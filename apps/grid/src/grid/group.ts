import { locale, t } from '../i18n'
import type { GroupFact, Row, Tone } from '../types'
import type { Column } from './columns'
import { DRAFT } from './store'

/** A fact as its band says it: `value` is "…" where the read limit may have cut the group short. */
export interface Fact {
  kind: GroupFact['kind']
  label: string
  value: string
  /** The tone of the option a `first` fact looks for, where its column declares one. */
  tone?: Tone
}

export interface Group {
  key: string
  label: string
  /** A day's group: its label as the weekday and the date. */
  day?: { weekday: string; date: string }
  rows: Row[]
  count: number
  facts: Fact[]
  /** The read limit may have cut this group short: its count and totals are what loaded, not what is. */
  cut: boolean
}

/** What a band says of its rows: the declared facts, read through the view's columns. */
export interface Band {
  facts: GroupFact[]
  columns: Column[]
  /** The last row as loaded when the read limit cut the rows; null when every row came. Its group is the one cut short. */
  cut: Row | null
}

const UNCUT = '…'
const CLOCK = /[T ](\d{2}:\d{2})/

/** The last row the read limit let through, when it held rows back. */
export function cutAt(loaded: Row[], total: number): Row | null {
  return total > loaded.length ? loaded.at(-1) ?? null : null
}

function raw(row: Row, key: string): unknown {
  return key === 'title' ? row.title : row.fields[key]
}

function empty(value: unknown): boolean {
  return value === null || value === undefined || value === '' || (Array.isArray(value) && value.length === 0)
}

function matches(row: Row, where: Record<string, unknown> = {}): boolean {
  return Object.entries(where).every(([key, wanted]) => String(raw(row, key) ?? '') === String(wanted))
}

function earliest(rows: Row[], key: string): Row | undefined {
  return rows.filter((row) => !empty(raw(row, key))).reduce<Row | undefined>((first, row) => {
    if (!first) return row
    const [a, b] = [raw(row, key), raw(first, key)]
    return (typeof a === 'number' && typeof b === 'number' ? a < b : String(a) < String(b)) ? row : first
  }, undefined)
}

function shown(row: Row, key: string, band: Band, by: Column): string {
  const column = band.columns.find((c) => c.id === key)
  const value = String(raw(row, key))
  if (column?.kind === 'datetime' && by.kind === 'date') return CLOCK.exec(value)?.[1] ?? value
  return column ? column.text(row) : value
}

function valueOf(fact: GroupFact, rows: Row[], band: Band, by: Column): string {
  if (fact.kind === 'count') return String(rows.filter((row) => matches(row, fact.where)).length)
  if (fact.kind === 'empty') return String(rows.filter((row) => empty(raw(row, fact.column))).length)
  const first = earliest(rows.filter((row) => matches(row, fact.where)), fact.column)
  return first ? shown(first, fact.column, band, by) : ''
}

function toneOf(fact: GroupFact, band: Band): Tone | undefined {
  if (fact.kind !== 'first') return undefined
  const [key, wanted] = Object.entries(fact.where)[0] ?? []
  return key === undefined ? undefined : band.columns.find((c) => c.id === key)?.tones?.[String(wanted)]
}

function factsOf(cut: boolean, rows: Row[], band: Band, by: Column): Fact[] {
  const real = rows.filter((row) => row.id !== DRAFT)
  return band.facts
    .map((fact) => {
      const tone = toneOf(fact, band)
      return { kind: fact.kind, label: fact.label, value: cut ? UNCUT : valueOf(fact, real, band, by), ...(tone ? { tone } : {}) }
    })
    .filter((fact) => fact.value !== '' && (fact.kind === 'first' || fact.value !== '0'))
}

/** "Maandag" and "2 november": the band sets the weekday apart from the date. */
export function dayParts(iso: string): { weekday: string; date: string } {
  const [y, m, d] = iso.split('-').map(Number)
  const at = new Date(y, m - 1, d)
  const weekday = new Intl.DateTimeFormat(locale(), { weekday: 'long' }).format(at)
  const date = new Intl.DateTimeFormat(locale(), { day: 'numeric', month: 'long' }).format(at)
  return { weekday: weekday.charAt(0).toUpperCase() + weekday.slice(1), date }
}

export function dayLabel(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number)
  const label = new Intl.DateTimeFormat(locale(), { weekday: 'long', day: 'numeric', month: 'long' }).format(new Date(y, m - 1, d))
  return label.charAt(0).toUpperCase() + label.slice(1)
}

/** Sections in the order a reader expects: days ascending, options as declared, titles alphabetical; empty last. */
function rank(by: Column): (a: string, b: string) => number {
  if (by.kind === 'select') {
    const order = Object.keys(by.options ?? {})
    return (a, b) => order.indexOf(a) - order.indexOf(b)
  }
  if (by.kind === 'date') return (a, b) => (a < b ? -1 : a > b ? 1 : 0)
  return (a, b) => a.localeCompare(b, locale())
}

function keyOf(row: Row, by: Column): string {
  return by.kind === 'select' || by.kind === 'date' ? by.edit(row) : by.text(row)
}

function labelOf(key: string, row: Row, by: Column): string {
  if (key === '') return t('noValue')
  return by.kind === 'date' ? dayLabel(key) : by.text(row)
}

export function groupRows(rows: Row[], by: Column | undefined, band?: Band): Group[] {
  if (!by) return [{ key: '', label: '', rows, count: rows.length, facts: [], cut: false }]

  const groups = new Map<string, Group>()
  for (const row of rows) {
    const key = keyOf(row, by)
    const group = groups.get(key) ?? { key, label: labelOf(key, row, by), rows: [], count: 0, facts: [], cut: band?.cut != null && keyOf(band.cut, by) === key, ...(by.kind === 'date' && key !== '' ? { day: dayParts(key) } : {}) }
    group.rows.push(row)
    group.count++
    groups.set(key, group)
  }

  if (band) for (const group of groups.values()) group.facts = factsOf(group.cut, group.rows, band, by)
  const order = rank(by)
  return [...groups.values()].sort((a, b) => (a.key === '' ? 1 : b.key === '' ? -1 : order(a.key, b.key)))
}

export function total(groups: Group[]): number {
  return groups.reduce((sum, group) => sum + group.count, 0)
}

export function sums(rows: Row[], columns: Column[]): Record<string, number> {
  const numeric = columns.filter((c) => c.kind === 'number' || c.kind === 'rollup')
  return Object.fromEntries(
    numeric.map((c) => [c.id, rows.reduce((sum, row) => sum + (Number(c.value(row)) || 0), 0)]),
  )
}
