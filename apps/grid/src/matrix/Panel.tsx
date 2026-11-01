import { CalendarDays, CircleDot, StickyNote, Tag, User } from 'lucide-react'
import { type CSSProperties, type KeyboardEvent, type Ref, useContext, useEffect, useId, useRef, useState } from 'react'
import { optionsFrom } from '../api'
import { Alert } from '../grid/drawer/Alert'
import { Section } from '../grid/drawer/Sections'
import type { Column } from '../grid/columns'
import { Drawer, Line } from '../grid/Drawer'
import { SchemaContext } from '../grid/drawer/context'
import { Note } from '../grid/drawer/Note'
import { dayLabel, kindOf } from '../grid/drawer/derive'
import { locale, t } from '../i18n'
import { placeOf } from '../ui/facts'
import { hueOf, toneColor } from '../ui/tone'
import { initials, whenOf } from '../ui/when'
import type { MatrixCell, MatrixColumn, Model, Row, View } from '../types'
import { absentOn } from './away'
import { cellsFor, markFor } from './columns'
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
  /** Moves when the matrix hands the keyboard over: the status opens for it. */
  asking?: number
  /** Gives the keyboard back to the cell, after a button that goes away with what it did (Kiezen). */
  onReturn?: () => void
}

function text(value: unknown): string {
  return typeof value === 'string' ? value : ''
}

