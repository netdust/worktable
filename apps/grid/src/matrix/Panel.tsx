import { AlertTriangle } from 'lucide-react'
import { type KeyboardEvent, type Ref, useEffect, useId, useRef, useState } from 'react'
import { TextArea, TextField } from 'react-aria-components'
import { optionsFrom } from '../api'
import { Section } from '../grid/drawer/Sections'
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
  /** The window's rows: the rest of a person's day. */
  rows?: Row[]
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

/** The other cells of this column on the same day: the rest of the person's day. */
function sameDay(view: View, rows: Row[], row: Row, column: MatrixColumn): { row: Row; cell: MatrixCell }[] {
  const date = text(row.fields[view.date_field ?? ''])
  return rows.filter((other) => other.id !== row.id && text(other.fields[view.date_field ?? '']) === date)
    .flatMap((other) => cellsFor(view, other, column).slice(0, 1).map((cell) => ({ row: other, cell })))
}

/** As the matrix prototype's cell drawer: the alert, who, in what role and state, on what; the rest of their day; who could stand in. */
function CellPanel({ view, models, row, column, away, store, rows = [] }: PanelProps & { column: MatrixColumn }) {
  const join = view.join!
  const { options, status, word } = useWords(view, models)
  const [cell, ...others] = cellsFor(view, row, column)
  const date = text(row.fields[view.date_field ?? ''])
  const absent = absentOn(away, view, column, date)
  const [kept, setKept] = useState(false)
  const current = cell ? status(cell) : ''
  const note = cell && join.note_field ? text(cell.fields[join.note_field]) : ''
  const noteOf = (c: MatrixCell) => (join.note_field ? text(c.fields[join.note_field]).trim() : '')
  const [draft, setDraft] = useState(note)
  useEffect(() => setDraft(note), [note])
  const role = join.open && cell ? (cell.lookups?.[join.open.match_field]?.title ?? '') : ''
  const day = sameDay(view, rows, row, column)
  const reason = absent && view.away ? text(absent.fields[view.away.label_field]) : ''
  const instead = useRef<HTMLElement>(null)

  const choices = [{ value: '', label: t('none') }, ...Object.entries(options).map(([value, label]) => ({ value, label }))]

  return (
    <div className="nv-panel">
      <p className="nv-panel__where">{[row.title, date && dayLabel(date)].filter(Boolean).join(' · ')}</p>
      {absent && !kept && (
        <div className={cell ? 'nv-dw-alert' : 'nv-dw-alert nv-dw-alert--warn'} role="alert">
          <AlertTriangle size={15} aria-hidden="true" />
          <div>
            <b>{cell ? t('awayWarning') : t('awayReason', { reason })}</b>
            {cell && reason && <span>{t('awayReason', { reason })}</span>}
            {cell && (
              <span className="nv-dw-alert__acts">
                <button type="button" onClick={() => instead.current?.scrollIntoView({ block: 'nearest' })}>{t('chooseOther')}</button>
                <button type="button" onClick={() => setKept(true)}>{t('keepIt')}</button>
              </span>
            )}
          </div>
        </div>
      )}
      <dl className="nv-drawer__fields">
        <div className="nv-drawer__field"><dt>{t('person')}</dt><dd>{column.title}</dd></div>
        {join.open && <div className="nv-drawer__field"><dt>{t('role')}</dt><dd>{role || t('empty')}</dd></div>}
        <div className="nv-drawer__field nv-panel__status">
          <dt>{t('statusLabel')}</dt>
          <dd><Choices label={t('statusLabel')} options={choices} value={current} disabled={!store}
            onPick={(value) => void store?.set(row.id, column, value === '' ? null : value)} /></dd>
        </div>
        <div className="nv-drawer__field"><dt>{t('onActivity')}</dt><dd>{row.title}</dd></div>
        {join.note_field && (
          <div className="nv-drawer__field">
            <dt>{t('noteLabel')}</dt>
            <dd>
              <TextField className="nv-field" aria-label={t('noteLabel')} value={draft} isDisabled={!store || !cell} onChange={setDraft}
                onBlur={() => {
                  if (draft !== note) void store?.setNote(row.id, column, draft)
                }}>
                <TextArea className="nv-textarea nv-panel__note" rows={2} placeholder={t('noNote')} />
              </TextField>
            </dd>
          </div>
        )}
      </dl>
      {others.length > 0 && (
        <Section title={t('sharedCell')} count={String(others.length)}>
          <ul className="nv-panel__others">
            {others.map((other) => <li key={other.id}>{[word(other), noteOf(other)].filter(Boolean).join(' — ')}</li>)}
          </ul>
        </Section>
      )}
      <Section title={t('alsoOn', { day: date ? dayLabel(date) : '' })} count={String(day.length)}>
        {day.length === 0 ? <p className="nv-dw-none">{t('nothingElse')}</p> : (
          <ul className="nv-dw-rows">
            {day.map(({ row: other, cell: c }) => <li key={other.id}><span className="nv-mono">{text(other.fields[view.date_field ?? '']).slice(11, 16) || '—'}</span><span>{other.title}<small> · {word(c)}</small></span></li>)}
          </ul>
        )}
      </Section>
      {cell && <Instead ref={instead} view={view} models={models} row={row} column={column} cell={cell} store={store} />}
    </div>
  )
}

/** Who could take this place instead, from the person column's own candidates; Kiezen moves the place to them. */
function Instead({ ref, view, models, row, column, cell, store }: { ref: Ref<HTMLElement>; view: View; models: Record<string, Model>; row: Row; column: MatrixColumn; cell: MatrixCell; store?: MatrixStore }) {
  const join = view.join!
  const from = models[join.model]?.fields[join.column_field]?.options_from
  const [people, setPeople] = useState<Row[] | null>(null)
  useEffect(() => {
    if (!from) return
    let live = true
    optionsFrom(from, { ...cell.fields, id: cell.id }).then((found) => live && setPeople(found), () => live && setPeople([]))
    return () => {
      live = false
    }
  }, [cell.id])
  if (!from) return null
  const status = text(cell.fields[join.cell_field])
  const choose = async (person: Row) => {
    if (!store) return
    const to: MatrixColumn = { key: `record:${person.id}`, kind: 'record', id: person.id, title: person.title }
    if (await store.set(row.id, to, status || null)) await store.set(row.id, column, null)
  }
  return (
    <Section ref={ref} title={t('whoInstead')} count={people ? String(people.length) : undefined}>
      {people?.length === 0 ? <p className="nv-dw-none">{t('candidatesNone')}</p> : (
        <ul className="nv-dw-list">
          {(people ?? []).map((person) => (
            <li key={person.id}>
              <span className="nv-dw-list__main">{person.title}</span>
              {store && <button type="button" className="nv-button nv-button--secondary nv-button--sm" onClick={() => void choose(person)}>{t('choose')}</button>}
            </li>
          ))}
        </ul>
      )}
    </Section>
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
