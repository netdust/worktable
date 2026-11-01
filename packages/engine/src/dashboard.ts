import type { Database } from 'bun:sqlite'
import { readable } from './access'
import {
  type Actor,
  type DashboardLayout,
  type Domain,
  type QuickAction,
  type SavedViewSeed,
  type Tile,
  TONES,
  type Tone,
} from './declare'
import { hasField } from './lookups'
import { ApiError } from './params'
import { type Source, sourceOf, writerOf } from './registry'
import { seedKey } from './saved-view'

const MAX_SECTIONS = 6
const MAX_TILES = 12
const MAX_ACTIONS = 8
const MAX_LABEL = 80
const MAX_ROWS = 50

type Fields = Record<string, unknown>
interface Ctx {
  domain: Domain
  sqlite: Database
  actor: Actor
}

const bad = (message: string) => new ApiError(400, 'bad_view', message)
const isObject = (v: unknown): v is Fields => typeof v === 'object' && v !== null && !Array.isArray(v)

function shaped(value: unknown, what: string, keys: string[], required = keys): Fields {
  if (!isObject(value)) throw bad(`${what} must be an object`)
  const extra = Object.keys(value).find((key) => !keys.includes(key))
  if (extra !== undefined) throw bad(`${what}: "${extra}" is not a key it takes`)
  const missing = required.find((key) => value[key] === undefined)
  if (missing !== undefined) throw bad(`${what} needs "${missing}"`)
  return value
}

function listOf(value: unknown, what: string, max: number): unknown[] {
  if (!Array.isArray(value)) throw bad(`${what} must be a list`)
  if (value.length > max) throw bad(`a layout holds at most ${max} ${what}`)
  return value
}

function labelOf(value: unknown, what: string): string {
  if (typeof value !== 'string' || value.trim().length < 1 || value.length > MAX_LABEL)
    throw bad(`${what} label must be 1 to ${MAX_LABEL} characters`)
  if (/[\p{Cc}\p{Cf}]/u.test(value)) throw bad(`${what} label must not hold control or format characters`)
  return value
}

const LISTABLE =
  'SELECT skin, source FROM saved_view WHERE id = ? AND deleted_at IS NULL AND (owner_id = ? OR shared = 1)'

// A tile reads a view the actor can list, with a source it can read: never a dashboard.
function viewNamed(ctx: Ctx, value: unknown): { id: number; skin: string; source: Source } {
  const id = typeof value === 'number' && Number.isSafeInteger(value) && value > 0 ? value : null
  const raw = id === null ? null : (ctx.sqlite.query(LISTABLE).get(id, ctx.actor.id) as Fields | null)
  const source = typeof raw?.source === 'string' ? sourceOf(ctx.domain, raw.source) : null
  if (id === null || !source || !readable(ctx.actor, source)) throw bad(`a tile names no view ${JSON.stringify(value)}`)
  return { id, skin: String(raw?.skin), source }
}

function summed(source: Source, value: unknown): string {
  const { sum } = shaped(value, 'measure', ['sum'])
  const type = typeof sum === 'string' && Object.hasOwn(source.columns, sum) ? source.columns[sum]?.type : undefined
  if (type !== 'integer' && type !== 'real') throw bad(`cannot sum "${String(sum)}": not a number column of the view`)
  return sum as string
}

function toneOf(value: unknown): { above: number; tone: Tone } {
  const { above, tone } = shaped(value, 'tone', ['above', 'tone'])
  if (typeof above !== 'number' || !Number.isFinite(above)) throw bad('tone.above must be a number')
  if (!TONES.includes(tone as Tone)) throw bad(`unknown tone "${String(tone)}"`)
  return { above, tone: tone as Tone }
}

function statOf(ctx: Ctx, value: unknown): Tile {
  const t = shaped(value, 'a stat tile', ['kind', 'view', 'label', 'measure', 'tone'], ['view', 'measure'])
  const { id, source } = viewNamed(ctx, t.view)
  return {
    kind: 'stat',
    view: id,
    ...(t.label === undefined ? {} : { label: labelOf(t.label, 'a tile') }),
    measure: t.measure === 'count' ? 'count' : { sum: summed(source, t.measure) },
    ...(t.tone === undefined ? {} : { tone: toneOf(t.tone) }),
  }
}

