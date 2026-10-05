import { InputEditor } from './Text'
import type { CellProps, EditorProps } from './props'

export function NumberCell({ column, row }: CellProps) {
  return <span className="nv-cell__tabular">{column.text(row)}</span>
}

export function NumberEditor(props: EditorProps) {
  return <InputEditor {...props} inputMode="decimal" />
}
