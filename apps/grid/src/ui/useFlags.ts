import { useEffect, useMemo, useState } from 'react'
import { rows as readRows } from '../api'
import type { DateWindow, Row, Schema, Scope, TableDef, Tone } from '../types'
import type { Shown } from './Toolbar'

/** One row of a flag query: its text, its tone and that option's word, and the record of each dataset it marks. */
export type Flag = { text: string; tone: Tone; label: string; marks: Record<string, number> }

export interface Flags {
  marksOf(dataset: string, id: number): Flag[]
  /** How many of these records carry a flag. */
  count(dataset: string, ids: number[]): number
  /** The flag query's key, to open its view by, and its name. */
  source: string
  label: string
}

const NONE: Flag[] = []

function flagOf(row: Row, table: TableDef, schema: Pick<Schema, 'models'>): Flag {
  const { marks, tone } = table.flags!
  const field = schema.models[table.model]?.fields[tone]
  const option = String(row.fields[tone] ?? '')
  const ids = Object.entries(marks).flatMap(([dataset, column]) => {
    const id = row.fields[column]
    return typeof id === 'number' && Number.isSafeInteger(id) ? [[dataset, id] as const] : []
  })
  return { text: row.title, tone: field?.tones?.[option] ?? 'warn', label: field?.options?.[option] ?? option, marks: Object.fromEntries(ids) }
}

function indexOf(found: Flag[], table: TableDef): Flags {
  const by = new Map<string, Flag[]>()
  for (const flag of found) {
    for (const [dataset, id] of Object.entries(flag.marks)) {
      const key = `${dataset}:${id}`
      by.set(key, [...(by.get(key) ?? []), flag])
    }
  }
  const marksOf = (dataset: string, id: number) => by.get(`${dataset}:${id}`) ?? NONE
  return {
    marksOf,
    count: (dataset, ids) => ids.filter((id) => marksOf(dataset, id).length > 0).length,
    source: table.key,
    label: table.label,
  }
}

/**
 * The flags the schema's flag query raises over a skin's window, read through the rows route in the caller's own scope,
 * so a caller who cannot read the query has none. Null without a flag query that marks the skin's dataset, without a
 * window, while the first read is pending, and once a read is refused.
 */
export function useFlags(schema: Pick<Schema, 'tables' | 'models'> | null, scope: Scope | null, window: Partial<DateWindow> | null, dataset: string): Flags | null {
  const table = schema?.tables.find((t) => t.flags && Object.hasOwn(t.flags.marks, dataset))
  const asked = table && window ? { ...(table.date_field ? window : {}) } : null
  const scoped = table?.space === 'scoped' ? scope : null
  const key = table && asked ? JSON.stringify([table.key, asked, scoped]) : null
  const [read, setRead] = useState<{ key: string; rows: Row[] | null } | null>(null)
  useEffect(() => {
    if (!table || !asked || key === null) return
    let live = true
    const view = { model: table.model, table: table.key, type: 'grid' as const, date_field: table.date_field, fixed: {} }
    readRows(view, asked, scoped).then(
      (found) => live && setRead({ key, rows: found.rows }),
      () => live && setRead({ key, rows: null }),
    )
    return () => {
      live = false
    }
  }, [key])
  // A new window keeps the last flags until its own read lands: they mark ids, so a row of another window stays unmarked.
  const rows = key === null ? null : (read?.rows ?? null)
  return useMemo(() => (table && schema && rows ? indexOf(rows.map((row) => flagOf(row, table, schema)), table) : null), [rows, table, schema])
}

/** The days a skin's rows are on, as its flags' window: none without rows, every day where the view has no date column. */
export function windowOfRows(rows: Row[], field: string | undefined): Partial<DateWindow> | null {
  if (rows.length === 0) return null
  if (!field) return {}
  const days = rows.map((row) => String(row.fields[field] ?? '').slice(0, 10)).filter((day) => day !== '').sort()
  return days.length > 0 ? { from: days[0], to: days[days.length - 1] } : {}
}

/** What a skin's title line says of its flagged rows. */
export function flaggedOf(flags: Flags | null, dataset: string, rows: Row[]): Shown['flagged'] {
  return flags ? { count: flags.count(dataset, rows.map((row) => row.id)), label: flags.label, source: flags.source } : undefined
}
