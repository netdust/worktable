import { afterEach, expect, test } from 'bun:test'
import { daysAgo } from '../src/time'

const zone = process.env.TZ

afterEach(() => {
  process.env.TZ = zone
})

test('yesterday is the calendar day before, even on the day the clocks go back', () => {
  process.env.TZ = 'Europe/Brussels'
  const lateOnTheLongDay = new Date('2026-10-25T23:30:00+01:00')
  expect(daysAgo(1, lateOnTheLongDay)).toBe('2026-10-24T23:30:00')
  expect(daysAgo(2, lateOnTheLongDay)).toBe('2026-10-23T23:30:00')
})
