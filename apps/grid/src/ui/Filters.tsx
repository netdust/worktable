import { ListFilter, X } from 'lucide-react'
import { Fragment, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { complete, type Filter, isDate, type Join, joinOf } from '../grid/conditions'
import type { FilterField } from '../grid/filter'
import { t } from '../i18n'
import { FilterBuilder } from './FilterBuilder'

const EDGE = 16

interface Props {
  fields: FilterField[]
  filters: Filter[]
  join?: Join
  onChange: (filters: Filter[]) => void
  onJoin: (join: Join) => void
  /** Fields whose related names are still being read: their chips wait, never showing an id. */
  waiting?: string[]
}

/** A condition in words: "Status is Optie of Bevestigd", "Plandag deze week". */
export function said(condition: Filter, field: FilterField | undefined): string {
  const label = field?.label ?? condition.field
  const name = (value: string) => field?.options.find(([key]) => key === value)?.[1] ?? (field?.relation ? `#${value}` : value)
  switch (condition.op) {
    case 'in':
      return `${label} ${t('op.choice.in')} ${condition.values.map(name).join(` ${t('or')} `)}`
    case 'nin':
      return `${label} ${t('op.choice.nin')} ${condition.values.map(name).join(` ${t('or')} `)}`
    case 'empty':
    case 'filled':
      return `${label} ${t(`op.choice.${condition.op}`)}`
    case 'like':
    case 'nlike':
    case 'eq':
      return `${label} ${t(`op.text.${condition.op}`)} “${condition.values[0]}”`
    case 'between':
      return `${label} ${t('betweenDays', { from: condition.values[0] ?? '', to: condition.values[1] ?? '' })}`
    default:
      return `${label} ${t(`period.${condition.op}`)}`
  }
}

/** The conditions as chips, each with its ×, and the Filter button that opens the builder. */
export function Filters({ fields, filters, join, onChange, onJoin, waiting = [] }: Props) {
  const fieldOf = (name: string) => fields.find((f) => f.field === name)
  const shown = filters.filter(complete)
  // Periods first: they always narrow. The rest are joined, and with "of" each after the first says so.
  const chips = [...shown.filter((c) => isDate(c.op)), ...shown.filter((c) => !isDate(c.op))].filter((c) => !waiting.includes(c.field))
  const any = joinOf(filters, join) === 'or'
  const [open, setOpen] = useState(false)
  const root = useRef<HTMLDivElement>(null)
  const panel = useRef<HTMLDivElement>(null)
  const [shift, setShift] = useState(0)
  // The panel opens under its button and moves left as far as it must to stay on screen.
  useLayoutEffect(() => {
    if (!open || !panel.current || !root.current) return
    const left = root.current.getBoundingClientRect().left
    const over = left + panel.current.offsetWidth - (window.innerWidth - EDGE)
    setShift(over > 0 ? Math.max(-over, EDGE - left) : 0)
  }, [open, filters.length])
  useEffect(() => {
    if (!open) return
    const away = (event: MouseEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false)
    }
    const escape = (event: KeyboardEvent) => event.key === 'Escape' && setOpen(false)
    document.addEventListener('mousedown', away)
    document.addEventListener('keydown', escape)
    return () => {
      document.removeEventListener('mousedown', away)
      document.removeEventListener('keydown', escape)
    }
  }, [open])
  return (
    <div className="nv-filters">
      {chips.map((condition, at) => {
        const label = fieldOf(condition.field)?.label ?? condition.field
        const joinWord = any && at > 0 && !isDate(condition.op) && !isDate((chips[at - 1] as Filter).op)
        return (
          <Fragment key={`${condition.field}:${condition.op}`}>
          {joinWord && <span className="nv-chip-join">{t('filterOr').toLocaleLowerCase()}</span>}
          <span className="nv-chip nv-chip--set nv-chip--filter">
            {said(condition, fieldOf(condition.field))}
            <button type="button" className="nv-chip__remove" aria-label={t('removeFilter', { field: label })} title={t('removeFilter', { field: label })}
              onClick={() => onChange(filters.filter((f) => f !== condition))}>
              <X size={12} aria-hidden="true" />
            </button>
          </span>
          </Fragment>
        )
      })}
      {fields.length > 0 && (
        <div className="nv-fb-anchor" ref={root}>
          <button type="button" className="nv-chip nv-chip--add" aria-expanded={open} onClick={() => setOpen(!open)}>
            <ListFilter size={13} aria-hidden="true" />{t('addFilter')}
            {shown.length > 0 && <span className="nv-chip__count">{shown.length}</span>}
          </button>
          {open && <div className="nv-fb-panel" ref={panel} style={{ left: shift }}><FilterBuilder fields={fields} filters={filters} join={join} onChange={onChange} onJoin={onJoin} /></div>}
        </div>
      )}
    </div>
  )
}
