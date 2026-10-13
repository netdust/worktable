import { locale, t } from '../i18n'
import type { Field, GroupFact, Link, LinkItem, Model, OptionsFrom, Row, Tone, View } from '../types'
import { DRAFT } from './store'

export type CellKind =
  | 'title' | 'text' | 'longtext' | 'select' | 'date' | 'datetime' | 'time' | 'relation' | 'bool' | 'number'
  | 'lookup' | 'rollup' | 'links' | 'other'

export interface Column {
  /** `title`, a field key, `lookups.<field>.<name>` or `rollups.<key>`. */
  id: string
  /** The key a write carries; null for what only the server computes. */
  field: string | null
  label: string
  kind: CellKind
  editable: boolean
  /** False for a title the server computes from a relation. */
  sortable?: boolean
  required: boolean
  align: 'start' | 'end'
  width: number
  options?: Record<string, string>
  tones?: Record<string, Tone>
  /** A relation's target model; single relations are picked in the cell. */
  relation?: { model: string; multiple: boolean }
  /** Where an empty relation's picker finds its candidates. */
  options_from?: OptionsFrom
  /** A count shown as a tinted badge. */
  badge?: Tone
  /** A `links` column's link: added and removed by its own editor, never written as a value. */
  link?: Link
  value: (row: Row) => unknown
  /** What the cell shows, copy takes and search reads. */
  text: (row: Row) => string
  /** For an inherited lookup, the word for where its value comes from; empty when the row's own. */
  via?: (row: Row) => string
  /** In a day group, a moment's time and the muted end of its range; null when it holds none. */
  range?: (row: Row) => { start: string; end: string } | null
  /** What an empty cell says, from the view's facts (a band counting what this column leaves empty). */
  blank?: string
  /** What an editor opens with. */
  edit: (row: Row) => string
  /** What a write sends for what was typed. */
  parse: (draft: string) => unknown
  /** What a write sends for what was pasted: the shown text read back. */
  fromText: (text: string) => unknown
}

const WIDTH: Record<CellKind, number> = {
  title: 280, text: 160, longtext: 220, select: 130, date: 108, datetime: 140, time: 76, relation: 150,
  bool: 80, number: 90, lookup: 170, rollup: 90, links: 200, other: 140,
}

/** Room for a value and its "via" tag side by side. */
const INHERITED_WIDTH = 240

const TIME = /^(\d{1,2})(?:[:.h]?(\d{2}))?$/

function scalar(value: unknown): string {
  if (value === null || value === undefined) return ''
  if (typeof value === 'string' || typeof value === 'number') return String(value)
  if (typeof value === 'boolean') return value ? '1' : ''
  return ''
}

/** `730`, `7.30`, `7h30` and `7` all mean a time of day; anything else goes as typed and the server answers. */
export function parseTime(draft: string): string {
  const match = TIME.exec(draft.trim())
  if (!match) return draft.trim()
  const [hours, minutes = '00'] = [match[1], match[2]]
  return `${hours.padStart(2, '0')}:${minutes}`
}

export function formatDay(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number)
  if (!y || !m || !d) return iso
  return new Intl.DateTimeFormat(locale(), { day: '2-digit', month: '2-digit', year: 'numeric' }).format(new Date(y, m - 1, d))
}

const MOMENT = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})/

/** `di 14/10 20:30`: the locale's short weekday, then day/month and the time; a value that is not a moment shows as stored. */
export function formatMoment(stored: string): string {
  const match = MOMENT.exec(stored)
  if (!match) return stored
  const [, y, m, d, hh, mm] = match
  const parts = new Intl.DateTimeFormat(locale(), { weekday: 'short' }).formatToParts(new Date(Number(y), Number(m) - 1, Number(d)))
  const weekday = parts.find((part) => part.type === 'weekday')?.value ?? ''
  return `${weekday} ${d}/${m} ${hh}:${mm}`
}

/** What a datetime-local input holds and a write sends: `YYYY-MM-DDTHH:mm`. */
function momentOf(text: string): string {
  const match = MOMENT.exec(text.trim())
  return match ? `${match[1]}-${match[2]}-${match[3]}T${match[4]}:${match[5]}` : text.trim()
}

