import type { Filter, Layout, SortKey } from './grid/layout'
import type { DateWindow, Field, FieldType, GroupFact, Lookup, MatrixAway, MatrixJoin, Model, ModelAction, Row, SavedView, Schema, Scope, Space, StoredArrangement, TableDef, View } from './types'

/** A column as `GET /api/schema` declares it. */
export interface EngineColumn {
  type: 'text' | 'integer' | 'real' | 'boolean' | 'date' | 'datetime' | 'json'
  label: string
  nullable?: boolean
  default?: unknown
  options?: Record<string, string>
  /** The dataset its integer points at. */
  relation?: string
  readonly?: true
  /** A query column's edit goes to this dataset's field, on the record `row[key]` names. */
  writes?: { dataset: string; field: string; key: string }
  inherited?: { flag: string; own: string }
}

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
  group_facts?: GroupFact[]
  columns: Record<string, EngineColumn>
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

/** A mapped query column reads as its target column, unless it declares its own options or relation. */
function asTarget(column: EngineColumn, sources: Sources): EngineColumn {
  const target = column.writes ? sources[column.writes.dataset]?.columns[column.writes.field] : undefined
  if (!target) return column
  const options = column.options ?? target.options
  const relation = column.relation ?? target.relation
  return { ...column, ...(options ? { options } : {}), ...(relation ? { relation } : {}) }
}

function fieldOf(declared: EngineColumn, source: EngineSource, sources: Sources): Field {
  const column = asTarget(declared, sources)
  const type: FieldType = column.relation ? 'relation' : column.options ? 'select' : TYPES[column.type]
  return {
    type,
    label: column.label,
    required: !column.nullable && column.default === undefined,
    fact: false,
    ...(column.options ? { options: column.options } : {}),
    ...(column.relation ? { relation: { model: column.relation, multiple: false } } : {}),
    ...(isReadonly(column, source) ? { readonly: true } : {}),
    ...(column.writes ? { writes: column.writes } : {}),
    ...(declared.inherited ? { inherited: declared.inherited } : {}),
  }
}

function titleLabel(source: EngineSource): string {
  const label = (column: string) => source.columns[column]?.label ?? column
  return source.title_via ? `${label(source.title_via)} / ${label(source.title)}` : label(source.title)
}

/** The row's own id is the grid's `id`, never a field. */
function modelOf(name: string, source: EngineSource, sources: Sources): Model {
  const fields = Object.entries(source.columns).filter(([key]) => key !== titleColumn(source) && key !== 'id')
  return {
    key: name,
    label: source.label,
    title_label: titleLabel(source),
    title_readonly: !source.writable || Boolean(source.title_via) || isReadonly(source.columns[source.title], source),
    ...(source.columns[source.title]?.nullable ? { title_required: false } : {}),
    ...(source.title_via ? { title_derived: true } : {}),
    ...(source.kind === 'query' ? { query: true } : {}),
    ...(source.deletable ? { deletable: true } : {}),
    ...(source.actions?.length ? { actions: source.actions } : {}),
    fields: Object.fromEntries(fields.map(([key, column]) => [key, fieldOf(column, source, sources)])),
  }
}

function joinOf(model: string, m: EngineMatrix): MatrixJoin {
  return {
    model, row_field: m.down, column_field: m.across, cell_field: m.cell, keys: m.keys, marks: m.marks, count: m.count,
    ...(m.label ? { name_field: m.label } : {}),
    ...(m.note ? { note_field: m.note } : {}),
  }
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
    ...(source.group_facts ? { facts: source.group_facts } : {}),
    types: ['grid'],
  }
  const matrix = source.matrix_join ? sources[source.matrix_join]?.matrix : undefined
  if (!source.matrix_join || !matrix) return table
  return { ...table, types: ['grid', 'matrix'], join: joinOf(source.matrix_join, matrix), ...(matrix.away ? { away: awayOf(matrix.away, sources) } : {}) }
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

function chipValue(value: unknown): string | null {
  if (typeof value === 'boolean') return value ? '1' : ''
  return typeof value === 'string' || typeof value === 'number' ? String(value) : null
}

const isObject = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value)

