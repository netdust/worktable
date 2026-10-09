import type { Database } from 'bun:sqlite'
import { timingSafeEqual } from 'node:crypto'
import type { Context, Hono } from 'hono'
import { createMiddleware } from 'hono/factory'
import { inScope, scopeOf } from './access'
import { type AuthEnv, secret, sha256 } from './auth'
import type { Actor, DatasetDecl } from './declare'
import { ApiError } from './params'
import { noStoreHeaders } from './public-headers'
import { failureLimiter } from './rate-limit'
import { titlesOf } from './rows'
import { applyWrite, bodyOf, noneHooked, type Store, sendAfterCommit, writableOf } from './writes'

type Subject = { dataset: string; id: number }
type Raw = Record<string, unknown>

const DAY = 24 * 60 * 60_000
const MAX_TOKEN = 128

interface TokenRow {
  hash: string
  dataset: string
  record_id: number
  subject_dataset: string
  subject_id: number
  from_state: string
  to_states: string
}

const iso = (ms: number): string => new Date(ms).toISOString()
const badToken = (): ApiError => new ApiError(401, 'bad_token', 'This link is not valid any more')
const linkActor = (id: number, subject: Subject): Actor => ({ id, role: 'owner', subject, kind: 'link' })

function findLink(sqlite: Database, { dataset, id }: Subject): { id: number; disabled_at: string | null } | null {
  const sql = "SELECT id, disabled_at FROM account WHERE kind = 'link' AND subject_dataset = ? AND subject_id = ?"
  return sqlite.query(sql).get(dataset, id) as { id: number; disabled_at: string | null } | null
}

/**
 * The subject's link account, made on first use; null when it was disabled.
 * One per subject, kept here rather than by a table UNIQUE, which would bind the subject's user owners too.
 */
export function linkAccount(sqlite: Database, subject: Subject): Actor | null {
  const findOrInsert = (): number | null => {
    const found = findLink(sqlite, subject)
    if (found !== null) return found.disabled_at === null ? found.id : null
    const sql =
      "INSERT INTO account (kind, role, subject_dataset, subject_id) VALUES ('link', 'owner', ?, ?) RETURNING id"
    return (sqlite.query(sql).get(subject.dataset, subject.id) as { id: number }).id
  }
  const id = sqlite.inTransaction ? findOrInsert() : sqlite.transaction(findOrInsert).immediate()
  return id === null ? null : linkActor(id, subject)
}

/** The record's owner subject, read from its owner column; null when the dataset has none or the column is empty. */
export function ownerSubject(dataset: DatasetDecl, row: Raw): Subject | null {
  const column = dataset.owners?.owner
  const id = column === undefined ? undefined : row[column]
  const name = column === 'id' ? dataset.name : column && dataset.columns[column]?.relation
  return name && typeof id === 'number' ? { dataset: name, id } : null
}

