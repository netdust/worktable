import { describe, expect, it } from 'vitest'
import type { CalendarDef, Row } from '../types'
import { calendarWindow, monthWeeks, placeEvents, spanBars, weekGrid } from './layout'

const CAL: CalendarDef = { day: 'plandag', start: 'start_at', end: 'eind_at', lanes: ['persoon_id'] }
const WEEK = { from: '2026-10-12', to: '2026-10-18' }
const WEEK_DAYS = ['2026-10-12', '2026-10-13', '2026-10-14', '2026-10-15', '2026-10-16', '2026-10-17', '2026-10-18']

const row = (id: number, fields: Record<string, unknown>, lane?: { id: number; title: string }): Row => ({
  id,
  title: `r${id}`,
  status: '',
  fields,
  lookups: lane ? { persoon_id: { id: lane.id, title: lane.title, status: '', fields: {} } } : {},
})

describe('placeEvents', () => {
  it('an untimed row is all-day', () => {
    const [placed] = placeEvents([row(1, { plandag: '2026-10-15', start_at: null })], CAL, WEEK, null).events
    expect(placed).toMatchObject({ day: '2026-10-15', allDay: true })
  })

  it('a 22:00–01:00 row sits on its plandag with to = 1500', () => {
    const r = row(1, { plandag: '2026-10-12', start_at: '2026-10-12T22:00', eind_at: '2026-10-13T01:00' })
    expect(placeEvents([r], CAL, WEEK, null).events[0]).toMatchObject({ day: '2026-10-12', allDay: false, from: 1320, to: 1500 })
  })

  it('a 00:30 row on the previous plandag starts past 1440', () => {
    const r = row(1, { plandag: '2026-10-13', start_at: '2026-10-14T00:30', eind_at: '2026-10-14T02:00' })
    expect(placeEvents([r], CAL, WEEK, null).events[0]).toMatchObject({ day: '2026-10-13', from: 1470, to: 1560 })
  })

  it('an end before start, or none, is a point', () => {
    const back = row(1, { plandag: '2026-10-12', start_at: '2026-10-12T10:00', eind_at: '2026-10-12T09:00' })
    const none = row(2, { plandag: '2026-10-12', start_at: '2026-10-12T10:00', eind_at: null })
    const [a, b] = placeEvents([back, none], CAL, WEEK, null).events
    expect([a.from, a.to, b.from, b.to]).toEqual([600, 600, 600, 600])
  })

  it('leaves out a row outside the window', () => {
    expect(placeEvents([row(1, { plandag: '2026-10-25' })], CAL, WEEK, null).events).toEqual([])
  })

  it('rows group into their lane, by title, with no lane last', () => {
    const rows = [
      row(1, { plandag: '2026-10-12', persoon_id: 2 }, { id: 2, title: 'Noor' }),
      row(2, { plandag: '2026-10-12', persoon_id: null }),
      row(3, { plandag: '2026-10-13', persoon_id: 1 }, { id: 1, title: 'Bram' }),
    ]
    const { lanes, events } = placeEvents(rows, CAL, WEEK, 'persoon_id')
    expect(lanes).toEqual([{ id: 1, title: 'Bram' }, { id: 2, title: 'Noor' }, { id: null, title: '' }])
    expect(events.map((e) => [e.row.id, e.lane])).toEqual([[1, 2], [2, null], [3, 1]])
  })

  it('without a lane, every row sits in one lane', () => {
    const { lanes } = placeEvents([row(1, { plandag: '2026-10-12' })], CAL, WEEK, null)
    expect(lanes).toEqual([{ id: null, title: '' }])
  })

  it('lists every day of the window', () => {
    expect(placeEvents([], CAL, WEEK, null).days).toEqual([
      '2026-10-12', '2026-10-13', '2026-10-14', '2026-10-15', '2026-10-16', '2026-10-17', '2026-10-18',
    ])
  })
})

