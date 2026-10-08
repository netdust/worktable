import { CalendarDate, CalendarDateTime, Time } from '@internationalized/date'
import { describe, expect, it } from 'vitest'
import { fromDate, fromMoment, fromTime, toDate, toMoment, toTime } from './dates'

describe('stored values as React Aria dates', () => {
  it('reads a stored date and writes it back', () => {
    expect(toDate('2026-10-13')).toEqual(new CalendarDate(2026, 10, 13))
    expect(fromDate(new CalendarDate(2026, 10, 13))).toBe('2026-10-13')
  })

  it('round-trips a moment to the minute', () => {
    expect(toMoment('2026-10-13T20:30')).toEqual(new CalendarDateTime(2026, 10, 13, 20, 30))
    expect(fromMoment(toMoment('2026-10-13T20:30'))).toBe('2026-10-13T20:30')
  })

  it('round-trips a time to HH:MM', () => {
    expect(toTime('09:05')).toEqual(new Time(9, 5))
    expect(fromTime(toTime('09:05'))).toBe('09:05')
  })

  it('reads empty and malformed values as null, and null as empty', () => {
    expect(toDate('')).toBeNull()
    expect(toDate('13/10/2026')).toBeNull()
    expect(toDate('2026-02-31')).toBeNull()
    expect(toMoment('2026-10-13')).toBeNull()
    expect(toTime('9u')).toBeNull()
    expect(fromDate(null)).toBe('')
    expect(fromMoment(null)).toBe('')
    expect(fromTime(null)).toBe('')
  })
})
