const pad = (n: number) => String(n).padStart(2, '0')

/** A moment as studio stores a datetime: local time to the second, without a zone (never toISOString). */
export function localTime(at: Date = new Date()): string {
  const day = `${at.getFullYear()}-${pad(at.getMonth() + 1)}-${pad(at.getDate())}`
  return `${day}T${pad(at.getHours())}:${pad(at.getMinutes())}:${pad(at.getSeconds())}`
}

export const localDay = (at: Date = new Date()): string => localTime(at).slice(0, 10)

/** Calendar days back at the same clock time: a DST day is 23 or 25 hours, so "yesterday" is never 24 hours ago. */
export function daysAgo(days: number, from: Date = new Date()): string {
  const at = new Date(from)
  at.setDate(at.getDate() - days)
  return localTime(at)
}
