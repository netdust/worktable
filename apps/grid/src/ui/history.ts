import type { ApiError } from '../types'

/** One undoable step: the batch the server recorded it under, and the row it was made on; none for an action. */
export interface Entry {
  /** Pending until the write answers; null once it was refused or changed nothing. */
  batch: Promise<string | null>
  model: string
  id: number | null
}

export interface History {
  subscribe: (listener: () => void) => () => void
  canUndo: () => boolean
  canRedo: () => boolean
  /** A new step: the redo stack empties. */
  push: (entry: Entry) => void
  drop: (entry: Entry) => void
  /** Every step made on this row: it is gone. */
  forget: (model: string, id: number) => void
  /** Resolves the entry undone or redone, null when there was none; rejects with the server's refusal. */
  undo: () => Promise<Entry | null>
  redo: () => Promise<Entry | null>
}

/** The refusals after which the step can never be undone: it leaves the history. */
const GONE = new Set(['not_undoable', 'already_undone', 'unknown_record'])

/** One per browser tab, of batch ids: `send` undoes a batch on the server and answers the undo's own batch, which a redo undoes. */
export function createHistory(send: (batch: string) => Promise<string>): History {
  const undos: Entry[] = []
  const redos: Entry[] = []
  const listeners = new Set<() => void>()
  const changed = () => listeners.forEach((listener) => listener())

  function without(entry: Entry): void {
    for (const stack of [undos, redos]) if (stack.includes(entry)) stack.splice(stack.indexOf(entry), 1)
  }

  /** The entry crosses at the press, so the next press sees it there; a refusal walks it back or drops it. */
  async function step(from: Entry[], to: Entry[]): Promise<Entry | null> {
    const entry = from.pop()
    if (!entry) return null
    let answered: (batch: string | null) => void = () => undefined
    const back: Entry = { ...entry, batch: new Promise((resolve) => (answered = resolve)) }
    to.push(back)
    changed()
    const refused = (keep: boolean) => {
      answered(null)
      without(back)
      if (keep) from.push(entry)
      changed()
    }
    const batch = await entry.batch
    // Its write was refused or changed nothing: there is nothing to undo.
    if (batch === null) {
      refused(false)
      return null
    }
    try {
      answered(await send(batch))
      return entry
    } catch (error) {
      refused(!GONE.has((error as Partial<ApiError> | null)?.code ?? ''))
      throw error
    }
  }

  return {
    subscribe(listener) {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    canUndo: () => undos.length > 0,
    canRedo: () => redos.length > 0,
    push(entry) {
      undos.push(entry)
      redos.length = 0
      changed()
    },
    drop(entry) {
      without(entry)
      changed()
    },
    forget(model, id) {
      for (const stack of [undos, redos]) stack.splice(0, stack.length, ...stack.filter((e) => e.model !== model || e.id !== id))
      changed()
    },
    undo: () => step(undos, redos),
    redo: () => step(redos, undos),
  }
}
