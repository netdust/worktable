import { type Filter, fromEngine, isDate, type Join, type Kind, toEngine } from './grid/conditions'
import type { Layout, SortKey } from './grid/layout'
import type { DateWindow, Field, FieldType, GroupFact, Link, LinkItem, Lookup, MatrixAway, MatrixJoin, Model, ModelAction, Row, SavedView, Schema, Scope, Space, StoredArrangement, TableDef, Tone, View } from './types'

/** A column as `GET /api/schema` declares it. */
export interface EngineColumn {
  type: 'text' | 'integer' | 'real' | 'boolean' | 'date' | 'datetime' | 'json'
  label: string
  nullable?: boolean
  default?: unknown
  options?: Record<string, string>
  tones?: Record<string, Tone>
  /** The dataset its integer points at. */
  relation?: string
  readonly?: true
  /** A query column's edit goes to this dataset's field, on the record `row[key]` names. */
  writes?: { dataset: string; field: string; key: string }
  owner_visible?: boolean
  /** Stored and written through the API, never shown in the grid. */
  hidden?: true
}

/** A dataset's lookup: the related row's field, typed as that field; an inherited one is the row's own when set. */
export type EngineLookup = EngineColumn & { inherited?: true; from?: string }

/** A join dataset's matrix: down and across are its relation columns, cell an options column. */
export interface EngineMatrix {
  down: string
  across: string
  label?: string
  cell: string
  note?: string
  keys: Record<string, string>
  marks: Record<string, string>
  count: string
  away?: { dataset: string; across: string; label: string; end: string }
  open?: { match: string; count: string; fill: string }
}

export interface EngineSource {
  kind: 'dataset' | 'query'
  label: string
  /** The column the grid shows as a row's title; with `title_via`, the fallback column the engine reads it from. */
  title: string
  /** The title comes through this relation: computed by the engine, never written. */
  title_via?: string
  /** On a join dataset. */
  matrix?: EngineMatrix
  /** On a matrix's down source: the join dataset. */
  matrix_join?: string
  date: string | null
  /** A dataset with a writer, or a query with a mapped column. */
  writable?: boolean
  deletable?: boolean
  actions?: ModelAction[]
  /** Served only beside the schema's `space`. */
  space?: 'scoped' | 'global'
  /** An administrator's pick from the engine's icon set, else null. */
  icon?: string | null
  /** A query's new rows are created in this dataset. */
  creates?: string
  /** The dataset a query reads; served only to a caller who can read it. */
  of?: string
  /** The words of the button that adds a row, while the dataset keeps its declared name. */
  new_label?: string
  group_facts?: GroupFact[]
  columns: Record<string, EngineColumn>
  lookups?: Record<string, EngineLookup>
  /** The rows of other datasets that point at a row, by link name; served only to a reader of that dataset. */
  links?: Record<string, Link & { label: string }>
  /** A write to this column is a transition: the grid sends the value it showed as `expect`. */
  lifecycle?: { column: string }
  /** Each record has a link its person reads their views through. */
  record_link?: true
  attachments?: { kinds: Record<string, string>; max_mb: number; owner_visible?: true; owner_writable?: true }
}

/** What the engine stores of a view's arrangement; a bare scalar in `filters` means `$eq`, a leading `-` in `sort` descending. */
export interface EngineArrangement {
  filters: Record<string, unknown>
  sort: string[]
  group_by: string | null
  visible_fields: string[]
}

/** A saved view as `GET /api/views` serves it. */
export interface EngineView extends EngineArrangement {
  id: number
  name: string
  source_type: 'dataset' | 'query'
  source: string
  skin: 'table' | 'matrix'
  shared: boolean
  owner_id: number
  mine: boolean
  editable: boolean
  public?: boolean
  for_owners?: boolean
}

export interface EngineSchema {
  sources: Record<string, EngineSource>
  /** Served only to a caller who can read the space's dataset. */
  space?: Space
  sections?: { label: string; sources: string[] }[]
}

