import type { Database } from 'bun:sqlite'
import { ApiError } from './params'

export interface Limit {
  key: string
  max: number
  windowMs: number
}

// The sweep keeps a row this long, so no limit may use a longer window.
const LONGEST_WINDOW = 15 * 60_000

function hit(sqlite: Database, { key, windowMs }: Limit, now: number): number {
  const start = now - (now % windowMs)
  const row = sqlite
    .query(
      `INSERT INTO rate_limit (key, window_start, count) VALUES (?, ?, 1)
       ON CONFLICT (key, window_start) DO UPDATE SET count = count + 1 RETURNING count`,
    )
    .get(key, start) as { count: number }
  return row.count
}

function isOver(sqlite: Database, limits: () => Limit[], now: number): boolean {
  return sqlite
    .transaction(() => {
      sqlite.query('DELETE FROM rate_limit WHERE window_start < ?').run(now - LONGEST_WINDOW)
      return limits()
        .map((limit) => hit(sqlite, limit, now) > limit.max)
        .some(Boolean)
    })
    .immediate()
}

/** Counts one request against each limit; when the limiter itself fails, failOpen decides. */
export function checkLimits(sqlite: Database, limits: () => Limit[], failOpen: boolean, now = Date.now()): void {
  let over: boolean
  try {
    over = isOver(sqlite, limits, now)
  } catch (err) {
    console.error(err)
    over = !failOpen
  }
  if (over) throw new ApiError(429, 'rate_limited', 'Too many requests; try again later')
}
