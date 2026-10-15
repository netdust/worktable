import type { Row } from '../types'

/** Each row of a lane that shares a day with another, with the rows it shares it with; a cancelled row neither overlaps nor is overlapped. */
export function overlapsOf(rows: Row[], lane: (r: Row) => string, from: (r: Row) => number, to: (r: Row) => number, cancelled: (r: Row) => boolean): Map<number, Row[]> {
  const live = rows.filter((r) => !cancelled(r))
  const found = new Map<number, Row[]>()
  live.forEach((a, i) => {
    for (const b of live.slice(i + 1)) {
      if (lane(a) !== lane(b) || from(a) > to(b) || from(b) > to(a)) continue
      found.set(a.id, [...(found.get(a.id) ?? []), b])
      found.set(b.id, [...(found.get(b.id) ?? []), a])
    }
  })
  return found
}

/** How many pairs of bars overlap. */
export const pairsOf = (found: Map<number, Row[]>): number => [...found.values()].reduce((sum, others) => sum + others.length, 0) / 2
