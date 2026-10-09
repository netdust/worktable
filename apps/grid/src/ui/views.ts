import { useSyncExternalStore } from 'react'
import { complete, joinOf } from '../grid/conditions'
import { clearKept, clearLayout, defaults, type Layout, save, saveKept, storedKept, storedLayout, storedRevision, subscribeStored } from '../grid/layout'
import { savePicked } from '../matrix/columns'
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
    filters: arrangement.filters.map(({ field, op, values }) => ({ field, op, values: [...values] })),
    ...(joinOf(arrangement.filters, arrangement.join) === 'or' ? { join: 'or' as const } : {}),
    group: arrangement.group,
    picked: arrangement.picked,
  }
}

export const blank = (): StoredArrangement => ({ hidden: [], order: [], widths: [], sort: [], filters: [], group: null, picked: [] })

/** The engine's system owner: it seeds the starting views. */
const SYSTEM_OWNER = -1

/** Why this user can only copy a view: it is a default, or a colleague's; null where they may change it. */
export function lockOf(view: View): 'standard' | 'colleague' | null {
  if (!isSaved(view)) return 'standard'
  if (view.editable) return null
  return view.owner.id === SYSTEM_OWNER ? 'standard' : 'colleague'
}

export function isSaved(view: View): view is SavedView {
  return typeof (view as Partial<SavedView>).id === 'number' && typeof (view as Partial<SavedView>).arrangement === 'object'
}

const isMatrixKey = (id: string): boolean => id.startsWith('record:') || id.startsWith('name:')

/** The arrangement a view is saved with: a starting view's declared one, a saved view's stored one; with what this browser keeps of it. */
export function arrangementOf(view: View): Arrangement {
  const saved = isSaved(view) ? fromStored(view.arrangement) : { ...defaults(view), picked: [] }
  const { widths = saved.widths, picked = saved.picked, hidden } = storedKept(view) ?? {}
  return { ...saved, widths, picked, hidden: hidden ? [...saved.hidden.filter((id) => !isMatrixKey(id)), ...hidden] : saved.hidden }
}

const layoutPart = ({ picked: _, ...layout }: Arrangement): Layout => layout

/** What the sheet shows: this browser's copy, else the saved arrangement. */
export function layoutOf(view: View): Layout {
  return storedLayout(view) ?? layoutPart(arrangementOf(view))
}

/** The browser's unsaved copy; null when it keeps none. */
export function localOf(view: View): Arrangement | null {
  const layout = storedLayout(view)
  return layout === null ? null : { ...layout, picked: arrangementOf(view).picked }
}

/** The browser's copy of the layout; its widths and hidden matrix columns are also kept past a Save or a revert. */
export function storeLayout(view: View, layout: Layout): void {
  save(view, layout)
  saveKept(view, { ...storedKept(view), widths: layout.widths, hidden: layout.hidden.filter(isMatrixKey) })
}

/** Compared as sets where the order means nothing: hidden columns and picked ones. */
function comparable(a: Arrangement): string {
  return JSON.stringify([
    [...a.hidden].sort(), a.order, Object.entries(a.widths).sort(([x], [y]) => x.localeCompare(y)),
    a.sort.map(({ id, desc }) => [id, desc]), a.filters.map(({ field, op, values }) => [field, op, values]), joinOf(a.filters, a.join), a.group, [...a.picked].sort((x, y) => x - y),
  ])
}

export function changed(view: View): boolean {
  const local = localOf(view)
  return local !== null && comparable(local) !== comparable(arrangementOf(view))
}

/** Drops the unsaved copy; what is kept past a Save stays. */
export function clearLocal(view: View): void {
  clearLayout(view)
}

/** A view gone for good: nothing of it stays in this browser. */
export function forget(view: View): void {
  clearLayout(view)
  clearKept(view)
}

/** "Save as new": the new view keeps what this browser kept of the one it came from. */
export function copyKept(from: View, to: View): void {
  const kept = storedKept(from)
  if (kept) saveKept(to, kept)
}

/** Clears the local copy only while it is what was sent: a change made since stays, and so does a condition not yet filled in, which is never sent. */
export function clearIfSent(view: View, sent: Arrangement): void {
  const now = localOf(view)
  if (now && comparable(now) === comparable(sent) && now.filters.every(complete)) clearLocal(view)
}

/** Keeps an arrangement as this browser's unsaved copy of another view. */
export function keepLocal(view: View, arrangement: Arrangement): void {
  storeLayout(view, layoutPart(arrangement))
  if (view.type === 'matrix') savePicked(view, arrangement.picked)
}

/** The current arrangement: the local copy, else the saved one. */
export function currentOf(view: View): Arrangement {
  return localOf(view) ?? arrangementOf(view)
}

/** A list's block: a source's starting views, then its saved ones by creation, re-ordered by `order`; the rest after it. */
function blockOf(starting: View[], saved: SavedView[], order: string[]): View[] {
  const all = [...starting, ...saved]
  const named = order.map((key) => all.find((view) => view.key === key)).filter((view): view is View => view !== undefined)
  const first = [...new Set(named)]
  return [...first, ...all.filter((view) => !first.includes(view))]
}

/** A table's views: a block per source, in the order their first view was served; each in the order kept for its own source. */
export function listFor(table: Table, saved: SavedView[], order: Record<string, string[]>): View[] {
  const own = new Set([table.key, ...table.views.map((view) => view.table)])
  const served = [...table.views.filter((view) => !isSaved(view)), ...saved].map((view) => view.table)
  const sources = [...new Set([...served.filter((source) => own.has(source)), ...own])]
  return sources.flatMap((source) => blockOf(
    table.views.filter((view) => !isSaved(view) && view.table === source),
    saved.filter((view) => view.table === source),
    order[source] ?? [],
  ))
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
