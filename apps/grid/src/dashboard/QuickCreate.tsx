import { useEffect, useState } from 'react'
import { Dialog, Heading, Modal, ModalOverlay } from 'react-aria-components'
import { create, records } from '../api'
import { madeFrom, type NewRow } from '../grid/newRow'
import { errorText, t } from '../i18n'
import type { ApiError, Field, DateWindow, Model, Row, Scope, TableDef } from '../types'

const INPUT: Partial<Record<Field['type'], string>> = { int: 'number', float: 'number', date: 'date', datetime: 'datetime-local', email: 'email', url: 'url' }

/** A relation picked from its target's records, by title. */
function RelationSelect({ id, field, value, onChange, autoFocus }: {
  id: string; field: Field; value: unknown; onChange: (value: unknown) => void; autoFocus?: boolean
}) {
  const [options, setOptions] = useState<Row[]>([])
  useEffect(() => {
    if (field.relation) records(field.relation.model, '').then((r) => setOptions(r.rows), () => setOptions([]))
  }, [field.relation?.model])
  const chosen = Array.isArray(value) ? value[0] : value
  return (
    <label className="nv-dialog__field" htmlFor={id}>
      {field.label}
      <select id={id} value={String(chosen ?? '')} autoFocus={autoFocus} onChange={(e) => onChange(e.target.value ? [Number(e.target.value)] : null)}>
        <option value="">–</option>
        {options.map((row) => <option key={row.id} value={row.id}>{row.title}</option>)}
      </select>
    </label>
  )
}

/** One field of a new record: its own input type, a select for options, a checkbox for a flag. */
function FieldInput({ name, field, value, onChange, autoFocus }: {
  name: string; field: Field; value: unknown; onChange: (value: unknown) => void; autoFocus?: boolean
}) {
  const id = `quick-${name}`
  if (field.type === 'relation' && field.relation) return <RelationSelect id={id} field={field} value={value} onChange={onChange} autoFocus={autoFocus} />
  if (field.options) {
    return (
      <label className="nv-dialog__field" htmlFor={id}>
        {field.label}
        <select id={id} value={String(value ?? '')} autoFocus={autoFocus} onChange={(e) => onChange(e.target.value)}>
          {Object.entries(field.options).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
        </select>
      </label>
    )
  }
  if (field.type === 'bool') {
    return (
      <label className="nv-dialog__field" htmlFor={id}>
        <input id={id} type="checkbox" checked={Boolean(value)} autoFocus={autoFocus} onChange={(e) => onChange(e.target.checked)} />
        {field.label}
      </label>
    )
  }
  return (
    <label className="nv-dialog__field" htmlFor={id}>
      {field.label}
      <input id={id} type={INPUT[field.type] ?? 'text'} value={String(value ?? '')} autoFocus={autoFocus} onChange={(e) => onChange(e.target.value)} />
    </label>
  )
}

/**
 * What the dialog asks, each once: the title where it is required, every required column the writer takes,
 * and the chosen space. A value `+ New` fills in (a day, a first option, the space) shows as the field's start.
 */
function askedOf(model: Model, made: NewRow, scope: Scope | null): string[] {
  if ('missing' in made) return []
  const required = Object.entries(model.fields)
    .filter(([key, field]) => field.required && !field.defaulted && !field.readonly && key !== model.title_field)
    .map(([key]) => key)
  const space = scope && scope.field in made.fields ? [scope.field] : []
  return [...new Set([...made.needs.filter((key) => key === 'title' || required.includes(key)), ...required, ...space])]
}

/** A create on one dataset from the dashboard's header: the columns it needs, the space filled in, the writer judging it. */
export function QuickCreate({ label, model, tables, scope, window = null, onClose, onCreated }: {
  label: string; model: Model; tables: TableDef[]; scope: Scope | null
  /** The days on screen: a date starts on today when it is among them, else on their first. */
  window?: DateWindow | null
  onClose: () => void; onCreated: () => void
}) {
  const made = madeFrom(model, tables, window, scope)
  const titleField: Field = { type: 'text', label: model.title_label, required: true, fact: false }
  const asked = askedOf(model, made, scope)
  const [values, setValues] = useState<Record<string, unknown>>(() =>
    'missing' in made ? {} : Object.fromEntries(asked.filter((key) => key in made.fields).map((key) => [key, made.fields[key]])),
  )
  const [refusal, setRefusal] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const submit = () => {
    setBusy(true)
    setRefusal(null)
    create(model.key, values).then(
      () => {
        onCreated()
        onClose()
      },
      (error: ApiError) => {
        setBusy(false)
        setRefusal(errorText(error.code, error.message))
      },
    )
  }
  return (
    <ModalOverlay className="nv-scrim" isOpen isDismissable onOpenChange={(open) => !open && onClose()}>
      <Modal className="nv-dialog">
        <Dialog className="nv-dialog__body" aria-label={label}>
          <form className="nv-dialog__form" onSubmit={(e) => { e.preventDefault(); submit() }}>
            <Heading slot="title">{label}</Heading>
            {'missing' in made && <p className="nv-dialog__refusal">{t('needsFields', { fields: made.missing.join(', ') })}</p>}
            {asked.map((key, at) => (
              <FieldInput key={key} name={key} field={key === 'title' ? titleField : model.fields[key]} value={values[key]} autoFocus={at === 0}
                onChange={(value) => setValues((was) => ({ ...was, [key]: value }))} />
            ))}
            {refusal && <p className="nv-dialog__refusal" role="alert">{refusal}</p>}
            <div className="nv-dialog__actions">
              <button type="button" className="nv-bar__button" onClick={onClose}>{t('cancel')}</button>
              <button type="submit" className="nv-button nv-button--primary nv-button--sm" disabled={busy || 'missing' in made}>{t('create')}</button>
            </div>
          </form>
        </Dialog>
      </Modal>
    </ModalOverlay>
  )
}
