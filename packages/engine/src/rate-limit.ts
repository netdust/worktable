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
      // some() stops at the first limit that is over, so a refused request writes no further rows.
      return limits().some((limit) => hit(sqlite, limit, now) > limit.max)
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

function failuresIn(sqlite: Database, key: string, start: number): number {
  const row = sqlite.query('SELECT count FROM rate_limit WHERE key = ? AND window_start = ?').get(key, start) as {
    count: number
  } | null
  return row?.count ?? 0
}

function countFailure(sqlite: Database, limit: Limit, now: number): void {
  try {
    isOver(sqlite, () => [limit], now)
  } catch (err) {
    console.error(err)
  }
}

/**
 * Counts only the 401s of `work`, after its transaction has rolled back, and refuses once `max` were counted.
 * Fails closed: a broken limiter refuses.
 */
export function failureLimiter(key: string, max: number, windowMinutes: number) {
  const windowMs = windowMinutes * 60_000
  if (windowMs > LONGEST_WINDOW) throw new Error(`a limit window is at most ${LONGEST_WINDOW / 60_000} minutes`)
  return async <T>(sqlite: Database, work: () => T | Promise<T>, now = Date.now()): Promise<T> => {
    const start = now - (now % windowMs)
    let over: boolean
    try {
      over = failuresIn(sqlite, key, start) >= max
    } catch (err) {
      console.error(err)
      over = true
    }
    if (over) throw new ApiError(429, 'rate_limited', 'Too many requests; try again later')
    try {
      return await work()
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) countFailure(sqlite, { key, max, windowMs }, now)
      throw err
    }
  }
}