export interface EngineRow {
  id: number
  custom: Record<string, unknown>
  lookups: Record<string, { id: number; title: string } | null>
  title?: string
  /** With `cells=1`: the matrix's live join rows. */
  cells?: EngineRow[]
  /** On a write reply: the write's batch and the columns it changed. */
  revision?: { batch_id: string | null; changed: string[] }
  /** Per link name, the linked rows the caller may read. */
  links?: Record<string, LinkItem[]>
  inherited?: string[]
  [column: string]: unknown
}

/** A datetime is stored as ISO text: it sorts as it reads. */
const TYPES: Record<EngineColumn['type'], FieldType> = {
  text: 'text', datetime: 'datetime', json: 'json', integer: 'int', real: 'float', boolean: 'bool', date: 'date',
}

const isReadonly = (column: EngineColumn | undefined, source: EngineSource): boolean =>
  Boolean(column?.readonly) || (source.kind === 'query' && !column?.writes)

type Sources = Record<string, EngineSource>

/** The column the grid's `title` stands for; none for a title through a relation. */
export const titleColumn = (source: EngineSource): string | null => (source.title_via ? null : source.title)

/** The engine serves a mapped query column with its target's options and tones; only the relation is read off the target here. */
function asTarget(column: EngineColumn, sources: Sources): EngineColumn {
  const target = column.writes ? sources[column.writes.dataset]?.columns[column.writes.field] : undefined
  const relation = column.relation ?? target?.relation
  return relation ? { ...column, relation } : column
}

function fieldOf(declared: EngineColumn, source: EngineSource, sources: Sources): Field {
  const column = asTarget(declared, sources)
  const type: FieldType = column.relation ? 'relation' : column.options ? 'select' : TYPES[column.type]
  return {
    type,
    label: column.label,
    required: !column.nullable,
    ...(column.default !== undefined ? { defaulted: true } : {}),
    fact: false,
    ...(column.options ? { options: column.options } : {}),
    ...(column.tones ? { tones: column.tones } : {}),
    ...(column.relation ? { relation: { model: column.relation, multiple: false } } : {}),
    ...(isReadonly(column, source) ? { readonly: true } : {}),
    ...(column.writes ? { writes: column.writes } : {}),
    ...(declared.owner_visible ? { owner_visible: true as const } : {}),
  }
}

function lookupField({ inherited, from, ...column }: EngineLookup, source: EngineSource, sources: Sources): Field {
  return { ...fieldOf(column, source, sources), ...(inherited && from ? { via: from } : {}) }
}

function titleLabel(source: EngineSource): string {
  const label = (column: string) => source.columns[column]?.label ?? column
  return source.title_via ? `${label(source.title_via)} / ${label(source.title)}` : label(source.title)
}

/** The columns the grid offers: never the title column, `id`, nor a hidden column. */
const shownColumns = (source: EngineSource): [string, EngineColumn][] =>
  Object.entries(source.columns).filter(([key, column]) => key !== titleColumn(source) && key !== 'id' && !column.hidden)

/** A dataset without a writer still lists its files; only a writable one takes and removes them. */
function attachable({ kinds, max_mb }: NonNullable<EngineSource['attachments']>, writable: boolean): NonNullable<Model['attachments']> {
  return { kinds, max_mb, ...(writable ? { writable: true as const } : {}) }
}

/** The row's own id is the grid's `id`, never a field. */
function modelOf(name: string, source: EngineSource, sources: Sources): Model {
  const fields = shownColumns(source)
  // The matrix's open column runs its fill; offered on any row it would only be refused.
  const actions = source.actions?.filter((action) => action.name !== source.matrix?.open?.fill)
  return {
    key: name,
    label: source.label,
    title_label: titleLabel(source),
    ...(titleColumn(source) ? { title_field: titleColumn(source) as string } : {}),
    title_readonly: !source.writable || Boolean(source.title_via) || isReadonly(source.columns[source.title], source),
    ...(source.columns[source.title]?.nullable ? { title_required: false } : {}),
    ...(source.title_via ? { title_derived: true } : {}),
    ...(source.kind === 'query' ? { query: true } : {}),
    ...(source.deletable ? { deletable: true } : {}),
    ...(source.creates ? { creates: source.creates } : {}),
    ...(source.new_label ? { new_label: source.new_label } : {}),
    ...(actions?.length ? { actions } : {}),
    ...(source.record_link ? { record_link: true as const } : {}),
    ...(source.attachments ? { attachments: attachable(source.attachments, source.writable === true) } : {}),
    fields: {
      ...Object.fromEntries(fields.map(([key, column]) => [key, fieldOf(column, source, sources)])),
      ...Object.fromEntries(Object.entries(source.lookups ?? {}).map(([key, lookup]) => [key, lookupField(lookup, source, sources)])),
      ...Object.fromEntries(Object.entries(source.links ?? {}).map(([name, link]) => [name, linkField(link)])),
    },
  }
}

