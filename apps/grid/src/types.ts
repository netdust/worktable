import type { Join } from './grid/conditions'
import type { Filter, Layout, SortKey } from './grid/layout'

export type FieldType =
  | 'int' | 'float' | 'bool' | 'text' | 'textarea' | 'html' | 'email' | 'url' | 'date' | 'datetime'
  | 'select' | 'array' | 'json' | 'relation' | 'gallery' | 'image' | 'file' | 'repeater' | 'links'

export type Tone = 'ok' | 'warn' | 'bad' | 'rose' | 'violet' | 'amber' | 'sky' | 'slate' | 'green' | 'teal' | 'grey'

/** A relation's picker lists the `value` records of `source`'s rows whose `match` columns equal the row's, in `sort` order. */
export interface OptionsFrom {
  source: string
  match: Record<string, string>
  value: string
  sort?: string[]
}

export interface Field {
  type: FieldType
  label: string
  /** Never emptied: the engine refuses null and '' alike. */
  required: boolean
  /** Filled by the engine when a new record leaves it out. */
  defaulted?: boolean
  fact: boolean
  options?: Record<string, string>
  /** A tone per option key; an option not listed falls back to the built-in defaults. */
  tones?: Record<string, Tone>
  relation?: { model: string; multiple: boolean }
  description?: string
  /** Shown, never written: a readonly column, or a query column no writer takes. */
  readonly?: boolean
  /** A query column's write: to `dataset`'s `field`, on the record the row's `key` names. */
  writes?: { dataset: string; field: string; key: string }
  /** The word for where an inherited lookup's value comes from, on a row whose `inherited` names it. */
  via?: string
  /** A `links` field: the rows of `dataset` whose `key` is this row's id, each pointing at a `target_dataset` record. */
  link?: Link
  /** Served to the row's owner in a view for owners. */
  owner_visible?: true
  options_from?: OptionsFrom
  /** An integer shown as a tinted count above 0. */
  badge?: Tone
}

export interface Link {
  /** The word for one link, in the question before one is removed. */
  item: string
  dataset: string
  key: string
  target: string
  target_dataset: string
  state?: { options: Record<string, string>; tones: Record<string, Tone>; default: string | null }
}

/** One linked row as a `links` field holds it. */
export interface LinkItem {
  id: number
  target: number | null
  title: string
  state: string | null
}

export interface Model {
  key: string
  label: string
  title_label: string
  /** The title's own column, which a condition names; absent for a title through a relation. */
  title_field?: string
  title_readonly: boolean
  /** The title column is not nullable: absent means required. */
  title_required?: boolean
  /** The title comes through a relation: never written, sorted, grouped or filtered on. */
  title_derived?: boolean
  /** A query's rows: joined, never created. */
  query?: boolean
  /** Its writer deletes: the drawer offers Verwijderen. */
  deletable?: boolean
  /** A query whose `+ Nieuw` creates a row in this model. */
  creates?: string
  /** The words of `+ Nieuw` ("Nieuwe activiteit"), while the model keeps its declared name. */
  new_label?: string
  /** What the drawer offers to run on one of its records. */
  actions?: ModelAction[]
  /** Each record has a link its person reads their views through. */
  record_link?: true
  /** The column a write to which is a transition: the record's state. */
  lifecycle?: string
  /** Files its records carry, by kind; the drawer lists and takes them. */
  attachments?: { kinds: Record<string, string>; max_mb: number; writable?: true }
  fields: Record<string, Field>
}

/** One input of an action: a record of `relation`, picked; or a typed value, filled in. */
export type ActionInput =
  | { relation: string; label: string; options_from?: OptionsFrom }
  | { type: 'integer' | 'date' | 'text' | 'boolean'; label: string; min?: number; max?: number; required?: boolean }

/** A declared action: every input is given before it runs, but one declared `required: false`. */
export interface ModelAction {
  name: string
  label: string
  input: Record<string, ActionInput>
}

export type ViewType = 'grid' | 'matrix' | 'calendar' | 'board' | 'timeline' | 'gallery' | 'dashboard'

/** A dashboard tile names saved views by id. */
export type Tile =
  | { kind: 'stat'; view: number; label?: string; measure: 'count' | { sum: string }; tone?: { above: number; tone: Tone } }
  | { kind: 'list'; view: number; rows: number; columns?: string[]; set?: { column: string; value: string; label: string } }
  | { kind: 'week'; view: number }
  | { kind: 'progress'; done: number; total: number; label: string }

