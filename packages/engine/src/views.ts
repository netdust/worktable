import type { Database } from 'bun:sqlite'
import type { Hono } from 'hono'
import type { Actor, Domain, SavedViewSeed } from './declare'
import { DEV_ACTOR } from './dev-actor'
import { filterWhere } from './filter'
import type { FilterInput } from './filter-compile'
import { ApiError } from './params'
import { type Source, sourceOf } from './registry'
import { matrixOf } from './rows'
import { savedView } from './saved-view'
import { tableOf } from './tables'
import { bodyOf, revise, type Store } from './writes'

export type SavedViewRow = SavedViewSeed & { id: number }
export type ViewOut = SavedViewRow & { shared: boolean; owner_id: number; mine: boolean; editable: boolean }
export type ViewFields = Omit<SavedViewSeed, 'skin'> & { skin: 'table' | 'matrix'; shared: boolean }

type Raw = Record<string, string | number | null>
type Change = [field: string, old: string | number | null, value: string | number | null]

const MAX_NAME = 80
const MAX_STORED = 16 * 1024
const FIXED = ['source', 'skin']
const DEFAULTS = { skin: 'table', filters: {}, sort: [], group_by: null, visible_fields: [], shared: false }

const bad = (message: string) => new ApiError(400, 'bad_view', message)
const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)
const hasColumn = (source: Source, key: string): boolean =>
  Object.hasOwn(source.columns, key) || (source.kind === 'dataset' && key === 'id')

export function viewOf(raw: Raw): SavedViewRow {
  return {
    id: raw.id as number,
    name: raw.name as string,
    source_type: raw.source_type as SavedViewRow['source_type'],
    source: raw.source as string,
    skin: raw.skin as SavedViewRow['skin'],
    filters: JSON.parse(raw.filters as string),
    sort: JSON.parse(raw.sort as string),
    group_by: raw.group_by as string | null,
    visible_fields: JSON.parse(raw.visible_fields as string),
  }
}

function outOf(raw: Raw, actor: Actor): ViewOut {
  const mine = raw.owner_id === actor.id
  return { ...viewOf(raw), shared: raw.shared === 1, owner_id: raw.owner_id as number, mine, editable: mine }
}

function nameOf(value: unknown): string {
  const name = typeof value === 'string' ? value.trim() : ''
  if (name.length < 1 || name.length > MAX_NAME) throw bad(`name must be 1 to ${MAX_NAME} characters`)
  return name
}

function sourceNamed(domain: Domain, value: unknown): Source {
  const source = typeof value === 'string' ? sourceOf(domain, value) : null
  if (!source) throw bad(`unknown source "${String(value)}"`)
  return source
}

function skinOf(domain: Domain, source: Source, value: unknown): 'table' | 'matrix' {
  if (value === 'table') return value
  if (value === 'matrix' && matrixOf(domain, source)) return value
  throw bad(`skin "${String(value)}" is not available on "${source.name}"`)
}

function filtersOf(source: Source, value: unknown): FilterInput {
  if (!isObject(value)) throw bad('filters must be an object')
  try {
    filterWhere(value as FilterInput, source, tableOf(source))
  } catch (err) {
    if (err instanceof ApiError) throw bad(err.message)
    throw err
  }
  return value as FilterInput
}

function columnsOf(source: Source, what: string, value: unknown, strip = (key: string) => key): string[] {
  if (!Array.isArray(value) || !value.every((key) => typeof key === 'string')) throw bad(`${what} must be a list`)
  for (const key of value) if (!hasColumn(source, strip(key))) throw bad(`${what}: "${key}" is not a column`)
  return value
}

function groupOf(source: Source, value: unknown): string | null {
  if (value === null) return null
  if (typeof value !== 'string' || !hasColumn(source, value)) throw bad(`cannot group on "${String(value)}"`)
  return value
}

function sharedOf(value: unknown): boolean {
  if (typeof value !== 'boolean') throw bad('shared must be a boolean')
  return value
}

function checkSize(fields: ViewFields): ViewFields {
  if (new TextEncoder().encode(JSON.stringify(fields)).length > MAX_STORED) {
    throw new ApiError(400, 'view_too_large', `a view is at most ${MAX_STORED} bytes`)
  }
  return fields
}

// On create the input is the body; on update it is the stored view with the patch laid over it.
export function viewBody(input: unknown, domain: Domain, creating: boolean): ViewFields {
  if (!isObject(input)) throw bad('body must be a JSON object')
  const v = creating ? { ...DEFAULTS, ...input } : input
  const source = sourceNamed(domain, v.source)
  return checkSize({
    name: nameOf(v.name),
    source_type: source.kind,
    source: source.name,
    skin: skinOf(domain, source, v.skin),
    filters: filtersOf(source, v.filters),
    sort: columnsOf(source, 'sort', v.sort, (key) => key.replace(/^-/, '')),
    group_by: groupOf(source, v.group_by),
    visible_fields: columnsOf(source, 'visible_fields', v.visible_fields),
    shared: sharedOf(v.shared),
  })
}