describe('monthWeeks', () => {
  it('a month from a Sunday the 1st spans six Monday-first weeks', () => {
    const weeks = monthWeeks({ from: '2026-11-01', to: '2026-11-30' })
    expect(weeks).toHaveLength(6)
    expect(weeks[0][0]).toBe('2026-10-26')
    expect(weeks[5][6]).toBe('2026-12-06')
  })

  it('October 2026 spans five weeks', () => {
    const weeks = monthWeeks({ from: '2026-10-01', to: '2026-10-31' })
    expect(weeks.map((w) => w[0])).toEqual(['2026-09-28', '2026-10-05', '2026-10-12', '2026-10-19', '2026-10-26'])
  })
})

describe('weekGrid', () => {
  const placedOf = (rows: Row[]) => placeEvents(rows, CAL, WEEK, 'persoon_id').events

  it('puts untimed rows in the all-day band and timed ones on the hours, by day', () => {
    const grid = weekGrid(placedOf([
      row(1, { plandag: '2026-10-12', start_at: '2026-10-12T14:00', eind_at: '2026-10-12T17:00' }),
      row(2, { plandag: '2026-10-15', start_at: null }),
    ]), WEEK_DAYS, [])
    expect(grid.allDay['2026-10-15']?.map((e) => e.row.id)).toEqual([2])
    expect(grid.timed['2026-10-12']?.map((b) => b.event.row.id)).toEqual([1])
  })

  it('spans 08:00 to 20:00 at least, and widens to whole hours around the events', () => {
    expect(weekGrid([], WEEK_DAYS, []).hours).toEqual({ from: 480, to: 1200 })
    const late = placedOf([row(1, { plandag: '2026-10-12', start_at: '2026-10-12T22:30', eind_at: '2026-10-13T01:15' })])
    expect(weekGrid(late, WEEK_DAYS, []).hours).toEqual({ from: 480, to: 1560 })
    const early = placedOf([row(1, { plandag: '2026-10-12', start_at: '2026-10-12T06:45', eind_at: '2026-10-12T07:00' })])
    expect(weekGrid(early, WEEK_DAYS, []).hours.from).toBe(360)
  })

  it('sets overlapping events side by side in start order, the lane deciding a tie', () => {
    const lanes = [{ id: 1, title: 'Bram' }, { id: 2, title: 'Noor' }]
    const rows = [
      row(1, { plandag: '2026-10-12', start_at: '2026-10-12T10:00', eind_at: '2026-10-12T12:00', persoon_id: 2 }, { id: 2, title: 'Noor' }),
      row(2, { plandag: '2026-10-12', start_at: '2026-10-12T11:00', eind_at: '2026-10-12T13:00', persoon_id: 1 }, { id: 1, title: 'Bram' }),
      row(3, { plandag: '2026-10-12', start_at: '2026-10-12T15:00', eind_at: '2026-10-12T16:00', persoon_id: 2 }, { id: 2, title: 'Noor' }),
      row(4, { plandag: '2026-10-12', start_at: '2026-10-12T15:00', eind_at: '2026-10-12T16:00', persoon_id: 1 }, { id: 1, title: 'Bram' }),
    ]
    const blocks = weekGrid(placedOf(rows), WEEK_DAYS, lanes).timed['2026-10-12'] ?? []
    expect(blocks.map((b) => [b.event.row.id, b.column, b.columns])).toEqual([[1, 0, 2], [2, 1, 2], [4, 0, 2], [3, 1, 2]])
  })

  it('packs a busy Monday into as few columns as overlap, and widens an event into free columns beside it', () => {
    const day = (id: number, from: string, to: string, lane: number) =>
      row(id, { plandag: '2026-10-12', start_at: `2026-10-12T${from}`, eind_at: `2026-10-12T${to}`, persoon_id: lane }, { id: lane, title: String(lane) })
    const lanes = [{ id: 1, title: '1' }, { id: 2, title: '2' }, { id: 3, title: '3' }]
    // Lane-first would put the late lanes' events in columns of their own: five slivers on Monday 12 Oct.
    const rows = [day(1, '08:00', '12:00', 3), day(2, '09:00', '13:00', 2), day(3, '10:00', '17:00', 1), day(4, '10:00', '11:00', 3), day(5, '13:00', '15:00', 1), day(6, '14:00', '18:00', 2), day(7, '11:30', '12:30', 1)]
    const blocks = weekGrid(placedOf(rows), WEEK_DAYS, lanes).timed['2026-10-12'] ?? []
    expect(Math.max(...blocks.map((b) => b.columns))).toBe(4)
    const of = (id: number) => blocks.find((b) => b.event.row.id === id)!
    // 11:30–12:30 takes the column 10:00–11:00 left free.
    expect(of(7).column).toBe(3)
    // An event with free columns to its right widens into them: 11:00–12:00 after two that ended at 11:00.
    const wide = weekGrid(placedOf([day(1, '10:00', '12:00', 1), day(2, '10:00', '11:00', 2), day(3, '10:00', '11:00', 3), day(4, '11:00', '12:00', 2)]), WEEK_DAYS, lanes).timed['2026-10-12'] ?? []
    expect(wide.map((b) => [b.event.row.id, b.column, b.span, b.columns])).toEqual([[1, 0, 1, 3], [2, 1, 1, 3], [3, 2, 1, 3], [4, 1, 2, 3]])
  })
})

