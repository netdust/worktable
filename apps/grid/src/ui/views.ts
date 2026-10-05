import { useSyncExternalStore } from 'react'
import { clearLayout, defaults, type Layout, save, storedLayout, storedRevision, subscribeStored } from '../grid/layout'
import { clearPicked, savePicked, storedPicked } from '../matrix/columns'
import type { Arrangement, SavedView, StoredArrangement, View } from '../types'
import type { Table } from './tables'

/** The one place an arrangement changes shape: the server keeps widths as a list, the sheet as a record. */
export function fromStored(stored: Partial<StoredArrangement>): Arrangement {
  return {
    hidden: [...(stored.hidden ?? [])],
    order: [...(stored.order ?? [])],
    widths: Object.fromEntries((stored.widths ?? []).map((w) => [w.id, w.width])),
    sort: [...(stored.sort ?? [])],
    filters: [...(stored.filters ?? [])],
    group: stored.group ?? null,
    picked: [...(stored.picked ?? [])],
  }
}

export function toStored(arrangement: Arrangement): StoredArrangement {
  return {
    hidden: arrangement.hidden,
    order: arrangement.order,
    widths: Object.entries(arrangement.widths).map(([id, width]) => ({ id, width })),
    sort: arrangement.sort.map(({ id, desc }) => ({ id, desc })),
    filters: arrangement.filters.map(({ field, value }) => ({ field, value })),
    group: arrangement.group,
    picked: arrangement.picked,
  }
}

export const blank = (): StoredArrangement => ({ hidden: [], order: [], widths: [], sort: [], filters: [], group: null, picked: [] })

export function isSaved(view: View): view is SavedView {
  return typeof (view as Partial<SavedView>).id === 'number' && typeof (view as Partial<SavedView>).arrangement === 'object'
}

/** The arrangement a view is saved with: a starting view's declared one, a saved view's stored one. */
export function arrangementOf(view: View): Arrangement {
  return isSaved(view) ? fromStored(view.arrangement) : { ...defaults(view), picked: [] }
}

const layoutPart = ({ picked: _, ...layout }: Arrangement): Layout => layout

/** What the sheet shows: this browser's copy, else the saved arrangement. */
export function layoutOf(view: View): Layout {
  return storedLayout(view) ?? layoutPart(arrangementOf(view))
}

/** The browser's unsaved copy; null when it keeps none. */
export function localOf(view: View): Arrangement | null {
  const layout = storedLayout(view)
  const picked = storedPicked(view)
  if (layout === null && picked === null) return null
  const saved = arrangementOf(view)
  return { ...(layout ? { ...layoutPart(saved), ...layout } : layoutPart(saved)), picked: picked ?? saved.picked }
}

/** Compared as sets where the order means nothing: hidden columns and picked ones. */
function comparable(a: Arrangement): string {
  return JSON.stringify([
    [...a.hidden].sort(), a.order, Object.entries(a.widths).sort(([x], [y]) => x.localeCompare(y)),
    a.sort.map(({ id, desc }) => [id, desc]), a.filters.map(({ field, value }) => [field, value]), a.group, [...a.picked].sort((x, y) => x - y),
  ])
}

export function changed(view: View): boolean {
  const local = localOf(view)
  return local !== null && comparable(local) !== comparable(arrangementOf(view))
}

export function clearLocal(view: View): void {
  clearLayout(view)
  clearPicked(view)
}

/** Clears the local copy only while it is what was sent: a change made since stays. */
export function clearIfSent(view: View, sent: Arrangement): void {
  const now = localOf(view)
  if (now && comparable(now) === comparable(sent)) clearLocal(view)
}

/** Keeps an arrangement as this browser's unsaved copy of another view. */
export function keepLocal(view: View, arrangement: Arrangement): void {
  save(view, layoutPart(arrangement))
  if (view.type === 'matrix') savePicked(view, arrangement.picked)
}

/** The current arrangement: the local copy, else the saved one. */
export function currentOf(view: View): Arrangement {
  return localOf(view) ?? arrangementOf(view)
}

/** A table's views: the starting ones, then its saved ones by creation, re-ordered by `order`; the rest after it. */
export function listFor(table: Table, saved: SavedView[], order: string[]): View[] {
  const all: View[] = [...table.views.filter((view) => !isSaved(view)), ...saved.filter((view) => view.table === table.key)]
  const named = order.map((key) => all.find((view) => view.key === key)).filter((view): view is View => view !== undefined)
  const first = [...new Set(named)]
  return [...first, ...all.filter((view) => !first.includes(view))]
}

export type Edge = 'before' | 'after'

/** The order with `key` taken out and put at `edge` of `target`; unchanged when either is missing or they are one. */
export function moved(keys: string[], key: string, target: string, edge: Edge): string[] {
  if (key === target || !keys.includes(key) || !keys.includes(target)) return keys
  const rest = keys.filter((k) => k !== key)
  const at = rest.indexOf(target) + (edge === 'after' ? 1 : 0)
  return [...rest.slice(0, at), key, ...rest.slice(at)]
}

/** The order with `key` one place up or down; unchanged at either end. */
export function stepped(keys: string[], key: string, step: -1 | 1): string[] {
  const at = keys.indexOf(key)
  const to = keys[at + step]
  return at < 0 || to === undefined ? keys : moved(keys, key, to, step < 0 ? 'before' : 'after')
}

/** Where a click on a table opens: the view last used there while it is still listed, else the first in the list. */
export function lastIn(table: Table, last: Record<string, string>): View | undefined {
  return table.views.find((view) => view.key === last[table.key]) ?? table.views[0]
}

/** Re-renders on any write to this browser's stored arrangements. */
export function useStoredRevision(): number {
  return useSyncExternalStore(subscribeStored, storedRevision)
}
