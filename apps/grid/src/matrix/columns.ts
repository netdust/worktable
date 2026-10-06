import { firstId } from '../grid/columns'
import { saveKept, storedKept } from '../grid/layout'
import type { MatrixCell, MatrixColumn, Row, SavedView, View } from '../types'

/** The longest name key, in characters, not UTF-16 units: the grid's own cap, as name keys stay in the browser. */
const MAX_NAME = 80

export const normalise = (name: string): string => Array.from(name.trim().toLocaleLowerCase()).slice(0, MAX_NAME).join('')

/** The join records a row carries, in the order the server gave. */
export function cellsOf(row: Row): MatrixCell[] {
  const cells = row.rollups?.cells
  return Array.isArray(cells) ? (cells as MatrixCell[]) : []
}

function nameOf(view: View, cell: MatrixCell): string {
  const field = view.join?.name_field
  const value = field ? cell.fields[field] : ''
  return typeof value === 'string' ? value.trim() : ''
}

/** Ids come out of a relation as strings: this is the one place they become numbers. */
function recordOf(view: View, cell: MatrixCell): number | null {
  const id = Number(firstId(cell.fields[view.join?.column_field ?? '']))
  return id > 0 ? id : null
}

/** Records first, each once, then the names no record carries (and the kept ones); a record without a title is dropped. */
export function buildColumns(view: View, rows: Row[], titles: Map<number, string>, picked: number[], keptNames: MatrixColumn[] = []): MatrixColumn[] {
  const records = new Map<number, MatrixColumn>()
  const names = new Map<string, MatrixColumn>()
  const addRecord = (id: number) => {
    const title = titles.get(id)
    if (title !== undefined && title !== '' && !records.has(id)) records.set(id, { key: `record:${id}`, kind: 'record', id, title })
  }
  for (const row of rows) {
    for (const cell of cellsOf(row)) {
      const id = recordOf(view, cell)
      const name = nameOf(view, cell)
      if (id !== null) addRecord(id)
      else if (name !== '' && !names.has(normalise(name))) names.set(normalise(name), { key: `name:${normalise(name)}`, kind: 'name', title: name })
    }
  }
  picked.forEach(addRecord)
  for (const column of keptNames) {
    const name = column.key.slice('name:'.length)
    if (!names.has(name)) names.set(name, column)
  }
  const byTitle = (a: MatrixColumn, b: MatrixColumn) => a.title.localeCompare(b.title)
  return [...[...records.values()].sort(byTitle), ...[...names.values()].sort(byTitle)]
}

/** The columns not hidden; a hidden key with no column in the window matches nothing. */
export function visibleColumns(columns: MatrixColumn[], hidden: string[]): MatrixColumn[] {
  return columns.filter((column) => !hidden.includes(column.key))
}

function onColumn(view: View, cell: MatrixCell, column: MatrixColumn): boolean {
  const id = recordOf(view, cell)
  return column.kind === 'record' ? id === column.id : id === null && normalise(nameOf(view, cell)) === column.key.slice('name:'.length)
}

/** Every join of one cell, the lowest id first: that one is shown, the rest are for the panel. */
export function cellsFor(view: View, row: Row, column: MatrixColumn): MatrixCell[] {
  return cellsOf(row).filter((cell) => onColumn(view, cell, column)).sort((a, b) => a.id - b.id)
}

export function cellFor(view: View, row: Row, column: MatrixColumn): MatrixCell | undefined {
  return cellsFor(view, row, column)[0]
}

export function markFor(view: View, status: string): string {
  return view.join?.marks[status] ?? status
}

/** The columns this browser picked for the view; null when it keeps none. */
export function storedPicked(view: View): number[] | null {
  return storedKept(view)?.picked ?? null
}

/** This browser's pick, else the saved view's. */
export function loadPicked(view: View): number[] {
  return storedPicked(view) ?? (view as Partial<SavedView>).arrangement?.picked ?? []
}

/** Kept past a Save or a revert, with the view's widths. */
export function savePicked(view: View, picked: number[]): void {
  saveKept(view, { ...storedKept(view), picked })
}
