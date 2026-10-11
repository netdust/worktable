import type { Database } from 'bun:sqlite'
import { createHmac, timingSafeEqual } from 'node:crypto'
import type { Context, Hono } from 'hono'
import { createMiddleware } from 'hono/factory'
import { forbid } from './access'
import { linkAccount, ownerSubject } from './action-token'
import type { AuthEnv } from './auth'
import type { Actor, DatasetDecl, Domain } from './declare'
import { ApiError, emailOf } from './params'
import { noStoreHeaders } from './public-headers'
import { checkLimits } from './rate-limit'
import { bodyOf, type Store } from './writes'

type Raw = Record<string, unknown>
type LinkedDataset = DatasetDecl & { record_link: NonNullable<DatasetDecl['record_link']> }

const MAX_TOKEN = 128
const WINDOW = 15 * 60_000
const TOKEN = /^([a-z][a-z0-9_]*)\.([1-9]\d{0,14})\.([\w-]{43})$/

export const badLink = (): ApiError => new ApiError(401, 'bad_link', 'This link is not valid any more')
const unknownRecord = (): ApiError => new ApiError(404, 'unknown_record', 'unknown record')

const linkedDataset = (domain: Domain, name: string): LinkedDataset | undefined =>
  domain.datasets.find((d): d is LinkedDataset => d.name === name && d.record_link !== undefined)

function versionOf(sqlite: Database, dataset: string, id: number): number {
  const sql = 'SELECT version FROM record_link WHERE dataset = ? AND record_id = ?'
  return (sqlite.query(sql).get(dataset, id) as { version: number } | null)?.version ?? 0
}

const macOf = (secret: Uint8Array, dataset: string, id: number, version: number): Buffer =>
  createHmac('sha256', secret).update(`record-link:${dataset}:${id}:${version}`).digest()

// The dataset name was matched against the declared ones, so it is safe to quote into the SQL.
const liveRecord = (sqlite: Database, dataset: LinkedDataset, id: number): Raw | null =>
  sqlite.query(`SELECT * FROM "${dataset.name}" WHERE id = ? AND deleted_at IS NULL`).get(id) as Raw | null

/** The record's current link token; the caller has checked that the dataset declares record_link. */
export function recordLinkFor(sqlite: Database, secret: Uint8Array, dataset: string, id: number): string {
  return `${dataset}.${id}.${macOf(secret, dataset, id, versionOf(sqlite, dataset, id)).toString('base64url')}`
}

/**
 * The link actor a token opens, or the one 401 for every failure (attacks 9, 10). The MAC is computed and compared
 * for a missing record too, so the timing does not tell whether the id exists.
 */
export function verifyRecordLink(sqlite: Database, domain: Domain, secret: Uint8Array, token: string): Actor {
  const parts = token.length <= MAX_TOKEN ? TOKEN.exec(token) : null
  const name = parts?.[1] ?? ''
  const id = Number(parts?.[2] ?? 0)
  const dataset = linkedDataset(domain, name)
  const record = dataset ? liveRecord(sqlite, dataset, id) : null
  const expected = macOf(secret, name, id, versionOf(sqlite, name, id))
  const given = Buffer.from(parts?.[3] ?? '', 'base64url')
  const same = given.length === expected.length && timingSafeEqual(given, expected)
  const subject = dataset && record ? ownerSubject(dataset, record) : null
  const actor = same && subject ? linkAccount(sqlite, subject) : null
  if (!actor) throw badLink()
  return actor
}

// Method and path both: a link never creates or deletes a row, runs an action or undoes (attachments attack 10).
const OPEN_TO_LINKS: [string, RegExp][] = [
  ['GET', /^\/api\/auth\/me$/],
  ['GET', /^\/api\/owner\/views(?:\/.*)?$/],
  ['PATCH', /^\/api\/rows\/[^/]+\/[^/]+$/],
  ['GET', /^\/api\/attachments\/[^/]+\/[^/]+$/],
  ['POST', /^\/api\/attachments\/(?!file\/)[^/]+\/[^/]+$/],
  ['DELETE', /^\/api\/attachments\/file\/[^/]+$/],
]

const openToLinks = (method: string, path: string): boolean =>
  OPEN_TO_LINKS.some(([m, pattern]) => m === method && pattern.test(path))

/** Installed right after authentication: a link actor reaches only the routes it may use. */
export const confineLinkActor = createMiddleware<AuthEnv>(async (c, next) => {
  if (c.get('actor').kind === 'link' && !openToLinks(c.req.method, c.req.path)) {
    forbid('A link opens only its own pages')
  }
  await next()
})

