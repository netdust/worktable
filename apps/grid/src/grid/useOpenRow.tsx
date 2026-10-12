import { type ReactNode, useMemo, useState } from 'react'
import type { Model, Row, View } from '../types'
import { columnsFor } from './columns'
import { Drawer } from './Drawer'

/** A read-only skin's open row: what it opens on a click, and the drawer that shows it beside the skin. */
export function useOpenRow(model: Model, view: View, models: Record<string, Model>): [(row: Row) => void, ReactNode] {
  const [open, setOpen] = useState<Row | null>(null)
  const columns = useMemo(
    () => columnsFor(model, { ...view, columns: undefined, lookups: undefined, rollups: undefined }, false, models),
    [model, view, models],
  )
  const drawer = open ? <Drawer row={open} columns={columns} focusOnOpen={false} onClose={() => setOpen(null)} /> : null
  return [setOpen, drawer]
}
