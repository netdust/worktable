import { useMemo, useRef, useSyncExternalStore } from 'react'
import { create, remove, runAction, undoBatch, update } from '../api'
import type { Row, View } from '../types'
import { createMatrixStore, type MatrixApi, type MatrixState, type MatrixStore } from './store'

export const matrixWrites: MatrixApi = {
  create,
  update: (model, id, data, expect) => update(model, id, data, undefined, expect),
  remove,
  undoBatch,
  runAction,
}

const idle: MatrixState = { rows: [], save: 'saved', error: null, canUndo: false, canRedo: false }
const never = () => () => undefined

/**
 * One store per loaded window of one matrix view: a new window starts a new undo history. `reload`
 * fetches the window's rows again for the store after a refusal; the store keeps its history.
 */
export function useMatrixStore(view: View | undefined, rows: Row[] | null, reload?: () => Promise<Row[]>, notify?: (message: string) => void): [MatrixStore | null, MatrixState] {
  const latest = useRef(reload)
  latest.current = reload
  const told = useRef(notify)
  told.current = notify
  const store = useMemo(
    () => (view?.join && rows
      ? createMatrixStore({ view, rows, api: matrixWrites, onStale: () => latest.current?.() ?? Promise.resolve([]), onNotice: (message) => told.current?.(message) })
      : null),
    [view, rows],
  )
  const state = useSyncExternalStore(store?.subscribe ?? never, store?.getState ?? (() => idle))
  return [store, state]
}
