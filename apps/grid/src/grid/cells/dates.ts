import { CalendarDate, CalendarDateTime, parseDate, parseDateTime, parseTime, Time } from '@internationalized/date'

const DAY = /^\d{4}-\d{2}-\d{2}$/
const MOMENT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/
const CLOCK = /^\d{2}:\d{2}$/

// parse* constrain an impossible day (31 February) instead of refusing it: the round trip catches that.
function read<T>(value: string, shape: RegExp, parse: (v: string) => T, write: (d: T) => string): T | null {
  if (!shape.test(value)) return null
  try {
    const parsed = parse(value)
    return write(parsed) === value ? parsed : null
  } catch {
    return null
  }
}

export function fromDate(d: CalendarDate | null): string {
  return d ? d.toString() : ''
}

export function toDate(v: string): CalendarDate | null {
  return read(v, DAY, parseDate, fromDate)
}

export function fromMoment(d: CalendarDateTime | null): string {
  return d ? d.toString().slice(0, 16) : ''
}

export function toMoment(v: string): CalendarDateTime | null {
  return read(v, MOMENT, parseDateTime, fromMoment)
}

export function fromTime(t: Time | null): string {
  return t ? t.toString().slice(0, 5) : ''
}

export function toTime(v: string): Time | null {
  return read(v, CLOCK, parseTime, fromTime)
}
