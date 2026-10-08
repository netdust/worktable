import {
  type ColumnDef, functionalUpdate, getCoreRowModel, getSortedRowModel, type Table, type Updater, useReactTable,
} from '@tanstack/react-table'
import { useMemo } from 'react'
import type { Row } from '../types'
import type { Column } from './columns'
import { type Layout, sort, type SortKey } from './layout'

function sortValue(column: Column, row: Row): string | number {
  switch (column.kind) {
    case 'number':
    case 'rollup':
      return Number(column.value(row)) || 0
    case 'date':
    case 'datetime':
    case 'time':
      return column.edit(row)
    default:
      return column.text(row)
  }
}

/** TanStack carries the column model, sorting, visibility, order and sizing; the layout is its state. `unshown` hides beyond it, `forced` shows past it. */
export function useGridTable(columns: Column[], rows: Row[], layout: Layout, onLayout: (layout: Layout) => void, unshown: string[] = [], forced: string[] = []): Table<Row> {
  const defs = useMemo<ColumnDef<Row, string | number>[]>(
    () => columns.map((column) => ({
      id: column.id,
      header: column.label,
      accessorFn: (row: Row) => sortValue(column, row),
      size: column.width,
      minSize: 48,
      sortingFn: column.kind === 'number' || column.kind === 'rollup' ? 'basic' : 'text',
      enableHiding: column.id !== 'title',
      enableSorting: column.sortable !== false,
    })),
    [columns],
  )

  // The title stands where the view put it; first when it was never moved.
  const order = layout.order.length === 0 || layout.order.includes('title') ? layout.order : ['title', ...layout.order]

  return useReactTable<Row>({
    data: rows,
    columns: defs,
    getRowId: (row) => String(row.id),
    state: {
      sorting: layout.sort,
      columnVisibility: Object.fromEntries([...layout.hidden, ...unshown].filter((id) => !forced.includes(id)).map((id) => [id, false])),
      columnOrder: order,
      columnSizing: layout.widths,
    },
    onSortingChange: (updater: Updater<SortKey[]>) => onLayout(sort(layout, functionalUpdate(updater, layout.sort))),
    onColumnSizingChange: (updater: Updater<Record<string, number>>) => onLayout({ ...layout, widths: functionalUpdate(updater, layout.widths) }),
    columnResizeMode: 'onEnd',
    autoResetAll: false,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
  })
}
