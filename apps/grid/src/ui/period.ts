import { calendarWindow } from '../calendar/layout'
import { complete, type Filter, isDate, windowOf } from '../grid/conditions'
import { type Layout, withFilters } from '../grid/layout'
import { timelineWindow } from '../timeline/layout'
import type { DateWindow, View } from '../types'
import { days, formatWindow, isMonth, isWeek, iso, MATRIX_DAYS, monthOf, parse, shift, shiftMonth, weekOf } from './Window'

export type PeriodKind = 'week' | 'month' | 'other' | null

/** The view's period: the one condition on its date column, the days it shows, and whether the skin can show every date instead. */
export interface Period {
  field: string
  condition: Filter | null
  window: DateWindow | null
  kind: PeriodKind
  name: string | null
  /** Grid, board and gallery can show all dates; calendar, timeline and matrix always show a window. */
  optional: boolean
}

const REQUIRED = ['calendar', 'timeline', 'matrix']

/** The column a view's days are read on: its table's date, or the day a calendar or timeline is laid out by. */
export const dayField = (view: View): string | null =>
  view.date_field ?? ((view.type === 'calendar' || view.type === 'timeline') && view.calendar ? view.calendar.day : null)

/** The condition on the date column that the period controls. */
export function periodCondition(view: View, layout: Layout): Filter | null {
  const field = dayField(view)
  return (field ? layout.filters.find((f) => f.field === field && isDate(f.op) && complete(f)) : undefined) ?? null
}

/** The days a skin shows for a condition: a windowed skin always has some, another only where a condition sets them. */
function shownOf(type: string, condition: DateWindow | null, today: Date): DateWindow | null {
  if (type === 'calendar') return calendarWindow(condition, today)
  if (type === 'timeline') return timelineWindow(condition, today)
  if (type === 'matrix') return condition && days(condition) <= MATRIX_DAYS ? condition : weekOf(today)
  return condition
}

export function periodOf(view: View, layout: Layout, today: Date): Period | null {
  const field = dayField(view)
  if (!field) return null
  const type = view.type ?? 'grid'
  const condition = periodCondition(view, layout)
  const window = shownOf(type, windowOf(condition ?? undefined, today), today)
  const kind: PeriodKind = !window ? null : isMonth(window) ? 'month' : isWeek(window) ? 'week' : 'other'
  return { field, condition, window, kind, name: window ? formatWindow(window) : null, optional: !REQUIRED.includes(type) }
}

const same = (a: DateWindow, b: DateWindow) => a.from === b.from && a.to === b.to

/** A window as a condition: today's week or month stays relative, so a saved view follows the calendar; any other is fixed days. */
function conditionOf(field: string, window: DateWindow, today: Date): Filter {
  if (same(window, weekOf(today))) return { field, op: 'week', values: [] }
  if (same(window, monthOf(today))) return { field, op: 'month', values: [] }
  return { field, op: 'between', values: [window.from, window.to] }
}

const fromOf = (p: Period, today: Date) => (p.window ? (parse(p.window.from) ?? today) : today)

/** Vandaag: this week, or this month when a month is shown; always relative. */
export const todayPeriod = (p: Period): Filter => ({ field: p.field, op: p.kind === 'month' ? 'month' : 'week', values: [] })

/** Maand: lit, it clears where the skin allows all dates and stays otherwise; from a week, the month of its Thursday. */
export function pressMonth(p: Period, today: Date): Filter | null {
  if (p.kind === 'month') return p.optional ? null : p.condition
  if (!p.window) return { field: p.field, op: 'month', values: [] }
  const from = fromOf(p, today)
  const day = p.kind === 'week' ? new Date(from.getFullYear(), from.getMonth(), from.getDate() + 3) : from
  return conditionOf(p.field, monthOf(day), today)
}

/** Week: lit, it clears where the skin allows all dates; from a month, today's week when the month holds today, else its first week. */
export function pressWeek(p: Period, today: Date): Filter | null {
  if (p.kind === 'week') return p.optional ? null : p.condition
  if (!p.window) return { field: p.field, op: 'week', values: [] }
  const holds = p.window.from <= iso(today) && iso(today) <= p.window.to
  return conditionOf(p.field, weekOf(holds ? today : fromOf(p, today)), today)
}

/** ‹ and ›: fixed days, a month by months and anything else by its own length; null where no period is set. */
export function stepPeriod(p: Period, by: 1 | -1): Filter | null {
  if (!p.window) return null
  const next = p.kind === 'month' ? shiftMonth(p.window, by) : shift(p.window, by * days(p.window))
  return { field: p.field, op: 'between', values: [next.from, next.to] }
}

/** The layout with its period replaced, or removed. */
export const withPeriod = (layout: Layout, field: string, next: Filter | null): Layout =>
  withFilters(layout, [...(next ? [next] : []), ...layout.filters.filter((f) => !(f.field === field && isDate(f.op)))])
