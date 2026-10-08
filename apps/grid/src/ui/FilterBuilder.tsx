import { Calendar, CalendarClock, CalendarDays, CircleChevronDown, Link2, type LucideIcon, Plus, SquareCheck, Trash2, Type, X } from 'lucide-react'
import { type KeyboardEvent, type ReactNode, useContext, useEffect, useRef, useState } from 'react'
import { UNSAFE_PortalProvider, useInteractOutside } from 'react-aria'
import { Button, DatePicker, Dialog, Group, OverlayTriggerStateContext, Popover } from 'react-aria-components'
import { Month, Segments } from '../grid/cells/Date'
import { fromDate, toDate } from '../grid/cells/dates'
import { type Filter, isDate, type Join, type Kind, type Op, put } from '../grid/conditions'
import type { FilterField } from '../grid/filter'
import { records } from '../api'
import { t } from '../i18n'
import { Pick } from './Pick'

/** The operators a field of each kind takes, in the order the builder offers them. */
export const OPERATORS: Record<Kind, Op[]> = {
  choice: ['in', 'nin', 'empty', 'filled'],
  text: ['like', 'nlike', 'eq', 'empty'],
  date: ['week', 'next_week', 'month', 'between'],
  datetime: ['week', 'next_week', 'month', 'between'],
  bool: ['in'],
}

const OPTIONS_SHOWN = 6

/** A yes/no starts at "ja", as its select shows; anything else starts empty. */
const startOf = (field: FilterField): string[] => (field.kind === 'bool' ? ['1'] : [])

/** The rows in their order on screen: periods first, then the rest; `joined` counts the rows the join holds over, -1 for a period. */
function rowsOf(filters: Filter[]): { condition: Filter; at: number; joined: number }[] {
  const all = filters.map((condition, at) => ({ condition, at }))
  const periods = all.filter(({ condition }) => isDate(condition.op)).map((row) => ({ ...row, joined: -1 }))
  const rest = all.filter(({ condition }) => !isDate(condition.op)).map((row, joined) => ({ ...row, joined }))
  return [...periods, ...rest]
}

/** What a field is, at a glance: its kind's icon, a relation's own. */
const iconOf = (field: FilterField): LucideIcon =>
  field.relation ? Link2 : { text: Type, choice: CircleChevronDown, date: Calendar, datetime: CalendarClock, bool: SquareCheck }[field.kind]

interface Props {
  fields: FilterField[]
  filters: Filter[]
  join?: Join
  onChange: (filters: Filter[]) => void
  onJoin: (join: Join) => void
}

