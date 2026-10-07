import { Button } from '@sakaniui/react'
import { type ReactNode, useState } from 'react'
import { errorText, t } from '../i18n'
import type { ApiError, ModelAction, Row } from '../types'
import { SidePanel } from '../ui/SidePanel'
import type { Column } from './columns'
import { RelationPicker } from './cells/RelationPicker'

/** Runs a declared action on the open record, with the records its inputs picked. */
export type RunAction = (action: ModelAction, input: Record<string, number>) => Promise<void>

interface Props {
  row: Row
  /** Every column the model has, not only the view's: the drawer is where the long ones are read. */
  columns: Column[]
  onClose: () => void
  /** What edits the record, under its fields. */
  editor?: ReactNode
  /** The model's declared actions, each a button with a picker per input. */
  actions?: ModelAction[]
  onAction?: RunAction
  /** False leaves focus where it was: the matrix keeps typing in its cell. */
  focusOnOpen?: boolean
}

/** One record read whole, beside the sheet — not a modal: the grid stays live. */
export function Drawer({ row, columns, onClose, editor, actions = [], onAction, focusOnOpen = true }: Props) {
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
      {onAction && actions.map((action) => <Action key={`${row.id}:${action.name}`} action={action} onRun={(input) => onAction(action, input)} />)}
      {editor && <div className="nv-drawer__editor">{editor}</div>}
    </SidePanel>
  )
}

type Sending = { status: 'idle' } | { status: 'sent' } | { status: 'refused'; message: string }

/** Keyed by its record, so another row starts with nothing picked. */
function Action({ action, onRun }: { action: ModelAction; onRun: (input: Record<string, number>) => Promise<void> }) {
  const inputs = Object.entries(action.input)
  const [picked, setPicked] = useState<Record<string, Row>>({})
  const [open, setOpen] = useState<string | null>(null)
  const [sending, setSending] = useState<Sending>({ status: 'idle' })
  const ready = inputs.every(([key]) => picked[key])

  const run = () => {
    setSending({ status: 'sent' })
    onRun(Object.fromEntries(inputs.map(([key]) => [key, picked[key].id]))).then(
      () => setSending({ status: 'idle' }),
      (error: ApiError) => setSending({ status: 'refused', message: errorText(error.code, error.message) }),
    )
  }

  return (
    <div className="nv-action" role="group" aria-label={action.label}>
      {inputs.map(([key, input]) => (
        <div key={key} className="nv-action__input">
          <Button variant="secondary" size="sm" onClick={() => setOpen(key)}>{`${input.label}: ${picked[key]?.title ?? t('empty')}`}</Button>
          {open === key && (
            <RelationPicker model={input.relation} label={input.label} onCancel={() => setOpen(null)}
              onPick={(record) => {
                setPicked((was) => ({ ...was, [key]: record }))
                setOpen(null)
              }} />
          )}
        </div>
      ))}
      <Button variant="primary" size="sm" disabled={!ready || sending.status === 'sent'} onClick={run}>{action.label}</Button>
      {sending.status === 'refused' && <p className="nv-action__refused" role="alert">{sending.message}</p>}
    </div>
  )
}
