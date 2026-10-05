import { InputEditor } from './Text'
import type { CellProps, EditorProps } from './props'

export function TimeCell({ column, row }: CellProps) {
  return <span className="nv-cell__tabular">{column.text(row)}</span>
}

export function TimeEditor(props: EditorProps) {
  return <InputEditor {...props} placeholder="HH:MM" inputMode="numeric" />
}
