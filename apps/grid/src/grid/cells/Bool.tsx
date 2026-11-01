import { Switch } from 'react-aria-components'
import { DRAFT } from '../store'
import type { CellProps } from './props'

interface Props extends CellProps {
  onToggle: () => void
}

/** Flipped in place — a click, Enter or Space — never an editor. */
export function BoolCell({ column, row, onToggle }: Props) {
  // A value never given reads blank, not as an off switch; a press gives it its first value, true.
  if (row.id !== DRAFT && (column.value(row) ?? null) === null) {
    return <span className="nv-cell__bool nv-cell__bool--blank" onClick={column.editable ? onToggle : undefined} />
  }
  return (
    <span className="nv-cell__bool">
      <Switch aria-label={column.label} excludeFromTabOrder className="nv-switch" isSelected={Boolean(column.value(row))}
        isReadOnly={!column.editable} onChange={onToggle}>
        <span className="nv-switch__track"><span className="nv-switch__thumb" /></span>
      </Switch>
      <span className="nv-cell__muted">{column.text(row)}</span>
    </span>
  )
}
