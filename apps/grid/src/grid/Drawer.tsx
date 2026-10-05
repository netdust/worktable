import type { ReactNode } from 'react'
import { t } from '../i18n'
import type { Row } from '../types'
import { SidePanel } from '../ui/SidePanel'
import type { Column } from './columns'

interface Props {
  row: Row
  /** Every column the model has, not only the view's: the drawer is where the long ones are read. */
  columns: Column[]
  onClose: () => void
  /** What edits the record, under its fields. */
  editor?: ReactNode
  /** False leaves focus where it was: the matrix keeps typing in its cell. */
  focusOnOpen?: boolean
}

/** One record read whole, beside the sheet — not a modal: the grid stays live. */
export function Drawer({ row, columns, onClose, editor, focusOnOpen = true }: Props) {
  return (
    <SidePanel label={row.title} focusKey={row.id} onClose={onClose} focusOnOpen={focusOnOpen}>
      {columns.length > 0 && <dl className="nv-drawer__fields">
        {columns.filter((column) => column.id !== 'title').map((column) => (
          <div key={column.id} className="nv-drawer__field">
            <dt>{column.label}</dt>
            <dd>{column.text(row) || t('empty')}</dd>
          </div>
        ))}
      </dl>}
      {editor && <div className="nv-drawer__editor">{editor}</div>}
    </SidePanel>
  )
}
