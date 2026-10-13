import { type CSSProperties, type ReactNode, useEffect, useMemo } from 'react'
import { ChipRow } from '../ui/ChipRow'
import { toneColor } from '../ui/tone'
import type { Shown } from '../ui/Toolbar'
import { Display } from '../grid/cells'
import { type Column, columnsFor, linksOf } from '../grid/columns'
import { useOpenRow } from '../grid/useOpenRow'
import { locale, t } from '../i18n'
import type { Model, Row, SavedView, View } from '../types'

const NONE = '\u0000'
const MAX_FACES = 4

const MOMENT = /^(\d{4}-\d{2}-\d{2})(?:[T ](\d{2}:\d{2}))?/

/** "di 13 okt", the day a card is on. */
function dayOf(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number)
  return new Intl.DateTimeFormat(locale(), { weekday: 'short', day: 'numeric', month: 'short' }).format(new Date(y, m - 1, d)).replace(/\./g, '')
}

/** The day and the hours of a card, from its date and datetime columns: "di 13 okt", "20:00–21:15". */
function whenOf(row: Row, dates: Column[]): { day: string | null; from: string | null; to: string | null } {
  const moments = dates.map((c) => MOMENT.exec(String(c.value(row) ?? ''))).filter((m): m is RegExpExecArray => m !== null)
  const day = moments[0]?.[1] ?? null
  const times = moments.map((m) => m[2]).filter((time): time is string => Boolean(time))
  return { day: day && dayOf(day), from: times[0] ?? null, to: times[1] ?? null }
}

const initials = (name: string) => name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join('').toLocaleUpperCase()

const noToggle = () => undefined

function Card({ row, columns, selected, onOpen }: { row: Row; columns: Column[]; selected: boolean; onOpen: () => void }) {
  const kind = columns.find((c) => c.kind === 'select')
  const dates = columns.filter((c) => c.kind === 'date' || c.kind === 'datetime')
  const people = columns.find((c) => c.kind === 'links')
  const facts = columns.filter((c) => c !== kind && c !== people && !dates.includes(c) && c.text(row) !== '' && c.text(row) !== row.title)
  const when = whenOf(row, dates)
  const faces = people ? linksOf(row, people.field ?? people.id).filter((f) => f.title.trim() !== '') : []
  return (
    <button type="button" className={selected ? 'nv-board__card nv-board__card--open' : 'nv-board__card'} aria-current={selected || undefined} onClick={onOpen}>
      {kind && kind.text(row) && <span className="nv-board__kind"><Display column={kind} row={row} onToggle={noToggle} /></span>}
      <b className="nv-board__title">{row.title}</b>
      {(when.day || when.from) && (
        <span className="nv-board__when">
          {when.day && <span className="nv-board__day">{when.day}</span>}
          {when.from ? <span className="nv-time">{when.from}{when.to && <span className="nv-time__end">–{when.to}</span>}</span> : <span className="nv-board__untimed">{t('noTime')}</span>}
        </span>
      )}
      {facts.map((c) => <span key={c.id} className="nv-board__fact"><Display column={c} row={row} onToggle={noToggle} /></span>)}
      {faces.length > 0 && (
        <span className="nv-board__faces" aria-label={faces.map((f) => f.title).join(', ')}>
          {faces.slice(0, MAX_FACES).map((f) => <span key={f.id} className="nv-avatar nv-avatar--sm" aria-hidden="true">{initials(f.title)}</span>)}
          {faces.length > MAX_FACES && <span className="nv-board__more" aria-hidden="true">+{faces.length - MAX_FACES}</span>}
        </span>
      )}
    </button>
  )
}

interface Props {
  view: View
  model: Model
  models: Record<string, Model>
  rows: Row[]
  column: string
  /** The grid's chips for this view: the space and the filters. */
  scope?: string | null
  filters?: ReactNode
  /** What the title line says it shows: the cards and the columns. */
  onShown?: (shown: Shown) => void
}

/** Cards in a column per option of the board's column, in its order, "Geen" last when it holds a card; read-only, a card opens its row. */
export function Board({ view, model, models, rows, column, scope = null, filters, onShown }: Props) {
  const [openRow, drawer, open] = useOpenRow(model, view, models)
  const field = model.fields[column]
  const options = Object.entries(field?.options ?? {})
  // The card shows the view's columns in its order; a view without an arrangement shows its first three.
  const shown = useMemo(() => {
    const all = columnsFor(model, view, false, models).filter((c) => c.id !== 'title' && c.id !== column)
    const order = (view as Partial<SavedView>).arrangement?.order
    if (!order) return all.slice(0, 3)
    return order.flatMap((id) => all.filter((c) => c.id === id))
  }, [model, view, models, column])
  const keyOf = (row: Row) => {
    const value = row.fields[column]
    return typeof value === 'string' && field?.options && value in field.options ? value : NONE
  }
  const lanes = [...options.map(([key, label]) => ({ key, label })), { key: NONE, label: t('noLane') }]
    .filter((lane) => lane.key !== NONE || rows.some((row) => keyOf(row) === NONE))
  useEffect(() => onShown?.({ rows: rows.length, groups: null, cut: false, columns: lanes.length }), [rows.length, lanes.length])
  const none = t('noneOf', { label: model.label.toLocaleLowerCase(locale()) })
  return (
    <div className="nv-frame">
      <ChipRow scope={scope} filters={filters} group={field?.label} count={rows.length} />
      <div className="nv-body">
        <div className="nv-board">
          {lanes.map((lane) => {
            const cards = rows.filter((row) => keyOf(row) === lane.key)
            return (
              <ul key={lane.key} className="nv-board__column" aria-label={lane.label}>
                <li className="nv-board__head" aria-hidden="true">
                  <span className="nv-board__name" style={{ '--tone': toneColor(field?.tones?.[lane.key]) } as CSSProperties}>{lane.label}</span>
                  <span className="nv-board__count">{cards.length}</span>
                </li>
                {cards.map((row) => (
                  <li key={row.id}>
                    <Card row={row} columns={shown} selected={open?.id === row.id} onOpen={() => openRow(row)} />
                  </li>
                ))}
                {cards.length === 0 && <li className="nv-board__empty">{none}</li>}
              </ul>
            )
          })}
        </div>
        {drawer}
      </div>
    </div>
  )
}
