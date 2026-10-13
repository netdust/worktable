import { spanDays } from '../calendar/layout'
import type { CalendarDef, DateWindow, Row, StoredArrangement } from '../types'
import { days, isMonth, isWeek, parse, weekOf } from '../ui/Window'

/** The longest window a timeline draws as it is. */
export const TIMELINE_DAYS = 92

/** The days a timeline shows: a week, a month or up to 92 days as given; a longer range, its first week; none, this week. */
export function timelineWindow(condition: DateWindow | null, today: Date): DateWindow {
  if (!condition) return weekOf(today)
  if (isWeek(condition) || isMonth(condition) || days(condition) <= TIMELINE_DAYS) return condition
  return weekOf(parse(condition.from) ?? today)
}

/** What a new timeline opens on, as the prototype: this month on its dated column, in lanes by the first lane its table declares. */
export function timelineStart(arrangement: StoredArrangement, cal: CalendarDef | undefined): StoredArrangement {
  if (!cal) return arrangement
  const dated = arrangement.filters.some((f) => f.field === cal.day)
  return {
    ...arrangement,
    filters: dated ? arrangement.filters : [...arrangement.filters, { field: cal.day, op: 'month', values: [] }],
    group: arrangement.group ?? cal.lanes[0] ?? null,
  }
}

export interface Bar {
  row: Row
  /** The day index in the window it starts on, and how many days it covers there. */
  start: number
  length: number
}

export interface TimelineLane {
  id: number | null
  title: string
  bars: Bar[]
}

/** Each row as a bar over the days it covers, clipped to the window; in lanes by title, or all in one lane without a lane. */
export function bars(rows: Row[], cal: CalendarDef, window: DateWindow, lane: string | null): { days: number; lanes: TimelineLane[] } {
  const span = days(window)
  const index = (day: string) => Math.round(((parse(day)?.getTime() ?? 0) - (parse(window.from)?.getTime() ?? 0)) / 86_400_000)
  const placed = rows.flatMap((row): Bar[] => {
    const covered = (cal.spans ? spanDays(row, cal) : [String(row.fields[cal.day] ?? '').slice(0, 10)]).map(index)
    const first = Math.max(0, Math.min(...covered))
    const last = Math.min(span - 1, Math.max(...covered))
    return covered.length > 0 && last >= first ? [{ row, start: first, length: last - first + 1 }] : []
  })
  if (!lane) return { days: span, lanes: placed.length > 0 ? [{ id: null, title: '', bars: placed }] : [] }
  const byLane = new Map<number | null, TimelineLane>()
  for (const bar of placed) {
    const id = typeof bar.row.fields[lane] === 'number' ? (bar.row.fields[lane] as number) : null
    const title = (id !== null ? bar.row.lookups?.[lane]?.title : '') ?? `#${id}`
    const at = byLane.get(id) ?? { id, title, bars: [] }
    at.bars.push(bar)
    byLane.set(id, at)
  }
  const lanes = [...byLane.values()].sort((a, b) => (a.id === null ? 1 : b.id === null ? -1 : a.title.localeCompare(b.title)))
  return { days: span, lanes }
}