export function humanise(key: string): string {
  const words = key.replace(/[_-]+/g, ' ').trim()
  return words.charAt(0).toUpperCase() + words.slice(1)
}

function kindOf(field: Field): CellKind {
  switch (field.type) {
    case 'text':
      return field.description?.includes('HH:MM') ? 'time' : 'text'
    case 'email':
    case 'url':
      return 'text'
    case 'textarea':
    case 'html':
      return 'longtext'
    case 'select':
    case 'date':
    case 'datetime':
    case 'relation':
    case 'bool':
      return field.type
    case 'int':
    case 'float':
      return 'number'
    case 'links':
      return 'links'
    default:
      return 'other'
  }
}

const EDITABLE: CellKind[] = ['title', 'text', 'longtext', 'select', 'date', 'datetime', 'time', 'bool', 'number']

function base(id: string, kind: CellKind, label: string, value: (row: Row) => unknown): Column {
  return {
    id, field: null, label, kind, editable: false, required: false,
    align: kind === 'number' || kind === 'rollup' ? 'end' : 'start',
    width: WIDTH[kind], value,
    text: (row) => scalar(value(row)),
    edit: (row) => scalar(value(row)),
    parse: (draft) => draft,
    fromText: (text) => text,
  }
}

const DMY = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/

function dayFromText(text: string): string {
  const match = DMY.exec(text.trim())
  return match ? `${match[3]}-${match[2].padStart(2, '0')}-${match[1].padStart(2, '0')}` : text.trim()
}

function optionFromText(options: Record<string, string>, text: string): string {
  const wanted = text.trim().toLowerCase()
  return Object.entries(options).find(([key, label]) => key === text.trim() || label.toLowerCase() === wanted)?.[0] ?? text.trim()
}

/** A links cell edits only a row that exists: a draft has no record to link to yet. */
export function editableAt(column: Column, row: Row): boolean {
  return column.editable && !(column.kind === 'links' && row.id === DRAFT)
}

/** A `links` field's rows; empty when the engine served none. */
export function linksOf(row: Row, key: string): LinkItem[] {
  const value = row.fields[key]
  return Array.isArray(value) ? (value as LinkItem[]) : []
}

/** A relation holds a list of ids; its cell edits the first. */
export function firstId(value: unknown): string {
  return scalar(Array.isArray(value) ? value[0] : value)
}

function fieldColumn(key: string, field: Field, writable: boolean): Column {
  const kind = kindOf(field)
  const column = base(key, kind, field.label, (row) => row.fields[key])
  column.field = key
  column.required = field.required
  column.editable = writable && !field.readonly && (EDITABLE.includes(kind) || (kind === 'relation' && field.relation?.multiple === false))
  column.options = field.options
  column.tones = field.tones
  column.relation = field.relation
  column.options_from = field.options_from
  column.badge = field.badge

  if (kind === 'select') {
    column.text = (row) => field.options?.[scalar(row.fields[key])] ?? scalar(row.fields[key])
    column.fromText = (text) => optionFromText(field.options ?? {}, text)
  }
  if (kind === 'date') {
    column.text = (row) => (scalar(row.fields[key]) === '' ? '' : formatDay(scalar(row.fields[key])))
    column.fromText = dayFromText
  }
  if (kind === 'datetime') {
    column.text = (row) => formatMoment(scalar(row.fields[key]))
    column.edit = (row) => momentOf(scalar(row.fields[key]))
    column.parse = column.fromText = momentOf
  }
  if (kind === 'time') column.parse = column.fromText = parseTime
  if (kind === 'bool') {
    column.text = (row) => (row.fields[key] ? t('yes') : t('no'))
    column.fromText = (text) => ['1', 'true', t('yes').toLowerCase()].includes(text.trim().toLowerCase())
  }
  if (kind === 'number') column.parse = column.fromText = (draft) => (draft.trim() === '' ? '' : Number(draft.replace(',', '.')))
  if (kind === 'relation') {
    column.text = (row) => row.lookups?.[key]?.title ?? ''
    column.edit = (row) => firstId(row.fields[key])
    column.parse = (draft) => (draft === '' ? [] : [Number(draft)])
  }
  const { via } = field
  if (via) {
    column.via = (row) => (row.inherited?.includes(key) ? via : '')
    column.width = INHERITED_WIDTH
  }
  if (kind === 'links') {
    column.editable = writable
    column.sortable = false
    column.link = field.link
    column.text = (row) => linksOf(row, key).map((item) => item.title).join(', ')
  }
  if (kind === 'other') column.text = (row) => (Array.isArray(row.fields[key]) ? String((row.fields[key] as unknown[]).length) : scalar(row.fields[key]))

  return column
}

