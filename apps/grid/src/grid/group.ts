import { locale, t } from '../i18n'
import type { Row } from '../types'
import type { Column } from './columns'

export interface Group {
  key: string
  label: string
  rows: Row[]
  count: number
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

export function groupRows(rows: Row[], by: Column | undefined): Group[] {
  if (!by) return [{ key: '', label: '', rows, count: rows.length }]

  const groups = new Map<string, Group>()
  for (const row of rows) {
    const key = keyOf(row, by)
    const group = groups.get(key) ?? { key, label: labelOf(key, row, by), rows: [], count: 0 }
    group.rows.push(row)
    group.count++
    groups.set(key, group)
  }

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