// The options a column writes: a dataset's own editable column, or a query column that writes, read from its target.
function writtenOptions(domain: Domain, source: Source, column: string): Record<string, string> | undefined {
  const decl = Object.hasOwn(source.columns, column) ? source.columns[column] : undefined
  if (!decl) return undefined
  if (source.kind === 'dataset') return decl.readonly ? undefined : decl.options
  if (!decl.writes) return undefined
  return decl.options ?? sourceOf(domain, decl.writes.dataset)?.columns[decl.writes.field]?.options
}

function setOf(domain: Domain, source: Source, value: unknown): { column: string; value: string; label: string } {
  const set = shaped(value, 'a set', ['column', 'value', 'label'])
  const column = String(set.column)
  const options = writtenOptions(domain, source, column)
  if (!options) throw bad(`"${column}" does not write an option`)
  if (typeof set.value !== 'string' || !Object.hasOwn(options, set.value))
    throw bad(`"${String(set.value)}" is not an option of "${column}"`)
  return { column, value: set.value, label: labelOf(set.label, 'a set') }
}

function columnsOf(source: Source, value: unknown): string[] {
  if (!Array.isArray(value) || !value.every((key) => typeof key === 'string')) throw bad('columns must be a list')
  const unknown = value.find((key) => !hasField(source, key))
  if (unknown !== undefined) throw bad(`columns: "${unknown}" is not a column`)
  return value
}

function listTileOf(ctx: Ctx, value: unknown): Tile {
  const t = shaped(value, 'a list tile', ['kind', 'view', 'rows', 'columns', 'set'], ['view', 'rows'])
  const { id, source } = viewNamed(ctx, t.view)
  if (typeof t.rows !== 'number' || !Number.isInteger(t.rows) || t.rows < 1 || t.rows > MAX_ROWS)
    throw bad(`a list shows 1 to ${MAX_ROWS} rows`)
  return {
    kind: 'list',
    view: id,
    rows: t.rows,
    ...(t.columns === undefined ? {} : { columns: columnsOf(source, t.columns) }),
    ...(t.set === undefined ? {} : { set: setOf(ctx.domain, source, t.set) }),
  }
}

function weekOf(ctx: Ctx, value: unknown): Tile {
  const t = shaped(value, 'a week tile', ['kind', 'view'])
  const { id, skin } = viewNamed(ctx, t.view)
  if (skin !== 'calendar') throw bad(`a week tile needs a calendar view; view ${id} is not one`)
  return { kind: 'week', view: id }
}

function progressOf(ctx: Ctx, value: unknown): Tile {
  const t = shaped(value, 'a progress tile', ['kind', 'done', 'total', 'label'])
  const done = viewNamed(ctx, t.done).id
  const total = viewNamed(ctx, t.total).id
  return { kind: 'progress', done, total, label: labelOf(t.label, 'a tile') }
}

/** The ids of the views a layout's tiles name. */
export const tileViews = (layout: DashboardLayout): number[] =>
  layout.sections
    .flatMap((s) => s.tiles.flatMap((t) => (t.kind === 'progress' ? [t.done, t.total] : [t.view])))
    .filter((view): view is number => typeof view === 'number')

const TILES: Record<string, (ctx: Ctx, value: unknown) => Tile> = {
  stat: statOf,
  list: listTileOf,
  week: weekOf,
  progress: progressOf,
}

function tileOf(ctx: Ctx, value: unknown): Tile {
  const kind = isObject(value) ? value.kind : undefined
  const read = typeof kind === 'string' && Object.hasOwn(TILES, kind) ? TILES[kind] : undefined
  if (!read) throw bad(`unknown tile kind "${String(kind)}"`)
  return read(ctx, value)
}

function sectionOf(ctx: Ctx, value: unknown): DashboardLayout['sections'][number] {
  const section = shaped(value, 'a section', ['label', 'tiles'])
  return {
    label: labelOf(section.label, 'a section'),
    tiles: listOf(section.tiles, 'tiles', MAX_TILES).map((tile) => tileOf(ctx, tile)),
  }
}

function actionOf({ domain, actor }: Ctx, value: unknown): QuickAction {
  const action = shaped(value, 'an action', ['create', 'label'])
  const name = String(action.create)
  const dataset = domain.datasets.find((d) => d.name === name)
  if (!dataset || !writerOf(domain, name)?.create || !readable(actor, dataset))
    throw bad(`an action cannot create in "${name}"`)
  return { create: name, label: labelOf(action.label, 'an action') }
}