function titleColumn(model: Model, writable: boolean): Column {
  const column = base('title', 'title', model.title_label, (row) => row.title)
  column.field = 'title'
  column.required = true
  column.editable = writable && !model.title_readonly
  if (model.title_derived) column.sortable = false
  return column
}

/** A lookup's header: the relation field's word, then the related model's own word for what it shows. */
function lookupColumns(model: Model, view: View, shown: string[], models: Record<string, Model>): Column[] {
  return Object.entries(view.lookups ?? {}).flatMap(([field, names]) =>
    names
      .filter((name) => !(name === 'title' && shown.includes(field)))
      .map((name) => {
        const via = model.fields[field]?.label ?? humanise(field)
        const target = models[model.fields[field]?.relation?.model ?? '']
        const label = name === 'title' ? via : `${via} · ${target?.fields[name]?.label ?? humanise(name)}`
        const column = base(`lookups.${field}.${name}`, 'lookup', label, (row) => {
          const lookup = row.lookups?.[field]
          return name === 'title' ? lookup?.title : lookup?.fields[name]
        })
        if (target?.fields[name]?.type === 'date') column.text = (row) => (scalar(column.value(row)) === '' ? '' : formatDay(scalar(column.value(row))))
        return column
      }),
  )
}

function rollupColumns(view: View): Column[] {
  return Object.entries(view.rollups ?? {}).map(([key, rollup]) =>
    base(`rollups.${key}`, 'rollup', rollup.label ?? humanise(key), (row) => {
      const value = row.rollups?.[key]
      return Array.isArray(value) ? value.length : value
    }),
  )
}

export function columnsFor(model: Model, view: View, writable = true, models: Record<string, Model> = {}): Column[] {
  const shown = (view.columns ?? Object.keys(model.fields)).filter((key) => key !== 'title' && key in model.fields)
  return [
    titleColumn(model, writable),
    ...shown.map((key) => fieldColumn(key, model.fields[key], writable)),
    ...lookupColumns(model, view, shown, models),
    ...rollupColumns(view),
  ]
}

const clock = (stored: string): string => MOMENT.exec(stored)?.slice(4, 6).join(':') ?? ''

/** A moment's end: the datetime field declared right after it, when the view does not show that one itself. */
function endOf(column: Column, model: Model, shown: string[]): string | null {
  const keys = Object.keys(model.fields)
  const next = keys[keys.indexOf(column.id) + 1]
  return next && model.fields[next]?.type === 'datetime' && !shown.includes(next) ? next : null
}

/**
 * Grouped by a day, a moment on its row's day reads as its time, with the end of its range after it:
 * "13:00–14:00". A moment on another day keeps its date. An empty one says what the view's facts call it.
 */
export function inDays(columns: Column[], model: Model, day: string, facts: GroupFact[] = [], shown: string[] = columns.map((c) => c.id)): Column[] {
  return columns.map((column) => {
    if (column.kind !== 'datetime') return column
    const end = endOf(column, model, shown)
    const blank = facts.find((fact) => fact.kind === 'empty' && fact.column === column.id)?.label
    const range = (row: Row) => {
      const stored = scalar(row.fields[column.id])
      if (!MOMENT.test(stored)) return null
      const start = stored.slice(0, 10) === scalar(row.fields[day]) ? clock(stored) : formatMoment(stored)
      const until = end ? clock(scalar(row.fields[end])) : ''
      return { start, end: until === '' ? '' : `–${until}` }
    }
    return {
      ...column,
      label: end ? t('time') : column.label,
      range,
      text: (row) => {
        const found = range(row)
        return found ? found.start + found.end : column.text(row)
      },
      ...(blank ? { blank } : {}),
    }
  })
}
