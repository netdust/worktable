import { type MouseEvent, type MutableRefObject, type PointerEvent, useEffect, useRef, useState } from 'react'
import { type Edge, moved } from './views'

/** How far the pointer travels before a press becomes a drag: a click stays a click. */
const THRESHOLD = 5

export interface Drop {
  key: string
  edge: Edge
}

/**
 * Rows ordered by dragging them with the pointer (Folio's line, not moving items): past a few pixels a
 * line shows at the edge the row lands on, decided by the pointer against each row's midpoint; letting
 * go hands the new order over; Escape cancels. `rows` holds each row's element by key. A row moves only
 * among `keysOf` its own key, in their order: a drop past them lands at their edge.
 */
export function useDragOrder(keysOf: (key: string) => string[], rows: MutableRefObject<Map<string, HTMLElement>>, onOrder: (keys: string[]) => void) {
  const [dragging, setDragging] = useState<string | null>(null)
  const [drop, setDrop] = useState<Drop | null>(null)
  const latest = useRef({ keysOf, onOrder })
  latest.current = { keysOf, onOrder }
  const swallow = useRef(false)
  const stop = useRef<(() => void) | null>(null)
  useEffect(() => () => stop.current?.(), [])

  /** The first row whose middle lies below the pointer takes the drop before it; past them all, after the last. Outside the block, no drop. */
  const dropAt = (key: string, y: number): Drop | null => {
    const order = latest.current.keysOf(key)
    const top = rows.current.get(order[0])?.getBoundingClientRect().top
    const bottom = rows.current.get(order[order.length - 1])?.getBoundingClientRect().bottom
    if (top === undefined || bottom === undefined || y < top || y > bottom) return null
    const below = order.find((k) => {
      const box = rows.current.get(k)?.getBoundingClientRect()
      return box !== undefined && y < box.top + box.height / 2
    })
    const target: Drop = below ? { key: below, edge: 'before' } : { key: order[order.length - 1], edge: 'after' }
    return moved(order, key, target.key, target.edge).join() === order.join() ? null : target
  }

  const press = (key: string, event: PointerEvent) => {
    if (event.button !== 0 || stop.current) return
    const from = event.clientY
    let active = false
    let landing: Drop | null = null
    const move = (e: globalThis.PointerEvent) => {
      if (!active && Math.abs(e.clientY - from) < THRESHOLD) return
      active = true
      setDragging(key)
      landing = dropAt(key, e.clientY)
      setDrop(landing)
    }
    const up = () => {
      if (active) {
        swallow.current = true
        setTimeout(() => (swallow.current = false), 0)
        if (landing) latest.current.onOrder(moved(latest.current.keysOf(key), key, landing.key, landing.edge))
      }
      end()
    }
    const cancel = (e: KeyboardEvent) => e.key === 'Escape' && end()
    const end = () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      window.removeEventListener('pointercancel', end)
      window.removeEventListener('keydown', cancel)
      stop.current = null
      setDragging(null)
      setDrop(null)
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
    window.addEventListener('pointercancel', end)
    window.addEventListener('keydown', cancel)
    stop.current = end
  }

  /** The click a drag ends with selects nothing. */
  const clickCapture = (event: MouseEvent) => {
    if (!swallow.current) return
    swallow.current = false
    event.preventDefault()
    event.stopPropagation()
  }

  return { dragging, drop, press, clickCapture }
}
