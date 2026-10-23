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

/** A relation's picker lists the `value` records of `source`'s rows whose `match` columns equal this row's, in `sort` order. */
export interface OptionsFrom {
  source: string
  match: Record<string, string>
  value: string
  sort?: string[]
}

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
  /** A person link may write it; only with owner_visible, never on the owner, lifecycle or link address column. */
  owner_writable?: true
  /** The grid never offers or shows it; still stored, imported and written through the API. */
  hidden?: boolean
  options_from?: OptionsFrom
  /** An integer the grid shows as a tinted count above 0, and not at all at 0. */
  badge?: Tone
  /** A text the grid edits as long text and the record drawer shows as its own block; never with options or a relation. */
  long?: true
  /**
   * Only a service account writes it; a person's write that sends it is refused 403 `service_only` before the writer runs.
   * Judged on the keys the caller sends, so a writer must not fill it on a person's write: that batch's undo would be refused.
   */
  written_by?: 'service'
  /** What the grid's foot adds up: a sum (the default) or nothing; integer and real columns only. */
  footer?: 'sum' | 'none'
}

/** A fact the grid computes from a group's rows. */
export type GroupFact =
  | { kind: 'first'; column: string; where: Record<string, unknown>; label: string }
  | { kind: 'count'; where?: Record<string, unknown>; label: string }
  | { kind: 'empty'; column: string; label: string }
  /** "label have/need" over the group's rows, in the places of the link's items. */
  | { kind: 'filled'; link: string; label: string }

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
  /** `where` keeps only the away rows whose columns equal its values. */
  away?: {
    dataset: string
    across: string
    label: string
    end: string
    where?: Record<string, string | number | boolean>
  }
  /** A join row with neither across nor label is open: `match` says what it waits for, `count` how many, `fill` the action that fills it. */
  open?: { match: string; count: string; fill: string }
}

/** The rows of `dataset` whose `key` column is this row's id; `item` is the word for one of them; `count` an integer column holding the places each holds. */
export interface LinkDecl {
  label: string
  item: string
  dataset: string
  key: string
  target: string
  state?: string
  count?: string
  /** A column of the link dataset whose text shows under each item; to an owner only when owner_visible. */
  detail?: string
  /** `false` keeps the have/need count out of the head. */
  meter?: false
}

/** A column not stored: the `field` of the live row `via` names; with `own`, this row's `own` when set. `from` words where an inherited value comes from. `owner_visible` serves it to the row's owner too. */
export interface LookupDecl {
  label: string
  via: string
  field: string
  own?: string
  from?: string
  owner_visible?: true
}

/** Files on a dataset's records: `kinds` keyed by identifier, at most `max_mb` each (default 10). */
export interface AttachmentsDecl {
  kinds: Record<string, string>
  max_mb?: number
  owner_visible?: true
  owner_writable?: true
  /** `person`: a service's delete of a file, and its undo of its own upload, are refused 403 `service_only`. */
  deleted_by?: 'person'
}

/** The column that ties a row to an owner account's subject: `id`, or a relation column. */
export type Owners = Partial<Record<'owner', string>>

/** Rows placed on `day`, timed by `start` and `end` (none is all-day), grouped by one of `lanes`. With `spans`, a row runs from `day` to `end`, which may be a date. */
export interface CalendarDecl {
  day: string
  start?: string
  end?: string
  lanes: string[]
  spans?: true
}

/** The options column a board groups its cards on. */
export interface BoardDecl {
  column: string
  /** `false`: the board only groups; its cards open and do not move. */
  drag?: false
}

/** The attachment kind a gallery shows of each record. */
export interface GalleryDecl {
  kind: string
}

export interface DatasetDecl {
  kind: 'dataset'
  name: string
  label: string
  title: TitleDecl
  date?: string
  calendar?: CalendarDecl
  board?: BoardDecl
  gallery?: GalleryDecl
  columns: Record<string, ColumnDecl>
  indexes?: string[][]
  custom: boolean
  matrix?: MatrixDecl
  owners?: Owners
  /** Only a service account creates its rows; a person's create is refused 403 `service_only`. */
  created_by?: 'service'
  /** Its seed rows are configuration, not demo data: --seed-missing writes them into an existing database. */
  config?: boolean
  /** Engine tables only: table constraints in SQL. validateDomain refuses them on a domain dataset. */
  checks?: string[]
  /** The relation column that points at the domain's space. */
  scoped?: string
  group_facts?: GroupFact[]
  /** An options column toning every option: a record's colour as a lane and on the rows that point at it. */
  tone?: string
  /** The icon the grid shows until an administrator picks one. */
  icon?: Icon
  /** The grid's words for its button that adds a row, whole; served while an administrator has not renamed the dataset. */
  new_label?: string
  links?: Record<string, LinkDecl>
  lookups?: Record<string, LookupDecl>
  lifecycle?: LifecycleDecl
  /** Its records carry a stable link that reads as the record's owner; `email` is the text column it is mailed to. */
  record_link?: { email?: string }
  attachments?: AttachmentsDecl
  /** `false` keeps it out of the grid's tree. Navigation only: the API serves it as before. */
  listed?: false
}

