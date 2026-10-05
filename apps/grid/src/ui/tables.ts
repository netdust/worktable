import type { TableDef, View } from '../types'

/** A set of data and the views on it: one rail entry. */
export interface Table {
  key: string
  label: string
  space: 'scoped' | 'global'
  views: View[]
}

/** The declared tables in their order, each with its views; a table without a view opens nothing and is left out. */
export function groupTables(tables: TableDef[], views: View[]): Table[] {
  return tables
    .map((table): Table => ({
      key: table.key,
      label: table.label,
      space: table.space === 'scoped' ? 'scoped' : 'global',
      views: views.filter((view) => view.table === table.key),
    }))
    .filter((table) => table.views.length > 0)
}

export function tableOf(tables: Table[], viewKey: string | undefined): Table | undefined {
  return tables.find((table) => table.views.some((view) => view.key === viewKey))
}
