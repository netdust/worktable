import type { ApiError } from '../types'

/** One undoable step: the batch the server recorded it under, and the row it was made on; none for an action. */
export interface Entry {
  /** Pending until the write answers; null once it was refused or changed nothing. */
  batch: Promise<string | null>
  /** A step of several writes: the batches made before `batch`, in the order made; a null one is skipped. */
  before?: Promise<string | null>[]
  model: string
  id: number | null
  /** Repaints what the step changed beside the rows, such as a record's files. */
  refresh?: () => void | Promise<void>
}

/** A step's batches before its writes answer: `settle` gives the last that landed to `batch`, the ones before it to `before`. */
export function pendingStep(count: number): { batch: Promise<string | null>; before: Promise<string | null>[]; settle: (landed: string[]) => void } {
  let answered: (batch: string | null) => void = () => undefined
  const batch = new Promise<string | null>((resolve) => (answered = resolve))
  const answers: ((batch: string | null) => void)[] = []
  const before = Array.from({ length: count - 1 }, () => new Promise<string | null>((resolve) => answers.push(resolve)))
  return {
    batch,
    before,
    settle(landed) {
      answers.forEach((answer, i) => answer(i < landed.length - 1 ? landed[i] : null))
      answered(landed.at(-1) ?? null)
    },
  }
}

export interface History {
  subscribe: (listener: () => void) => () => void
  canUndo: () => boolean
  canRedo: () => boolean
  /** The step the next undo would take. */
  last: () => Entry | undefined
  /** A new step: the redo stack empties. */
  push: (entry: Entry) => void
  drop: (entry: Entry) => void
  /** Every step made on this row: it is gone. */
  forget: (model: string, id: number) => void
  /** Resolves the entry undone or redone, null when there was none; rejects with the server's refusal. */
  undo: () => Promise<Entry | null>
  redo: () => Promise<Entry | null>
}

/** The refusal the planner can resolve, and an undo that never reached the server; after any other the step leaves the history. */
const KEPT = new Set(['in_use', 'unknown'])

/** One per browser tab, of batch ids: `send` undoes a batch on the server and answers the undo's own batch, which a redo undoes. */
export function createHistory(send: (batch: string) => Promise<string>): History {
  const undos: Entry[] = []
  const redos: Entry[] = []
  const listeners = new Set<() => void>()
  const changed = () => listeners.forEach((listener) => listener())

  function without(entry: Entry): void {
    for (const stack of [undos, redos]) if (stack.includes(entry)) stack.splice(stack.indexOf(entry), 1)
  }

  /** The step's own batch first, then the ones before it last-first; answers the undo batches in the order made. */
  async function undoAll(batch: string, before: Promise<string | null>[]): Promise<string[]> {
    const undone = [await send(batch)]
    for (const earlier of before.toReversed()) {
      const made = await earlier
      if (made !== null) undone.push(await send(made))
    }
    return undone
  }

  /** The entry crosses at the press, so the next press sees it there; a refusal walks it back or drops it. */
  async function step(from: Entry[], to: Entry[]): Promise<Entry | null> {
    const entry = from.pop()
    if (!entry) return null
    const pending = pendingStep(1 + (entry.before?.length ?? 0))
    const back: Entry = { ...entry, batch: pending.batch, before: pending.before }
    to.push(back)
    changed()
    const refused = (keep: boolean) => {
      pending.settle([])
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
      pending.settle(await undoAll(batch, entry.before ?? []))
      return entry
    } catch (error) {
      refused(KEPT.has(String((error as Partial<ApiError> | null)?.code)))
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
    last: () => undos.at(-1),
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
