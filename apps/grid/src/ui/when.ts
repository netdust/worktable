import type { Column } from '../grid/columns'
import { locale } from '../i18n'
import type { Row } from '../types'

const MOMENT = /^(\d{4}-\d{2}-\d{2})(?:[T ](\d{2}:\d{2}))?/

/** "di 13 okt", the day a card is on. */
function dayOf(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number)
  return new Intl.DateTimeFormat(locale(), { weekday: 'short', day: 'numeric', month: 'short' }).format(new Date(y, m - 1, d)).replace(/\./g, '')
}

/** The day and the hours of a card, from its date and datetime columns: "di 13 okt", "20:00–21:15". */
export function whenOf(row: Row, dates: Column[]): { day: string | null; from: string | null; to: string | null } {
  const moments = dates.map((c) => MOMENT.exec(String(c.value(row) ?? ''))).filter((m): m is RegExpExecArray => m !== null)
  const day = moments[0]?.[1] ?? null
  const times = moments.map((m) => m[2]).filter((time): time is string => Boolean(time))
  return { day: day && dayOf(day), from: times[0] ?? null, to: times[1] ?? null }
}

export const initials = (name: string) => name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join('').toLocaleUpperCase()
