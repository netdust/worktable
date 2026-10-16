import { describe, expect, test } from 'vitest'
import type { Row } from '../types'
import { byRank, rankBetween } from './rank'

// Folio's packages/shared/src/board-rank.test.ts at 15bd9886, on Vitest.
describe('rankBetween', () => {
  test('between null/null (empty list) returns a non-empty key', () => {
    const k = rankBetween(null, null)
    expect(typeof k).toBe('string')
    expect(k.length).toBeGreaterThan(0)
  })
  test('before-first: rankBetween(null, x) < x lexically', () => {
    const x = rankBetween(null, null)
    const before = rankBetween(null, x)
    expect(before < x).toBe(true)
  })
  test('after-last: rankBetween(x, null) > x lexically', () => {
    const x = rankBetween(null, null)
    const after = rankBetween(x, null)
    expect(after > x).toBe(true)
  })
  test('between two keys yields a key strictly between them', () => {
    const a = rankBetween(null, null)
    const c = rankBetween(a, null)
    const b = rankBetween(a, c)
    expect(a < b && b < c).toBe(true)
  })
  test('repeated midpoint insertions just above lo stay strictly ordered', () => {
    const lo = rankBetween(null, null)
    let hi = rankBetween(lo, null)
    for (let i = 0; i < 30; i++) {
      const mid = rankBetween(lo, hi)
      expect(lo < mid && mid < hi).toBe(true)
      hi = mid
    }
  })
  test('repeated midpoint insertions just below hi stay strictly ordered', () => {
    let lo = rankBetween(null, null)
    const hi = rankBetween(lo, null)
    for (let i = 0; i < 30; i++) {
      const mid = rankBetween(lo, hi)
      expect(lo < mid && mid < hi).toBe(true)
      lo = mid
    }
  })
  test('adjacent keys (single-digit gap) still yield a strictly-between key', () => {
    const a = rankBetween(null, null)
    let lo = rankBetween(null, a)
    for (let i = 0; i < 50; i++) {
      const mid = rankBetween(lo, a)
      expect(lo < mid && mid < a).toBe(true)
      lo = mid
    }
  })
  test('500 inserts each just-before-hi stay strictly ordered & unique', () => {
    const lo = rankBetween(null, null)
    let hi = rankBetween(lo, null)
    const keys: string[] = [lo, hi]
    for (let i = 0; i < 500; i++) {
      const mid = rankBetween(lo, hi)
      expect(lo < mid && mid < hi).toBe(true)
      keys.push(mid)
      hi = mid
    }
    expect(new Set(keys).size).toBe(keys.length)
  })
  test('500 inserts each just-after-lo stay strictly ordered & unique', () => {
    let lo = rankBetween(null, null)
    const hi = rankBetween(lo, null)
    const keys: string[] = [lo, hi]
    for (let i = 0; i < 500; i++) {
      const mid = rankBetween(lo, hi)
      expect(lo < mid && mid < hi).toBe(true)
      keys.push(mid)
      lo = mid
    }
    expect(new Set(keys).size).toBe(keys.length)
  })
  test('reordering a full small list keeps all keys strictly increasing', () => {
    const keys: string[] = []
    let prev: string | null = null
    for (let i = 0; i < 5; i++) {
      const k = rankBetween(prev, null)
      keys.push(k)
      prev = k
    }
    for (let i = 0; i < keys.length - 1; i++) {
      const mid = rankBetween(keys[i], keys[i + 1])
      expect(keys[i] < mid && mid < keys[i + 1]).toBe(true)
    }
  })
})

describe('rankBetween, as the engine takes it', () => {
  test('throws when lo is not below hi', () => {
    expect(() => rankBetween('V', 'V')).toThrow()
    expect(() => rankBetween('X', 'M')).toThrow()
  })

  test("never ends in '0' and stays within the engine's alphabet, inserting at one spot on either side", () => {
    let lo = rankBetween(null, null)
    let hi = rankBetween(lo, null)
    const keys: string[] = []
    for (let i = 0; i < 200; i++) {
      hi = rankBetween(lo, hi)
      lo = rankBetween(null, lo)
      keys.push(hi, lo)
    }
    expect(keys.every((key) => /^[0-9A-Za-z]+$/.test(key) && !key.endsWith('0'))).toBe(true)
  })
})

describe('byRank', () => {
  const card = (id: number, position: string | null = null): Row => ({ id, title: `${id}`, status: '', fields: { position } })

  test('puts ranked rows first in rank order, and keeps the given order among the unranked', () => {
    const rows = [card(5), card(3, 'k'), card(9), card(1, 'B'), card(2)]

    expect(rows.toSorted(byRank).map((row) => row.id)).toEqual([1, 3, 5, 9, 2])
  })
})
