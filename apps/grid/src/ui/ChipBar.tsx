import { Check, ChevronLeft, ChevronRight, Columns3, Rows2, Tag } from 'lucide-react'
import { type ReactNode, useContext, useRef } from 'react'
import { useInteractOutside } from 'react-aria'
import { Button, Checkbox, CheckboxGroup, Dialog, DialogTrigger, OverlayTriggerStateContext, Popover } from 'react-aria-components'
import type { Column } from '../grid/columns'
import { hide, type Layout, orderOf, reorder, show } from '../grid/layout'
import { rowCount, t } from '../i18n'
import type { Filter } from '../grid/conditions'
import { hint } from './hint'
import { type Period, pressMonth, pressWeek, stepPeriod, todayPeriod } from './period'

/** What a view groups on: the field's label, or none; with options the chip opens a list to choose from. */
export interface GroupSlot {
  label: string | null
  value?: string | null
  options?: { key: string | null; label: string }[]
  onChange?: (key: string | null) => void
}

/** The view's period on its dated column, and how to set it: a condition, or none for every date. */
export interface PeriodSlot {
  period: Period
  onPeriod: (next: Filter | null) => void
}

export interface ChipBarProps {
  /** The space's chip ("Productie is Nachtwacht"); null where the view is not narrowed. */
  scope?: string | null
  /** The view's condition chips and the Filter button. */
  filters?: ReactNode
  group?: GroupSlot
  period?: PeriodSlot
  /** The skin's own chips, after the period: a gallery's S M L, a matrix's Afwezigheden. */
  skin?: ReactNode
  /** "+ Kolom": a column added by hand, where the view takes one. */
  addColumn?: { open: boolean; onToggle: () => void }
  /** A dashboard's quick actions, where the period would sit. */
  actions?: ReactNode
  count?: { rows: number; cut: boolean; text?: string }
  /** Kolommen: show, hide and move the view's columns. */
  columns?: { list: Column[]; layout: Layout; onLayout: (layout: Layout) => void }
  /** What closes the row on a page that is no view of rows: a dashboard's Bewerken. */
  end?: ReactNode
}

const ICON = 13

/** A panel under its trigger, non-modal: the page keeps scrolling, and a press outside closes it and still reaches its target. */
function Panel({ trigger, placement, label, children }: { trigger: ReactNode; placement: 'bottom start' | 'bottom end'; label: string; children: ReactNode }) {
  return (
    <DialogTrigger>
      {trigger}
      <Popover isNonModal className="nv-bar__panel" placement={placement} offset={8}>
        <PanelBody label={label}>{children}</PanelBody>
      </Popover>
    </DialogTrigger>
  )
}

function PanelBody({ label, children }: { label: string; children: ReactNode }) {
  const state = useContext(OverlayTriggerStateContext)
  const body = useRef<HTMLElement>(null)
  useInteractOutside({ ref: body, onInteractOutside: () => state?.close() })
  return <Dialog ref={body} className="nv-bar__dialog" aria-label={label}>{children}</Dialog>
}

function GroupChip({ group }: { group: GroupSlot }) {
  const word = group.label ? t('groupOn', { field: group.label.toLocaleLowerCase() }) : t('groupOn', { field: t('none').toLocaleLowerCase() })
  const chip = <><Rows2 size={ICON} aria-hidden="true" />{word}</>
  const set = group.label ? 'nv-chip nv-chip--set' : 'nv-chip'
  if (!group.options || !group.onChange) return <span className={set}>{chip}</span>
  const choose = group.onChange
  return (
    <Panel placement="bottom start" label={t('groupBy')} trigger={<Button className={set}>{chip}</Button>}>
      <div className="nv-filters__menu" role="group" aria-label={t('groupBy')}>
        {group.options.map(({ key, label }) => (
          <button key={key ?? ''} type="button" className="nv-filters__option" aria-pressed={(group.value ?? null) === key} onClick={() => choose(key)}>
            {label}
          </button>
        ))}
      </div>
    </Panel>
  )
}

