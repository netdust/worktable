import type { FilterInput } from './filter-compile'
import type { Mail } from './mailer'

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
  /** Served to the row's owner in a view for owners; never on json or on the owner column. */
  owner_visible?: boolean
  /** The grid never offers or shows it; still stored, imported and written through the API. */
  hidden?: boolean
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
  /** A join row with neither across nor label is open: `match` says what it waits for, `count` how many, `fill` the action that fills it. */
  open?: { match: string; count: string; fill: string }
}

/** The rows of `dataset` whose `key` column is this row's id; `item` is the word for one of them. */
export interface LinkDecl {
  label: string
  item: string
  dataset: string
  key: string
  target: string
  state?: string
}

/** A column not stored: the `field` of the live row `via` names; with `own`, this row's `own` when set. `from` words where an inherited value comes from. */
export interface LookupDecl {
  label: string
  via: string
  field: string
  own?: string
  from?: string
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
  /** The grid's words for its button that adds a row, whole; served while an administrator has not renamed the dataset. */
  new_label?: string
  links?: Record<string, LinkDecl>
  lookups?: Record<string, LookupDecl>
  lifecycle?: LifecycleDecl
  /** Its records carry a stable link that reads as the record's owner; `email` is the text column it is mailed to. */
  record_link?: { email?: string }
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
  /** The dataset this query reads: the grid lists its views under that dataset. */
  of?: string
  links?: Record<string, LinkDecl>
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

export type Role = 'administrator' | 'editor' | 'owner'

export interface Actor {
  id: number
  role: Role
  subject: { dataset: string; id: number } | null
  /** Who signs in: a person by mail (`user`, the default), an agent by Bearer, or a record's link. */
  kind?: 'user' | 'service' | 'link'
}

/** What a hook asks the engine to do; `link` is null while no token was minted. */
export interface HookResult {
  token?: { to: string[]; days: number }
  mail?: (link: string | null) => Mail | null
  notice?: string
}

/** A write to `column` on an existing row is a transition; a create is not. Hooks run on entering their state. */
export interface LifecycleDecl {
  column: string
  /** `label` is the transition's verb, shown on the action token's page. */
  transitions: { from: string[] | '*'; to: string; roles: Role[]; label?: string }[]
  hooks?: Record<string, (row: Record<string, unknown>, ctx: WriteContext) => HookResult>
  token_projection?: string[]
}

/** How the engine judges a transition: by the table, or in undo as the exact inverse of `from` → `to`. */
export type TransitionMode = { kind: 'write'; expect?: string } | { kind: 'undo'; from: string; to: string }

export interface WriteContext {
  readonly lifecycle?: TransitionMode
  actor: Actor
  current: Record<string, unknown> | null
  find(dataset: string, id: number): Record<string, unknown> | null
  /** The first live row whose columns equal `match`. */
  findBy(dataset: string, match: Record<string, unknown>): Record<string, unknown> | null
  /** Every live row whose columns equal `match`, by id; at most 5000, refused past that. */
  findAll(dataset: string, match: Record<string, unknown>): Record<string, unknown>[]
  exists(dataset: string, match: Record<string, unknown>, exceptId?: number): boolean
}

type Values = Record<string, unknown>

/** A create; `children` makes creates once this row exists and has its id. */
export interface ActionCreate {
  dataset: string
  values: Values
  children?: (id: number) => ActionCreate[]
}

export interface ActionUpdate {
  dataset: string
  id: number
  values: Values
  expect?: Record<string, unknown>
}

export type ActionResult = ActionCreate[] | { creates?: ActionCreate[]; updates?: ActionUpdate[] }

export type InputType = 'integer' | 'date' | 'text' | 'boolean'

/** The longest text a typed action input takes. */
export const MAX_INPUT_TEXT = 500

/** A record picked by id, which `run` receives as the record; or a typed value, checked before `run`. */
export type ActionInput =
  | { relation: string; label: string }
  | { type: InputType; label: string; min?: number; max?: number; required?: boolean }

/** What `run` receives per input: the picked record, or the typed value (absent when not required and left out). */
export type InputValue = Values | string | number | boolean | undefined

/** Runs as the caller: `run` answers the creates and updates, and each goes through its dataset's writer. */
export interface ActionDecl {
  label: string
  on: string
  input: Record<string, ActionInput>
  run(record: Values, input: Record<string, InputValue>, ctx: WriteContext): ActionResult
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
  for (const link of Object.keys(d.links ?? {})) assertIdentifier('link', link)
}

export function defineDataset(d: Omit<DatasetDecl, 'kind'>): DatasetDecl {
  assertNames(d)
  for (const [name, column] of Object.entries(d.columns)) {
    if (column.relation) assertIdentifier(`relation of ${name}`, column.relation)
  }
  for (const lookup of Object.keys(d.lookups ?? {})) assertIdentifier('lookup', lookup)
  return { kind: 'dataset', ...d }
}

export function defineQuery(q: Omit<QueryDecl, 'kind'>): QueryDecl {
  assertNames(q)
  if (!q.columns.id) throw new Error(`query "${q.name}" must declare an id column`)
  return { kind: 'query', ...q }
}
