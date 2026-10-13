import type { ReactNode } from 'react'
import { group, type Layout } from '../grid/layout'
import { t } from '../i18n'
import type { Model, View } from '../types'
import type { ChipBarProps, GroupSlot, PeriodSlot } from './ChipBar'
import type { Shown } from './Toolbar'

const GROUPABLE = ['date', 'select', 'relation']

export interface BarInput {
  view: View
  model: Model
  layout: Layout
  onLayout: (layout: Layout) => void
  scope: string | null
  filters?: ReactNode
  /** What the open view told the title line: its rows and, for a sheet, its columns. */
  told: Shown | null
  /** The view's period on its dated column, where it has one. */
  period: PeriodSlot | null
  /** "+ Kolom" on a view that takes columns by hand. */
  adding?: { open: boolean; onToggle: () => void }
}

const labelOf = (model: Model, key: string | null | undefined) => (key ? (model.fields[key]?.label ?? key) : null)

/** Groep from the data, never the skin: a board's option column, a calendar's lanes, a gallery's none, else any field a sheet can group on. */
function groupOf({ view, model, layout, onLayout }: BarInput): GroupSlot {
  const choose = (key: string | null) => onLayout(group(layout, key))
  if (view.type === 'board' && view.board) return { label: labelOf(model, view.board.column) }
  if (view.type === 'gallery') return { label: null }
  if (view.calendar && (view.type === 'calendar' || view.type === 'timeline')) {
    // A calendar lanes by what it declares; a need that declares none offers the first relation.
    const declared = view.calendar.lanes.length > 0 ? view.calendar.lanes : Object.keys(model.fields).filter((k) => model.fields[k].type === 'relation').slice(0, 1)
    const options = [...declared.map((key) => ({ key, label: labelOf(model, key) ?? key })), { key: null, label: t('noLane') }]
    return { label: labelOf(model, layout.group), value: layout.group, options, onChange: choose }
  }
  const options = [{ key: null, label: t('none') }, ...Object.entries(model.fields).filter(([, f]) => GROUPABLE.includes(f.type)).map(([key, f]) => ({ key, label: f.label }))]
  // A matrix sections by its date column until the layout groups otherwise.
  const by = view.type === 'matrix' ? (layout.group ?? view.date_field ?? null) : layout.group
  return { label: labelOf(model, by), value: layout.group, options, onChange: choose }
}

/** The chip row's slots for a view: the same order everywhere, each slot there where the view's data has it. */
export function barOf(input: BarInput): ChipBarProps {
  const { view, layout, onLayout, told } = input
  return {
    scope: input.scope,
    filters: input.filters,
    group: groupOf(input),
    ...(input.period ? { period: input.period } : {}),
    ...(input.adding ? { addColumn: input.adding } : {}),
    ...(told ? { count: { rows: told.rows, cut: told.cut } } : {}),
    ...((view.type ?? 'grid') === 'grid' && told?.menu ? { columns: { list: told.menu, layout, onLayout } } : {}),
  }
}
