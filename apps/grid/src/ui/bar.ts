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
  /** The skin's own chips: a gallery's S M L, a matrix's Afwezigheden. */
  skin?: ReactNode
}

const labelOf = (model: Model, key: string | null | undefined) => (key ? (model.fields[key]?.label ?? key) : null)

/** Groep from the data, never the skin: a board's option column, a calendar's lanes, a gallery's none, else any field a sheet can group on. */
function groupOf({ view, model, layout, onLayout }: BarInput): GroupSlot {
  const choose = (key: string | null) => onLayout(group(layout, key))
  const of = (types: string[]) => Object.entries(model.fields).filter(([, f]) => types.includes(f.type)).map(([key, f]) => ({ key, label: f.label }))
  if (view.type === 'board') {
    // A board's columns are an option field's: the one chosen, else the one its table declares.
    const by = boardColumn(view, model, layout)
    return { label: labelOf(model, by), value: by, options: of(['select']), onChange: choose }
  }
  if (view.type === 'gallery') return { label: labelOf(model, layout.group), value: layout.group, options: [{ key: null, label: t('none') }, ...of(['date', 'select'])], onChange: choose }
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

/** The option field a board's columns follow: the layout's choice where it is one, else the declared column. */
export function boardColumn(view: View, model: Model, layout: Layout): string | null {
  if (layout.group && model.fields[layout.group]?.type === 'select') return layout.group
  return view.board?.column ?? null
}

/** The chip row's slots for a view: the same order everywhere, each slot there where the view's data has it. */
export function barOf(input: BarInput): ChipBarProps {
  const { view, layout, onLayout, told } = input
  return {
    scope: input.scope,
    filters: input.filters,
    group: groupOf(input),
    ...(input.period ? { period: input.period } : {}),
    ...(input.skin ? { skin: input.skin } : {}),
    ...(input.adding ? { addColumn: input.adding } : {}),
    ...(told ? { count: { rows: told.rows, cut: told.cut } } : {}),
    // Kolommen wherever the skin shows record fields, the matrix aside: its columns are people.
    ...(view.type !== 'matrix' && told?.menu ? { columns: { list: told.menu, layout, onLayout } } : {}),
  }
}
