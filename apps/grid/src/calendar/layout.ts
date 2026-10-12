import type { CalendarDef, DateWindow, Row } from '../types'
import { isMonth, isWeek, iso, parse, weekOf } from '../ui/Window'

export interface Lane {
  id: number | null
  title: string
}

/** A row on its day: minutes after that day's midnight, past 1440 for a night that runs on. */
export interface Placed {
  row: Row
  day: string
  lane: number | null
  allDay: boolean
  from: number
  to: number
}

const DAY_MS = 86_400_000

function daysOf(window: DateWindow): string[] {
  const from = parse(window.from)
  const to = parse(window.to)
  if (!from || !to) return []
  const out: string[] = []
  for (let d = from; d <= to; d = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1)) out.push(iso(d))
  return out
}

// Minutes of `at` (YYYY-MM-DDTHH:mm) after midnight of `day`.
function minutesAfter(day: string, at: string): number | null {
  const base = parse(day)
  const date = parse(at.slice(0, 10))
  const [h, m] = at.slice(11, 16).split(':').map(Number)
  if (!base || !date || !Number.isFinite(h) || !Number.isFinite(m)) return null
  return Math.round((date.getTime() - base.getTime()) / DAY_MS) * 1440 + h * 60 + m
}

const text = (value: unknown): string | null => (typeof value === 'string' && value !== '' ? value : null)

function placed(row: Row, cal: CalendarDef, lane: string | null): Placed | null {
  const day = text(row.fields[cal.day])?.slice(0, 10)
  if (!day) return null
  const laneId = lane ? row.fields[lane] : null
  const at = { row, day, lane: typeof laneId === 'number' ? laneId : null }
  const start = cal.start ? text(row.fields[cal.start]) : null
  const from = start ? minutesAfter(day, start) : null
  if (from === null) return { ...at, allDay: true, from: 0, to: 0 }
  const end = cal.end ? text(row.fields[cal.end]) : null
  const until = end ? minutesAfter(day, end) : null
  return { ...at, allDay: false, from, to: until !== null && until > from ? until : from }
}

function lanesOf(events: Placed[], lane: string | null): Lane[] {
  if (!lane) return [{ id: null, title: '' }]
  const titles = new Map<number, string>()
  for (const event of events) {
    if (event.lane !== null) titles.set(event.lane, event.row.lookups?.[lane]?.title ?? `#${event.lane}`)
  }
  const named = [...titles].map(([id, title]) => ({ id, title })).sort((a, b) => a.title.localeCompare(b.title))
  return events.some((event) => event.lane === null) ? [...named, { id: null, title: '' }] : named
}

/** The window's days, its rows placed on them and the lanes they fall in, by lane title with no lane last. */
export function placeEvents(rows: Row[], cal: CalendarDef, window: DateWindow, lane: string | null) {
  const days = daysOf(window)
  const inWindow = new Set(days)
  const events = rows.flatMap((row) => {
    const event = placed(row, cal, lane)
    return event && inWindow.has(event.day) ? [event] : []
  })
  return { days, events, lanes: lanesOf(events, lane) }
}

/** The Monday-first weeks a month's grid shows, whole. */
export function monthWeeks(month: DateWindow): string[][] {
  const first = parse(month.from)
  const last = parse(month.to)
  if (!first || !last) return []
  const start = new Date(first.getFullYear(), first.getMonth(), first.getDate() - ((first.getDay() + 6) % 7))
  const end = new Date(last.getFullYear(), last.getMonth(), last.getDate() + (6 - ((last.getDay() + 6) % 7)))
  const days = daysOf({ from: iso(start), to: iso(end) })
  return Array.from({ length: days.length / 7 }, (_, w) => days.slice(w * 7, w * 7 + 7))
}

/** A timed event in its day: `column` of `columns` side by side where events overlap. */
export interface Block {
  event: Placed
  column: number
  columns: number
}

const DAY_START = 8 * 60
const DAY_END = 20 * 60

// Overlapping events form a cluster; within it, one lane's events sit together, then greedily in the first free column.
function blocksOf(events: Placed[], laneOrder: (event: Placed) => number): Block[] {
  const byStart = [...events].sort((a, b) => a.from - b.from)
  const clusters: Placed[][] = []
  let end = -1
  for (const event of byStart) {
    const stop = Math.max(event.to, event.from + 1)
    const last = clusters[clusters.length - 1]
    if (last && event.from < end) {
      last.push(event)
      end = Math.max(end, stop)
    } else {
      clusters.push([event])
      end = stop
    }
  }
  return clusters.flatMap((cluster) => {
    const ordered = [...cluster].sort((a, b) => laneOrder(a) - laneOrder(b) || a.from - b.from)
    const ends: number[] = []
    const placed = ordered.map((event) => {
      const free = ends.findIndex((until) => until <= event.from)
      const column = free < 0 ? ends.length : free
      ends[column] = Math.max(event.to, event.from + 1)
      return { event, column }
    })
    return placed.map((block) => ({ ...block, columns: ends.length }))
  })
}

/** A week as a calendar: per day, the untimed rows in the all-day band and the timed ones as blocks on the hours. */
export function weekGrid(events: Placed[], days: string[], lanes: Lane[]) {
  const laneOrder = (event: Placed) => {
    const at = lanes.findIndex((lane) => lane.id === event.lane)
    return at < 0 ? lanes.length : at
  }
  const allDay: Record<string, Placed[]> = {}
  const timed: Record<string, Block[]> = {}
  for (const day of days) {
    const today = events.filter((event) => event.day === day)
    allDay[day] = today.filter((event) => event.allDay).sort((a, b) => laneOrder(a) - laneOrder(b))
    timed[day] = blocksOf(today.filter((event) => !event.allDay), laneOrder)
  }
  const hours = events.filter((event) => !event.allDay)
  const from = Math.min(DAY_START, ...hours.map((event) => Math.floor(event.from / 60) * 60))
  const to = Math.max(DAY_END, ...hours.map((event) => Math.ceil(Math.max(event.to, event.from + 1) / 60) * 60))
  return { allDay, timed, hours: { from, to } }
}

/** The days a calendar shows for a date condition: a whole week or month as it is, else the week the condition starts in. */
export function calendarWindow(condition: DateWindow | null, today: Date): DateWindow {
  if (!condition) return weekOf(today)
  if (isWeek(condition) || isMonth(condition)) return condition
  return weekOf(parse(condition.from) ?? today)
}