/** Only `$eq` on a scalar is a chip, the grid has no word for the other operators; those stay as the view's fixed filters. */
function splitFilters(filters: Record<string, unknown>): { chips: Filter[]; fixed: Record<string, unknown> } {
  const chips: Filter[] = []
  const fixed: Record<string, unknown> = {}
  for (const [field, raw] of Object.entries(filters)) {
    const { $eq, ...rest } = isObject(raw) ? raw : { $eq: raw }
    const value = chipValue($eq)
    if (value !== null) chips.push({ field, value })
    const kept = value === null ? raw : rest
    if (!isObject(kept) || Object.keys(kept).length > 0) fixed[field] = kept
  }
  return { chips, fixed }
}

/** The grid's field ids, in declared order: never the title column nor `id`. */
const fieldsOf = (source: EngineSource): string[] => Object.keys(source.columns).filter((key) => key !== titleColumn(source) && key !== 'id')

/** A stored view as the grid's arrangement: its visible columns are the order, the rest hidden; widths and picks are never stored. */
export function fromStoredView(view: EngineArrangement, source: EngineSource): { arrangement: StoredArrangement; fixed: Record<string, unknown> } {
  const sort: SortKey[] = view.sort.map((key) => {
    const desc = key.startsWith('-')
    return { id: columnId(source, desc ? key.slice(1) : key), desc }
  })
  const fields = fieldsOf(source)
  const { chips, fixed } = splitFilters(view.filters)
  const arrangement = {
    hidden: fields.filter((key) => !view.visible_fields.includes(key)),
    order: view.visible_fields.filter((key) => fields.includes(key)),
    widths: [],
    sort,
    filters: chips,
    group: view.group_by === null ? null : columnId(source, view.group_by),
    picked: [],
  }
  return { arrangement, fixed }
}

/** A chip and a fixed filter on one column both hold: `{ status: { $in: [...], $eq: 'x' } }`. */
function mergeFilters(chips: Filter[], fixed: Record<string, unknown>): Record<string, unknown> {
  const merged: Record<string, unknown> = { ...fixed }
  for (const { field, value } of chips) {
    const kept = merged[field]
    merged[field] = isObject(kept) ? { ...kept, $eq: value } : { $eq: value }
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
 * The arrangement as the engine stores it. `visible_fields` is the title column, then the shown fields in their order:
 * a hidden column keeps no place, so shown again after a re-read it comes last. Widths, picks and matrix keys stay in the browser; lookup, rollup and custom (`custom` JSON) columns are not stored,
 * so hiding or reordering one is lost on save. Custom fields come with Field, step 5.
 */
export function toStoredView(arrangement: StoredArrangement, fixed: Record<string, unknown>, source: EngineSource): EngineArrangement {
  const title = titleColumn(source)
  const fields = fieldsOf(source)
  const kept = arrangement.order.filter((id) => fields.includes(id))
  const shown = [...kept, ...fields.filter((id) => !kept.includes(id))].filter((id) => !arrangement.hidden.includes(id))
  const group = arrangement.group === null ? null : engineColumn(arrangement.group, title)
  return {
    filters: mergeFilters(arrangement.filters, fixed),
    sort: arrangement.sort.flatMap(({ id, desc }) => {
      const column = engineColumn(id, title)
      return column === null ? [] : [desc ? `-${column}` : column]
    }),
    group_by: group,
    visible_fields: [...(title ? [title] : []), ...shown],
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
    }]
  })
}

function lookupOf(found: { id: number; title: string } | null): Lookup | null {
  return found ? { id: found.id, title: found.title, status: '', fields: {} } : null
}

/** The engine titles every row; a matrix row's join rows become its `rollups.cells`. */
export function toRow(r: EngineRow): Row {
  const { id, custom: _custom, lookups, title, cells, revision: _revision, ...fields } = r
  return {
    id,
    title: title ?? '',
    status: '',
    fields,
    lookups: Object.fromEntries(Object.entries(lookups).map(([key, found]) => [key, lookupOf(found)])),
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
    const declared = source.columns[name]
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
export function rowsQuery(view: Pick<View, 'date_field' | 'fixed'>, layout: Layout, window: Partial<DateWindow>, title: string | null): Record<string, string> {
  const query: Record<string, string> = {}
  const filters = mergeFilters(layout.filters, view.fixed ?? {})
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
