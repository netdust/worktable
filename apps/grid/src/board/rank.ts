// Copied from Folio, packages/shared/src/board-rank.ts at 15bd9886 (a port of fractional indexing's
// generateKeyBetween); `rankOf` and `byRank` are ours.
import type { Row } from '../types'

// Ordered digit alphabet. Index === digit value. MUST stay ASCII-monotonic.
const DIGITS = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz'
const BASE = DIGITS.length // 62
const FIRST = DIGITS[0] // '0'  — smallest digit

function digitValue(c: string): number {
  const v = DIGITS.indexOf(c)
  if (v === -1) throw new Error(`board-rank: invalid digit '${c}'`)
  return v
}

/**
 * Return a digit string strictly between fractional digit-strings `a` and `b`
 * (each interpreted as `0.<digits>` base-BASE, with `b === null` meaning `1.0`
 * and `a === ''` / empty meaning `0.0`). The result is the shortest such
 * string. Mirrors the reference `midpoint` routine.
 */
function midpoint(a: string, b: string | null): string {
  if (b !== null && a >= b) {
    throw new Error(`board-rank: midpoint expects a < b, got ${a} / ${b}`)
  }

  // Walk the shared prefix of equal digits; recurse on the remainder.
  if (b !== null) {
    let n = 0
    while ((a[n] ?? FIRST) === b[n]) n++
    if (n > 0) {
      return b.slice(0, n) + midpoint(a.slice(n), b.slice(n))
    }
  }

  // No shared prefix (or b is null). Look at the first digit of each bound.
  const digitA = a === '' ? 0 : digitValue(a[0])
  const digitB = b !== null ? digitValue(b[0]) : BASE

  if (digitB - digitA > 1) {
    // There's room for a digit strictly between them: pick the rounded middle.
    const midDigit = Math.round((digitA + digitB) / 2)
    return DIGITS[midDigit]
  }

  // digitA and digitB are adjacent (or equal-first-digit cases). Keep the
  // first digit of `b` (if any) and descend into the remainder of `a`,
  // treating the upper bound as open (1.0) for that deeper level.
  if (b !== null && b.length > 1) {
    return b.slice(0, 1)
  }
  // Append: a's first digit, then recurse to find a digit above a's tail.
  return DIGITS[digitA] + midpoint(a.slice(1), null)
}

/**
 * rankBetween(lo, hi) — return a key that sorts strictly between `lo` and `hi`
 * under lexical (string `<`) comparison. `null` means an open end:
 *   - rankBetween(null, null) → a key for an empty list
 *   - rankBetween(null, x)    → a key that sorts before `x`
 *   - rankBetween(x, null)    → a key that sorts after `x`
 */
export function rankBetween(lo: string | null, hi: string | null): string {
  if (lo !== null && hi !== null && lo >= hi) {
    throw new Error(`board-rank: lo must be < hi, got '${lo}' / '${hi}'`)
  }

  if (lo === null && hi === null) {
    // Empty list: middle of the space.
    return midpoint('', null)
  }

  if (lo === null) {
    // Before the first key `hi`: midpoint of (0.0, hi).
    return midpoint('', hi)
  }

  // hi === null → after the last key `lo`: midpoint of (lo, 1.0).
  // lo !== null && hi !== null → midpoint of (lo, hi).
  return midpoint(lo, hi)
}

export function rankOf(row: Row): string | null {
  const rank = row.fields.position
  return typeof rank === 'string' && rank !== '' ? rank : null
}

/** Ranked before unranked, ranks ascending; 0 between two unranked rows, so a stable sort keeps the order they came in. */
export function byRank(a: Row, b: Row): number {
  const x = rankOf(a)
  const y = rankOf(b)
  if (x === y) return 0
  if (x === null) return 1
  if (y === null) return -1
  return x < y ? -1 : 1
}