// Minting revokes the record's outstanding tokens: only the newest invite works (threat 8).
export function mintActionToken(
  sqlite: Database,
  m: { dataset: string; record_id: number; subject: Subject; from: string; to: string[]; days: number; batch: string },
): string {
  const now = Date.now()
  sqlite
    .query('UPDATE action_token SET used_at = ? WHERE dataset = ? AND record_id = ? AND used_at IS NULL')
    .run(iso(now), m.dataset, m.record_id)
  const token = secret()
  sqlite
    .query(
      `INSERT INTO action_token (hash, dataset, record_id, subject_dataset, subject_id, from_state, to_states,
         expires_at, minted_batch) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      sha256(token),
      m.dataset,
      m.record_id,
      m.subject.dataset,
      m.subject.id,
      m.from,
      JSON.stringify(m.to),
      iso(now + m.days * DAY),
      m.batch,
    )
  return token
}

export function revokeMintedBy(sqlite: Database, batch: string, now: string): void {
  sqlite.query('UPDATE action_token SET used_at = ? WHERE minted_batch = ? AND used_at IS NULL').run(now, batch)
}

// A live, unused token by its hash; the hash is looked up, then compared in constant time.
function liveToken(sqlite: Database, token: unknown, now: number): TokenRow {
  if (typeof token !== 'string' || token.length > MAX_TOKEN) throw badToken()
  const hash = sha256(token)
  const sql = 'SELECT * FROM action_token WHERE hash = ? AND used_at IS NULL AND expires_at > ?'
  const row = sqlite.query(sql).get(hash, iso(now)) as TokenRow | null
  if (!row || !timingSafeEqual(Buffer.from(row.hash), Buffer.from(hash))) throw badToken()
  return row
}

function lifecycleDataset(
  store: Store,
  name: string,
): DatasetDecl & { lifecycle: NonNullable<DatasetDecl['lifecycle']> } {
  const dataset = store.domain.datasets.find((d) => d.name === name)
  if (!dataset?.lifecycle) throw badToken()
  return dataset as DatasetDecl & { lifecycle: NonNullable<DatasetDecl['lifecycle']> }
}

const subjectOf = (row: TokenRow): Subject => ({ dataset: row.subject_dataset, id: row.subject_id })

type Answer = { value: string; label: string }
type Shown = { dataset: string; projection: Raw; labels: Record<string, string>; to: Answer[] }

// Read as the stored subject's link account reads: a record whose owner moved is no longer this token's.
function projectionOf(store: Store, token: unknown): Shown {
  const row = liveToken(store.sqlite, token, Date.now())
  const dataset = lifecycleDataset(store, row.dataset)
  const scope = scopeOf(linkActor(0, subjectOf(row)), dataset)
  const record = store.sqlite
    .query(`SELECT * FROM "${dataset.name}" WHERE id = ? AND deleted_at IS NULL`)
    .get(row.record_id) as Raw | null
  if (!record || !inScope(scope, record)) throw badToken()
  const keys = dataset.lifecycle.token_projection ?? []
  const options = dataset.columns[dataset.lifecycle.column]?.options ?? {}
  const projection = Object.fromEntries(
    keys.map((key) => {
      const relation = dataset.columns[key]?.relation
      const value = record[key] ?? null
      if (key === dataset.lifecycle.column && typeof value === 'string') return [key, options[value] ?? value]
      if (!relation || typeof value !== 'number') return [key, value]
      return [key, titlesOf(store.db, store.domain, relation, [value]).get(value) ?? null]
    }),
  )
  const labels = Object.fromEntries(keys.map((key) => [key, dataset.columns[key]?.label ?? key]))
  const verb = (value: string) =>
    dataset.lifecycle.transitions.find(
      (t) => t.to === value && (t.from === '*' || t.from.includes(row.from_state)) && t.label !== undefined,
    )?.label
  const to = (JSON.parse(row.to_states) as string[]).map((value) => ({
    value,
    label: verb(value) ?? options[value] ?? value,
  }))
  return { dataset: dataset.name, projection, labels, to }
}

function consume(sqlite: Database, row: TokenRow, now: number): void {
  sqlite.query('UPDATE action_token SET used_at = ? WHERE hash = ? AND used_at IS NULL').run(iso(now), row.hash)
}

// Consume and transition in one transaction: a refused transition leaves the token unused (threat 2).
function actOn(store: Store, token: unknown, to: unknown): { ok: true } {
  const hooked = noneHooked()
  store.sqlite
    .transaction(() => {
      const now = Date.now()
      const row = liveToken(store.sqlite, token, now)
      const dataset = lifecycleDataset(store, row.dataset)
      const column = dataset.lifecycle.column
      consume(store.sqlite, row, now)
      if (typeof to !== 'string' || !(JSON.parse(row.to_states) as string[]).includes(to)) {
        throw new ApiError(422, 'transition_not_allowed', `"${column}" may not go to ${String(to)}`)
      }
      const actor = linkAccount(store.sqlite, subjectOf(row))
      if (!actor) throw badToken()
      try {
        const target = writableOf(store.domain, dataset.name, 'update', actor)
        const mode = { kind: 'write', expect: row.from_state } as const
        applyWrite(store, target, 'update', row.record_id, { [column]: to }, actor, mode, hooked)
      } catch (err) {
        // The scope read refuses a record whose owner moved since the mint: the same answer as any bad token.
        if (err instanceof ApiError && err.status === 404) throw badToken()
        throw err
      }
    })
    .immediate()
  sendAfterCommit(store, hooked)
  return { ok: true }
}

// Registered before the session middleware: the token, not a session, opens them.
export function actionTokenRoutes(app: Hono<AuthEnv>, store: Store, clientIp: (c: Context) => string): void {
  const limited = (c: Context) => failureLimiter(`act:ip:${clientIp(c)}`, 20, 15)
  const noStore = createMiddleware(async (c, next) => {
    for (const [name, value] of Object.entries(noStoreHeaders())) c.header(name, value)
    await next()
  })
  app.use('/act', noStore)
  app.use('/act/*', noStore)
  app.post('/act/view', async (c) => {
    const { token } = await bodyOf(c)
    return c.json(await limited(c)(store.sqlite, () => projectionOf(store, token)))
  })
  app.post('/act', async (c) => {
    const { token, to } = await bodyOf(c)
    return c.json(await limited(c)(store.sqlite, () => actOn(store, token, to)))
  })
}
