import type { Row } from '../types'

/** A row's start and end in milliseconds, where it carries a start time. */
export type Times = (r: Row) => { from: number; to: number } | null

/** A row's times from its start and end columns; a row without an end lasts no time. */
export const timesOf = (start: string, end: string | null): Times => (r) => {
  const from = Date.parse(String(r.fields[start] ?? ''))
  if (Number.isNaN(from)) return null
  const to = end ? Date.parse(String(r.fields[end] ?? '')) : Number.NaN
  return { from, to: Number.isNaN(to) ? from : to }
}

/**
 * Each row of a lane that overlaps another, with the rows it overlaps; a cancelled row neither overlaps nor is overlapped.
 * Two rows with times overlap when their times do, or they start together, as a domain's overlap query decides; else when they share a day.
 */
export function overlapsOf(rows: Row[], lane: (r: Row) => string, from: (r: Row) => number, to: (r: Row) => number, cancelled: (r: Row) => boolean, times: Times = () => null): Map<number, Row[]> {
  const live = rows.filter((r) => !cancelled(r))
  const found = new Map<number, Row[]>()
  const meet = (a: Row, b: Row) => {
    const [x, y] = [times(a), times(b)]
    return x && y ? (x.from < y.to && y.from < x.to) || x.from === y.from : from(a) <= to(b) && from(b) <= to(a)
  }
  live.forEach((a, i) => {
    for (const b of live.slice(i + 1)) {
      if (lane(a) !== lane(b) || !meet(a, b)) continue
      found.set(a.id, [...(found.get(a.id) ?? []), b])
      found.set(b.id, [...(found.get(b.id) ?? []), a])
    }
  })
  return found
}

/** How many pairs of bars overlap. */
export const pairsOf = (found: Map<number, Row[]>): number => [...found.values()].reduce((sum, others) => sum + others.length, 0) / 2