/** Vandaag, the steps and Maand Week: the same on every skin; a lit chip pressed again clears where the skin can show every date. */
function PeriodChips({ period: { period, onPeriod } }: { period: PeriodSlot }) {
  const today = new Date()
  const set = (next: Filter | null) => next !== period.condition && onPeriod(next)
  return (
    <>
      <button type="button" className="nv-chip" onClick={() => set(todayPeriod(period))}>{t('today')}</button>
      <button type="button" className="nv-chip nv-chip--icon" aria-label={t('previousPeriod')} title={t('previousPeriod')} disabled={!period.window} onClick={() => set(stepPeriod(period, -1))}><ChevronLeft size={14} aria-hidden="true" /></button>
      <button type="button" className="nv-chip nv-chip--icon" aria-label={t('nextPeriod')} title={t('nextPeriod')} disabled={!period.window} onClick={() => set(stepPeriod(period, 1))}><ChevronRight size={14} aria-hidden="true" /></button>
      <span className="nv-chips" role="radiogroup" aria-label={t('period')}>
        <button type="button" role="radio" aria-checked={period.kind === 'month'} className="nv-chip" data-selected={period.kind === 'month' || undefined} onClick={() => set(pressMonth(period, today))}>{t('month')}</button>
        <button type="button" role="radio" aria-checked={period.kind === 'week'} className="nv-chip" data-selected={period.kind === 'week' || undefined} onClick={() => set(pressWeek(period, today))}>{t('week')}</button>
      </span>
    </>
  )
}

/** The one chip row every view shows, in one order: scope, conditions, Filter, Groep, period, + Kolom; the count and Kolommen at the end. A slot shows where the view's data has it. */
export function ChipBar({ scope = null, filters, group, period, skin, addColumn, actions, count, columns, end }: ChipBarProps) {
  return (
    <div className="nv-bar">
      {scope && <span className="nv-chip nv-chip--set nv-chip--scope"><Tag size={ICON} aria-hidden="true" />{scope}</span>}
      {filters}
      {group && <GroupChip group={group} />}
      {period && <PeriodChips period={period} />}
      {skin}
      {actions}
      {addColumn && <button type="button" className="nv-chip" aria-expanded={addColumn.open} onClick={addColumn.onToggle}>{t('addColumn')}</button>}
      {(count || columns || end) && (
        <span className="nv-bar__end">
          {count && <span className="nv-bar__count">{count.text ?? rowCount(count.rows, count.cut)}</span>}
          {columns && (
            <Panel placement="bottom end" label={t('columns')} trigger={
              <Button ref={hint(t('columns'))} className="nv-bar__icon" aria-label={t('columns')}><Columns3 size={ICON + 1} aria-hidden="true" /></Button>
            }>
              <ColumnsMenu columns={columns.list} layout={columns.layout} onLayout={columns.onLayout} />
            </Panel>
          )}
          {end}
        </span>
      )}
    </div>
  )
}

/** Show, hide and move each column; the title moves, and always shows. */
function ColumnsMenu({ columns, layout, onLayout }: { columns: Column[]; layout: Layout; onLayout: (layout: Layout) => void }) {
  const ids = columns.map((c) => c.id)
  const stored = orderOf(layout, ids)
  const order = layout.order.includes('title') ? stored : ['title', ...stored.filter((id) => id !== 'title')]
  const byId = new Map(columns.map((c) => [c.id, c]))
  const move = (id: string, to: number) => onLayout(reorder({ ...layout, order }, id, to, ids))

  const shown = order.filter((id) => !layout.hidden.includes(id))
  const toggle = (next: string[]) => {
    const changed = order.find((id) => next.includes(id) !== shown.includes(id))
    if (changed) onLayout(next.includes(changed) ? show(layout, changed) : hide(layout, changed))
  }

  return (
    <CheckboxGroup className="nv-bar__columns" aria-label={t('columns')} value={shown} onChange={toggle}>
      {order.map((id, at) => {
        const c = byId.get(id)!
        return (
          <div key={id} className="nv-bar__column">
            <Checkbox value={id} isDisabled={id === 'title'} className="nv-check">
              <span className="nv-check__box" aria-hidden="true"><Check size={12} strokeWidth={3} /></span>
              {c.label}
            </Checkbox>
            <button type="button" className="nv-bar__move" aria-label={`${c.label}: ${t('moveLeft').toLowerCase()}`}
              disabled={at === 0} onClick={() => move(id, at - 1)}>
              {t('moveLeft')}
            </button>
            <button type="button" className="nv-bar__move" aria-label={`${c.label}: ${t('moveRight').toLowerCase()}`}
              disabled={at === order.length - 1} onClick={() => move(id, at + 1)}>
              {t('moveRight')}
            </button>
          </div>
        )
      })}
    </CheckboxGroup>
  )
}
