import { locale, t } from '../i18n'
import type { Model, Row } from '../types'
import type { Filter } from './layout'

export interface FilterField {
  field: string
  label: string
  /** `[value, label]`, in the order a chip's menu lists them. */
  options: [string, string][]
}

/** The value a filter compares: a relation's first id, a toggle as `1` or empty, anything else as text. */
export function filterValue(row: Row, field: string): string {
  const value = row.fields[field]
  const first = Array.isArray(value) ? value[0] : value
  if (typeof first === 'boolean') return first ? '1' : ''
  return first === null || first === undefined ? '' : String(first)
}

function relationOptions(rows: Row[], field: string): [string, string][] {
  const seen = new Map<string, string>()
  for (const row of rows) {
    const id = filterValue(row, field)
    if (id !== '' && !seen.has(id)) seen.set(id, row.lookups?.[field]?.title ?? `#${id}`)
  }
  return [...seen.entries()].sort((a, b) => a[1].localeCompare(b[1], locale()))
}

/** The model's filterable fields: the view's `filters` first, in their declared order, the rest after. */
export function filterFields(model: Model, rows: Row[], first: string[] = []): FilterField[] {
  const rank = (field: string) => (first.includes(field) ? first.indexOf(field) : first.length)
  const fields = Object.entries(model.fields).flatMap(([field, declared]): FilterField[] => {
    const base = { field, label: declared.label }
    switch (declared.type) {
      case 'select':
        return [{ ...base, options: Object.entries(declared.options ?? {}) }]
      case 'relation':
        return [{ ...base, options: relationOptions(rows, field) }]
      case 'bool':
        return [{ ...base, options: [['1', t('yes')], ['', t('no')]] }]
      default:
        return []
    }
  })
  return fields.sort((a, b) => rank(a.field) - rank(b.field))
}

function fold(text: string): string {
  return text.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase().trim()
}

export function filterRows(rows: Row[], filters: Filter[], query: string): Row[] {
  const wanted = fold(query)
  return rows.filter(
    (row) => filters.every((f) => filterValue(row, f.field) === f.value) && (wanted === '' || fold(row.title).includes(wanted)),
  )
}
