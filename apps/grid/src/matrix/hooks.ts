import { useMemo, useRef, useSyncExternalStore } from 'react'
import { create, remove, update } from '../api'
import type { Row, View } from '../types'
import { createMatrixStore, type MatrixState, type MatrixStore } from './store'

// The matrix keeps its own undo: it needs the rows a write returns, not its batch.
const writes = {
  create: (model: string, data: Record<string, unknown>) => create(model, data).then((saved) => saved.row),
  update: (model: string, id: number, data: Record<string, unknown>) => update(model, id, data).then((saved) => saved.row),
  remove: (model: string, id: number) => remove(model, id),
}

const idle: MatrixState = { rows: [], save: 'saved', error: null, canUndo: false, canRedo: false }
const never = () => () => undefined

/**
 * One store per loaded window of one matrix view: a new window starts a new undo history. `reload`
 * fetches the window's rows again for the store after a refusal; the store keeps its history.
 */
export function useMatrixStore(view: View | undefined, rows: Row[] | null, reload?: () => Promise<Row[]>): [MatrixStore | null, MatrixState] {
  const latest = useRef(reload)
  latest.current = reload
  const store = useMemo(
    () => (view?.join && rows
      ? createMatrixStore({ view, rows, api: writes, onStale: () => latest.current?.() ?? Promise.resolve([]) })
      : null),
    [view, rows],
  )
  const state = useSyncExternalStore(store?.subscribe ?? never, store?.getState ?? (() => idle))
  return [store, state]
}
