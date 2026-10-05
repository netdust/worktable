import { locale, t } from '../i18n'
import type { Field, Model, Row, View } from '../types'

export type CellKind =
  | 'title' | 'text' | 'longtext' | 'select' | 'date' | 'time' | 'relation' | 'bool' | 'number'
  | 'lookup' | 'rollup' | 'other'

export interface Column {
  /** `title`, a field key, `lookups.<field>.<name>` or `rollups.<key>`. */
  id: string
  /** The key a write carries; null for what only the server computes. */
  field: string | null
  label: string
  kind: CellKind
  editable: boolean
  required: boolean
  align: 'start' | 'end'
  width: number
  options?: Record<string, string>
  /** A relation's target model; single relations are picked in the cell. */
  relation?: { model: string; multiple: boolean }
  value: (row: Row) => unknown
  /** What the cell shows, copy takes and search reads. */
  text: (row: Row) => string
  /** What an editor opens with. */
  edit: (row: Row) => string
  /** What a write sends for what was typed. */
  parse: (draft: string) => unknown
  /** What a write sends for what was pasted: the shown text read back. */
  fromText: (text: string) => unknown
}

const WIDTH: Record<CellKind, number> = {
  title: 240, text: 160, longtext: 220, select: 130, date: 108, time: 76, relation: 170,
  bool: 80, number: 90, lookup: 170, rollup: 90, other: 140,
}

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
    case 'relation':
    case 'bool':
      return field.type
    case 'int':
    case 'float':
      return 'number'
    default:
      return 'other'
  }
}

const EDITABLE: CellKind[] = ['title', 'text', 'longtext', 'select', 'date', 'time', 'bool', 'number']

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
  column.relation = field.relation

  if (kind === 'select') {
    column.text = (row) => field.options?.[scalar(row.fields[key])] ?? scalar(row.fields[key])
    column.fromText = (text) => optionFromText(field.options ?? {}, text)
  }
  if (kind === 'date') {
    column.text = (row) => (scalar(row.fields[key]) === '' ? '' : formatDay(scalar(row.fields[key])))
    column.fromText = dayFromText
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
  if (kind === 'other') column.text = (row) => (Array.isArray(row.fields[key]) ? String((row.fields[key] as unknown[]).length) : scalar(row.fields[key]))

  return column
}

function titleColumn(model: Model, writable: boolean): Column {
  const column = base('title', 'title', model.title_label, (row) => row.title)
  column.field = 'title'
  column.required = true
  column.editable = writable && !model.title_readonly
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
