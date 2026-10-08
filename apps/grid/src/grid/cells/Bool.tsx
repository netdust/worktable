import { Switch } from 'react-aria-components'
import type { CellProps } from './props'

interface Props extends CellProps {
  onToggle: () => void
}

/** Flipped in place — a click, Enter or Space — never an editor. */
export function BoolCell({ column, row, onToggle }: Props) {
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