/** Rows of field · operator · value: a period first, always narrowing, then the rest under one join; a value of a choice is searched as one types. */
export function FilterBuilder({ fields, filters, join = 'and', onChange, onJoin }: Props) {
  const fieldOf = (name: string) => fields.find((f) => f.field === name)
  const kindOf = (name: string): Kind => fieldOf(name)?.kind ?? 'text'
  // A change at one row: a condition that clashes with it (same engine key, or a second date condition) leaves.
  const setAt = (at: number, next: Filter) => {
    const kept = put(filters.filter((_, i) => i !== at), next, kindOf).filter((f) => f !== next)
    onChange([...kept.slice(0, at), next, ...kept.slice(at)])
  }
  const add = () => {
    const field = fields.find((f) => !filters.some((c) => c.field === f.field)) ?? fields[0]
    if (field) onChange([...filters, { field: field.field, op: OPERATORS[field.kind][0] as Op, values: startOf(field) }])
  }

  return (
    <div className="nv-fb">
      {rowsOf(filters).map(({ condition, at, joined }, shown) => {
        const field = fieldOf(condition.field)
        const kind = kindOf(condition.field)
        return (
          // biome-ignore lint/suspicious/noArrayIndexKey: a row is its position; two rows may hold the same field.
          <div key={at} className="nv-fb__row" role="group" aria-label={t('filterRow', { n: String(shown + 1) })}>
            {joined === 1
              ? <Pick label={t('filterJoin')} value={join} className="nv-fb__join"
                  options={[{ value: 'and', label: t('filterAnd') }, { value: 'or', label: t('filterOr') }]} onChange={(next) => onJoin(next as Join)} />
              : <span className="nv-fb__join">{shown === 0 ? t('filterWhereWord') : joined > 1 && join === 'or' ? t('filterOr') : t('filterAnd')}</span>}
            <Pick label={t('filterField')} value={condition.field} searchable className="nv-fb__field"
              options={fields.map((f) => ({ value: f.field, label: f.label, icon: iconOf(f) }))}
              onChange={(name) => {
                const next = fieldOf(name)
                if (next) setAt(at, { field: next.field, op: OPERATORS[next.kind][0] as Op, values: startOf(next) })
              }} />
            <Pick label={t('filterOperator')} value={condition.op} className="nv-fb__op"
              options={OPERATORS[kind].map((op) => ({ value: op, label: t(opWord(kind, op)) }))}
              onChange={(next) => {
                const op = next as Op
                const keep = isDate(op) === isDate(condition.op) && op !== 'between' && condition.op !== 'between'
                setAt(at, { ...condition, op, values: keep && valued(op) ? condition.values : [] })
              }} />
            {field && <Value field={field} condition={condition} onChange={(values) => setAt(at, { ...condition, values })} />}
            <button type="button" className="nv-fb__remove" aria-label={t('filterRemove')} title={t('filterRemove')}
              onClick={() => onChange(filters.filter((_, i) => i !== at))}>
              <Trash2 size={14} aria-hidden="true" />
            </button>
          </div>
        )
      })}
      <button type="button" className="nv-fb__add" onClick={add}><Plus size={14} aria-hidden="true" />{t('filterAdd')}</button>
    </div>
  )
}

/** The word of an operator: a datetime speaks as a date. */
export const opWord = (kind: Kind, op: Op) => `op.${kind === 'datetime' ? 'date' : kind}.${op}` as Parameters<typeof t>[0]

const valued = (op: Op): boolean => !['empty', 'filled', 'week', 'next_week', 'month'].includes(op)

function Value({ field, condition, onChange }: { field: FilterField; condition: Filter; onChange: (values: string[]) => void }) {
  if (!valued(condition.op)) return <span className="nv-fb__value" />
  if (condition.op === 'between') {
    const [from = '', to = ''] = condition.values
    return (
      <Between>
        <Day label={t('fromDay')} value={from} onChange={(next) => onChange([next, to])} />
        <Day label={t('toDay')} value={to} onChange={(next) => onChange([from, next])} />
      </Between>
    )
  }
  if (field.kind === 'text') {
    return <input type="text" className="nv-fb__text" aria-label={field.label} placeholder={t('filterValue')} value={condition.values[0] ?? ''} onChange={(event) => onChange([event.target.value])} />
  }
  if (field.kind === 'bool') {
    return (
      <select className="nv-fb__text" aria-label={field.label} value={condition.values[0] ?? '1'} onChange={(event) => onChange([event.target.value])}>
        {field.options.map(([value, word]) => <option key={value} value={value}>{word}</option>)}
      </select>
    )
  }
  return field.relation
    ? <Related field={field} values={condition.values} onChange={onChange} />
    : <Choices field={field} values={condition.values} onChange={onChange} />
}

/** The range's calendars open inside it, so the builder counts a press on them as its own. */
function Between({ children }: { children: ReactNode }) {
  const root = useRef<HTMLSpanElement>(null)
  return (
    <span className="nv-fb__value nv-fb__between" ref={root}>
      <UNSAFE_PortalProvider getContainer={() => root.current}>{children}</UNSAFE_PortalProvider>
    </span>
  )
}

