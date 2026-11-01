import { type ReactNode, useEffect, useMemo, useRef, useState } from 'react'
import type { Model, Row, View } from '../types'
import type { Flags } from '../ui/useFlags'
import type { Layout } from './layout'
import { columnsFor } from './columns'
import type { Places } from './drawer/place'
import { Drawer } from './Drawer'
import { useReread } from './drawerWrite'

/** A read-only skin's open row: what it opens on a click, and the drawer that shows it beside the skin, stepping through `rows`; `places` chooses who holds a place. */
export function useOpenRow(model: Model, view: View, models: Record<string, Model>, rows: Row[] = [], layout: Layout | null = null, flags: Flags | null = null, places?: Places): [(row: Row) => void, ReactNode, Row | null] {
  const [open, setOpen] = useState<Row | null>(null)
  const opener = useRef<HTMLElement | null>(null)
  const reread = useReread()
  // The skin keeps the focus on what opened the drawer, so Escape there closes it; closing gives the focus back to it.
  const openRow = (row: Row) => {
    opener.current = document.activeElement instanceof HTMLElement ? document.activeElement : null
    setOpen(row)
  }
  const close = () => {
    setOpen(null)
    if (opener.current?.isConnected) opener.current.focus()
  }
  useEffect(() => {
    if (!open) return
    const onKey = (event: KeyboardEvent) => {
      const target = event.target
      const apart = target instanceof Element && target.closest('.nv-drawer, [role="dialog"], [role="menu"], [role="listbox"], [aria-expanded="true"], input, textarea, select')
      if (event.key === 'Escape' && !event.defaultPrevented && !apart && !document.querySelector('.nv-board__card--lifted')) close()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open])
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
  const drawer = current ? <Drawer row={current} columns={columns} focusOnOpen={false} onClose={close} model={model} view={view} layout={layout} nav={nav} flags={flags} onLink={places?.(model.key, current.id)} onDone={reread(model.key, current.id, undefined, () => setOpen((now) => (now?.id === current.id ? null : now)))}
    attachments={model.attachments ? { ...model.attachments, dataset: model.key } : undefined} /> : null
  return [openRow, drawer, current]
}
