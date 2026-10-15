import { beforeEach, describe, expect, it } from 'vitest'
import type { Filter, Layout } from '../grid/layout'
import type { View, ViewType } from '../types'
import { periodOf, pressMonth, pressWeek, stepPeriod, todayPeriod, withPeriod } from './period'

const today = new Date(2026, 9, 14)
const view = (type: ViewType, date_field: string | null = 'plandag') => ({ key: 'v', label: 'V', model: 'm', table: 't', type, date_field: date_field ?? undefined }) as View
const layout = (...filters: Filter[]): Layout => ({ hidden: [], order: [], widths: {}, sort: [], filters, group: null })
const between = (from: string, to: string): Filter => ({ field: 'plandag', op: 'between', values: [from, to] })
const at = (type: ViewType, ...filters: Filter[]) => periodOf(view(type), layout(...filters), today)!

beforeEach(() => {
  document.documentElement.lang = 'nl-BE'
})

describe('periodOf', () => {
  it('is null on a view with no date field', () => {
    expect(periodOf(view('grid', null), layout(), today)).toBeNull()
  })

  it('shows no window on a grid without a condition, and a week on a calendar', () => {
    expect(at('grid')).toMatchObject({ window: null, kind: null, name: null, optional: true })
    expect(at('calendar')).toMatchObject({ window: { from: '2026-10-12', to: '2026-10-18' }, kind: 'week', optional: false })
  })

  it('names the window it shows', () => {
    expect(at('grid', { field: 'plandag', op: 'week', values: [] }).name).toBe('Week 42 · 12–18 okt')
    expect(at('grid', { field: 'plandag', op: 'month', values: [] }).name).toBe('oktober 2026')
    expect(at('grid', { field: 'plandag', op: 'today', values: [] })).toMatchObject({ kind: 'other', name: '14 okt' })
  })

  it('takes no condition on another date column as the period', () => {
    expect(at('grid', { field: 'deadline', op: 'week', values: [] }).condition).toBeNull()
  })
})

describe('Maand and Week', () => {
  it('clears a lit chip where the skin can show every date', () => {
    expect(pressMonth(at('grid', { field: 'plandag', op: 'month', values: [] }), today)).toBeNull()
    expect(pressWeek(at('board', between('2026-10-19', '2026-10-25')), today)).toBeNull()
  })

  it('keeps a lit chip lit on a calendar, a timeline and a matrix', () => {
    const month: Filter = { field: 'plandag', op: 'month', values: [] }
    expect(pressMonth(at('calendar', month), today)).toBe(month)
    expect(pressWeek(at('matrix'), today)).toBeNull()
    expect(periodOf(view('matrix'), withPeriod(layout(), 'plandag', pressWeek(at('matrix'), today)), today)?.kind).toBe('week')
  })

  it('sets this week or month, relative, when nothing is set', () => {
    expect(pressMonth(at('gallery'), today)).toEqual({ field: 'plandag', op: 'month', values: [] })
    expect(pressWeek(at('gallery'), today)).toEqual({ field: 'plandag', op: 'week', values: [] })
  })

  it('goes from a month to today’s week when the month holds today, else to its first week', () => {
    expect(pressWeek(at('grid', { field: 'plandag', op: 'month', values: [] }), today)).toEqual({ field: 'plandag', op: 'week', values: [] })
    expect(pressWeek(at('grid', between('2026-11-01', '2026-11-30')), today)).toEqual(between('2026-10-26', '2026-11-01'))
  })

  it('goes from a week to the month of its Thursday', () => {
    expect(pressMonth(at('grid', between('2026-10-26', '2026-11-01')), today)).toEqual({ field: 'plandag', op: 'month', values: [] })
    expect(pressMonth(at('grid', between('2026-11-30', '2026-12-06')), today)).toEqual(between('2026-12-01', '2026-12-31'))
  })
})

describe('Vandaag and the steps', () => {
  it('stores Vandaag relative, as a week or as a month', () => {
    expect(todayPeriod(at('grid'))).toEqual({ field: 'plandag', op: 'week', values: [] })
    expect(todayPeriod(at('timeline', between('2026-12-01', '2026-12-31')))).toEqual({ field: 'plandag', op: 'month', values: [] })
  })

  it('steps by fixed days: a week by seven, a month by a month', () => {
    expect(stepPeriod(at('grid', { field: 'plandag', op: 'week', values: [] }), 1)).toEqual(between('2026-10-19', '2026-10-25'))
    expect(stepPeriod(at('calendar', { field: 'plandag', op: 'month', values: [] }), -1)).toEqual(between('2026-09-01', '2026-09-30'))
  })

  it('does not step without a period', () => {
    expect(stepPeriod(at('grid'), 1)).toBeNull()
  })
})

describe('withPeriod', () => {
  it('replaces the date column’s condition and keeps the rest', () => {
    const other: Filter = { field: 'status', op: 'in', values: ['optie'] }
    const next = withPeriod(layout(between('2026-10-01', '2026-10-31'), other), 'plandag', { field: 'plandag', op: 'week', values: [] })
    expect(next.filters).toEqual([{ field: 'plandag', op: 'week', values: [] }, other])
    expect(withPeriod(next, 'plandag', null).filters).toEqual([other])
  })
})