function linkField({ label, ...link }: Link & { label: string }): Field {
  return { type: 'links', label, required: false, fact: false, link }
}

function joinOf(model: string, m: EngineMatrix, joined: EngineSource): MatrixJoin {
  const lifecycle = joined.lifecycle?.column
  return {
    model, row_field: m.down, column_field: m.across, cell_field: m.cell, keys: m.keys, marks: m.marks, count: m.count,
    ...(m.label ? { name_field: m.label } : {}),
    ...(m.note ? { note_field: m.note } : {}),
    ...(lifecycle ? { lifecycle } : {}),
    ...openOf(m, joined),
  }
}

/** The open column, when the fill action is served with its one input. */
function openOf(m: EngineMatrix, joined: EngineSource): Pick<MatrixJoin, 'open'> {
  const fill = joined.actions?.find((action) => action.name === m.open?.fill)
  const [input] = Object.keys(fill?.input ?? {})
  if (!m.open || !fill || input === undefined) return {}
  return { open: { match_field: m.open.match, count_field: m.open.count, action: fill.name, input } }
}

function awayOf(away: NonNullable<EngineMatrix['away']>, sources: Sources): MatrixAway {
  const date_field = sources[away.dataset]?.date ?? ''
  return { table: away.dataset, model: away.dataset, column_field: away.across, label_field: away.label, date_field, end_field: away.end }
}

function tableDefOf(name: string, source: EngineSource, sources: Sources): TableDef {
  const table: TableDef = {
    key: name, label: source.label, model: name,
    ...(source.date ? { date_field: source.date } : {}),
    ...(source.space ? { space: source.space } : {}),
    ...(source.kind === 'query' ? { query: true } : {}),
    ...(source.of ? { of: source.of } : {}),
    ...(source.icon ? { icon: source.icon } : {}),
    ...(source.group_facts ? { facts: source.group_facts } : {}),
    types: ['grid'],
  }
  const joined = source.matrix_join ? sources[source.matrix_join] : undefined
  const matrix = joined?.matrix
  if (!source.matrix_join || !joined || !matrix) return table
  const join = joinOf(source.matrix_join, matrix, joined)
  return { ...table, types: ['grid', 'matrix'], join, ...(matrix.away ? { away: awayOf(matrix.away, sources) } : {}) }
}

/** A table for every source: the rail lists those a saved view is on. */
export function toSchema(s: EngineSchema): Schema {
  return {
    models: Object.fromEntries(Object.entries(s.sources).map(([name, source]) => [name, modelOf(name, source, s.sources)])),
    tables: Object.entries(s.sources).map(([name, source]) => tableDefOf(name, source, s.sources)),
    views: [],
    writable: Object.fromEntries(Object.entries(s.sources).map(([name, source]) => [name, source.writable === true])),
    ...(s.space ? { space: s.space } : {}),
    ...(s.sections ? { sections: s.sections } : {}),
  }
}

/** A column name as the grid's column id: the title column is the grid's `title`. */
const columnId = (source: EngineSource, column: string): string => (column === titleColumn(source) ? 'title' : column)

const isObject = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value)

/** What a source's column is, for the operators the filter builder offers on it. */
export function kindOf(source: EngineSource | undefined): (field: string) => Kind {
  return (field) => {
    const column = source?.columns[field] ?? source?.lookups?.[field]
    if (!column) return 'text'
    if (column.relation || column.options) return 'choice'
    if (column.type === 'boolean') return 'bool'
    if (column.type === 'date' || column.type === 'datetime') return column.type
    return 'text'
  }
}

