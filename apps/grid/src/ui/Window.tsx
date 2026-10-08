import { ChevronLeft, ChevronRight } from 'lucide-react'
import { useCallback, useState } from 'react'
import { t } from '../i18n'
import type { DateWindow } from '../types'

const DAY = /^\d{4}-\d{2}-\d{2}$/

function iso(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

function parse(day: string): Date | null {
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
function monthName(date: Date): string {
  try {
    return new Intl.DateTimeFormat(document.documentElement.lang || 'en', { month: 'short' }).format(date).replace(/\.$/, '')
  } catch {
    return new Intl.DateTimeFormat('en', { month: 'short' }).format(date)
  }
}

/** The ISO week number: the week holding the year's first Thursday is week 1. */
export function isoWeek(date: Date): number {
  const thursday = addDays(date, 3 - ((date.getDay() + 6) % 7))
  const first = new Date(thursday.getFullYear(), 0, 1)
  return 1 + Math.floor(Math.round((thursday.getTime() - first.getTime()) / 86_400_000) / 7)
}

/** "Week 45 · 2–8 nov"; a week across two months names both. */
export function formatWindow(window: DateWindow): string {
  const from = parse(window.from) ?? new Date()
  const to = parse(window.to) ?? from
  const start = from.getMonth() === to.getMonth() ? `${from.getDate()}` : `${from.getDate()} ${monthName(from)}`
  return `${t('week')} ${isoWeek(from)} · ${start}–${to.getDate()} ${monthName(to)}`
}

function fromHash(): DateWindow {
  const from = parse(new URLSearchParams(window.location.hash.slice(1)).get('from') ?? '')
  return weekOf(from ?? new Date())
}

function toHash(value: DateWindow): void {
  const params = new URLSearchParams(window.location.hash.slice(1))
  params.set('from', value.from)
  params.set('to', value.to)
  window.history.replaceState(null, '', `#${params.toString()}`)
}

/** The window lives in the URL hash so a reload keeps it. */
export function useWindow(): [DateWindow, (value: DateWindow) => void] {
  const [value, setValue] = useState(fromHash)
  const set = useCallback((next: DateWindow) => {
    toHash(next)
    setValue(next)
  }, [])
  return [value, set]
}

interface Props {
  value: DateWindow
  onChange: (value: DateWindow) => void
}

export function WindowControl({ value, onChange }: Props) {
  const pick = (day: string) => {
    const date = parse(day)
    if (date) onChange(weekOf(date))
  }

  return (
    <div className="nv-window">
      <div className="nv-window__nav" role="group" aria-label={formatWindow(value)}>
        <button type="button" className="nv-window__step" aria-label={t('previousWeek')} title={t('previousWeek')} onClick={() => onChange(shift(value, -7))}>
          <ChevronLeft size={16} aria-hidden="true" />
        </button>
        <span className="nv-window__week">{formatWindow(value)}</span>
        <button type="button" className="nv-window__step" aria-label={t('nextWeek')} title={t('nextWeek')} onClick={() => onChange(shift(value, 7))}>
          <ChevronRight size={16} aria-hidden="true" />
        </button>
      </div>
      <label className="nv-day" title={t('pickDay')}>
        <span className="nv-sr">{t('pickDay')}</span>
        <input type="date" value={value.from} onChange={(event) => pick(event.target.value)} />
      </label>
    </div>
  )
}
