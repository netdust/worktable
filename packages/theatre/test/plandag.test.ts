import { expect, test } from 'bun:test'
import { plandag } from '../src/plandag'

test.each([
  ['2026-10-12T20:30', '2026-10-12'],
  ['2026-10-13T01:00', '2026-10-12'],
  ['2026-10-13T05:00', '2026-10-13'],
  ['2026-10-13T04:59', '2026-10-12'],
  ['2027-01-01T02:00', '2026-12-31'],
  ['2026-03-29T03:00', '2026-03-28'],
])('plandag(%s, 5) is %s', (startAt, expected) => {
  expect(plandag(startAt, 5)).toBe(expected)
})