const linkUrl = (appUrl: string, token: string): string => `${appUrl.replace(/\/+$/, '')}/#/link/${token}`

function rotate(sqlite: Database, dataset: string, id: number, actor: Actor): void {
  sqlite
    .query(
      `INSERT INTO record_link (dataset, record_id, version, rotated_at, rotated_by) VALUES (?, ?, 1, ?, ?)
       ON CONFLICT (dataset, record_id) DO UPDATE
       SET version = version + 1, rotated_at = excluded.rotated_at, rotated_by = excluded.rotated_by,
           updated_at = excluded.rotated_at`,
    )
    .run(dataset, id, new Date().toISOString(), actor.id)
}

// A human administrator only; a service account is refused whatever its role (attack 16).
function linkedRecord(c: Context<AuthEnv>, store: Store): { dataset: string; id: number } {
  const actor = c.get('actor')
  if (actor.role !== 'administrator' || (actor.kind ?? 'user') !== 'user') forbid('Only an administrator copies links')
  const dataset = linkedDataset(store.domain, c.req.param('dataset') ?? '')
  const id = Number(c.req.param('id'))
  if (!dataset || !Number.isSafeInteger(id) || !liveRecord(store.sqlite, dataset, id)) throw unknownRecord()
  return { dataset: dataset.name, id }
}

/** A new address for the link: the old link and the subject's outstanding action tokens stop working. */
export function retireDelivered(sqlite: Database, dataset: DatasetDecl, row: Raw, actor: Actor): void {
  rotate(sqlite, dataset.name, row.id as number, actor)
  const subject = ownerSubject(dataset, row)
  if (!subject) return
  sqlite
    .query('UPDATE action_token SET used_at = ? WHERE subject_dataset = ? AND subject_id = ? AND used_at IS NULL')
    .run(new Date().toISOString(), subject.dataset, subject.id)
}

/** Re-copy and rotate. Revoking is rotating without handing the new link on. */
export function recordLinkRoutes(app: Hono<AuthEnv>, store: Store, secret: Uint8Array): void {
  const answer = ({ dataset, id }: { dataset: string; id: number }) => ({
    link: linkUrl(store.appUrl, recordLinkFor(store.sqlite, secret, dataset, id)),
  })
  app.get('/record-links/:dataset/:id', (c) => c.json(answer(linkedRecord(c, store))))
  app.post('/record-links/:dataset/:id/rotate', (c) => {
    const record = linkedRecord(c, store)
    rotate(store.sqlite, record.dataset, record.id, c.get('actor'))
    return c.json(answer(record))
  })
}

async function deliverLinks(store: Store, secret: Uint8Array, email: string): Promise<void> {
  try {
    for (const dataset of store.domain.datasets) {
      const column = dataset.record_link?.email
      if (!column) continue
      const sql = `SELECT id, "${column}" AS email FROM "${dataset.name}" WHERE "${column}" = ? COLLATE NOCASE AND deleted_at IS NULL`
      for (const row of store.sqlite.query(sql).all(email) as { id: number; email: string }[]) {
        const link = linkUrl(store.appUrl, recordLinkFor(store.sqlite, secret, dataset.name, row.id))
        await store.mailer.send({ to: row.email, subject: 'Je link', text: link })
      }
    }
  } catch (err) {
    console.error(err)
  }
}

/**
 * Sessionless, so registered before authRoutes: one answer for every address, delivery after the response,
 * nothing written but the rate limits (attack 14). Every /record-links/* response carries noStoreHeaders().
 */
export function recordLinkRequest(
  app: Hono<AuthEnv>,
  store: Store,
  secret: Uint8Array | undefined,
  clientIp: (c: Context) => string,
): void {
  app.use(
    '/record-links/*',
    createMiddleware(async (c, next) => {
      for (const [name, value] of Object.entries(noStoreHeaders())) c.header(name, value)
      await next()
    }),
  )
  app.post('/record-links/request', async (c) => {
    const email = emailOf((await bodyOf(c)).email)
    const limits = () => [
      { key: `record-link-request:ip:${clientIp(c)}`, max: 20, windowMs: WINDOW },
      { key: `record-link-request:email:${email.toLowerCase()}`, max: 5, windowMs: WINDOW },
    ]
    checkLimits(store.sqlite, limits, true)
    // A timer, not a microtask: every read and mail happens after the response is out, for every address alike.
    if (secret) setTimeout(() => deliverLinks(store, secret, email), 0)
    return c.json({ ok: true })
  })
}
