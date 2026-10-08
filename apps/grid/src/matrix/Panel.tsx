import { type KeyboardEvent, useEffect, useId, useRef, useState } from 'react'
import { Label, TextArea, TextField } from 'react-aria-components'
import { dayLabel } from '../grid/group'
import { t } from '../i18n'
import type { MatrixCell, MatrixColumn, Model, Row, View } from '../types'
import { absentOn } from './away'
import { cellsFor } from './columns'
import type { MatrixStore } from './store'

export interface PanelProps {
  view: View
  models: Record<string, Model>
  row: Row
  /** The cell's column; null is the row label's panel. */
  column: MatrixColumn | null
  columns: MatrixColumn[]
  away: Row[]
  /** Without one the panel reads only. */
  store?: MatrixStore
}

function text(value: unknown): string {
  return typeof value === 'string' ? value : ''
}

/** The side panel's editor: one cell's status and note, or who is on a row. */
export function Panel(props: PanelProps) {
  return props.column ? <CellPanel {...props} column={props.column} /> : <RowPanel {...props} />
}

function useWords(view: View, models: Record<string, Model>) {
  const join = view.join!
  const options = models[join.model]?.fields[join.cell_field]?.options ?? {}
  const status = (cell: MatrixCell) => text(cell.fields[join.cell_field])
  return { options, status, word: (cell: MatrixCell) => options[status(cell)] ?? status(cell) }
}

function CellPanel({ view, models, row, column, away, store }: PanelProps & { column: MatrixColumn }) {
  const join = view.join!
  const { options, status, word } = useWords(view, models)
  const [cell, ...others] = cellsFor(view, row, column)
  const date = text(row.fields[view.date_field ?? ''])
  const absent = absentOn(away, view, column, date)
  const current = cell ? status(cell) : ''
  const note = cell && join.note_field ? text(cell.fields[join.note_field]) : ''
  const noteOf = (c: MatrixCell) => (join.note_field ? text(c.fields[join.note_field]).trim() : '')
  const [draft, setDraft] = useState(note)
  useEffect(() => setDraft(note), [note])

  const choices = [{ value: '', label: t('none') }, ...Object.entries(options).map(([value, label]) => ({ value, label }))]

  return (
    <div className="nv-panel">
      <p className="nv-panel__where">{[row.title, date && dayLabel(date)].filter(Boolean).join(' · ')}</p>
      {absent && (
        <div className="nv-panel__away">
          <p>{t('awayReason', { reason: view.away ? text(absent.fields[view.away.label_field]) : '' })}</p>
          {cell && <p className="nv-panel__warn">{t('awayWarning')}</p>}
        </div>
      )}
      <Choices label={t('statusLabel')} options={choices} value={current} disabled={!store}
        onPick={(value) => void store?.set(row.id, column, value === '' ? null : value)} />
      {join.note_field && (
        <TextField className="nv-field" value={draft} isDisabled={!store || !cell} onChange={setDraft}
          onBlur={() => {
            if (draft !== note) void store?.setNote(row.id, column, draft)
          }}>
          <Label className="nv-field__label">{t('noteLabel')}</Label>
          <TextArea className="nv-textarea nv-panel__note" rows={4} />
        </TextField>
      )}
      {others.length > 0 && (
        <section className="nv-panel__section">
          <h3 className="nv-panel__label">{t('sharedCell')}</h3>
          <ul className="nv-panel__others">
            {others.map((other) => <li key={other.id}>{[word(other), noteOf(other)].filter(Boolean).join(' — ')}</li>)}
          </ul>
        </section>
      )}
    </div>
  )
}

const STEP: Record<string, number> = { ArrowDown: 1, ArrowRight: 1, ArrowUp: -1, ArrowLeft: -1 }

/** The status as an inline radio group: arrows move, Space or Enter picks; nothing floats. */
function Choices({ label, options, value, disabled, onPick }: {
  label: string; options: { value: string; label: string }[]; value: string; disabled: boolean; onPick: (value: string) => void
}) {
  const id = useId()
  const buttons = useRef<(HTMLButtonElement | null)[]>([])
  const checked = Math.max(0, options.findIndex((option) => option.value === value))
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const at = buttons.current.findIndex((button) => button === event.target)
    if (at < 0) return
    if (event.key in STEP) {
      event.preventDefault()
      buttons.current[(at + STEP[event.key] + options.length) % options.length]?.focus()
    } else if (event.key === ' ' || event.key === 'Enter') {
      event.preventDefault()
      onPick(options[at].value)
    }
  }

  return (
    <div className="nv-panel__field">
      <span id={id} className="nv-panel__label">{label}</span>
      <div role="radiogroup" aria-labelledby={id} aria-disabled={disabled || undefined} className="nv-choices" onKeyDown={onKeyDown}>
        {options.map((option, i) => (
          <button key={option.value} ref={(el) => { buttons.current[i] = el }} type="button" role="radio" className="nv-choices__option"
            aria-checked={option.value === value} tabIndex={i === checked ? 0 : -1} disabled={disabled}
            onClick={() => onPick(option.value)}>
            {option.label}
          </button>
        ))}
      </div>
    </div>
  )
}

function RowPanel({ view, models, row, columns }: PanelProps) {
  const { word } = useWords(view, models)
  const people = columns.flatMap((column) => cellsFor(view, row, column).map((cell) => ({ cell, column })))

  return (
    <div className="nv-panel">
      <section className="nv-panel__section">
        <h3 className="nv-panel__label">{t('onIt')}</h3>
        {people.length === 0 ? <p>{t('empty')}</p> : (
          <ul className="nv-panel__people">
            {people.map(({ cell, column }) => (
              <li key={cell.id}><span>{column.title}</span><span>{word(cell)}</span></li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}
