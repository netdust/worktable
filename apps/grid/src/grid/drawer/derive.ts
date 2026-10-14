import type { Layout } from '../layout'
import type { CalendarDef, Model, Row, Schema } from '../../types'
import type { Column } from '../columns'

const STATE_TONES = ['ok', 'warn', 'bad']

/** Whether an option field reads as a state (optie, bevestigd, geannuleerd): its tones are the status tones. */
export const isState = (tones: Record<string, string> | undefined): boolean => Boolean(tones) && Object.values(tones ?? {}).some((tone) => STATE_TONES.includes(tone))

/** The field that says what kind of record a row is: the first toned option field that is no state. */
export function kindOf(model: Model): string | null {
  return Object.entries(model.fields).find(([, f]) => f.type === 'select' && f.tones && !isState(f.tones))?.[0] ?? null
}

/** "wo 14 okt 2026": a day as the drawer writes it. */
export function dayLabel(iso: string, locale: string): string {
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number)
  if (!y || !m || !d) return iso
  return new Intl.DateTimeFormat(locale, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(y, m - 1, d)).replace(/\./g, '')
}

/** Who made a change, as the drawer names them: an address's local part. */
export const actorOf = (email: string | null): string => (email ? email.split('@')[0] : '')

export interface Prop {
  column: Column
  /** "Tijd": the start and end a calendar declares, one line. */
  span?: { start: Column; end: Column | null }
  empty: boolean
}

/**
 * The drawer's fields: those the view shows (all, where no view says), its date and its start and end as one "Tijd",
 * never the title or a list of linked rows, which are its own sections. The rest is listed as folded.
 */
export function propsOf(columns: Column[], row: Row, cal?: CalendarDef | null, layout?: Layout | null, dateField?: string | null): { shown: Prop[]; folded: Prop[] } {
  const start = cal?.start ? columns.find((c) => c.id === cal.start) : undefined
  const end = cal?.end && cal.start ? columns.find((c) => c.id === cal.end) : undefined
  // A layout that shows no field at all (a timeline's) says nothing about the drawer.
  const says = layout && columns.some((c) => c.id !== 'title' && c.kind !== 'links' && !layout.hidden.includes(c.id))
  const kept = (c: Column) => !says || !layout.hidden.includes(c.id) || c.id === dateField || c === start || c === end
  const props: Prop[] = []
  for (const column of columns) {
    if (column.id === 'title' || column.kind === 'links' || column === end) continue
    const prop: Prop = column === start ? { column, span: { start, end: end ?? null }, empty: column.text(row) === '' } : { column, empty: column.text(row) === '' }
    props.push(prop)
  }
  // The record's state first, as the prototypes list it: the first option field toned ok, warn or bad.
  const state = props.findIndex((p) => isState(p.column.tones))
  if (state > 0) props.unshift(...props.splice(state, 1))
  return { shown: props.filter((p) => kept(p.column) && !p.empty), folded: props.filter((p) => !kept(p.column) || p.empty) }
}

export interface Inbound {
  model: string
  table: string
  field: string
  label: string
  date: string
}

/** The dated tables whose rows point at this model by a relation: a tourstop's activities. A link field already lists its own. */
export function inboundOf(schema: Pick<Schema, 'models' | 'tables'>, model: string): Inbound[] {
  const linked = new Set(Object.values(schema.models[model]?.fields ?? {}).flatMap((f) => (f.link ? [f.link.dataset] : [])))
  return schema.tables.flatMap((table) => {
    const other = schema.models[table.model]
    if (!other || other.query || !table.date_field || table.model === model || linked.has(table.model)) return []
    return Object.entries(other.fields)
      .filter(([, f]) => f.type === 'relation' && f.relation?.model === model)
      .map(([field]) => ({ model: table.model, table: table.key, field, label: table.label, date: table.date_field as string }))
  })
}
