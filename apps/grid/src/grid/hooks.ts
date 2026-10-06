import { useCallback, useMemo, useState, useSyncExternalStore } from 'react'
import { create, remove, update } from '../api'
import type { Model, Row, View } from '../types'
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

/** One store per loaded window of one view: a new window starts a new undo history. */
export function useGridStore(view: View | undefined, rows: Row[] | null, model?: Model): [Store | null, StoreState] {
  const store = useMemo(() => {
    if (!view || !rows) return null
    const editable = (field: string) => (field === 'title' ? model?.title_readonly === false : Boolean(model?.fields[field] && !model.fields[field].readonly))
    return createStore({ model: view.model, rows, api: { update, create, remove }, editable })
  }, [view, rows, model])
  const state = useSyncExternalStore(store?.subscribe ?? never, store?.getState ?? (() => idle))
  return [store, state]
}