/** A dashboard's layout, rebuilt from what it was given; every view it names is one the actor can list. */
export function layoutOf(domain: Domain, sqlite: Database, raw: unknown, actor: Actor): DashboardLayout {
  const ctx = { domain, sqlite, actor }
  const layout = shaped(raw, 'layout', ['sections', 'actions'])
  return {
    sections: listOf(layout.sections, 'sections', MAX_SECTIONS).map((section) => sectionOf(ctx, section)),
    actions: listOf(layout.actions, 'actions', MAX_ACTIONS).map((action) => actionOf(ctx, action)),
  }
}

/** A seed's view names to the ids they were seeded under; null for a name two seeds share, "gone" for one a person deleted. */
export type SeededIds = Map<string, number | null | 'gone'>

const refOf = (ids: SeededIds, ref: string | number): number | 'gone' => {
  if (typeof ref === 'number') return ref
  const id = ids.get(ref)
  if (id === undefined) throw new Error(`a dashboard tile names unknown view "${ref}"`)
  if (id === null) throw new Error(`a dashboard tile names "${ref}", which two seeded views share`)
  return id
}

// A tile on a gone view is dropped, and the view's name goes to `dropped`.
function resolvedTile(tile: Tile, ids: SeededIds, dropped: string[]): Tile | null {
  const refs = tile.kind === 'progress' ? [tile.done, tile.total] : [tile.view]
  const found = refs.map((ref) => refOf(ids, ref))
  const gone = refs.filter((_, at) => found[at] === 'gone')
  if (gone.length > 0) {
    dropped.push(...gone.map(String))
    return null
  }
  if (tile.kind === 'progress') return { ...tile, done: found[0] as number, total: found[1] as number }
  return { ...tile, view: found[0] as number }
}

export function resolveSeedLayout(layout: DashboardLayout, ids: SeededIds, dropped: string[] = []): DashboardLayout {
  const resolve = (tile: Tile) => resolvedTile(tile, ids, dropped)
  return {
    ...layout,
    sections: layout.sections.map((s) => ({ ...s, tiles: s.tiles.map(resolve).filter((t): t is Tile => t !== null) })),
  }
}

const KEYED =
  'SELECT id, deleted_at FROM saved_view WHERE seed_key = ? AND owner_id = ? ORDER BY deleted_at IS NOT NULL, id'
const SEEDED_ID = `SELECT id FROM saved_view WHERE name = ? AND source IS ? AND deleted_at IS NULL
                   AND owner_id != ? AND shared = 1 ORDER BY id LIMIT 1`

// A seeded view is found by its key, a deleted one included; a colleague's shared view of the same name and source
// stands in only when no row carries the key.
function seededIds(sqlite: Database, domain: Domain, system: Actor): SeededIds {
  const ids: SeededIds = new Map()
  for (const seed of domain.views.filter((v) => v.skin !== 'dashboard')) {
    if (ids.has(seed.name)) {
      ids.set(seed.name, null)
      continue
    }
    const keyed = sqlite.query(KEYED).get(seedKey(seed.name, seed.source), system.id) as {
      id: number
      deleted_at: string | null
    } | null
    if (keyed) {
      ids.set(seed.name, keyed.deleted_at === null ? keyed.id : 'gone')
      continue
    }
    const other = sqlite.query(SEEDED_ID).get(seed.name, seed.source ?? null, system.id) as { id: number } | null
    if (other) ids.set(seed.name, other.id)
  }
  return ids
}

/** A dashboard seed's layout as stored, its views by id; throws naming the dashboard and what is wrong. */
export function seededLayout(
  sqlite: Database,
  domain: Domain,
  seed: SavedViewSeed,
  system: Actor,
  dropped: string[] = [],
): DashboardLayout {
  try {
    const ids = seededIds(sqlite, domain, system)
    return layoutOf(
      domain,
      sqlite,
      resolveSeedLayout(seed.layout ?? { sections: [], actions: [] }, ids, dropped),
      system,
    )
  } catch (err) {
    throw new Error(`dashboard "${seed.name}": ${(err as Error).message}`)
  }
}
