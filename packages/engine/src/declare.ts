import type { FilterInput } from './filter-compile'

export type ColumnType = 'text' | 'integer' | 'real' | 'boolean' | 'date' | 'datetime' | 'json'

export interface ColumnDecl {
  type: ColumnType
  label: string
  nullable?: boolean
  default?: string | number | boolean | null
  options?: Record<string, string>
  relation?: string
  readonly?: boolean
  writes?: { dataset: string; field: string; key: string }
}

export type TitleDecl = string | { via: string; else: string }

export interface MatrixDecl {
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

export interface DatasetDecl {
  kind: 'dataset'
  name: string
  label: string
  title: TitleDecl
  date?: string
  columns: Record<string, ColumnDecl>
  indexes?: string[][]
  custom: boolean
  matrix?: MatrixDecl
}

export interface QueryDecl {
  kind: 'query'
  name: string
  label: string
  title: string
  date?: string
  sql: string
  columns: Record<string, ColumnDecl>
}

export interface SavedViewSeed {
  name: string
  source_type: 'dataset' | 'query'
  source: string
  skin: 'table' | 'matrix'
  filters: FilterInput
  sort: string[]
  group_by: string | null
  visible_fields: string[]
}

export interface Domain {
  datasets: DatasetDecl[]
  queries: QueryDecl[]
  seed(insert: (dataset: string, rows: Record<string, unknown>[]) => void): void
  views: SavedViewSeed[]
  writers?: Record<string, Writer>
}

export interface Actor {
  id: number
  role: string
}

export interface WriteContext {
  actor: Actor
  current: Record<string, unknown> | null
  find(dataset: string, id: number): Record<string, unknown> | null
  exists(dataset: string, match: Record<string, unknown>, exceptId?: number): boolean
}

export interface Writer {
  create?(values: Record<string, unknown>, ctx: WriteContext): Record<string, unknown>
  update?(values: Record<string, unknown>, ctx: WriteContext): Record<string, unknown>
  delete?(ctx: WriteContext): void
}

const IDENTIFIER = /^[a-z][a-z0-9_]*$/

function assertIdentifier(what: string, name: string): void {
  if (!IDENTIFIER.test(name)) throw new Error(`${what} "${name}" must match ${IDENTIFIER}`)
}

function assertNames(d: Omit<DatasetDecl | QueryDecl, 'kind'>): void {
  assertIdentifier('name', d.name)
  for (const column of Object.keys(d.columns)) assertIdentifier('column', column)
}

export function defineDataset(d: Omit<DatasetDecl, 'kind'>): DatasetDecl {
  assertNames(d)
  for (const [name, column] of Object.entries(d.columns)) {
    if (column.relation) assertIdentifier(`relation of ${name}`, column.relation)
  }
  return { kind: 'dataset', ...d }
}

export function defineQuery(q: Omit<QueryDecl, 'kind'>): QueryDecl {
  assertNames(q)
  if (!q.columns.id) throw new Error(`query "${q.name}" must declare an id column`)
  return { kind: 'query', ...q }
}