/** One end of a range: typed in Dutch segments or picked on a calendar, drafted as YYYY-MM-DD. */
function Day({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return (
    <DatePicker aria-label={label} className="nv-fb__date" value={toDate(value)} onChange={(day) => onChange(fromDate(day))} shouldForceLeadingZeros>
      <Group className="nv-datefield__group">
        <Segments />
        <Button className="nv-datefield__open"><CalendarDays size={14} aria-hidden="true" /></Button>
      </Group>
      <Popover isNonModal className="nv-pop" placement="bottom start" offset={4}>
        <Days />
      </Popover>
    </DatePicker>
  )
}

/** Non-modal, as the native picker was, so the page stays live: a press outside the calendar closes it and still reaches its target. */
function Days() {
  const state = useContext(OverlayTriggerStateContext)
  const box = useRef<HTMLElement>(null)
  useInteractOutside({ ref: box, onInteractOutside: () => state?.close() })
  return <Dialog ref={box} className="nv-calendar__dialog"><Month /></Dialog>
}

/** The chosen values, each with its ×, and a search after them; the list below holds only what is not chosen. */
function Choices({ field, values, onChange }: { field: FilterField; values: string[]; onChange: (values: string[]) => void }) {
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const root = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const away = (event: MouseEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', away)
    return () => document.removeEventListener('mousedown', away)
  }, [open])
  const name = (value: string) => field.options.find(([key]) => key === value)?.[1] ?? value
  const wanted = query.trim().toLocaleLowerCase()
  const free = field.options.filter(([key, word]) => !values.includes(key) && word.toLocaleLowerCase().includes(wanted))
  const keys = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Backspace' && query === '' && values.length > 0) onChange(values.slice(0, -1))
    // Escape closes the list only, not the builder it sits in.
    if (event.key === 'Escape' && open) {
      event.stopPropagation()
      setOpen(false)
    }
  }
  return (
    <div className="nv-fb__value" ref={root}>
      <div className="nv-fb__box">
        <Chosen values={values} name={name} onRemove={(value) => onChange(values.filter((v) => v !== value))} />
        <input type="search" aria-label={t('filterSearch', { field: field.label })} placeholder={values.length ? '' : t('filterSearchHint')}
          value={query} onFocus={() => setOpen(true)} onChange={(event) => {
            setQuery(event.target.value)
            setOpen(true)
          }} onKeyDown={keys} />
      </div>
      {open && <div className="nv-fb__menu">
      <ul className="nv-fb__list" role="listbox" aria-label={field.label}>
        {free.slice(0, OPTIONS_SHOWN).map(([key, word]) => (
          <li key={key} role="option" aria-selected="false" tabIndex={-1} onClick={() => {
            onChange([...values, key])
            setQuery('')
          }} onKeyDown={(event) => event.key === 'Enter' && onChange([...values, key])}>{word}</li>
        ))}
      </ul>
      {free.length > OPTIONS_SHOWN && <p className="nv-fb__note">{t('filterMore', { n: String(free.length - OPTIONS_SHOWN) })}</p>}
      {free.length === 0 && <p className="nv-fb__note">{t('filterNoOther')}</p>}
      </div>}
    </div>
  )
}

/** A relation's values are its target's records, read once, then searched like a choice's. */
function Related({ field, values, onChange }: { field: FilterField; values: string[]; onChange: (values: string[]) => void }) {
  const [options, setOptions] = useState(field.options)
  useEffect(() => {
    let live = true
    records(field.relation as string, '').then(
      (found) => live && setOptions(found.rows.map((row) => [String(row.id), row.title])),
      () => undefined,
    )
    return () => {
      live = false
    }
  }, [field.relation])
  return <Choices field={{ ...field, options }} values={values} onChange={onChange} />
}

function Chosen({ values, name, onRemove }: { values: string[]; name: (value: string) => string; onRemove: (value: string) => void }) {
  return (
    <ul className="nv-chosen">
      {values.map((value) => (
        <li key={value} className="nv-pill nv-pill--sky" aria-label={name(value)}>
          {name(value)}
          <button type="button" className="nv-chosen__remove" aria-label={t('removeItem', { name: name(value) })} title={t('removeItem', { name: name(value) })} onClick={() => onRemove(value)}>
            <X size={11} aria-hidden="true" />
          </button>
        </li>
      ))}
    </ul>
  )
}