/** A stored filter as the builder's conditions; what no condition says stays the view's fixed filter. */
function splitFilters(filters: Record<string, unknown>, source: EngineSource): { chips: Filter[]; fixed: Record<string, unknown>; join: Join } {
  const { conditions, fixed, join } = fromEngine(filters, kindOf(source))
  return { chips: conditions, fixed, join }
}

/** The grid's field ids, in declared order. */
const fieldsOf = (source: EngineSource): string[] => [
  ...shownColumns(source).map(([key]) => key),
  ...Object.keys(source.lookups ?? {}),
  ...Object.keys(source.links ?? {}),
]

/** A stored view as the grid's arrangement: its visible columns are the order, the rest hidden; widths and picks are never stored. */
export function fromStoredView(view: EngineArrangement, source: EngineSource): { arrangement: StoredArrangement; fixed: Record<string, unknown> } {
  const sort: SortKey[] = view.sort.map((key) => {
    const desc = key.startsWith('-')
    return { id: columnId(source, desc ? key.slice(1) : key), desc }
  })
  const fields = fieldsOf(source)
  const { chips, fixed, join } = splitFilters(view.filters, source)
  const order = view.visible_fields.map((key) => columnId(source, key)).filter((id) => id === 'title' || fields.includes(id))
  const arrangement = {
    hidden: fields.filter((key) => !view.visible_fields.includes(key)),
    order: order.includes('title') ? order : ['title', ...order],
    widths: [],
    sort,
    filters: chips,
    ...(join === 'or' ? { join } : {}),
    group: view.group_by === null ? null : columnId(source, view.group_by),
    picked: [],
  }
  return { arrangement, fixed }
}

/** A condition and a fixed filter on one column both hold: `{ status: { $in: [...], $exists: true } }`. */
function mergeFilters(chips: Filter[], fixed: Record<string, unknown>, source?: EngineSource, join?: Join): Record<string, unknown> {
  const merged: Record<string, unknown> = { ...fixed }
  for (const [field, condition] of Object.entries(toEngine(chips, kindOf(source), join))) {
    const kept = merged[field]
    merged[field] = field !== '$or' && isObject(kept) && isObject(condition) ? { ...kept, ...condition } : condition
  }
  return merged
}

/** The selected space record narrows the rows as a fixed filter would, beside any other condition on its column. */
export function withScope(fixed: Record<string, unknown>, scope: Scope | null): Record<string, unknown> {
  if (!scope) return fixed
  const kept = fixed[scope.field]
  return { ...fixed, [scope.field]: isObject(kept) ? { ...kept, $eq: scope.id } : { $eq: scope.id } }
}

/**
 * The arrangement as the engine stores it. `visible_fields` is the shown columns in their order, the title column where it stands (first when it was never moved):
 * a hidden column keeps no place, so shown again after a re-read it comes last. Widths, picks and matrix keys stay in the browser; lookup, rollup and custom (`custom` JSON) columns are not stored,
 * so hiding or reordering one is lost on save. Custom fields come with Field, step 5.
 */
export function toStoredView(arrangement: StoredArrangement, fixed: Record<string, unknown>, source: EngineSource): EngineArrangement {
  const title = titleColumn(source)
  const fields = fieldsOf(source)
  const kept = arrangement.order.filter((id) => fields.includes(id) || (id === 'title' && title !== null))
  const placed = kept.includes('title') || title === null ? kept : ['title', ...kept]
  const shown = [...placed, ...fields.filter((id) => !placed.includes(id))].filter((id) => !arrangement.hidden.includes(id))
  const group = arrangement.group === null ? null : engineColumn(arrangement.group, title)
  return {
    filters: mergeFilters(arrangement.filters, fixed, source, arrangement.join),
    sort: arrangement.sort.flatMap(({ id, desc }) => {
      const column = engineColumn(id, title)
      return column === null ? [] : [desc ? `-${column}` : column]
    }),
    group_by: group,
    visible_fields: shown.map((id) => (id === 'title' ? title ?? id : id)),
  }
}