export interface DashboardLayout {
  sections: { label: string; tiles: Tile[] }[]
  actions: { create: string; label: string }[]
}

/** A calendar table: rows placed on `day`, timed by `start` and `end` (none is all-day), laned by one of `lanes`. */
export interface CalendarDef {
  day: string
  start: string | null
  end: string | null
  lanes: string[]
  /** A row covers every day from `day` to `end`. */
  spans?: true
}

/** A declared table (V19): one model, what its rows carry, and the view types it can be shown as. */
export interface TableDef {
  key: string
  label: string
  model: string
  date_field?: string
  /** A range's last day: with it, the window shows every record whose range overlaps the week. */
  end_field?: string
  columns?: string[]
  lookups?: Record<string, string[]>
  rollups?: Record<string, Rollup>
  /** The fields the "+ Filter" menu offers first, in this order. */
  filters?: string[]
  /** Field keys in order; a leading `-` sorts that key descending. */
  sort?: string[]
  /** `scoped`: its rows are the selected space record's; `global`: beside any space. */
  space?: 'scoped' | 'global'
  /** A query's rows: joined, never created. */
  query?: boolean
  /** The dataset a query reads: its views sit under that table in the rail. */
  of?: string
  /** An administrator's pick from the engine's icon set; absent, the tree shows the kind's icon. */
  icon?: string
  /** What a group's band says of its rows, computed by the grid. */
  facts?: GroupFact[]
  /** A matrix table: the records that join a row to a column, and what they mean. */
  join?: MatrixJoin
  /** A matrix table: the table whose rows say which columns are away when. */
  away?: MatrixAway
  /** A calendar table: how its rows sit on days. */
  calendar?: CalendarDef
  /** A board table: the options column its cards are grouped by. */
  board?: { column: string }
  /** A gallery table: the attachment kind its cards show. */
  gallery?: { kind: string }
  types: ViewType[]
}

/** A view as served: its table's keys, then the view's own over them (`Json::view`). */
export interface View extends Omit<TableDef, 'types'> {
  types?: ViewType[]
  type?: ViewType
  /** The table this view is one way of working with. */
  table: string
  table_label?: string
  group?: string | null
  /** The field a type is built on; null for a grid and a matrix. */
  field?: string | null
  /** Column ids the view starts hidden. */
  hidden?: string[]
  /** A site's starting view: shared, never written. */
  starting?: boolean
  /** The saved filters no chip shows (`$in`, a range, `custom.<key>`), by column; kept on every Save. */
  fixed?: Record<string, unknown>
  /** A dashboard's sections, tiles and quick actions. */
  layout?: DashboardLayout
}

/** A view's arrangement in the app: the grid's layout, plus the columns a matrix picked. */
export type Arrangement = Layout & { picked: number[] }

/** A saved view's arrangement as the grid holds it: widths are a list. The engine stores filters, sort, group and the visible columns of it. */
export interface StoredArrangement {
  hidden: string[]
  order: string[]
  widths: { id: string; width: number }[]
  sort: SortKey[]
  filters: Filter[]
  join?: Join
  group: string | null
  picked: number[]
}

/** A view someone saved, merged with its table by the server; its key is its id. */
export interface SavedView extends View {
  id: number
  arrangement: StoredArrangement
  shared: boolean
  owner: { id: number; name: string }
  mine: boolean
  /** Only its owner may write it. */
  editable: boolean
  /** Published with a share token: it never saves itself. */
  public?: boolean
  /** Shown to the people its rows belong to. */
  for_owners?: boolean
}

/** What `POST views` takes: a new view, always of no field. */
export interface NewView {
  name: string
  table: string
  type: ViewType
  field: null
  shared: boolean
  arrangement: StoredArrangement
  fixed?: Record<string, unknown>
  layout?: DashboardLayout
}

/** A user's own order of each table's views and the view last used there, by table key. */
export interface Prefs {
  order: Record<string, string[]>
  last: Record<string, string>
}

export interface MatrixJoin {
  model: string
  row_field: string
  column_field: string
  name_field?: string
  cell_field: string
  note_field?: string
  /** What a typed key means: key → the cell's value. */
  keys: Record<string, string>
  /** The mark a cell shows: value → mark. */
  marks: Record<string, string>
  /** The cell value the counts add up. */
  count: string
  /** The join's lifecycle column: when it is the cell field, a cell's undo goes through the batch undo. */
  lifecycle?: string
  /** A join row with neither record nor name is open: it waits for a `match_field` record, `count_field` times; `action` fills it, its record put under `input`. */
  open?: { match_field: string; count_field: string; action: string; input: string; options_from?: OptionsFrom }
}

