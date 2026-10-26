import { Button } from 'react-aria-components'
import { useEffect, useRef, useState } from 'react'
import { optionsFrom } from '../api'
import { errorText, t } from '../i18n'
import type { ActionInput, ApiError, ModelAction, OptionsFrom, Row } from '../types'
import { RelationPicker } from './cells/RelationPicker'

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

/** Keyed by its record, so another row starts with nothing picked. The bar has no one record: its inputs pick by id, never `options_from`. */
export function ActionInputs({ action, record, disabled = false, staleOn, onRun }: { action: ModelAction; record?: Record<string, unknown>; disabled?: boolean; staleOn?: number; onRun: (input: Record<string, unknown>) => Promise<unknown> }) {
  const inputs = Object.entries(action.input)
  const [picked, setPicked] = useState<Record<string, Row>>({})
  const [typed, setTyped] = useState<Record<string, unknown>>(() => unticked(inputs))
  const [open, setOpen] = useState<string | null>(null)
  const openers = useRef<Record<string, HTMLButtonElement | null>>({})
  // A picker that closes gives the keyboard back to the button that opened it, so Escape goes on to the panel.
  const closePicker = (key: string) => {
    setOpen(null)
    openers.current[key]?.focus()
  }
  const [sending, setSending] = useState<Sending>({ status: 'idle' })
  // A refusal belongs to what was asked: when what it was asked of changes, it goes.
  useEffect(() => setSending((was) => (was.status === 'refused' ? { status: 'idle' } : was)), [staleOn])
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
          <Button ref={(element) => { openers.current[key] = element }} className="nv-button nv-button--secondary nv-button--sm" onPress={() => setOpen(key)}>{`${input.label}: ${picked[key]?.title ?? t('empty')}`}</Button>
          {open === key && (
            <RelationPicker model={input.relation} label={input.label} onCancel={() => closePicker(key)}
              candidates={input.options_from && record ? () => optionsFrom(input.options_from as OptionsFrom, record) : undefined}
              onPick={(record) => {
                setPicked((was) => ({ ...was, [key]: record }))
                closePicker(key)
              }} />
          )}
        </div>
      ) : (
        <TypedInput key={key} input={input} value={typed[key]} onChange={(value) => setTyped((was) => ({ ...was, [key]: value }))} />
      ))}
      <Button className="nv-button nv-button--primary nv-button--sm" isDisabled={disabled || !ready || sending.status === 'sent'} onPress={run}>{action.label}</Button>
      {sending.status === 'refused' && <p className="nv-action__refused" role="alert">{sending.message}</p>}
    </div>
  )
}