/** Each saved view merged over its source's table, as `Json::saved` merged one over its table; a view on a source not served is left out. */
export function toSavedViews(views: EngineView[], sources: Sources): SavedView[] {
  return views.flatMap((view) => {
    const source = sources[view.source]
    if (!source) return []
    const { arrangement, fixed } = fromStoredView(view, source)
    return [{
      ...tableDefOf(view.source, source, sources),
      key: String(view.id),
      label: view.name,
      table: view.source,
      table_label: source.label,
      type: view.skin === 'matrix' ? 'matrix' : 'grid',
      starting: false,
      id: view.id,
      arrangement,
      fixed,
      shared: view.shared,
      owner: { id: view.owner_id, name: '' },
      mine: view.mine,
      editable: view.editable,
      ...(view.public ? { public: true } : {}),
      ...(view.for_owners ? { for_owners: true } : {}),
    }]
  })
}

function lookupOf(found: { id: number; title: string } | null): Lookup | null {
  return found ? { id: found.id, title: found.title, status: '', fields: {} } : null
}

/** The engine titles every row; a matrix row's join rows become its `rollups.cells`. */
export function toRow(r: EngineRow): Row {
  const { id, custom: _custom, lookups, title, cells, revision: _revision, links, inherited, ...fields } = r
  return {
    id,
    title: title ?? '',
    status: '',
    fields: { ...fields, ...links },
    lookups: Object.fromEntries(Object.entries(lookups).map(([key, found]) => [key, lookupOf(found)])),
    ...(inherited ? { inherited } : {}),
    ...(cells ? { rollups: { cells: cells.map(toRow) } } : {}),
  }
}

/** The grid holds a relation as a list of ids, and a cleared cell as ''; the engine takes one id, and null. A cleared non-nullable text stays '' for its writer to refuse. */
function wireValue(column: EngineColumn | undefined, value: unknown): unknown {
  if (column?.relation && Array.isArray(value)) return value[0] ?? null
  return column && value === '' && (column.type !== 'text' || column.nullable) ? null : value
}

/** A write's grid fields as the engine's columns: the grid's `title` is the source's title column; a title through a relation is never written. */
export function toEngineData(data: Record<string, unknown>, source: EngineSource, sources: Sources): Record<string, unknown> {
  return Object.fromEntries(Object.entries(data).flatMap(([key, value]) => {
    const name = key === 'title' ? titleColumn(source) : key
    if (name === null) return []
    const declared = source.columns[name] ?? source.lookups?.[name]
    const target = declared?.writes ? sources[declared.writes.dataset]?.columns[declared.writes.field] : declared
    return [[name, wireValue(target ?? declared, value)]]
  }))
}

/** A grid column id as the engine's column; null for what only the grid computes. */
function engineColumn(id: string, title: string | null): string | null {
  if (id.startsWith('lookups.') || id.startsWith('rollups.')) return null
  return id === 'title' ? title : id
}

/** The layout's filters, sort and group as `/rows` params; the grid sorts lookups and rollups itself. */
/**
 * The rows request. A table's date condition travels in `filter`; a matrix passes its window as `from`/`to`,
 * and its date condition stays out of `filter`, so the two never narrow each other to nothing.
 */
export function rowsQuery(view: Pick<View, 'date_field' | 'fixed'>, layout: Layout, window: Partial<DateWindow>, title: string | null, source?: EngineSource): Record<string, string> {
  const query: Record<string, string> = {}
  const windowed = Boolean(view.date_field && window.from && window.to)
  const conditions = windowed ? layout.filters.filter((f) => !(f.field === view.date_field && isDate(f.op))) : layout.filters
  const filters = mergeFilters(conditions, view.fixed ?? {}, source, layout.join)
  if (Object.keys(filters).length > 0) query.filter = JSON.stringify(filters)
  const sort = layout.sort.flatMap(({ id, desc }) => {
    const column = engineColumn(id, title)
    return column === null ? [] : [desc ? `-${column}` : column]
  })
  if (sort.length > 0) query.sort = sort.join(',')
  const group = layout.group === null ? null : engineColumn(layout.group, title)
  if (group !== null) query.group = group
  if (view.date_field && window.from) query.from = window.from
  if (view.date_field && window.to) query.to = window.to
  return query
}
