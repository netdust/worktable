import { Button } from 'react-aria-components'
import { type ReactNode, useState } from 'react'
import { recordLink as readLink, rotateRecordLink } from '../api'
import { errorText, t } from '../i18n'
import type { Account, ActionInput, ApiError, Model, ModelAction, Row } from '../types'
import { SidePanel } from '../ui/SidePanel'
import type { Column } from './columns'
import { RelationPicker } from './cells/RelationPicker'

/** Runs a declared action on the open record, with the records its inputs picked. */
export type RunAction = (action: ModelAction, input: Record<string, unknown>) => Promise<void>

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
  /** The dataset whose record link the drawer copies and renews; an administrator's. */
  recordLink?: string
}

/** The dataset an administrator copies a record's link of, on one that declares record_link. */
export function linkedDataset(role: Account['role'], model: Model): string | undefined {
  return role === 'administrator' && model.record_link ? model.key : undefined
}

/** One record read whole, beside the sheet — not a modal: the grid stays live. */
export function Drawer({ row, columns, onClose, editor, actions = [], onAction, focusOnOpen = true, recordLink }: Props) {
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
      {recordLink && <RecordLink key={`${recordLink}:${row.id}`} dataset={recordLink} id={row.id} />}
      {onAction && actions.map((action) => <Action key={`${row.id}:${action.name}`} action={action} onRun={(input) => onAction(action, input)} />)}
      {editor && <div className="nv-drawer__editor">{editor}</div>}
    </SidePanel>
  )
}

/** Copies the record's link for its person, or a new one that stops the old. */
function RecordLink({ dataset, id }: { dataset: string; id: number }) {
  const [said, setSaid] = useState('')
  const copy = (read: Promise<string>, done: string) => {
    read.then((link) => navigator.clipboard.writeText(link)).then(
      () => setSaid(done),
      () => setSaid(t('recordLinkFailed')),
    )
  }
  return (
    <div className="nv-action" role="group" aria-label={t('copyLink')}>
      <Button className="nv-button nv-button--secondary nv-button--sm" onPress={() => copy(readLink(dataset, id), t('linkCopied'))}>{t('copyLink')}</Button>
      <Button className="nv-button nv-button--secondary nv-button--sm" onPress={() => copy(rotateRecordLink(dataset, id), t('recordLinkRotated'))}>{t('recordLinkNew')}</Button>
      <p className="nv-action__said" role="status">{said}</p>
    </div>
  )
}

type Sending = { status: 'idle' } | { status: 'sent' } | { status: 'refused'; message: string }

type Typed = Exclude<ActionInput, { relation: string }>

/** As the engine checks it, so the run button waits for a value it would take. */
function typedValid(input: Typed, value: unknown): boolean {
  if (value === undefined || value === '') return input.required === false
  if (input.type !== 'integer') return true
  const n = value as number
  return Number.isSafeInteger(n) && (input.min === undefined || n >= input.min) && (input.max === undefined || n <= input.max)
}

function TypedInput({ input, value, onChange }: { input: Typed; value: unknown; onChange: (value: unknown) => void }) {
  if (input.type === 'boolean') {
    return (
      <label className="nv-action__input nv-action__check">
        <input type="checkbox" checked={value === true} onChange={(event) => onChange(event.target.checked)} />
        {input.label}
      </label>
    )
  }
  const kind = input.type === 'integer' ? 'number' : input.type
  const read = (raw: string): unknown => (raw === '' ? undefined : input.type === 'integer' ? Number(raw) : raw)
  return (
    <label className="nv-action__input">
      <span>{input.label}</span>
      <input className="nv-fb__text" type={kind} aria-label={input.label} min={input.min} max={input.max} maxLength={input.type === 'text' ? 500 : undefined}
        value={value === undefined ? '' : String(value)} onChange={(event) => onChange(read(event.target.value))} />
    </label>
  )
}

/** A required yes/no starts as no, as its box shows; an optional one stays out until ticked. */
const unticked = (inputs: [string, ActionInput][]): Record<string, unknown> =>
  Object.fromEntries(inputs.filter(([, input]) => 'type' in input && input.type === 'boolean' && input.required !== false).map(([key]) => [key, false]))

/** Keyed by its record, so another row starts with nothing picked. */
function Action({ action, onRun }: { action: ModelAction; onRun: (input: Record<string, unknown>) => Promise<void> }) {
  const inputs = Object.entries(action.input)
  const [picked, setPicked] = useState<Record<string, Row>>({})
  const [typed, setTyped] = useState<Record<string, unknown>>(() => unticked(inputs))
  const [open, setOpen] = useState<string | null>(null)
  const [sending, setSending] = useState<Sending>({ status: 'idle' })
  const valueOf = ([key, input]: [string, ActionInput]) => ('relation' in input ? picked[key]?.id : typed[key])
  const ready = inputs.every((entry) => {
    const [, input] = entry
    return 'relation' in input ? picked[entry[0]] !== undefined : typedValid(input, typed[entry[0]])
  })

  const run = () => {
    setSending({ status: 'sent' })
    const given = inputs.filter((entry) => valueOf(entry) !== undefined).map((entry) => [entry[0], valueOf(entry)])
    onRun(Object.fromEntries(given)).then(
      () => setSending({ status: 'idle' }),
      (error: ApiError) => setSending({ status: 'refused', message: errorText(error.code, error.message) }),
    )
  }

  return (
    <div className="nv-action" role="group" aria-label={action.label}>
      {inputs.map(([key, input]) => 'relation' in input ? (
        <div key={key} className="nv-action__input">
          <Button className="nv-button nv-button--secondary nv-button--sm" onPress={() => setOpen(key)}>{`${input.label}: ${picked[key]?.title ?? t('empty')}`}</Button>
          {open === key && (
            <RelationPicker model={input.relation} label={input.label} onCancel={() => setOpen(null)}
              onPick={(record) => {
                setPicked((was) => ({ ...was, [key]: record }))
                setOpen(null)
              }} />
          )}
        </div>
      ) : (
        <TypedInput key={key} input={input} value={typed[key]} onChange={(value) => setTyped((was) => ({ ...was, [key]: value }))} />
      ))}
      <Button className="nv-button nv-button--primary nv-button--sm" isDisabled={!ready || sending.status === 'sent'} onPress={run}>{action.label}</Button>
      {sending.status === 'refused' && <p className="nv-action__refused" role="alert">{sending.message}</p>}
    </div>
  )
}
