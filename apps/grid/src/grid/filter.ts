import { locale, t } from '../i18n'
import type { Model, Row } from '../types'
import type { Kind } from './conditions'

export interface FilterField {
  field: string
  label: string
  /** What the field is, for the operators the builder offers on it. */
  kind: Kind
  /** `[value, label]` of a choice or yes/no, in the order the builder lists them. */
  options: [string, string][]
  /** A relation's target model: its values are searched there, not listed. */
  relation?: string
}

/** The value a filter compares: a relation's first id, a toggle as `1` or empty, anything else as text. */
export function filterValue(row: Row, field: string): string {
  const value = row.fields[field]
  const first = Array.isArray(value) ? value[0] : value
  if (typeof first === 'boolean') return first ? '1' : ''
  return first === null || first === undefined ? '' : String(first)
}

/** A relation's options by title: from its target's records, or the loaded rows while those are not read. */
export function byTitle(titles: Map<string, string>): [string, string][] {
  return [...titles.entries()].sort((a, b) => a[1].localeCompare(b[1], locale()))
}

function relationOptions(rows: Row[], field: string): [string, string][] {
  const seen = new Map<string, string>()
  for (const row of rows) {
    const id = filterValue(row, field)
    if (id !== '' && !seen.has(id)) seen.set(id, row.lookups?.[field]?.title ?? `#${id}`)
  }
  return byTitle(seen)
}

/** The model's filterable fields: the view's `filters` first, in their declared order, the rest after. */
export function filterFields(model: Model, rows: Row[], first: string[] = []): FilterField[] {
  const rank = (field: string) => (first.includes(field) ? first.indexOf(field) : first.length)
  const title: FilterField[] = model.title_field ? [{ field: model.title_field, label: model.title_label, kind: 'text', options: [] }] : []
  const fields = Object.entries(model.fields).flatMap(([field, declared]): FilterField[] => {
    const base = { field, label: declared.label, options: [] as [string, string][] }
    switch (declared.type) {
      case 'select':
        return [{ ...base, kind: 'choice', options: Object.entries(declared.options ?? {}) }]
      case 'relation':
        return [{ ...base, kind: 'choice', options: relationOptions(rows, field), relation: declared.relation?.model }]
      case 'bool':
        return [{ ...base, kind: 'bool', options: [['1', t('yes')], ['', t('no')]] }]
      case 'date':
      case 'datetime':
        return [{ ...base, kind: declared.type }]
      case 'text':
      case 'textarea':
      case 'email':
      case 'url':
        return [{ ...base, kind: 'text' }]
      default:
        return []
    }
  })
  // A text column labelled like a relation holds that relation's title: offering both reads as one field twice.
  const named = new Set(fields.filter((f) => f.relation).map((f) => f.label))
  const shown = [...title, ...fields].filter((f) => f.relation || f.kind !== 'text' || !named.has(f.label))
  return shown.sort((a, b) => rank(a.field) - rank(b.field))
}

function fold(text: string): string {
  return text.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase().trim()
}

/** The search, on the titles loaded: conditions are the server's to apply (its LIKE and this fold disagree on diacritics). */
export function filterRows(rows: Row[], query: string): Row[] {
  const wanted = fold(query)
  return wanted === '' ? rows : rows.filter((row) => fold(row.title).includes(wanted))
}
