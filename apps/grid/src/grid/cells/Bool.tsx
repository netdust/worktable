import { Switch } from '@sakaniui/react'
import type { CellProps } from './props'

interface Props extends CellProps {
  onToggle: () => void
}

/** Flipped in place — a click, Enter or Space — never an editor. */
export function BoolCell({ column, row, onToggle }: Props) {
  return (
    <span className="nv-cell__bool">
      <Switch
        aria-label={column.label}
        tabIndex={-1}
        checked={Boolean(column.value(row))}
        disabled={!column.editable}
        onChange={onToggle}
      />
      <span className="nv-cell__muted">{column.text(row)}</span>
    </span>
  )
}
