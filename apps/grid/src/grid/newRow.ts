import type { DateWindow, Field, Model, Scope, View } from '../types'

/**
 * `needs`: the fields the draft row asks for, in order, before it is created; none creates it at once.
 * `offers`: the single relations left empty that the view shows, asked for once the writer refuses the row.
 */
export type NewRow = { fields: Record<string, unknown>; needs: string[]; offers: string[] } | { missing: string[] }

const TYPED = ['text', 'datetime', 'textarea', 'html', 'email', 'url', 'int', 'float']

function iso(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

function fillable(field: Field): boolean {
  return TYPED.includes(field.type) || (field.type === 'relation' && field.relation?.multiple === false)
}

/**
 * What `+ New` fills in by itself — the day it lands on, the first option of a
 * required list, the selected space — and what the draft row asks for.
 */
export function newRow(model: Model, view: View, window: DateWindow | null, today = new Date(), scope: Scope | null = null): NewRow {
  const now = iso(today)
  const day = window && (now < window.from || now > window.to) ? window.from : now
  const fields: Record<string, unknown> = {}
  // The title is asked only when the writer requires it and the grid may write it.
  const needs: string[] = model.title_readonly || model.title_required === false ? [] : ['title']
  const missing: string[] = []
  const offers: string[] = []

  for (const [key, field] of Object.entries(model.fields)) {
    const single = field.type === 'relation' && field.relation?.multiple === false
    if (scope && key === scope.field && field.type === 'relation') fields[key] = [scope.id]
    else if (field.type === 'date' && (field.required || key === view.date_field)) fields[key] = day
    else if (single) offers.push(key)
    if (key in fields || !field.required) continue
    if (field.type === 'select' && field.options && Object.keys(field.options).length > 0) fields[key] = Object.keys(field.options)[0]
    else if (field.type === 'bool') fields[key] = false
    else if (fillable(field)) needs.push(key)
    else missing.push(field.label)
  }

  // Only what the view shows can be asked for, the schema's required ones first.
  const shown = (key: string) => !view.columns || view.columns.includes(key) || key in (view.lookups ?? {})
  const offered = offers.filter(shown).sort((a, b) => Number(model.fields[b].required) - Number(model.fields[a].required))

  return missing.length > 0 ? { missing } : { fields, needs, offers: offered }
}
