import type { FilterInput } from './filter-compile'

/** The generic icons an administrator picks a source's icon from. */
export const ICONS = [
  'table',
  'calendar',
  'users',
  'clock',
  'tag',
  'pin',
  'check',
  'list',
  'film',
  'box',
  'star',
  'flag',
  'user',
  'query',
] as const
export type Icon = (typeof ICONS)[number]

/** The generic palette a column colours its options from. */
export const TONES = ['ok', 'warn', 'bad', 'rose', 'violet', 'amber', 'sky', 'slate', 'green', 'teal', 'grey'] as const
export type Tone = (typeof TONES)[number]

export type ColumnType = 'text' | 'integer' | 'real' | 'boolean' | 'date' | 'datetime' | 'json'

export interface ColumnDecl {
  type: ColumnType
  label: string
  nullable?: boolean
  default?: string | number | boolean | null
  options?: Record<string, string>
  /** A tone per option key, for the grid to colour the option. */
  tones?: Record<string, Tone>
  relation?: string
  readonly?: boolean
  writes?: { dataset: string; field: string; key: string }
  /** Query columns only: the value is taken over from elsewhere when the row's `flag` column is neither `own` nor empty. */
  inherited?: { flag: string; own: string }
}

/** A fact the grid computes from a group's rows. */
export type GroupFact =
  | { kind: 'first'; column: string; where: Record<string, unknown>; label: string }
  | { kind: 'count'; where?: Record<string, unknown>; label: string }
  | { kind: 'empty'; column: string; label: string }

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

/** The column that ties a row to an owner account's subject: `id`, or a relation column. */
export type Owners = Partial<Record<'owner', string>>

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
  owners?: Owners
  /** Its seed rows are configuration, not demo data: --seed-missing writes them into an existing database. */
  config?: boolean
  /** Engine tables only: table constraints in SQL. validateDomain refuses them on a domain dataset. */
  checks?: string[]
  /** The relation column that points at the domain's space. */
  scoped?: string
  group_facts?: GroupFact[]
  /** The icon the grid shows until an administrator picks one. */
  icon?: Icon
}

export interface QueryDecl {
  kind: 'query'
  name: string
  label: string
  title: string
  date?: string
  sql: string
  columns: Record<string, ColumnDecl>
  owners?: Owners
  scoped?: string
  group_facts?: GroupFact[]
  icon?: Icon
  /** The dataset a new row from this query is created in. */
  creates?: string
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
  actions?: Record<string, ActionDecl>
  /** The dataset whose records split the work. A view filter for the grid, never access control. */
  space?: { dataset: string }
  /** The order of the sources in the grid's tree; unlisted sources follow, unlabelled. */
  sections?: { label: string; sources: string[] }[]
}

export interface Actor {
  id: number
  role: 'administrator' | 'editor' | 'owner'
  subject: { dataset: string; id: number } | null
}

export interface WriteContext {
  actor: Actor
  current: Record<string, unknown> | null
  find(dataset: string, id: number): Record<string, unknown> | null
  exists(dataset: string, match: Record<string, unknown>, exceptId?: number): boolean
}

type Values = Record<string, unknown>

/** Runs as the caller: `run` answers the creates, and each goes through its dataset's writer. */
export interface ActionDecl {
  label: string
  on: string
  input: Record<string, { relation: string; label: string }>
  run(record: Values, input: Record<string, Values>, ctx: WriteContext): { dataset: string; values: Values }[]
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
