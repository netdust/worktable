import { t } from '../i18n'
import type { DateWindow } from '../types'

const DAY = /^\d{4}-\d{2}-\d{2}$/

export function iso(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

export function parse(day: string): Date | null {
  if (!DAY.test(day)) return null
  const [y, m, d] = day.split('-').map(Number)
  const date = new Date(y, m - 1, d)
  return iso(date) === day ? date : null
}

function addDays(date: Date, days: number): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + days)
}

/** Monday to Sunday, local time. */
export function weekOf(date: Date): DateWindow {
  const monday = addDays(date, -((date.getDay() + 6) % 7))
  return { from: iso(monday), to: iso(addDays(monday, 6)) }
}

export function shift(window: DateWindow, days: number): DateWindow {
  const from = parse(window.from) ?? new Date()
  const to = parse(window.to) ?? from
  return { from: iso(addDays(from, days)), to: iso(addDays(to, days)) }
}

/** The page's `<html lang>`; a tag Intl refuses falls back to English. */
function named(date: Date, options: Intl.DateTimeFormatOptions): string {
  try {
    return new Intl.DateTimeFormat(document.documentElement.lang || 'en', options).format(date)
  } catch {
    return new Intl.DateTimeFormat('en', options).format(date)
  }
}

function monthName(date: Date): string {
  return named(date, { month: 'short' }).replace(/\.$/, '')
}

/** A calendar month moved by `months`, whole. */
export function shiftMonth(window: DateWindow, months: number): DateWindow {
  const from = parse(window.from) ?? new Date()
  return { from: iso(new Date(from.getFullYear(), from.getMonth() + months, 1)), to: iso(new Date(from.getFullYear(), from.getMonth() + months + 1, 0)) }
}

/** The calendar month a day falls in. */
export function monthOf(date: Date): DateWindow {
  return shiftMonth({ from: iso(date), to: iso(date) }, 0)
}

export function isWeek(window: DateWindow): boolean {
  const from = parse(window.from)
  return from !== null && weekOf(from).from === window.from && weekOf(from).to === window.to
}

export function isMonth(window: DateWindow): boolean {
  const from = parse(window.from)
  return from !== null && shiftMonth(window, 0).from === window.from && shiftMonth(window, 0).to === window.to
}

export function days(window: DateWindow): number {
  const from = parse(window.from)
  const to = parse(window.to)
  return from && to ? Math.round((to.getTime() - from.getTime()) / 86_400_000) + 1 : 0
}

/** The ISO week number: the week holding the year's first Thursday is week 1. */
export function isoWeek(date: Date): number {
  const thursday = addDays(date, 3 - ((date.getDay() + 6) % 7))
  const first = new Date(thursday.getFullYear(), 0, 1)
  return 1 + Math.floor(Math.round((thursday.getTime() - first.getTime()) / 86_400_000) / 7)
}

/** "Alles", "31 dec", "Week 45 · 2–8 nov", "oktober 2026" or "12 okt – 3 nov". */
export function formatWindow(window: Partial<DateWindow>): string {
  if (!window.from || !window.to) return t('all')
  const full = { from: window.from, to: window.to }
  const from = parse(full.from) ?? new Date()
  const to = parse(full.to) ?? from
  if (full.from === full.to) return `${from.getDate()} ${monthName(from)}`
  if (isMonth(full)) return named(from, { month: 'long', year: 'numeric' })
  if (!isWeek(full)) return `${from.getDate()} ${monthName(from)} – ${to.getDate()} ${monthName(to)}`
  const start = from.getMonth() === to.getMonth() ? `${from.getDate()}` : `${from.getDate()} ${monthName(from)}`
  return `${t('week')} ${isoWeek(from)} · ${start}–${to.getDate()} ${monthName(to)}`
}

/** The longest window a matrix reads: the engine refuses a wider one. */
export const MATRIX_DAYS = 92
