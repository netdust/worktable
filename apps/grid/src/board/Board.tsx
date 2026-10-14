import { type CSSProperties, useEffect, useMemo } from 'react'
import { toneColor } from '../ui/tone'
import { initials, whenOf } from '../ui/when'
import type { Shown } from '../ui/Toolbar'
import { Display } from '../grid/cells'
import { type Column, columnsFor, linksOf } from '../grid/columns'
import { useOpenRow } from '../grid/useOpenRow'
import { locale, t } from '../i18n'
import type { Layout } from '../grid/layout'
import { factsOf } from '../ui/facts'
import type { Model, Row, View } from '../types'

const NONE = '\u0000'
const MAX_FACES = 4

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
  /** Which facts a card shows, and in what order (Kolommen). */
  layout: Layout
  /** What the title line says it shows: the cards and the columns. */
  onShown?: (shown: Shown) => void
}

/** Cards in a column per option of the board's column, in its order, "Geen" last when it holds a card; read-only, a card opens its row. */
export function Board({ view, model, models, rows, column, layout, onShown }: Props) {
  const [openRow, drawer, open] = useOpenRow(model, view, models)
  const field = model.fields[column]
  const options = Object.entries(field?.options ?? {})
  const all = useMemo(() => columnsFor(model, view, false, models), [model, view, models])
  // The card shows the facts Kolommen leaves, in its order; the column the board sorts by needs no line.
  const shown = useMemo(() => factsOf(all, layout).filter((c) => c.id !== column), [all, layout, column])
  const keyOf = (row: Row) => {
    const value = row.fields[column]
    return typeof value === 'string' && field?.options && value in field.options ? value : NONE
  }
  const lanes = [...options.map(([key, label]) => ({ key, label })), { key: NONE, label: t('noLane') }]
    .filter((lane) => lane.key !== NONE || rows.some((row) => keyOf(row) === NONE))
  useEffect(() => onShown?.({ rows: rows.length, groups: null, cut: false, columns: lanes.length, menu: all }), [rows.length, lanes.length, all])
  const none = t('noneOf', { label: model.label.toLocaleLowerCase(locale()) })
  return (
    <div className="nv-frame">
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