/** The side panel's editor: one cell's status and note, or who is on a row. */
export function Panel(props: PanelProps) {
  return <RowPanel {...props} />
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

const shortDay = (date: string) => dayLabel(date, locale()).replace(/ \d{4}$/, '')

/** The cell's subline, as the prototype's: its day and hours in mono, then the activity's place. */
function CellSub({ row, fields, date }: { row: Row; fields: Column[]; date: string }) {
  const space = useContext(SchemaContext)?.space?.field ?? null
  const { from, to } = whenOf(row, fields.filter((c) => c.kind === 'datetime'))
  // Its place: the first relation that is not the space every row of the view shares.
  const place = placeOf(fields, [space])?.text(row)
  return (
    <>
      <span className="nv-mono">{[date && shortDay(date), from && `${from}${to ? `–${to}` : ''}`].filter(Boolean).join(' ')}</span>
      {place && <span>{place}</span>}
    </>
  )
}

/** Absent on the day: the band names the reason; assigned anyway, it offers someone else or to keep them. */
function CellAlert({ name, date, reason, assigned, onOther }: { name: string; date: string; reason: string; assigned: boolean; onOther: () => void }) {
  return (
    <Alert title={assigned ? t('awayWarning') : t('away')} text={t('awaySentence', { name, day: shortDay(date), reason })} warn={!assigned}
      actions={assigned ? [{ label: t('chooseOther'), run: onOther }] : []} dismiss={assigned ? t('keepIt') : undefined} />
  )
}

/** The status as the prototype's badge; pressed, the choices open in place, nothing floating. */
function StatusLine({ view, models, cell, store, row, column, asking = 0 }: { view: View; models: Record<string, Model>; cell: MatrixCell | undefined; store?: MatrixStore; row: Row; column: MatrixColumn; asking?: number }) {
  const join = view.join!
  const { options, status } = useWords(view, models)
  const tones = models[join.model]?.fields[join.cell_field]?.tones ?? {}
  const [open, setOpen] = useState(asking > 0 && store !== undefined)
  // Asked again while shown: open in this same render, so the matrix finds a choice to focus.
  const [seen, setSeen] = useState(asking)
  if (asking !== seen) {
    setSeen(asking)
    if (store) setOpen(true)
  }
  const current = cell ? status(cell) : ''
  const choices = [{ value: '', label: t('none') }, ...Object.entries(options).map(([value, label]) => ({ value, label }))]
  return (
    <Line icon={CircleDot} label={t('statusLabel')}>
      <button type="button" className="nv-dw-status" aria-expanded={open} disabled={!store} style={{ '--tone': toneColor(tones[current]) } as CSSProperties}
        onClick={() => setOpen(!open)}>
        {cell ? <>{markFor(view, current)} {options[current] ?? current}</> : t('notAssigned')}
      </button>
      {open && <Choices list label={t('statusLabel')} options={choices} value={current} disabled={!store}
        onPick={(value) => {
          setOpen(false)
          void store?.set(row.id, column, value === '' ? null : value)
        }} />}
    </Line>
  )
}

/** The note as a line: its empty words until pressed, then its field, as the record drawer edits a long text. */
function NoteLine({ note, disabled, onSave }: { note: string; disabled: boolean; onSave: (note: string) => void }) {
  return (
    <Line icon={StickyNote} label={t('noteLabel')}>
      <Note text={note} label={t('noteLabel')} empty={<span className="nv-muted">{t('noNote')}</span>} className="nv-dw-note" area="nv-textarea"
        rows={2} disabled={disabled} onSave={onSave} />
    </Line>
  )
}

/** A matrix cell read as the record drawer reads a record: the alert, who, in what role and state, on what; the rest of their day; who could stand in; its history. */
export function CellDrawer({ view, models, row, column, columns, away, store, rows = [], fields, asking, onReturn, onClose }: PanelProps & { column: MatrixColumn; fields: Column[]; onClose: () => void }) {
  const join = view.join!
  const { word } = useWords(view, models)
  const [cell, ...others] = cellsFor(view, row, column)
  const at = columns.indexOf(column)
  const date = text(row.fields[view.date_field ?? ''])
  const absent = absentOn(away, view, column, date)
  const note = cell && join.note_field ? text(cell.fields[join.note_field]) : ''
  const noteOf = (c: MatrixCell) => (join.note_field ? text(c.fields[join.note_field]).trim() : '')
  const role = join.open && cell ? (cell.lookups?.[join.open.match_field]?.title ?? '') : ''
  const activity = models[view.model]
  const kind = activity ? kindOf(activity) : null
  const day = sameDay(view, rows, row, column)
  const start = fields.find((c) => c.kind === 'datetime')
  const instead = useRef<HTMLElement>(null)
  // Each line is named by the join's own field: no word of the app's.
  const labelOf = (field: string) => models[join.model]?.fields[field]?.label ?? field
  const shown: Row = { id: cell?.id ?? -(row.id * 1000000 + at), title: `${column.title} · ${row.title}`, status: cell?.status ?? '', fields: cell?.fields ?? {} }
  return (
    <Drawer row={shown} columns={[]} focusOnOpen={false} onClose={onClose} model={models[join.model]}
      sub={<CellSub row={row} fields={fields} date={date} />}
      alert={absent && <CellAlert name={column.title} date={date} reason={view.away ? text(absent.fields[view.away.label_field]) : ''} assigned={cell !== undefined}
        onOther={() => instead.current?.scrollIntoView({ block: 'nearest' })} />}
      lines={<>
        <Line icon={User} label={labelOf(join.column_field)}><span className="nv-avatar nv-avatar--sm" aria-hidden="true">{initials(column.title)}</span>{column.title}</Line>
        {join.open && <Line icon={Tag} label={labelOf(join.open.match_field)}>{role || t('empty')}</Line>}
        <StatusLine view={view} models={models} cell={cell} store={store} row={row} column={column} asking={asking} />
        <Line icon={CalendarDays} label={labelOf(join.row_field)}>
          {kind && <i className="nv-dw-dot" style={{ '--tone': toneColor(activity?.fields[kind]?.tones?.[text(row.fields[kind])]) } as CSSProperties} aria-hidden="true" />}{row.title}
        </Line>
        {join.note_field && <NoteLine note={note} disabled={!store || !cell} onSave={(next) => void store?.setNote(row.id, column, next)} />}
      </>}
      sections={<>
        {others.length > 0 && (
          <Section title={t('sharedCell')} count={String(others.length)}>
            <ul className="nv-panel__others">
              {others.map((other) => <li key={other.id}>{[word(other), noteOf(other)].filter(Boolean).join(' — ')}</li>)}
            </ul>
          </Section>
        )}
        <Section title={t('alsoOn', { day: date ? dayLabel(date, locale()).replace(/ \d{4}$/, '') : '' })} count={String(day.length)}>
          {day.length === 0 ? <p className="nv-dw-none">{t('nothingElse')}</p> : (
            <ul className="nv-dw-rows">
              {day.map(({ row: other, cell: c }) => (
                <li key={other.id}>
                  <span className="nv-mono">{(start ? text(start.value(other)) : '').slice(11, 16) || '—'}</span>
                  <span className="nv-dw-rows__main">{other.title}<small>{word(c)}</small></span>
                </li>
              ))}
            </ul>
          )}
        </Section>
        {cell && <Instead ref={instead} view={view} models={models} row={row} cell={cell} store={store} date={date} onReturn={onReturn} />}
      </>} />
  )
}

/** Who could take this place instead, from the person column's own candidates; Kiezen moves the place to them. */
function Instead({ ref, view, models, row, cell, store, date, onReturn }: { ref: Ref<HTMLElement>; view: View; models: Record<string, Model>; row: Row; cell: MatrixCell; store?: MatrixStore; date: string; onReturn?: () => void }) {
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
  // The place keeps its role, note and state: only who holds it changes, in one write and one undo step.
  const choose = (person: Row) => {
    void store?.move(row.id, cell.id, person.id)
    onReturn?.()
  }
  return (
    <Section ref={ref} title={t('whoInstead')} count={people ? String(people.length) : undefined}>
      {people?.length === 0 ? <p className="nv-dw-none">{t('candidatesNone')}</p> : (
        <ul className="nv-dw-list">
          {(people ?? []).map((person) => (
            <li key={person.id}>
              <span className="nv-avatar nv-avatar--hue" style={{ '--h': hueOf(person.id) } as CSSProperties} aria-hidden="true">{initials(person.title)}</span>
              <span className="nv-dw-list__main">{person.title}{date && <small>{t('freeOn', { day: shortDay(date) })}</small>}</span>
              {store && <button type="button" className="nv-button nv-button--secondary nv-button--sm" onClick={() => choose(person)}>{t('choose')}</button>}
            </li>
          ))}
        </ul>
      )}
    </Section>
  )
}

const STEP: Record<string, number> = { ArrowDown: 1, ArrowRight: 1, ArrowUp: -1, ArrowLeft: -1 }

/** The status as an inline radio group: arrows move, Space or Enter picks; nothing floats. */
function Choices({ label, options, value, disabled, onPick, list = false }: {
  label: string; options: { value: string; label: string }[]; value: string; disabled: boolean; onPick: (value: string) => void
  /** Under a badge: one quiet list named by its line, no label of its own. */
  list?: boolean
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

  const group = (
    <div role="radiogroup" aria-labelledby={list ? undefined : id} aria-label={list ? label : undefined} aria-disabled={disabled || undefined}
      className={list ? 'nv-choices nv-choices--list' : 'nv-choices'} onKeyDown={onKeyDown}>
      {options.map((option, i) => (
        <button key={option.value} ref={(el) => { buttons.current[i] = el }} type="button" role="radio" className="nv-choices__option"
          aria-checked={option.value === value} tabIndex={i === checked ? 0 : -1} disabled={disabled}
          onClick={() => onPick(option.value)}>
          {option.label}
        </button>
      ))}
    </div>
  )
  if (list) return group
  return (
    <div className="nv-panel__field">
      <span id={id} className="nv-panel__label">{label}</span>
      {group}
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
