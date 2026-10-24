import type { Database } from 'bun:sqlite'
import { timingSafeEqual } from 'node:crypto'
import type { Context, Hono } from 'hono'
import { forbid, may, readable } from './access'
import { type AuthEnv, secret, sha256 } from './auth'
import { layoutOf, tileViews } from './dashboard'
import type { Actor, DashboardLayout, Domain, SavedViewSeed } from './declare'
import { filterKeys, filterWhere } from './filter'
import type { FilterInput } from './filter-compile'
import { hasColumn, hasField, sortable } from './lookups'
import { ApiError, keysProblem, parseRowsParams } from './params'
import { checkLimits } from './rate-limit'
import { type Source, sourceOf } from './registry'
import { matrixOf, readRows } from './rows'
import { savedView, seedKey } from './saved-view'
import { tableOf } from './tables'
import { bodyOf, revise, type Store } from './writes'

export type SavedViewRow = Omit<SavedViewSeed, 'source_type' | 'source' | 'layout' | 'locked'> & {
  id: number
  source_type: 'dataset' | 'query' | null
  source: string | null
  layout: DashboardLayout | null
}
export type ViewOut = SavedViewRow & {
  gone_views?: number[]
  shared: boolean
  public: boolean
  for_owners: boolean
  owner_id: number
  mine: boolean
  editable: boolean
}
type Skin = SavedViewSeed['skin']
export type ViewFields = Omit<SavedViewRow, 'id'> & { shared: boolean }
type Sourced = Omit<ViewFields, 'name' | 'shared'>

type Raw = Record<string, string | number | null>
type Change = [field: string, old: string | number | null, value: string | number | null]

const MAX_NAME = 80
const MAX_STORED = 16 * 1024
const FIXED = ['source', 'skin']
const MAX_TOKEN = 128
const PUBLIC_PARAMS = ['from', 'to']
const DEFAULTS = { skin: 'table', filters: {}, sort: [], group_by: null, visible_fields: [], shared: false }
const EMPTY_LAYOUT: DashboardLayout = { sections: [], actions: [] }

const bad = (message: string) => new ApiError(400, 'bad_view', message)
const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)

export function viewOf(raw: Raw): SavedViewRow {
  return {
    id: raw.id as number,
    name: raw.name as string,
    source_type: raw.source_type as SavedViewRow['source_type'],
    source: raw.source as string | null,
    skin: raw.skin as SavedViewRow['skin'],
    filters: JSON.parse(raw.filters as string),
    sort: JSON.parse(raw.sort as string),
    group_by: raw.group_by as string | null,
    visible_fields: JSON.parse(raw.visible_fields as string),
    layout: raw.layout == null ? null : JSON.parse(raw.layout as string),
  }
}

/** What matches a seeded view to its row: its name and source, a dashboard's source being none. */
export const viewKey = (name: string, source: string | null | undefined): string => `${name}\u0000${source ?? ''}`

// Seeded views belong to no account: a human administrator changes an unlocked one, everyone else copies it by a plain POST.
export const SYSTEM_OWNER = -1
export const SYSTEM: Actor = { id: SYSTEM_OWNER, role: 'administrator', subject: null }

const isPublic = (raw: Raw): boolean => raw.public === 1
const isForOwners = (raw: Raw): boolean => raw.for_owners === 1

const humanAdmin = (actor: Actor): boolean => actor.role === 'administrator' && (actor.kind ?? 'user') === 'user'

// One team dashboard: any administrator edits a shared one in place instead of copying it again.
const teamDashboard = (raw: Raw, actor: Actor): boolean =>
  raw.skin === 'dashboard' && raw.shared === 1 && raw.owner_id !== SYSTEM_OWNER && humanAdmin(actor)

// Read-only to everyone: locked by its seed, or no seed any more to say otherwise.
function lockedSeed(raw: Raw, domain: Domain): boolean {
  if (raw.owner_id !== SYSTEM_OWNER) return false
  const seed = domain.views.find((v) => seedKey(v.name, v.source) === raw.seed_key)
  return seed === undefined || seed.locked === true
}

const teamSeed = (raw: Raw, actor: Actor, domain: Domain): boolean =>
  raw.owner_id === SYSTEM_OWNER && humanAdmin(actor) && !lockedSeed(raw, domain)