export function ownedView(sqlite: Database, id: number, actor: Actor, includeDeleted = false): Raw {
  const live = includeDeleted ? '' : ' AND deleted_at IS NULL'
  const raw = sqlite.query(`SELECT * FROM saved_view WHERE id = ?${live}`).get(id) as Raw | null
  if (raw && raw.owner_id === actor.id) return raw
  if (raw?.shared === 1) throw new ApiError(403, 'not_owner', `view ${id} belongs to someone else`)
  throw new ApiError(404, 'unknown_view', `unknown view ${id}`)
}

function viewId(raw: string): number {
  const id = /^[1-9]\d*$/.test(raw) ? Number(raw) : Number.NaN
  if (!Number.isSafeInteger(id)) throw new ApiError(404, 'unknown_view', `unknown view "${raw}"`)
  return id
}

function stored(fields: ViewFields): Raw {
  const json = (value: unknown) => JSON.stringify(value)
  const { filters, sort, visible_fields, shared } = fields
  return { ...fields, filters: json(filters), sort: json(sort), visible_fields: json(visible_fields), shared: +shared }
}

function changed(next: Raw, current: Raw): Change[] {
  return Object.entries(next)
    .map(([key, value]): Change => [key, current[key] ?? null, value])
    .filter(([, old, value]) => old !== value)
}

function save(sqlite: Database, actor: Actor, id: number, next: Raw, current: Raw): void {
  const changes = changed(next, current)
  if (changes.length === 0) return
  const now = new Date().toISOString()
  const sets = [...changes.map(([key]) => `"${key}" = ?`), 'updated_at = ?']
  sqlite.query(`UPDATE saved_view SET ${sets.join(', ')} WHERE id = ?`).run(...changes.map(([, , v]) => v), now, id)
  revise(sqlite, savedView, id, changes, now, actor.id)
}

function create(sqlite: Database, fields: ViewFields, actor: Actor): number {
  const next = { ...stored(fields), owner_id: actor.id }
  const keys = Object.keys(next)
  const sql = `INSERT INTO saved_view (${keys.join(', ')}) VALUES (${keys.map(() => '?').join(', ')})`
  const id = Number(sqlite.query(sql).run(...Object.values(next)).lastInsertRowid)
  const raw = sqlite.query('SELECT * FROM saved_view WHERE id = ?').get(id) as Raw
  const changes = Object.keys(savedView.columns).map((key): Change => [key, null, raw[key] ?? null])
  revise(
    sqlite,
    savedView,
    id,
    changes.filter(([, , value]) => value !== null),
    raw.created_at as string,
    actor.id,
  )
  return id
}

function patchOf(body: Record<string, unknown>): Record<string, unknown> {
  const fixed = FIXED.find((key) => Object.hasOwn(body, key))
  if (fixed) throw bad(`"${fixed}" is fixed when a view is created`)
  return body
}

function listViews(sqlite: Database, actor: Actor): ViewOut[] {
  const sql = 'SELECT * FROM saved_view WHERE deleted_at IS NULL AND (owner_id = ? OR shared = 1) ORDER BY id'
  return (sqlite.query(sql).all(actor.id) as Raw[]).map((raw) => outOf(raw, actor))
}

export function viewRoutes(app: Hono, { sqlite, domain }: Store, actor: Actor = DEV_ACTOR): void {
  const write = <T>(work: () => T): T => sqlite.transaction(work).immediate()
  const outById = (id: number): ViewOut => outOf(ownedView(sqlite, id, actor), actor)

  app.get('/views', (c) => c.json({ views: listViews(sqlite, actor) }))

  app.post('/views', async (c) => {
    const fields = viewBody(await bodyOf(c), domain, true)
    return c.json(outById(write(() => create(sqlite, fields, actor))), 201)
  })

  app.patch('/views/:id', async (c) => {
    const id = viewId(c.req.param('id'))
    const patch = patchOf(await bodyOf(c))
    write(() => {
      const current = ownedView(sqlite, id, actor)
      save(sqlite, actor, id, stored(viewBody({ ...outOf(current, actor), ...patch }, domain, false)), current)
    })
    return c.json(outById(id))
  })

  app.delete('/views/:id', (c) => {
    const id = viewId(c.req.param('id'))
    write(() => save(sqlite, actor, id, { deleted_at: new Date().toISOString() }, ownedView(sqlite, id, actor)))
    return c.json({ id })
  })

  app.post('/views/:id/restore', (c) => {
    const id = viewId(c.req.param('id'))
    write(() => save(sqlite, actor, id, { deleted_at: null }, ownedView(sqlite, id, actor, true)))
    return c.json(outById(id))
  })
}
