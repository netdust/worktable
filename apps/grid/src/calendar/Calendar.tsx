import { ChevronLeft, ChevronRight } from 'lucide-react'
import { type ReactNode, useMemo, useState } from 'react'
import { type Key, ToggleButton, ToggleButtonGroup } from 'react-aria-components'
import { Drawer } from '../grid/Drawer'
import { columnsFor } from '../grid/columns'
import { t } from '../i18n'
import type { CalendarDef, DateWindow, Model, Row, View } from '../types'
import { formatWindow, isMonth, iso, parse, shift, shiftMonth, weekOf } from '../ui/Window'
import { type Lane, monthWeeks, type Placed, placeEvents } from './layout'

interface Props {
  view: View
  model: Model
  models: Record<string, Model>
  rows: Row[]
  cal: CalendarDef
  /** The days shown: a week, or a whole month. */
  shown: DateWindow
  /** The lane relation, or none. */
  lane: string | null
  onShown: (next: DateWindow) => void
  onLane: (lane: string | null) => void
  filters?: ReactNode
}

const NO_LANE = '-'
const monthOf = (date: Date): DateWindow => shiftMonth({ from: iso(date), to: iso(date) }, 0)
const hhmm = (minutes: number) =>
  `${String(Math.floor(minutes / 60) % 24).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`
const byStart = (a: Placed, b: Placed) => Number(b.allDay) - Number(a.allDay) || a.from - b.from

function dayHead(day: string): string {
  const date = parse(day) ?? new Date()
  const weekday = new Intl.DateTimeFormat(document.documentElement.lang || 'nl', { weekday: 'short' }).format(date)
  return `${weekday} ${date.getDate()}`
}

function Event({ event, laneTitle, onOpen }: { event: Placed; laneTitle?: string; onOpen: (row: Row) => void }) {
  const time = event.allDay ? t('allDay') : event.to > event.from ? `${hhmm(event.from)}–${hhmm(event.to)}` : hhmm(event.from)
  return (
    <button type="button" className={`nv-cal__event${event.allDay ? ' nv-cal__event--all' : ''}`} onClick={() => onOpen(event.row)}>
      <span className="nv-cal__time">{time}</span>
      <span className="nv-cal__title">{laneTitle ? `${laneTitle} · ${event.row.title}` : event.row.title}</span>
    </button>
  )
}

function Week({ days, lanes, events, onOpen }: { days: string[]; lanes: Lane[]; events: Placed[]; onOpen: (row: Row) => void }) {
  return (
    <table className="nv-cal nv-cal--week">
      <thead>
        <tr>
          <th scope="col" className="nv-cal__lane" />
          {days.map((day) => <th key={day} scope="col">{dayHead(day)}</th>)}
        </tr>
      </thead>
      <tbody>
        {lanes.map((lane) => (
          <tr key={lane.id ?? NO_LANE} aria-label={lane.title || undefined}>
            <th scope="row" className="nv-cal__lane">{lane.title}</th>
            {days.map((day) => (
              <td key={day}>
                {events.filter((e) => e.day === day && e.lane === lane.id).sort(byStart)
                  .map((e) => <Event key={e.row.id} event={e} onOpen={onOpen} />)}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  )
}

function Month({ month, weeks, lanes, events, onOpen }: { month: DateWindow; weeks: string[][]; lanes: Lane[]; events: Placed[]; onOpen: (row: Row) => void }) {
  const titleOf = (id: number | null) => lanes.find((lane) => lane.id === id)?.title || undefined
  return (
    <table className="nv-cal nv-cal--month">
      <thead>
        <tr>{weeks[0]?.map((day) => <th key={day} scope="col">{dayHead(day).split(' ')[0]}</th>)}</tr>
      </thead>
      <tbody>
        {weeks.map((week) => (
          <tr key={week[0]}>
            {week.map((day) => (
              <td key={day} className={day < month.from || day > month.to ? 'nv-cal__out' : undefined}>
                <span className="nv-cal__date">{parse(day)?.getDate()}</span>
                {events.filter((e) => e.day === day).sort(byStart)
                  .map((e) => <Event key={e.row.id} event={e} laneTitle={titleOf(e.lane)} onOpen={onOpen} />)}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  )
}

/** Rows on their days, a week or a month, in lanes; read-only: an event opens its row. */
export function Calendar({ view, model, models, rows, cal, shown, lane, onShown, onLane, filters }: Props) {
  const [open, setOpen] = useState<Row | null>(null)
  const month = isMonth(shown)
  const weeks = useMemo(() => (month ? monthWeeks(shown) : []), [month, shown.from, shown.to])
  const window = month && weeks.length > 0 ? { from: weeks[0][0], to: weeks[weeks.length - 1][6] } : shown
  const { days, events, lanes } = useMemo(() => placeEvents(rows, cal, window, lane), [rows, cal, window.from, window.to, lane])
  const columns = useMemo(
    () => columnsFor(model, { ...view, columns: undefined, lookups: undefined, rollups: undefined }, false, models),
    [model, view, models],
  )
  const step = (by: number) => onShown(month ? shiftMonth(shown, by) : shift(shown, 7 * by))
  // A week's Thursday names its month; a month's first day names its first week.
  const from = parse(shown.from) ?? new Date()
  const choose = (mode: Key) =>
    onShown(mode === 'month' ? monthOf(new Date(from.getFullYear(), from.getMonth(), from.getDate() + 3)) : weekOf(from))
  const laneOptions = [...cal.lanes.map((key) => ({ key, label: model.fields[key]?.label ?? key })), { key: NO_LANE, label: t('noLane') }]
  return (
    <div className="nv-frame">
      <div className="nv-bar nv-cal__bar">
        <b>{formatWindow(shown)}</b>
        <ToggleButtonGroup className="nv-theme" aria-label={t('period')} selectionMode="single" disallowEmptySelection
          selectedKeys={[month ? 'month' : 'week']} onSelectionChange={(keys) => choose([...keys][0] ?? 'week')}>
          <ToggleButton id="month" className="nv-theme__option">{t('month')}</ToggleButton>
          <ToggleButton id="week" className="nv-theme__option">{t('week')}</ToggleButton>
        </ToggleButtonGroup>
        <button type="button" className="nv-bar__button" aria-label={t('previousPeriod')} onClick={() => step(-1)}><ChevronLeft size={14} aria-hidden="true" /></button>
        <button type="button" className="nv-bar__button" onClick={() => onShown(month ? monthOf(new Date()) : weekOf(new Date()))}>{t('today')}</button>
        <button type="button" className="nv-bar__button" aria-label={t('nextPeriod')} onClick={() => step(1)}><ChevronRight size={14} aria-hidden="true" /></button>
        <ToggleButtonGroup className="nv-theme" aria-label={t('lane')} selectionMode="single" disallowEmptySelection
          selectedKeys={[lane ?? NO_LANE]} onSelectionChange={(keys) => {
            const key = String([...keys][0] ?? NO_LANE)
            onLane(key === NO_LANE ? null : key)
          }}>
          {laneOptions.map((option) => <ToggleButton key={option.key} id={option.key} className="nv-theme__option">{option.label}</ToggleButton>)}
        </ToggleButtonGroup>
        {filters}
      </div>
      <div className="nv-cal__body">
        {month
          ? <Month month={shown} weeks={weeks} lanes={lanes} events={events} onOpen={setOpen} />
          : <Week days={days} lanes={lanes} events={events} onOpen={setOpen} />}
      </div>
      {open && <Drawer row={open} columns={columns} focusOnOpen={false} onClose={() => setOpen(null)} />}
    </div>
  )
}
