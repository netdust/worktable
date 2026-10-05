import type { Filter, Layout, SortKey } from './grid/layout'
import type { DateWindow, Field, FieldType, Lookup, Model, Row, SavedView, Schema, StoredArrangement, TableDef, View } from './types'

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
}

export interface EngineSource {
  kind: 'dataset' | 'query'
  label: string
  /** The column the grid shows as a row's title. */
  title: string
  date: string | null
  /** A dataset with a writer, or a query with a mapped column. */
  writable?: boolean
  columns: Record<string, EngineColumn>
}

/** A saved view row; a bare scalar in `filters` means `$eq`. */
export interface EngineView {
  id: number
  name: string
  source_type: 'dataset' | 'query'
  source: string
  skin: 'table'
  filters: Record<string, unknown>
  sort: string[]
  group_by: string | null
  visible_fields: string[]
}

export interface EngineSchema {
  sources: Record<string, EngineSource>
  views: EngineView[]
}

export interface EngineRow {
  id: number
  custom: Record<string, unknown>
  lookups: Record<string, { id: number; title: string } | null>
  [column: string]: unknown
}

/** ISO datetimes stay text: they sort as they read. */
const TYPES: Record<EngineColumn['type'], FieldType> = {
  text: 'text', datetime: 'text', json: 'json', integer: 'int', real: 'float', boolean: 'bool', date: 'date',
}

const isReadonly = (column: EngineColumn | undefined, source: EngineSource): boolean =>
  Boolean(column?.readonly) || (source.kind === 'query' && !column?.writes)

function fieldOf(column: EngineColumn, source: EngineSource): Field {
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
  }
}

/** The row's own id is the grid's `id`, never a field. */
function modelOf(name: string, source: EngineSource): Model {
  const fields = Object.entries(source.columns).filter(([key]) => key !== source.title && key !== 'id')
  return {
    key: name,
    label: source.label,
    title_label: source.columns[source.title]?.label ?? source.title,
    title_readonly: !source.writable || isReadonly(source.columns[source.title], source),
    ...(source.kind === 'query' ? { query: true } : {}),
    fields: Object.fromEntries(fields.map(([key, column]) => [key, fieldOf(column, source)])),
  }
}

function tableDefOf(name: string, source: EngineSource): TableDef {
  return { key: name, label: source.label, model: name, ...(source.date ? { date_field: source.date } : {}), types: ['grid'] }
}

const usedSources = (s: EngineSchema): string[] => [...new Set(s.views.map((view) => view.source))].filter((name) => name in s.sources)

export function toSchema(s: EngineSchema): Schema {
  return {
    models: Object.fromEntries(Object.entries(s.sources).map(([name, source]) => [name, modelOf(name, source)])),
    tables: usedSources(s).map((name) => tableDefOf(name, s.sources[name])),
    views: [],
    writable: Object.fromEntries(Object.entries(s.sources).map(([name, source]) => [name, source.writable === true])),
  }
}

/** A column name as the grid's column id: the title column is the grid's `title`. */
const columnId = (source: EngineSource, column: string): string => (column === source.title ? 'title' : column)

function chipValue(value: unknown): string | null {
  if (typeof value === 'boolean') return value ? '1' : ''
  return typeof value === 'string' || typeof value === 'number' ? String(value) : null
}

/** Only `$eq` on a scalar is a chip; the grid has no word for the other operators. */
function chipsOf(filters: Record<string, unknown>): Filter[] {
  return Object.entries(filters).flatMap(([field, raw]) => {
    const value = chipValue(typeof raw === 'object' && raw !== null && '$eq' in raw ? raw.$eq : raw)
    return value === null ? [] : [{ field, value }]
  })
}

function arrangementOf(view: EngineView, source: EngineSource): StoredArrangement {
  const sort: SortKey[] = view.sort.map((key) => {
    const desc = key.startsWith('-')
    return { id: columnId(source, desc ? key.slice(1) : key), desc }
  })
  const fields = Object.keys(source.columns).filter((key) => key !== source.title && key !== 'id')
  return {
    hidden: fields.filter((key) => !view.visible_fields.includes(key)),
    order: [],
    widths: [],
    sort,
    filters: chipsOf(view.filters),
    group: view.group_by === null ? null : columnId(source, view.group_by),
    picked: [],
  }
}

/** Each saved view merged over its source's table, as `Json::saved` merged one over its table. */
export function toSavedViews(s: EngineSchema): SavedView[] {
  return s.views.flatMap((view) => {
    const source = s.sources[view.source]
    if (!source) return []
    return [{
      ...tableDefOf(view.source, source),
      key: String(view.id),
      label: view.name,
      table: view.source,
      table_label: source.label,
      type: 'grid',
      starting: false,
      id: view.id,
      arrangement: arrangementOf(view, source),
      shared: true,
      owner: { id: 0, name: '' },
      mine: false,
      editable: false,
    }]
  })
}

function lookupOf(found: { id: number; title: string } | null): Lookup | null {
  return found ? { id: found.id, title: found.title, status: '', fields: {} } : null
}

export function toRow(r: EngineRow, title: string): Row {
  const { id, custom: _custom, lookups, [title]: shown, ...fields } = r
  return {
    id,
    title: shown === null || shown === undefined ? '' : String(shown),
    status: '',
    fields,
    lookups: Object.fromEntries(Object.entries(lookups).map(([key, found]) => [key, lookupOf(found)])),
  }
}

/** A write's grid fields as the engine's columns: the grid's `title` is the source's title column. */
export function toEngineData(data: Record<string, unknown>, titleColumn: string): Record<string, unknown> {
  return Object.fromEntries(Object.entries(data).map(([key, value]) => [key === 'title' ? titleColumn : key, value]))
}

/** A grid column id as the engine's column; null for what only the grid computes. */
function engineColumn(id: string, titleColumn: string): string | null {
  if (id.startsWith('lookups.') || id.startsWith('rollups.')) return null
  return id === 'title' ? titleColumn : id
}

/** The layout's filters, sort and group as `/rows` params; the grid sorts lookups and rollups itself. */
export function rowsQuery(view: Pick<View, 'date_field'>, layout: Layout, window: Partial<DateWindow>, titleColumn: string): Record<string, string> {
  const query: Record<string, string> = {}
  if (layout.filters.length > 0) {
    query.filter = JSON.stringify(Object.fromEntries(layout.filters.map((f) => [f.field, { $eq: f.value }])))
  }
  const sort = layout.sort.flatMap(({ id, desc }) => {
    const column = engineColumn(id, titleColumn)
    return column === null ? [] : [desc ? `-${column}` : column]
  })
  if (sort.length > 0) query.sort = sort.join(',')
  const group = layout.group === null ? null : engineColumn(layout.group, titleColumn)
  if (group !== null) query.group = group
  if (view.date_field && window.from) query.from = window.from
  if (view.date_field && window.to) query.to = window.to
  return query
}
