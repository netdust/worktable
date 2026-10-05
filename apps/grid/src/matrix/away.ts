import { firstId } from '../grid/columns'
import type { MatrixColumn, Row, View } from '../types'

function day(value: unknown): string {
  return typeof value === 'string' ? value : ''
}

/** The away record that covers `date` for this column: only a record column can be away. */
export function absentOn(away: Row[], view: View, column: MatrixColumn, date: string): Row | undefined {
  const spec = view.away
  if (!spec || column.kind !== 'record' || date === '') return undefined
  return away.find((row) => {
    const from = day(row.fields[spec.date_field])
    const to = day(row.fields[spec.end_field]) || from
    return Number(firstId(row.fields[spec.column_field])) === column.id && from !== '' && from <= date && date <= to
  })
}