describe('calendarWindow', () => {
  const today = new Date(2026, 9, 14)

  it('shows this week without a condition, and keeps a whole week or month', () => {
    expect(calendarWindow(null, today)).toEqual({ from: '2026-10-12', to: '2026-10-18' })
    expect(calendarWindow({ from: '2026-11-02', to: '2026-11-08' }, today)).toEqual({ from: '2026-11-02', to: '2026-11-08' })
    expect(calendarWindow({ from: '2026-11-01', to: '2026-11-30' }, today)).toEqual({ from: '2026-11-01', to: '2026-11-30' })
  })

  it('turns any other condition into the week it starts in: a day, a year, a range', () => {
    expect(calendarWindow({ from: '2026-10-15', to: '2026-10-15' }, today)).toEqual({ from: '2026-10-12', to: '2026-10-18' })
    expect(calendarWindow({ from: '2026-01-01', to: '2026-12-31' }, today)).toEqual({ from: '2025-12-29', to: '2026-01-04' })
    expect(calendarWindow({ from: '2026-10-14', to: '2026-12-02' }, today)).toEqual({ from: '2026-10-12', to: '2026-10-18' })
  })
})

describe('spans on the calendar', () => {
  it('puts a spanning row in the all-day band of every day it covers in the window', () => {
    const cal: CalendarDef = { day: 'start_at', start: 'start_at', end: 'eind_at', lanes: ['persoon_id'], spans: true }
    const rows = [{ id: 1, title: 'afwezig', status: '', fields: { start_at: '2026-10-10T00:00', eind_at: '2026-10-13T23:59' } }]
    const { events } = placeEvents(rows, cal, WEEK, null)
    expect(events.map((e) => [e.day, e.allDay])).toEqual([['2026-10-12', true], ['2026-10-13', true]])
  })
})

describe('spanBars', () => {
  const SPANS: CalendarDef = { day: 'start_datum', start: null, end: 'eind_datum', lanes: ['persoon_id'], spans: true }
  const stop = (id: number, from: string, to: string) => row(id, { start_datum: from, eind_datum: to })
  const bars = (rows: Row[]) =>
    spanBars(placeEvents(rows, SPANS, WEEK, null).events, WEEK_DAYS, SPANS, () => 0).map(({ row: r, ...bar }) => ({ id: r.id, ...bar }))

  it('draws a row over its days as one bar', () => {
    expect(bars([stop(1, '2026-10-12', '2026-10-15')])).toEqual([{ id: 1, lane: null, start: 0, length: 4, line: 0, before: false, after: false }])
  })

  it('clips a row that begins before the days or ends after them, and says so', () => {
    expect(bars([stop(1, '2026-10-09', '2026-10-13'), stop(2, '2026-10-17', '2026-10-21')])).toEqual([
      { id: 1, lane: null, start: 0, length: 2, line: 0, before: true, after: false },
      { id: 2, lane: null, start: 5, length: 2, line: 0, before: false, after: true },
    ])
  })

  it('stacks overlapping bars and reuses a line once it is free', () => {
    const lines = bars([stop(1, '2026-10-12', '2026-10-14'), stop(2, '2026-10-13', '2026-10-16'), stop(3, '2026-10-16', '2026-10-18')])
    expect(lines.map((b) => [b.id, b.line])).toEqual([[1, 0], [2, 1], [3, 0]])
  })
})
