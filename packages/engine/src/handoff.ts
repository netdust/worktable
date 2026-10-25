import type { Database } from 'bun:sqlite'
import type { Context, Hono } from 'hono'
import { createMiddleware } from 'hono/factory'
import { inScope, isPerson, scopeOf, serviceOnly } from './access'
import type { AuthEnv } from './auth'
import type { DatasetDecl } from './declare'
import { ApiError } from './params'
import { noStoreHeaders } from './public-headers'
import { siteGuard } from './write-guard'
import { bodyOf, CREATED, isWebAddress, type Store } from './writes'

const DEFAULT_TTL_S = 60
const MAX_TTL_S = 120
const MAX_VALUE_LENGTH = 2048
const SWEEP_EVERY_MS = 60_000

const unknownRecord = (): ApiError => new ApiError(404, 'unknown_record', 'unknown record')
const badBody = (message: string): ApiError => new ApiError(400, 'bad_body', message)

/** Clears the value of every expired handoff; the rows stay, so a record never gets a second one. */
function sweep(sqlite: Database, now: string): void {
  sqlite
    .query('UPDATE handoff SET value = NULL, taken_at = ? WHERE value IS NOT NULL AND expires_at <= ?')
    .run(now, now)
}

interface SweepClock {
  every?: number
  setIntervalFn?: (run: () => void, every: number) => { unref(): unknown }
  now?: () => number
}

/** Clears expired values now and then on a timer, so an unread value does not wait for traffic. */
export function startSweep(sqlite: Database, clock: SweepClock = {}): void {
  const { every = SWEEP_EVERY_MS, setIntervalFn = setInterval, now = Date.now } = clock
  const run = () => sweep(sqlite, new Date(now()).toISOString())
  run()
  setIntervalFn(run, every).unref()
}

function targetOf(c: Context<AuthEnv>, store: Store): { dataset: DatasetDecl; id: number } {
  const name = c.req.param('dataset') ?? ''
  const id = Number(c.req.param('id'))
  const dataset = store.domain.datasets.find((d) => d.name === name)
  if (!dataset || !Number.isSafeInteger(id)) throw unknownRecord()
  return { dataset, id }
}

function liveRecord(store: Store, c: Context<AuthEnv>, dataset: DatasetDecl, id: number): void {
  const sql = `SELECT * FROM "${dataset.name}" WHERE id = ? AND deleted_at IS NULL`
  const row = store.sqlite.query(sql).get(id) as Record<string, unknown> | null
  if (!row || !inScope(scopeOf(c.get('actor'), dataset), row)) throw unknownRecord()
}

const creatorOf = (sqlite: Database, dataset: string, id: number): number => {
  const sql = 'SELECT actor_id FROM revision WHERE entity = ? AND record_id = ? AND field = ? ORDER BY id LIMIT 1'
  const row = sqlite.query(sql).get(dataset, id, CREATED) as { actor_id: number } | null
  if (!row) throw unknownRecord()
  return row.actor_id
}

function ttlOf(value: unknown): number {
  if (value === undefined) return DEFAULT_TTL_S
  if (!Number.isInteger(value) || (value as number) < 1 || (value as number) > MAX_TTL_S) {
    throw badBody(`ttl_s is an integer from 1 to ${MAX_TTL_S}`)
  }
  return value as number
}

// SQLite's RETURNING gives the row after the update, so the old value is read first in the same write transaction.
function takeValue(sqlite: Database, w: { dataset: string; id: number; creator: number; now: string }): string | null {
  const where = 'dataset = ? AND record_id = ? AND creator_id = ? AND value IS NOT NULL AND expires_at > ?'
  const args = [w.dataset, w.id, w.creator, w.now]
  return sqlite
    .transaction((): string | null => {
      const row = sqlite.query(`SELECT value FROM handoff WHERE ${where}`).get(...args) as { value: string } | null
      if (!row) return null
      const taken = sqlite.query(`UPDATE handoff SET value = NULL, taken_at = ? WHERE ${where}`).run(w.now, ...args)
      return taken.changes === 1 ? row.value : null
    })
    .immediate()
}

/** The value never leaves this module except through the creator's one read. */
export function handoffRoutes(app: Hono<AuthEnv>, store: Store, services: ReadonlySet<string>): void {
  const { sqlite } = store
  app.use(
    '/handoff/*',
    createMiddleware(async (c, next) => {
      await next()
      for (const [name, value] of Object.entries(noStoreHeaders())) c.header(name, value)
    }),
  )

  const fromOtherSite = siteGuard()
  app.use('/handoff/*', (c, next) => (c.req.method === 'GET' ? fromOtherSite(c, next) : next()))

  app.put('/handoff/:dataset/:id', async (c) => {
    const actor = c.get('actor')
    if (isPerson(actor)) serviceOnly('Only a service account puts a handoff')
    if (!actor.name || !services.has(actor.name)) {
      throw new ApiError(403, 'handoff_not_allowed', 'This service account may not put a handoff')
    }
    const { dataset, id } = targetOf(c, store)
    liveRecord(store, c, dataset, id)
    const body = await bodyOf(c)
    if (typeof body.value !== 'string') throw badBody('value must be a string')
    const ttl = ttlOf(body.ttl_s)
    if (body.value.length > MAX_VALUE_LENGTH || !isWebAddress(body.value))
      throw new ApiError(400, 'bad_url', 'value must be an http or https address')
    const creator = creatorOf(sqlite, dataset.name, id)
    const now = Date.now()
    const insert = sqlite.transaction(() => {
      sweep(sqlite, new Date(now).toISOString())
      const sql = `INSERT INTO handoff (dataset, record_id, value, creator_id, expires_at) VALUES (?, ?, ?, ?, ?)
        ON CONFLICT (dataset, record_id) DO NOTHING`
      return sqlite
        .query(sql)
        .run(dataset.name, id, body.value as string, creator, new Date(now + ttl * 1000).toISOString())
    })
    if (insert.immediate().changes === 0) throw new ApiError(409, 'handoff_exists', 'This record already had a handoff')
    return c.json({ ok: true })
  })

  app.get('/handoff/:dataset/:id', (c) => {
    const actor = c.get('actor')
    const { dataset, id } = targetOf(c, store)
    const now = new Date().toISOString()
    sweep(sqlite, now)
    if (!isPerson(actor)) throw unknownRecord()
    const taken = takeValue(sqlite, { dataset: dataset.name, id, creator: actor.id, now })
    if (taken === null) throw unknownRecord()
    return c.json({ value: taken })
  })
}
