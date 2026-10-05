import type { View } from '../types'

export interface SortKey {
  id: string
  desc: boolean
}

export interface Filter {
  field: string
  /** The raw value: an option key, a related id, `1`/`` for a toggle. */
  value: string
}

/** One viewer's arrangement of one view (V7/R5): kept in this browser only, never shared. */
export interface Layout {
  hidden: string[]
  order: string[]
  widths: Record<string, number>
  sort: SortKey[]
  filters: Filter[]
  group: string | null
}

export type StorageAccess = () => Storage

const PREFIX = 'ntdst-views/layout/v1/'
const MIN_WIDTH = 48

const browser: StorageAccess = () => window.localStorage

export function defaults(view: View): Layout {
  return {
    hidden: [...(view.hidden ?? [])],
    order: [],
    widths: {},
    sort: (view.sort ?? []).map((key) => (key.startsWith('-') ? { id: key.slice(1), desc: true } : { id: key, desc: false })),
    filters: [],
    group: view.group ?? null,
  }
}

export function hide(layout: Layout, id: string): Layout {
  return layout.hidden.includes(id) ? layout : { ...layout, hidden: [...layout.hidden, id] }
}

export function show(layout: Layout, id: string): Layout {
  return { ...layout, hidden: layout.hidden.filter((h) => h !== id) }
}

/** The columns in the order shown: the stored order for those still there, the rest after it as declared. */
export function orderOf(layout: Layout, ids: string[]): string[] {
  const kept = layout.order.filter((id) => ids.includes(id))
  return [...kept, ...ids.filter((id) => !kept.includes(id))]
}

export function reorder(layout: Layout, id: string, to: number, ids: string[]): Layout {
  const order = orderOf(layout, ids).filter((o) => o !== id)
  order.splice(to, 0, id)
  return { ...layout, order }
}

export function resize(layout: Layout, id: string, width: number): Layout {
  return { ...layout, widths: { ...layout.widths, [id]: Math.max(MIN_WIDTH, Math.round(width)) } }
}

export function sort(layout: Layout, list: SortKey[]): Layout {
  return { ...layout, sort: list }
}

export function filter(layout: Layout, field: string, value: string | null): Layout {
  if (value === null) return { ...layout, filters: layout.filters.filter((f) => f.field !== field) }
  const exists = layout.filters.some((f) => f.field === field)
  return {
    ...layout,
    filters: exists ? layout.filters.map((f) => (f.field === field ? { field, value } : f)) : [...layout.filters, { field, value }],
  }
}

export function group(layout: Layout, field: string | null): Layout {
  return { ...layout, group: field }
}

const isStrings = (v: unknown): v is string[] => Array.isArray(v) && v.every((s) => typeof s === 'string')

/** Parsed, not cast: what is stored may come from an older build. */
function parse(raw: unknown): Layout | null {
  if (typeof raw !== 'object' || raw === null) return null
  const l = raw as Record<string, unknown>
  const widths = l.widths as Record<string, unknown>
  const ok =
    isStrings(l.hidden) && isStrings(l.order)
    && typeof widths === 'object' && widths !== null && Object.values(widths).every((w) => typeof w === 'number')
    && Array.isArray(l.sort) && l.sort.every((s: Partial<SortKey>) => typeof s?.id === 'string' && typeof s.desc === 'boolean')
    && Array.isArray(l.filters) && l.filters.every((f: Partial<Filter>) => typeof f?.field === 'string' && typeof f.value === 'string')
    && (l.group === null || typeof l.group === 'string')
  return ok ? (l as unknown as Layout) : null
}

/** One viewer's value for one view, read back through `parse`: null when absent, unreadable or blocked. */
export function readStored<T>(prefix: string, view: View, parse: (raw: unknown) => T | null, storage: StorageAccess = browser): T | null {
  try {
    const raw = storage().getItem(prefix + view.key)
    return raw ? parse(JSON.parse(raw)) : null
  } catch {
    return null
  }
}

let revision = 0
const listeners = new Set<() => void>()

/** Every write to a viewer's stored values, so what reads them (the "changed" mark) reads again. */
export function subscribeStored(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export const storedRevision = (): number => revision

function written(): void {
  revision++
  listeners.forEach((listener) => listener())
}

export function writeStored(prefix: string, view: View, value: unknown, storage: StorageAccess = browser): void {
  try {
    storage().setItem(prefix + view.key, JSON.stringify(value))
  } catch {
    // A private window or blocked storage: the value lives for this visit only.
  }
  written()
}

export function removeStored(prefix: string, view: View, storage: StorageAccess = browser): void {
  try {
    storage().removeItem(prefix + view.key)
  } catch {
    // Blocked storage held nothing to remove.
  }
  written()
}

/** The layout this browser keeps for the view; null when it keeps none. */
export function storedLayout(view: View, storage: StorageAccess = browser): Layout | null {
  return readStored(PREFIX, view, parse, storage)
}

export function clearLayout(view: View, storage: StorageAccess = browser): void {
  removeStored(PREFIX, view, storage)
}

export function save(view: View, layout: Layout, storage: StorageAccess = browser): void {
  writeStored(PREFIX, view, layout, storage)
}
