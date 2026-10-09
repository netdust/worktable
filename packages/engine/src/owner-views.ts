import type { Database } from 'bun:sqlite'
import type { BunSQLiteDatabase } from 'drizzle-orm/bun-sqlite'
import type { Context, Hono } from 'hono'
import { createMiddleware } from 'hono/factory'
import { forbid, may, scopeOf } from './access'
import type { AuthEnv } from './auth'
import type { Actor, Domain } from './declare'
import { filterKeys } from './filter'
import { ApiError, parseFilter, parseRowsParams } from './params'
import { noStoreHeaders } from './public-headers'
import { checkLimits } from './rate-limit'
import { type Source, sourceOf } from './registry'
import { readRows } from './rows'
import { forOwnersProblem, notOwnerVisible, ownerVisible, viewOf } from './views'
import type { Store } from './writes'

type Raw = Record<string, string | number | null>
type Query = Record<string, string | undefined>

const ROW_PARAMS = ['from', 'to', 'filter', 'sort', 'group', 'limit', 'offset']
const READS = { max: 60, windowMs: 60_000 }

const unknownView = (): ApiError => new ApiError(404, 'unknown_view', 'no view for owners answers this id')

// Served only while it still holds to owner-visible keys and the actor's scope reaches its source.
function servable(domain: Domain, raw: Raw, actor: Actor): Source | null {
  if (raw.for_owners !== 1 || raw.deleted_at !== null || forOwnersProblem(domain, raw)) return null
  const source = sourceOf(domain, raw.source as string)
  return source && scopeOf(actor, source) !== 'none' ? source : null
}

function reading(actor: Actor): Actor {
  if (!may(actor, 'owner.views')) forbid('only an owner reads views for owners')
  return actor
}

const shownKeys = (source: Source, raw: Raw): string[] =>
  viewOf(raw).visible_fields.filter((key) => ownerVisible(source, key))

function columnsOf(source: Source, keys: string[]) {
  return keys.map((key) => {
    const { label, type, options } = source.columns[key] ?? {}
    return { key, label, type, ...(options ? { options } : {}) }
  })
}

// The window filters on the date column, so it is a key like any other.
function dateOf(source: Source, shown: string[]): string | null {
  return source.date && shown.includes(source.date) ? source.date : null
}

function listViews(sqlite: Database, domain: Domain, actor: Actor) {
  const sql = 'SELECT * FROM saved_view WHERE for_owners = 1 AND deleted_at IS NULL ORDER BY id'
  return (sqlite.query(sql).all() as Raw[]).flatMap((raw) => {
    const source = servable(domain, raw, actor)
    if (!source) return []
    const view = viewOf(raw)
    const shown = shownKeys(source, raw)
    return [
      {
        id: raw.id,
        name: view.name,
        source: view.source,
        skin: view.skin,
        date: dateOf(source, shown),
        sort: view.sort,
        group_by: view.group_by,
        columns: columnsOf(source, shown),
      },
    ]
  })
}

// Every key the request names, inside $or too, must be a listed, owner-visible column (attack 12).
function holdKeys(source: Source, shown: string[], query: Query): void {
  const filter = parseFilter(query.filter)
  const keys = [
    ...(filter ? filterKeys(filter) : []),
    ...(query.sort ?? '')
      .split(',')
      .filter(Boolean)
      .map((key) => key.replace(/^-/, '')),
    ...(query.group ? [query.group] : []),
    ...((query.from || query.to) && source.date ? [source.date] : []),
  ]
  const hidden = keys.find((key) => !shown.includes(key))
  if (hidden !== undefined) throw notOwnerVisible(hidden)
}

/** A view's rows as its owner reads them: scoped to the actor, never 'all', and the listed keys only. */
export function ownerRows(db: BunSQLiteDatabase, domain: Domain, raw: Raw, actor: Actor, query: Query) {
  const source = servable(domain, raw, actor)
  if (!source) throw unknownView()
  const extra = Object.keys(query).find((key) => !ROW_PARAMS.includes(key))
  if (extra) throw new ApiError(400, 'bad_param', `"${extra}" is not accepted`)
  const view = viewOf(raw)
  const shown = shownKeys(source, raw)
  holdKeys(source, shown, query)
  const sort = query.sort ?? view.sort.join(',')
  const group = query.group ?? view.group_by ?? undefined
  const params = { ...parseRowsParams(source, { ...query, sort, group }), stored: view.filters }
  const { rows, total } = readRows(db, domain, source, params, scopeOf(actor, source))
  return {
    columns: columnsOf(source, shown),
    rows: rows.map((row) => Object.fromEntries(shown.map((key) => [key, row[key]]))),
    total,
  }
}

function forOwnersView(sqlite: Database, param: string): Raw {
  if (!/^[1-9]\d{0,15}$/.test(param)) throw unknownView()
  const sql = 'SELECT * FROM saved_view WHERE id = ? AND for_owners = 1 AND deleted_at IS NULL'
  const raw = sqlite.query(sql).get(Number(param)) as Raw | null
  if (!raw) throw unknownView()
  return raw
}

/** Registered before authRoutes, so a 401 carries the headers and counts against the read limit too. */
export function ownerViewGuard(app: Hono<AuthEnv>, store: Store, clientIp: (c: Context) => string): void {
  app.use(
    '/owner/*',
    createMiddleware(async (c, next) => {
      for (const [name, value] of Object.entries(noStoreHeaders())) c.header(name, value)
      checkLimits(store.sqlite, () => [{ key: `owner:ip:${clientIp(c)}`, ...READS }], false)
      await next()
    }),
  )
}

export function ownerViewRoutes(app: Hono<AuthEnv>, { sqlite, db, domain }: Store): void {
  app.get('/owner/views', (c) => c.json({ views: listViews(sqlite, domain, reading(c.get('actor'))) }))
  app.get('/owner/views/:id/rows', (c) => {
    const actor = reading(c.get('actor'))
    const raw = forOwnersView(sqlite, c.req.param('id'))
    return c.json(ownerRows(db, domain, raw, actor, c.req.query()))
  })
}