export interface MatrixAway {
  table: string
  column_field: string
  label_field: string
  model: string
  date_field: string
  end_field: string
  /** Only the away rows whose columns equal these values. */
  where?: Record<string, string | number | boolean>
}

/** A join record as a row carries it under `rollups.cells`; its lookups title what its relations point at. */
export type MatrixCell = Lookup & { lookups?: Record<string, Lookup | null> }

export interface MatrixColumn {
  /** `record:<id>`, `name:<normalised name>`, or `open`. */
  key: string
  kind: 'record' | 'name' | 'open'
  id?: number
  title: string
}

export interface Rollup {
  /** The column's header; the humanised key without one. */
  label?: string
  model: string
  field: string
  count?: boolean
  list?: boolean
  filter?: Record<string, string | number | boolean>
}

export interface Schema {
  models: Record<string, Model>
  tables: TableDef[]
  views: View[]
  writable: Record<string, boolean>
  /** The relation that scopes a view, and the model it points at; null when the site configured none. */
  space?: Space | null
  /** The tree's sections, in order; the sources each lists, in order. */
  sections?: { label: string; sources: string[] }[]
  /** The site's words for the app's own strings, by `i18n.ts` key. */
  strings?: Record<string, string>
}

/** A fact the grid computes from a group's rows. */
export type GroupFact =
  | { kind: 'first'; column: string; where: Record<string, unknown>; label: string }
  | { kind: 'count'; where?: Record<string, unknown>; label: string }
  | { kind: 'empty'; column: string; label: string }

export interface Space {
  field: string
  model: string
}

/** The space record a scoped view's rows belong to. */
export interface Scope {
  field: string
  id: number
}

export interface Row {
  id: number
  title: string
  status: string
  fields: Record<string, unknown>
  lookups?: Record<string, Lookup | null>
  rollups?: Record<string, number | unknown[]>
  /** The inherited lookups whose value came through the relation, not the row's own. */
  inherited?: string[]
}

export interface Lookup {
  id: number
  title: string
  status: string
  fields: Record<string, unknown>
}

export interface RowsResponse {
  rows: Row[]
  total: number
}

/** A dataset still pointing at a record, as the engine's 409 `in_use` names it. */
export interface Referrer {
  label: string
  count: number
}

export interface ApiError {
  code: string
  message: string
  by?: Referrer[]
  /** On a 409 `changed_since`: the column that changed, and its label. */
  column?: string
  label?: string
  /** On a 409 `changed_since`: the dataset of the record that changed. */
  dataset?: string
  /** On a refusal about one column, such as one not shown to owners. */
  key?: string
}

/** A column of a view shown to owners, as the engine describes it beside the view. */
export interface OwnerColumn {
  key: string
  label: string
  type: string
  options?: Record<string, string>
}

/** A saved view shown to the people its rows belong to, as `GET /owner/views` lists it. */
export interface OwnerView {
  id: number
  name: string
  columns: OwnerColumn[]
}

export interface OwnerRows {
  columns: OwnerColumn[]
  rows: Record<string, unknown>[]
  total: number
}

/** One record's part of one batch, as `/history/:source` answers it; `actor` is an email, or a link's name, only where the engine may say it. */
export interface HistoryEntry {
  batch: string
  at: string
  by: 'self' | 'account' | 'link' | 'system' | 'gone' | 'hidden'
  actor: string | null
  undoable: boolean
  /** On an undoable entry: the other records its undo changes too. */
  others: number
  batch_kind: string | null
  created: boolean
  record: { id: number; title: string }
  changes: { field: string; label: string; old: unknown; new: unknown }[]
}

/** A write's answer: the row, and the batch an undo names it by; none when nothing changed. */
export interface Saved {
  row: Row
  batch: string | null
}

/** The inclusive window a dated view shows, as local `YYYY-MM-DD` days. */
export interface DateWindow {
  from: string
  to: string
}

/** An action token's page: the record's projection with its column labels, and one answer per allowed state. */
export interface ActView {
  dataset: string
  projection: Record<string, unknown>
  labels: Record<string, string>
  to: { value: string; label: string }[]
  /** False once the record left the state the token was minted for: `to` is then empty. */
  answerable: boolean
}

/** The signed-in account, as `/auth/me` serves it. */
export interface Account {
  id: number
  email: string
  role: 'administrator' | 'editor' | 'owner'
  subject: { dataset: string; id: number } | null
}
