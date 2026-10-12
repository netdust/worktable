import { ChevronLeft, ChevronRight } from 'lucide-react'
import { type CSSProperties, type ReactNode, useMemo, useState } from 'react'
import { type Key, ToggleButton, ToggleButtonGroup } from 'react-aria-components'
import { Drawer } from '../grid/Drawer'
import { columnsFor } from '../grid/columns'
import { t } from '../i18n'
import type { CalendarDef, DateWindow, Model, Row, View } from '../types'
import { formatWindow, isMonth, iso, parse, shift, shiftMonth, weekOf } from '../ui/Window'
import { type Lane, monthWeeks, type Placed, placeEvents, weekGrid } from './layout'

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
/** One block hour on the week's time axis, in pixels. */
export const HOUR_PX = 48
const MIN_BLOCK = 20
// The lanes' colours, in order; the status tones are left to statuses.
const LANE_TONES = ['sky', 'violet', 'amber', 'teal', 'rose', 'green', 'slate', 'grey']
const monthOf = (date: Date): DateWindow => shiftMonth({ from: iso(date), to: iso(date) }, 0)
const hhmm = (minutes: number) =>
  `${String(Math.floor(minutes / 60) % 24).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`
const byStart = (a: Placed, b: Placed) => Number(b.allDay) - Number(a.allDay) || a.from - b.from

type ToneOf = (lane: number | null) => CSSProperties

function lanePalette(lanes: Lane[]): ToneOf {
  return (lane) => {
    const at = Math.max(0, lanes.findIndex((l) => l.id === lane))
    return { '--tone': `var(--tone-${LANE_TONES[at % LANE_TONES.length]})` } as CSSProperties
  }
}

function dayHead(day: string): string {
  const date = parse(day) ?? new Date()
  const weekday = new Intl.DateTimeFormat(document.documentElement.lang || 'nl', { weekday: 'short' }).format(date)
  return `${weekday} ${date.getDate()}`
}

function Event({ event, laneTitle, named = false, style, onOpen }: {
  event: Placed; laneTitle?: string; named?: boolean; style: CSSProperties; onOpen: (row: Row) => void
}) {
  const time = event.allDay ? '' : event.to > event.from ? `${hhmm(event.from)}–${hhmm(event.to)}` : hhmm(event.from)
  return (
    <button type="button" className={`nv-cal__event${event.allDay ? ' nv-cal__event--all' : ''}`} style={style}
      title={laneTitle} onClick={() => onOpen(event.row)}>
      {time && <span className="nv-cal__time">{time}</span>}
      <span className="nv-cal__title">{named && laneTitle ? `${laneTitle} · ${event.row.title}` : event.row.title}</span>
    </button>
  )
}

function Legend({ lanes, toneOf }: { lanes: Lane[]; toneOf: ToneOf }) {
  return (
    <ul className="nv-cal__legend" aria-label={t('lane')}>
      {lanes.map((lane) => (
        <li key={lane.id ?? NO_LANE} style={toneOf(lane.id)}>{lane.title || t('noLane')}</li>
      ))}
    </ul>
  )
}

function Week({ days, lanes, events, timed, toneOf, onOpen }: {
  days: string[]; lanes: Lane[]; events: Placed[]; timed: boolean; toneOf: ToneOf; onOpen: (row: Row) => void
}) {
  const grid = weekGrid(events, days, lanes)
  const titleOf = (id: number | null) => lanes.find((lane) => lane.id === id)?.title || undefined
  const height = ((grid.hours.to - grid.hours.from) / 60) * HOUR_PX
  const hours = Array.from({ length: (grid.hours.to - grid.hours.from) / 60 }, (_, i) => grid.hours.from + i * 60)
  const columns = { gridTemplateColumns: `56px repeat(${days.length}, minmax(0, 1fr))` }
  return (
    <div className="nv-week">
      <div className="nv-week__row nv-week__head" style={columns}>
        <span />
        {days.map((day) => <span key={day} className="nv-week__dayhead">{dayHead(day)}</span>)}
      </div>
      <div className="nv-week__row nv-week__band" style={columns}>
        <span className="nv-week__axis">{t('allDay')}</span>
        {days.map((day) => (
          <div key={day} role="group" aria-label={`${t('allDay')} ${dayHead(day)}`} className="nv-week__allday">
            {(grid.allDay[day] ?? []).map((e) => <Event key={e.row.id} event={e} laneTitle={titleOf(e.lane)} style={toneOf(e.lane)} onOpen={onOpen} />)}
          </div>
        ))}
      </div>
      {timed && (
        <div className="nv-week__row nv-week__hours" style={columns}>
          <div className="nv-week__axis" data-testid="hours" style={{ height }}>
            {hours.map((at) => <span key={at} style={{ top: ((at - grid.hours.from) / 60) * HOUR_PX }}>{hhmm(at)}</span>)}
          </div>
          {days.map((day) => (
            <section key={day} aria-label={dayHead(day)} className="nv-week__day" style={{ height, backgroundSize: `100% ${HOUR_PX}px` }}>
              {(grid.timed[day] ?? []).map(({ event, column, columns: across }) => (
                <Event key={event.row.id} event={event} laneTitle={titleOf(event.lane)} onOpen={onOpen} style={{
                  ...toneOf(event.lane),
                  position: 'absolute',
                  top: `${((event.from - grid.hours.from) / 60) * HOUR_PX}px`,
                  height: `${Math.max(((event.to - event.from) / 60) * HOUR_PX, MIN_BLOCK)}px`,
                  left: `${(column / across) * 100}%`,
                  width: `${100 / across}%`,
                }} />
              ))}
            </section>
          ))}
        </div>
      )}
    </div>
  )
}

function Month({ month, weeks, lanes, events, toneOf, onOpen }: {
  month: DateWindow; weeks: string[][]; lanes: Lane[]; events: Placed[]; toneOf: ToneOf; onOpen: (row: Row) => void
}) {
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
                  .map((e) => <Event key={e.row.id} event={e} laneTitle={titleOf(e.lane)} named style={toneOf(e.lane)} onOpen={onOpen} />)}
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
  const toneOf = useMemo(() => lanePalette(lanes), [lanes])
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
        {lane && <Legend lanes={lanes} toneOf={toneOf} />}
        {month
          ? <Month month={shown} weeks={weeks} lanes={lanes} events={events} toneOf={toneOf} onOpen={setOpen} />
          : <Week days={days} lanes={lanes} events={events} timed={cal.start !== null} toneOf={toneOf} onOpen={setOpen} />}
      </div>
      {open && <Drawer row={open} columns={columns} focusOnOpen={false} onClose={() => setOpen(null)} />}
    </div>
  )
}
