import type { CalendarDef, DateWindow, Row } from '../types'
import { iso, parse } from '../ui/Window'

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
