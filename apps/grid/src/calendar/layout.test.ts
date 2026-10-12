import { describe, expect, it } from 'vitest'
import type { CalendarDef, Row } from '../types'
import { monthWeeks, placeEvents } from './layout'

const CAL: CalendarDef = { day: 'plandag', start: 'start_at', end: 'eind_at', lanes: ['persoon_id'] }
const WEEK = { from: '2026-10-12', to: '2026-10-18' }

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