function outOf(raw: Raw, actor: Actor, domain: Domain): ViewOut {
  const mine = raw.owner_id === actor.id
  const editable =
    (mine && ((!isPublic(raw) && !isForOwners(raw)) || actor.role === 'administrator')) ||
    teamDashboard(raw, actor) ||
    teamSeed(raw, actor, domain)
  return {
    ...viewOf(raw),
    shared: raw.shared === 1,
    public: isPublic(raw),
    for_owners: isForOwners(raw),
    owner_id: raw.owner_id as number,
    mine,
    editable,
  }
}

function nameOf(value: unknown): string {
  const name = typeof value === 'string' ? value.trim() : ''
  if (name.length < 1 || name.length > MAX_NAME) throw bad(`name must be 1 to ${MAX_NAME} characters`)
  if (/[\p{Cc}\p{Cf}]/u.test(name)) throw bad('name must not hold control or format characters')
  return name
}

function sourceNamed(domain: Domain, value: unknown): Source {
  const source = typeof value === 'string' ? sourceOf(domain, value) : null
  if (!source) throw bad(`unknown source "${String(value)}"`)
  return source
}

function skinOf(domain: Domain, source: Source, value: unknown): Skin {
  if (value === 'table') return value
  if (value === 'matrix' && matrixOf(domain, source)) return value
  if ((value === 'calendar' || value === 'timeline') && source.calendar) return value
  if (value === 'board' && source.board) return value
  if (value === 'gallery' && source.kind === 'dataset' && source.gallery) return value
  throw bad(`skin "${String(value)}" is not available on "${source.name}"`)
}

function filtersOf(domain: Domain, source: Source, value: unknown): FilterInput {
  if (!isObject(value)) throw bad('filters must be an object')
  if (!Bun.deepEquals(JSON.parse(JSON.stringify(value)), value)) throw bad('filters must hold only finite numbers')
  try {
    filterWhere(value as FilterInput, source, tableOf(source), undefined, domain)
  } catch (err) {
    if (err instanceof ApiError) throw bad(err.message)
    throw err
  }
  return value as FilterInput
}

function columnsOf(
  source: Source,
  what: string,
  value: unknown,
  strip = (key: string) => key,
  known = hasColumn,
  max?: number,
): string[] {
  if (!Array.isArray(value) || !value.every((key) => typeof key === 'string')) throw bad(`${what} must be a list`)
  const problem = keysProblem(what, value.map(strip), max)
  if (problem) throw bad(problem)
  for (const key of value) if (!known(source, strip(key))) throw bad(`${what}: "${key}" is not a column`)
  return value
}

