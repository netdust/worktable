import { describe, expect, it } from 'vitest'
import type { Row } from '../types'
import { overlapsOf, pairsOf, timesOf } from './overlap'

type Span = { id: number; lane: string; from: number; to: number; cancelled?: boolean }
const row = (s: Span) => ({ id: s.id, title: `r${s.id}`, status: '', fields: { ...s } }) as unknown as Row
const spans = (...list: Span[]) => {
  const rows = list.map(row)
  const at = (r: Row) => r.fields as unknown as Span
  return overlapsOf(rows, (r) => at(r).lane, (r) => at(r).from, (r) => at(r).to, (r) => !!at(r).cancelled)
}

describe('overlapsOf', () => {
  it('marks two bars of one lane that share a day, each naming the other', () => {
    const found = spans({ id: 1, lane: 'a', from: 0, to: 2 }, { id: 2, lane: 'a', from: 2, to: 4 })
    expect([...found.keys()].sort()).toEqual([1, 2])
    expect(found.get(1)?.map((r) => r.id)).toEqual([2])
    expect(pairsOf(found)).toBe(1)
  })

  it('leaves out bars that only touch', () => {
    expect(spans({ id: 1, lane: 'a', from: 0, to: 2 }, { id: 2, lane: 'a', from: 3, to: 4 }).size).toBe(0)
  })

  it('leaves out a cancelled bar', () => {
    expect(spans({ id: 1, lane: 'a', from: 0, to: 2 }, { id: 2, lane: 'a', from: 1, to: 4, cancelled: true }).size).toBe(0)
  })

  it('leaves out bars of different lanes', () => {
    expect(spans({ id: 1, lane: 'a', from: 0, to: 2 }, { id: 2, lane: 'b', from: 0, to: 2 }).size).toBe(0)
  })

  it('counts three bars that all overlap as three pairs', () => {
    const found = spans({ id: 1, lane: 'a', from: 0, to: 4 }, { id: 2, lane: 'a', from: 1, to: 4 }, { id: 3, lane: 'a', from: 2, to: 4 })
    expect(pairsOf(found)).toBe(3)
  })
})

describe('overlapsOf with times', () => {
  const at = (id: number, start: string, end: string | null) => ({ id, title: `r${id}`, status: '', fields: { start: `2026-10-14T${start}`, end: end && `2026-10-14T${end}` } }) as unknown as Row
  const timed = (...rows: Row[]) => overlapsOf(rows, () => 'a', () => 0, () => 0, () => false, timesOf('start', 'end'))

  it('leaves out bars whose times only touch, and marks two that start together, one without an end', () => {
    expect(timed(at(1, '10:00', '12:00'), at(2, '12:00', '13:00')).size).toBe(0)
    expect(pairsOf(timed(at(1, '10:00', null), at(2, '10:00', '11:00')))).toBe(1)
  })

  it('falls back to the day where a bar has no time', () => {
    const untimed = { id: 2, title: 'r2', status: '', fields: { start: null, end: null } } as unknown as Row
    expect(pairsOf(timed(at(1, '10:00', '12:00'), untimed))).toBe(1)
  })
})
