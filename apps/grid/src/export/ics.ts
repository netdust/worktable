import type { Column } from '../grid/columns'
import type { Model, Row, View } from '../types'

const MOMENT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/
const DAY = /^\d{4}-\d{2}-\d{2}/
const OCTETS = 75

const text = (value: unknown): string => (typeof value === 'string' ? value : '')

/** RFC 5545 text: a backslash, a semicolon, a comma and a line break are escaped. */
const escape = (value: string): string => value.replace(/[\\;,]/g, (c) => `\\${c}`).replace(/\r?\n/g, '\\n')

/** A content line longer than 75 octets continues on lines that start with a space; a character is never split. */
function fold(line: string): string {
  const parts: string[] = []
  let part = ''
  let size = 0
  for (const char of line) {
    const bytes = new TextEncoder().encode(char).length
    const room = parts.length === 0 ? OCTETS : OCTETS - 1
    if (size + bytes > room) {
      parts.push(part)
      part = ''
      size = 0
    }
    part += char
    size += bytes
  }
  parts.push(part)
  return parts.join('\r\n ')
}

const compact = (stored: string): string => stored.replace(/[-:]/g, '')
const moment = (stored: string): string => compact(`${stored.slice(0, 16)}:00`.slice(0, 19))
const nextDay = (day: string): string => {
  const date = new Date(`${day}T12:00:00Z`)
  date.setUTCDate(date.getUTCDate() + 1)
  return date.toISOString().slice(0, 10)
}
const stamp = (now: Date): string => `${now.toISOString().slice(0, 19).replace(/[-:]/g, '')}Z`

/** The moment column a row is timed by, and the end declared right after it in the model. */
function timing(columns: Column[], model: Model): { start: string | null; end: string | null } {
  const start = columns.find((c) => c.kind === 'datetime')?.id ?? null
  if (!start) return { start: null, end: null }
  const keys = Object.keys(model.fields)
  const next = keys[keys.indexOf(start) + 1]
  return { start, end: next && model.fields[next]?.type === 'datetime' ? next : null }
}

/**
 * The view's dated rows as calendar events: a timed row from its moment to its declared end, an untimed one as its whole day
 * (or days, to the view's end column). Times are floating local times, as the grid shows them. No LOCATION: which column is
 * a place is a domain word.
 */
export function toIcs(rows: Row[], view: View, columns: Column[], model: Model, now = new Date()): string {
  const { start, end } = timing(columns, model)
  const used = new Set(['title', view.date_field, view.end_field, start, end])
  const described = columns.filter((c) => !used.has(c.id))
  const events = rows.flatMap((row) => {
    const day = text(row.fields[view.date_field ?? ''])
    if (!DAY.test(day)) return []
    const from = start ? text(row.fields[start]) : ''
    const until = end ? text(row.fields[end]) : ''
    const last = view.end_field ? text(row.fields[view.end_field]) : ''
    const when = MOMENT.test(from)
      ? [`DTSTART:${moment(from)}`, ...(MOMENT.test(until) ? [`DTEND:${moment(until)}`] : [])]
      : [`DTSTART;VALUE=DATE:${compact(day.slice(0, 10))}`, `DTEND;VALUE=DATE:${compact(nextDay((DAY.test(last) ? last : day).slice(0, 10)))}`]
    const lines = described.flatMap((c) => (c.text(row) ? [`${c.label}: ${c.text(row)}`] : []))
    return [
      'BEGIN:VEVENT',
      `UID:${view.key}-${row.id}@worktable`,
      `DTSTAMP:${stamp(now)}`,
      ...when,
      `SUMMARY:${escape(row.title)}`,
      ...(lines.length ? [`DESCRIPTION:${escape(lines.join('\n'))}`] : []),
      'END:VEVENT',
    ]
  })
  const all = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Worktable//NL', 'CALSCALE:GREGORIAN', ...events, 'END:VCALENDAR']
  return `${all.map(fold).join('\r\n')}\r\n`
}

/** The calendar file, named after the view. */
export function downloadIcs(ics: string, name: string): void {
  const url = URL.createObjectURL(new Blob([ics], { type: 'text/calendar;charset=utf-8' }))
  const link = Object.assign(document.createElement('a'), { href: url, download: `${name}.ics` })
  document.body.append(link)
  link.click()
  link.remove()
  setTimeout(() => URL.revokeObjectURL(url), 0)
}
