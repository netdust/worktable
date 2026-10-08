import { useCallback, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import { create, remove, rowOf, update } from '../api'
import type { Row, View } from '../types'
import type { History } from '../ui/history'
import { layoutOf, storeLayout, useStoredRevision } from '../ui/views'
import { type Layout, storedRevision } from './layout'
import { createStore, type Store, type StoreState } from './store'

/** The layout of the view on screen: this browser's copy, else the saved one; read again after any other write. */
export function useLayout(view: View | undefined): [Layout | null, (layout: Layout) => void] {
  const [held, setHeld] = useState<{ key: string; layout: Layout; revision: number } | null>(null)
  const revision = useStoredRevision()
  const read = useMemo(() => (view ? layoutOf(view) : null), [view, revision])
  const current = view && held?.key === view.key && held.revision === revision ? held.layout : read

  const set = useCallback(
    (layout: Layout) => {
      if (!view) return
      storeLayout(view, layout)
      setHeld({ key: view.key, layout, revision: storedRevision() })
    },
    [view],
  )
  return [current, set]
}

const idle: StoreState = { rows: [], save: 'saved', error: null, errors: {}, canUndo: false, canRedo: false, needs: [], asked: 0 }
const never = () => () => undefined

/** One store per loaded window of one view; the undo history is the tab's, so it outlives the store. */
export function useGridStore(view: View | undefined, rows: Row[] | null, history: History, reload: () => void): [Store | null, StoreState] {
  const latest = useRef(reload)
  latest.current = reload
  const store = useMemo(
    () => (view && rows ? createStore({ model: view.model, rows, api: { update, create, remove, read: rowOf }, history, reload: () => latest.current() }) : null),
    [view, rows, history],
  )
  const state = useSyncExternalStore(store?.subscribe ?? never, store?.getState ?? (() => idle))
  return [store, state]
}

function storedFolds(key: string): Set<string> {
  try {
    const value: unknown = JSON.parse(window.localStorage.getItem(key) ?? '[]')
    return new Set(Array.isArray(value) ? value.filter((k): k is string => typeof k === 'string') : [])
  } catch {
    return new Set()
  }
}

/** The groups folded away in this view, by the column it groups on; kept in this browser. */
export function useFolded(view: string, group: string | null): [Set<string>, (key: string) => void] {
  const key = `ntdst-views/folded/v1/${view}/${group ?? ''}`
  const [held, setHeld] = useState(() => ({ key, folded: storedFolds(key) }))
  const folded = held.key === key ? held.folded : storedFolds(key)

  const toggle = (group: string) => {
    const next = new Set(folded)
    if (!next.delete(group)) next.add(group)
    setHeld({ key, folded: next })
    try {
      window.localStorage.setItem(key, JSON.stringify([...next]))
    } catch {
      // Blocked storage: the fold holds for this visit only.
    }
  }
  return [folded, toggle]
}