function groupOf(source: Source, skin: Skin, value: unknown): string | null {
  if (value === null) return null
  if (typeof value !== 'string' || !hasColumn(source, value)) throw bad(`cannot group on "${String(value)}"`)
  if ((skin === 'calendar' || skin === 'timeline') && !source.calendar?.lanes.includes(value))
    throw bad(`cannot group a ${skin} on "${value}"`)
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

// A view may show every field its source has, however many.
const fieldCount = (source: Source): number =>
  Object.keys(source.columns).length +
  (source.kind === 'dataset' ? 1 + Object.keys(source.lookups ?? {}).length : 0) +
  Object.keys(source.links ?? {}).length

function sourcedFields(domain: Domain, v: Record<string, unknown>): Sourced {
  if (v.layout != null) throw bad('only a dashboard takes a layout')
  const source = sourceNamed(domain, v.source)
  const skin = skinOf(domain, source, v.skin)
  return {
    source_type: source.kind,
    source: source.name,
    skin,
    filters: filtersOf(domain, source, v.filters),
    sort: columnsOf(source, 'sort', v.sort, (key) => key.replace(/^-/, ''), sortable),
    group_by: groupOf(source, skin, v.group_by),
    visible_fields: columnsOf(source, 'visible_fields', v.visible_fields, undefined, hasField, fieldCount(source)),
    layout: null,
  }
}

type ViewCtx = { sqlite: Database; actor: Actor }

function dashboardFields(domain: Domain, v: Record<string, unknown>, { sqlite, actor }: ViewCtx): Sourced {
  if (v.source != null) throw bad('a dashboard takes no source')
  const empty = Bun.deepEquals(v.filters, {}) && Bun.deepEquals(v.sort, []) && Bun.deepEquals(v.visible_fields, [])
  if (!empty || v.group_by !== null) throw bad('a dashboard takes no filters, sort, group or visible fields')
  return {
    source_type: null,
    source: null,
    skin: 'dashboard',
    filters: {},
    sort: [],
    group_by: null,
    visible_fields: [],
    layout: layoutOf(domain, sqlite, v.layout ?? EMPTY_LAYOUT, actor),
  }
}

// On create the input is the body; on update it is the stored view with the patch laid over it.
export function viewBody(input: unknown, domain: Domain, creating: boolean, ctx: ViewCtx): ViewFields {
  if (!isObject(input)) throw bad('body must be a JSON object')
  const v = creating ? { ...DEFAULTS, ...input } : input
  const fields = v.skin === 'dashboard' ? dashboardFields(domain, v, ctx) : sourcedFields(domain, v)
  const shared = sharedOf(v.shared)
  // A shared dashboard is every editor's landing page (R-3c-1).
  if (fields.skin === 'dashboard' && shared && !humanAdmin(ctx.actor))
    throw new ApiError(403, 'shared_dashboard', 'only an administrator shares a dashboard')
  return checkSize({ name: nameOf(v.name), ...fields, shared })
}

const unknownView = (id: number | string) => new ApiError(404, 'unknown_view', `unknown view ${id}`)

function viewRaw(sqlite: Database, id: number, includeDeleted: boolean): Raw | null {
  const live = includeDeleted ? '' : ' AND deleted_at IS NULL'
  return sqlite.query(`SELECT * FROM saved_view WHERE id = ?${live}`).get(id) as Raw | null
}

export function ownedView(sqlite: Database, domain: Domain, id: number, actor: Actor, includeDeleted = false): Raw {
  const raw = viewRaw(sqlite, id, includeDeleted)
  if (!raw) throw unknownView(id)
  if (raw.owner_id === SYSTEM_OWNER) {
    if (!teamSeed(raw, actor, domain)) throw new ApiError(403, 'read_only_view', `view ${id} is read-only; save a copy`)
    return raw
  }
  if (raw.owner_id !== actor.id && !teamDashboard(raw, actor)) {
    if (raw.shared === 1 && raw.deleted_at === null)
      throw new ApiError(403, 'not_owner', `view ${id} belongs to someone else`)
    throw unknownView(id)
  }
  // An editor or a service must not widen what a published token serves (attack 16).
  const human = humanAdmin(actor)
  if (isPublic(raw) && !human)
    throw new ApiError(403, 'public_view', `view ${id} is public; only an administrator may change it`)
  if (isForOwners(raw) && !human)
    throw new ApiError(403, 'owner_view', `view ${id} is shown to owners; only an administrator may change it`)
  return raw
}

function viewId(raw: string): number {
  const id = /^[1-9]\d*$/.test(raw) ? Number(raw) : Number.NaN
  if (!Number.isSafeInteger(id)) throw unknownView(`"${raw}"`)
  return id
}

function stored(fields: ViewFields): Raw {
  const json = (value: unknown) => JSON.stringify(value)
  const { filters, sort, visible_fields, layout, shared } = fields
  return {
    ...fields,
    filters: json(filters),
    sort: json(sort),
    visible_fields: json(visible_fields),
    layout: layout === null ? null : json(layout),
    shared: +shared,
  }
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

// The deleted views a layout's tiles name that this viewer could have seen; the layout itself stays as stored.
function goneViews(sqlite: Database, layout: DashboardLayout, viewer: Actor): number[] {
  const named = [...new Set(tileViews(layout))]
  if (named.length === 0) return []
  const sql = `SELECT id FROM saved_view WHERE deleted_at IS NOT NULL AND (owner_id = ? OR shared = 1) AND id IN (${named.map(() => '?').join(', ')}) ORDER BY id`
  return (sqlite.query(sql).all(viewer.id, ...named) as { id: number }[]).map((row) => row.id)
}

function withGone(sqlite: Database, out: ViewOut, viewer: Actor): ViewOut {
  return out.skin === 'dashboard' && out.layout ? { ...out, gone_views: goneViews(sqlite, out.layout, viewer) } : out
}

// What a stored layout is checked as when a request does not send one: its tiles on deleted views are not what is being changed.
function withoutGone(sqlite: Database, layout: DashboardLayout): DashboardLayout {
  const gone = new Set(
    (sqlite.query('SELECT id FROM saved_view WHERE deleted_at IS NOT NULL').all() as { id: number }[]).map(
      (row) => row.id,
    ),
  )
  const named = (tile: DashboardLayout['sections'][number]['tiles'][number]) =>
    tile.kind === 'progress' ? [tile.done, tile.total] : [tile.view]
  return {
    ...layout,
    sections: layout.sections.map((section) => ({
      ...section,
      tiles: section.tiles.filter((tile) => !named(tile).some((id) => typeof id === 'number' && gone.has(id))),
    })),
  }
}

function listViews(sqlite: Database, domain: Domain, actor: Actor): ViewOut[] {
  const sql = 'SELECT * FROM saved_view WHERE deleted_at IS NULL AND (owner_id = ? OR shared = 1) ORDER BY id'
  // A dashboard has no source; it is never listed to an owner (attack 1).
  const onReadable = (raw: Raw): boolean => {
    if (raw.skin === 'dashboard') return actor.role !== 'owner'
    const source = sourceOf(domain, raw.source as string)
    return source !== null && readable(actor, source)
  }
  return seedOrdered(domain, (sqlite.query(sql).all(actor.id) as Raw[]).filter(onReadable)).map((raw) =>
    withGone(sqlite, outOf(raw, actor, domain), actor),
  )
}

// The system's seeded views come first, in the order the domain declares them; every other view follows by id.
function seedOrdered(domain: Domain, rows: Raw[]): Raw[] {
  const declared = new Map(domain.views.map((seed, at) => [seedKey(seed.name, seed.source), at]))
  const at = (raw: Raw) => (raw.owner_id === SYSTEM_OWNER ? declared.get(raw.seed_key as string) : undefined)
  const seeded = rows.filter((raw) => at(raw) !== undefined)
  seeded.sort((a, b) => (at(a) as number) - (at(b) as number))
  return [...seeded, ...rows.filter((raw) => at(raw) === undefined)]
}

function changing(actor: Actor): Actor {
  if (!may(actor, 'views.write')) forbid('this account may not change views')
  return actor
}

export function viewRoutes(app: Hono<AuthEnv>, { sqlite, domain }: Store): void {
  const write = <T>(work: () => T): T => sqlite.transaction(work).immediate()
  const outById = (id: number, actor: Actor): ViewOut =>
    withGone(sqlite, outOf(ownedView(sqlite, domain, id, actor), actor, domain), actor)

  app.get('/views', (c) => c.json({ views: listViews(sqlite, domain, c.get('actor')) }))

  app.post('/views', async (c) => {
    const actor = changing(c.get('actor'))
    const fields = viewBody(await bodyOf(c), domain, true, { sqlite, actor })
    const id = write(() => create(sqlite, fields, actor))
    return c.json(outById(id, actor), 201)
  })

  app.patch('/views/:id', async (c) => {
    const actor = changing(c.get('actor'))
    const id = viewId(c.req.param('id'))
    const patch = patchOf(await bodyOf(c))
    write(() => {
      const current = ownedView(sqlite, domain, id, actor)
      // Unsharing it would hide it from every list, its administrator's too.
      if (current.owner_id === SYSTEM_OWNER && Object.hasOwn(patch, 'shared')) throw bad('a seeded view stays shared')
      const sent = Object.hasOwn(patch, 'layout')
      const merged = { ...outOf(current, actor, domain), ...patch }
      if (current.skin === 'dashboard' && !sent && merged.layout) merged.layout = withoutGone(sqlite, merged.layout)
      const next = stored(viewBody(merged, domain, false, { sqlite, actor }))
      if (current.skin === 'dashboard' && !sent) next.layout = current.layout ?? null
      // A view for owners must not gain a hidden column later (attack 13).
      const problem = isForOwners(current) ? forOwnersProblem(domain, { ...current, ...next }) : null
      if (problem) throw problem
      save(sqlite, actor, id, next, current)
    })
    return c.json(outById(id, actor))
  })

  app.delete('/views/:id', (c) => {
    const actor = changing(c.get('actor'))
    const id = viewId(c.req.param('id'))
    // A delete also revokes the share token and the owners' access, so a restore never brings either back.
    const gone = { deleted_at: new Date().toISOString(), public: 0, share_token: null, for_owners: 0 }
    write(() => save(sqlite, actor, id, gone, ownedView(sqlite, domain, id, actor)))
    return c.json({ id })
  })

  app.post('/views/:id/restore', (c) => {
    const actor = changing(c.get('actor'))
    const id = viewId(c.req.param('id'))
    write(() => save(sqlite, actor, id, { deleted_at: null }, ownedView(sqlite, domain, id, actor, true)))
    return c.json(outById(id, actor))
  })
}

// A human administrator only; a service account is refused whatever its role (attack 16).
function sharing(actor: Actor): Actor {
  if (!may(actor, 'views.share') || (actor.kind ?? 'user') !== 'user')
    forbid('only an administrator may publish a view')
  return actor
}

// An administrator publishes any live view it can see: its own, a shared one or a system view.
function shareable(sqlite: Database, id: number, actor: Actor): Raw {
  const raw = viewRaw(sqlite, id, false)
  if (!raw || (raw.owner_id !== actor.id && raw.shared !== 1)) throw unknownView(id)
  return raw
}

function checkPublishable(domain: Domain, raw: Raw): void {
  if (raw.source_type !== 'query') throw new ApiError(400, 'not_query', 'only a view on a query can be public')
  if (isForOwners(raw)) throw new ApiError(400, 'already_for_owners', 'a view for owners cannot also be public')
  const owner = sourceOf(domain, raw.source as string)?.owners?.owner
  if (owner && viewOf(raw).visible_fields.includes(owner)) {
    throw new ApiError(400, 'owner_column_visible', `hide "${owner}" before publishing this view`)
  }
}

/** A column served to the row's owner: declared owner_visible, and never the owner column. */
export function ownerVisible(source: Source, key: string): boolean {
  return (
    key !== source.owners?.owner && Object.hasOwn(source.columns, key) && source.columns[key]?.owner_visible === true
  )
}

export const notOwnerVisible = (key: string): ApiError =>
  new ApiError(400, 'column_not_owner_visible', `"${key}" is not shown to owners`, { key })

const keysOf = (raw: Raw): string[] => {
  const view = viewOf(raw)
  const sort = view.sort.map((key) => key.replace(/^-/, ''))
  return [...view.visible_fields, ...filterKeys(view.filters), ...sort, ...(view.group_by ? [view.group_by] : [])]
}

/** Why a view may not be shown to owners, or null: each listed, filtered, sorted or grouped key must be owner-visible. */
export function forOwnersProblem(domain: Domain, raw: Raw): ApiError | null {
  if (raw.source_type !== 'query') return new ApiError(400, 'not_query', 'only a view on a query can be for owners')
  const source = sourceOf(domain, raw.source as string)
  if (!source?.owners?.owner) return new ApiError(400, 'no_owner_column', `"${raw.source}" declares no owner column`)
  if (isPublic(raw) || raw.share_token != null)
    return new ApiError(400, 'already_public', 'a public view cannot also be for owners')
  const link = viewOf(raw).visible_fields.find((key) => Object.hasOwn(source.links ?? {}, key))
  if (link) return new ApiError(400, 'link_not_allowed', `"${link}" is a link; owners see columns only`, { key: link })
  try {
    const hidden = keysOf(raw).find((key) => !ownerVisible(source, key))
    return hidden === undefined ? null : notOwnerVisible(hidden)
  } catch (err) {
    if (err instanceof ApiError) return err
    throw err
  }
}

// A human administrator only; a service account is refused whatever its role (attack 16).
function showingToOwners(actor: Actor): Actor {
  if (actor.role !== 'administrator' || (actor.kind ?? 'user') !== 'user') {
    forbid('only an administrator may show a view to owners')
  }
  return actor
}

export function setForOwners(sqlite: Database, domain: Domain, id: number, actor: Actor): void {
  const raw = shareable(sqlite, id, actor)
  const problem = forOwnersProblem(domain, raw)
  if (problem) throw problem
  save(sqlite, actor, id, { for_owners: 1 }, raw)
}

export function shareRoutes(app: Hono<AuthEnv>, { sqlite, domain }: Store): void {
  const write = <T>(work: () => T): T => sqlite.transaction(work).immediate()

  app.put('/views/:id/share-token', (c) => {
    const actor = sharing(c.get('actor'))
    const id = viewId(c.req.param('id'))
    const token = secret()
    write(() => {
      const raw = shareable(sqlite, id, actor)
      checkPublishable(domain, raw)
      save(sqlite, actor, id, { public: 1, share_token: sha256(token) }, raw)
    })
    return c.json({ token })
  })

  app.delete('/views/:id/share-token', (c) => {
    const actor = sharing(c.get('actor'))
    const id = viewId(c.req.param('id'))
    write(() => save(sqlite, actor, id, { public: 0, share_token: null }, shareable(sqlite, id, actor)))
    return c.json({ id })
  })

  app.put('/views/:id/for-owners', (c) => {
    const actor = showingToOwners(c.get('actor'))
    const id = viewId(c.req.param('id'))
    write(() => setForOwners(sqlite, domain, id, actor))
    return c.json({ id, for_owners: true })
  })

  app.delete('/views/:id/for-owners', (c) => {
    const actor = showingToOwners(c.get('actor'))
    const id = viewId(c.req.param('id'))
    write(() => save(sqlite, actor, id, { for_owners: 0 }, shareable(sqlite, id, actor)))
    return c.json({ id, for_owners: false })
  })
}

const noPublicView = () => new ApiError(404, 'unknown_view', 'no public view answers this link')

function publicView(sqlite: Database, token: string): Raw {
  if (token.length > MAX_TOKEN) throw noPublicView()
  const hash = Buffer.from(sha256(token))
  const sql = `SELECT * FROM saved_view
               WHERE public = 1 AND share_token IS NOT NULL AND deleted_at IS NULL AND source_type = 'query'`
  const found = (sqlite.query(sql).all() as Raw[]).find((raw) => {
    const stored = Buffer.from(raw.share_token as string)
    return stored.length === hash.length && timingSafeEqual(stored, hash)
  })
  if (!found) throw noPublicView()
  return found
}

export function publicRows({ db, domain }: Store, raw: Raw, window: { from?: string; to?: string }) {
  const view = viewOf(raw)
  const source = sourceOf(domain, view.source)
  if (source?.kind !== 'query') throw noPublicView()
  const sort = view.sort.join(',')
  const params = {
    ...parseRowsParams(source, { ...window, sort, group: view.group_by ?? undefined }),
    filter: view.filters,
  }
  const owner = source.owners?.owner
  const keys = view.visible_fields.filter((key) => key !== owner && !Object.hasOwn(source.links ?? {}, key))
  const { rows, total } = readRows(db, domain, source, params, 'all')
  return {
    columns: keys.map((key) => ({ key, label: source.columns[key]?.label, type: source.columns[key]?.type })),
    rows: rows.map((row) => Object.fromEntries(keys.map((key) => [key, row[key]]))),
    total,
  }
}

// Registered before the session middleware: a token, not a session, opens it.
export function publicRoutes(app: Hono<AuthEnv>, store: Store, clientIp: (c: Context) => string): void {
  app.get('/public/views/:token', (c) => {
    const limit = { key: `public:ip:${clientIp(c)}`, max: 60, windowMs: 60_000 }
    checkLimits(store.sqlite, () => [limit], false)
    const query = c.req.query()
    const extra = Object.keys(query).find((key) => !PUBLIC_PARAMS.includes(key))
    if (extra) throw new ApiError(400, 'bad_param', `"${extra}" is not accepted; only from and to are`)
    const raw = publicView(store.sqlite, c.req.param('token'))
    return c.json(publicRows(store, raw, { from: query.from, to: query.to }))
  })
}
