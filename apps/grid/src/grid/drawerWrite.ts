import { createContext, useContext } from 'react'
import { rowOf } from '../api'
import type { Available, Row } from '../types'

/** What App gives every drawer: the press of a marked button, and where a re-read row lands. */
export interface DrawerWrite {
  press: (model: string, id: number, available: Available, to: string, onDone: () => Promise<Row | null>) => Promise<void>
  /** A record read again: the view's own store takes it when it is the view's model. */
  fresh: (model: string, row: Row) => void
}

export const DrawerWriteContext = createContext<DrawerWrite | null>(null)

/** Reads a record again and hands it to its host, answering the row it read; none outside App, so a drawer there shows no buttons and does not follow the record. */
export function useReread(): (model: string, id: number, own?: (row: Row) => void, gone?: () => void) => (() => Promise<Row | null>) | undefined {
  const write = useContext(DrawerWriteContext)
  return (model, id, own, gone) => write ? () => rowOf(model, id).then((found) => {
    if (found) {
      write.fresh(model, found)
      own?.(found)
    } else gone?.()
    return found
  }) : undefined
}
