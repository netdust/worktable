import { type ReactNode, useMemo, useState } from 'react'
import type { Model, Row, View } from '../types'
import type { Layout } from './layout'
import { columnsFor } from './columns'
import { Drawer } from './Drawer'

/** A read-only skin's open row: what it opens on a click, and the drawer that shows it beside the skin, stepping through `rows`. */
export function useOpenRow(model: Model, view: View, models: Record<string, Model>, rows: Row[] = [], layout: Layout | null = null): [(row: Row) => void, ReactNode, Row | null] {
  const [open, setOpen] = useState<Row | null>(null)
  const columns = useMemo(
    () => columnsFor(model, { ...view, columns: undefined, lookups: undefined, rollups: undefined }, false, models),
    [model, view, models],
  )
  const nav = {
    ids: rows.map((row) => row.id),
    onStep: (id: number) => setOpen(rows.find((row) => row.id === id) ?? null),
  }
  // The row as the skin now holds it: a drop or an undo repaints the drawer too.
  const current = open ? (rows.find((row) => row.id === open.id) ?? open) : null
  const drawer = current ? <Drawer row={current} columns={columns} focusOnOpen={false} onClose={() => setOpen(null)} model={model} view={view} layout={layout} nav={nav}
    attachments={model.attachments ? { ...model.attachments, dataset: model.key } : undefined} /> : null
  return [setOpen, drawer, current]
}