export interface QueryDecl {
  kind: 'query'
  name: string
  label: string
  title: string
  date?: string
  calendar?: CalendarDecl
  board?: BoardDecl
  sql: string
  columns: Record<string, ColumnDecl>
  owners?: Owners
  scoped?: string
  group_facts?: GroupFact[]
  icon?: Icon
  /** The dataset a new row from this query is created in. */
  creates?: string
  /** Its rows' ids are `of` records' ids, so the grid offers that dataset's selection actions on ticked rows. */
  selectable?: true
  /** The dataset this query reads: the grid lists its views under that dataset. */
  of?: string
  links?: Record<string, LinkDecl>
  /** Each row flags the records its marks point at (dataset → integer column of ids), with its title and its tone column's tone. */
  flags?: FlagsDecl
}

export interface FlagsDecl {
  marks: Record<string, string>
  tone: string
}

/** A tile names a view: by name in a seed, by id once stored. */
export type Tile =
  | {
      kind: 'stat'
      view: string | number
      label?: string
      measure: 'count' | { sum: string }
      tone?: { above: number; tone: Tone }
    }
  | {
      kind: 'list'
      view: string | number
      rows: number
      columns?: string[]
      set?: { column: string; value: string; label: string }
    }
  | { kind: 'week'; view: string | number }
  | { kind: 'progress'; done: string | number; total: string | number; label: string }

export type QuickAction = { create: string; label: string }

export interface DashboardLayout {
  sections: { label: string; tiles: Tile[] }[]
  actions: QuickAction[]
}

/** A dashboard has no source and holds a layout; every other skin has a source and no layout. */
export interface SavedViewSeed {
  name: string
  source_type?: 'dataset' | 'query'
  source?: string
  skin: 'table' | 'matrix' | 'calendar' | 'board' | 'timeline' | 'gallery' | 'dashboard'
  filters: FilterInput
  sort: string[]
  group_by: string | null
  visible_fields: string[]
  layout?: DashboardLayout
}

export interface Domain {
  datasets: DatasetDecl[]
  queries: QueryDecl[]
  seed(insert: (dataset: string, rows: Record<string, unknown>[]) => void): void
  views: SavedViewSeed[]
  writers?: Record<string, Writer>
  actions?: Record<string, ActionDecl | SelectionActionDecl>
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
  /** Passes the record's current record link to `mail`; only on a dataset that declares record_link. */
  record_link?: true
  /** `link` is the minted token's link; `links` carries it again beside the record link. At most 10 mails. */
  mail?: (link: string | null, links: { token: string | null; record: string | null }) => Mail | Mail[] | null
  notice?: string
}

type Scalar = string | number | boolean | null

/** Every key (a column or lookup of the source) equals its value, or is one of `$in`, on the row as the caller reads it; a key it lacks (an owner's lookup that is not owner_visible) never matches. */
export type Condition = Record<string, Scalar | { $in: Scalar[] }>

/** A write to `column` on an existing row is a transition; a create is not. Hooks run on entering their state. */
export interface LifecycleDecl {
  column: string
  /**
   * `label` is the transition's verb, shown on the action token's page. `button` is its label as a drawer button.
   * `when` decides only whether that button shows, never whether the write is allowed: a writer mirrors any `when` that matters.
   */
  transitions: {
    from: string[] | '*'
    to: string
    roles: Role[]
    label?: string
    button?: string
    /** The button the drawer shows filled; only with `button`. */
    primary?: true
    when?: Condition
  }[]
  /** The states in which an outside process is busy with the record or picks it up next. */
  live?: string[]
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
  /**
   * Every live row whose columns equal `match`, by id; at most 5000, refused past that.
   * No scope is applied: never copy its rows into what an owner-reachable action returns or refuses.
   */
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
  | { relation: string; label: string; options_from?: OptionsFrom }
  | { type: InputType; label: string; min?: number; max?: number; required?: boolean }

/** What `run` receives per input: the picked record, or the typed value (absent when not required and left out). */
export type InputValue = Values | string | number | boolean | undefined

/** Runs as the caller: `run` answers the creates and updates, and each goes through its dataset's writer. */
export interface ActionDecl {
  label: string
  on: string
  input: Record<string, ActionInput>
  /** The grid opens the first record the run created, else the record it ran on. */
  opens?: true
  /** A record that does not match is refused 422 `condition_not_met` before `run`. */
  when?: Condition
  run(record: Values, input: Record<string, InputValue>, ctx: WriteContext): ActionResult
}

/** Runs once on every selected record (1 to 500), each read as the caller, in one transaction and one batch. */
export interface SelectionActionDecl {
  label: string
  on: string
  many: true
  input: Record<string, ActionInput>
  opens?: true
  when?: Condition
  run(records: Values[], input: Record<string, InputValue>, ctx: WriteContext): ActionResult
}

/** Only `many: true` makes a selection action; a stray `many` is refused at validation, never read as one. */
export const isSelection = (action: ActionDecl | SelectionActionDecl): action is SelectionActionDecl =>
  (action as { many?: unknown }).many === true

/** An update that adds rows to its own batch: each create runs as an action's does, as the same actor. */
export interface WriterUpdate {
  values: Values
  creates: ActionCreate[]
}

export interface Writer {
  create?(values: Record<string, unknown>, ctx: WriteContext): Record<string, unknown>
  update?(values: Record<string, unknown>, ctx: WriteContext): Record<string, unknown> | WriterUpdate
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
