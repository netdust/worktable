import type { SavedView, Schema, TableDef, View, ViewType } from '../types'

/** A set of data and the views on it: one node of the tree. */
export interface Table {
  key: string
  label: string
  space: 'scoped' | 'global'
  /** The kinds of view it can be shown as. */
  types: ViewType[]
  query?: boolean
  listed?: false
  icon?: string
  views: View[]
}

/** The tree's sections; the last, for every source no section lists, has no label. */
export interface Section {
  label: string | null
  tables: Table[]
}

/**
 * The declared tables in their order, each with its views; a table without a view is kept, `+` makes its first.
 * A query read `of` a table gets no node: its views sit among that table's own, in the order they were served.
 */
export function groupTables(tables: TableDef[], views: View[]): Table[] {
  const keys = new Set(tables.map((table) => table.key))
  const under = (table: TableDef) => table.of !== undefined && keys.has(table.of)
  return tables.filter((table) => !under(table)).map((table): Table => ({
    key: table.key,
    label: table.label,
    space: table.space === 'scoped' ? 'scoped' : 'global',
    types: table.types,
    ...(table.query ? { query: true } : {}),
    ...(table.listed === false ? { listed: false as const } : {}),
    ...(table.icon ? { icon: table.icon } : {}),
    views: views.filter((view) => view.table === table.key || tables.some((query) => query.of === table.key && query.key === view.table)),
  }))
}

/** The served sections in their order, each holding its sources in theirs; the sources none lists follow, unlabelled. */
export function sectionsOf(tables: Table[], served: Schema['sections'] = []): Section[] {
  const byKey = new Map(tables.map((table) => [table.key, table]))
  const listed = served
    .map((section) => ({ label: section.label, tables: section.sources.flatMap((key) => byKey.get(key) ?? []) }))
    .filter((section) => section.tables.length > 0)
  const placed = new Set(listed.flatMap((section) => section.tables))
  const rest = tables.filter((table) => !placed.has(table) && table.listed !== false)
  return rest.length > 0 ? [...listed, { label: null, tables: rest }] : listed
}

/** The tables in the order their first view comes, the rest as declared after them: the engine declares every source, the saved views say which the rail starts with. */
export function byFirstView<T extends { key: string }>(tables: T[], views: View[]): T[] {
  const first = (table: T) => {
    const at = views.findIndex((view) => view.table === table.key)
    return at < 0 ? views.length : at
  }
  return [...tables].sort((a, b) => first(a) - first(b))
}

export function tableOf(tables: Table[], viewKey: string | undefined): Table | undefined {
  return tables.find((table) => table.views.some((view) => view.key === viewKey))
}

const SYSTEM = -1

/** The dashboards in landing order: the reader's own, then those shared by someone else, then the system's. */
export function dashboardsOf(views: SavedView[]): SavedView[] {
  const rank = (view: SavedView) => (view.owner.id === SYSTEM ? 2 : view.mine ? 0 : 1)
  return views.filter((view) => view.type === 'dashboard').sort((a, b) => rank(a) - rank(b) || a.id - b.id)
}
