import type { ApiError } from '../types'

/** One undoable step: the batch the server recorded it under, and the row it was made on; none for an action. */
export interface Entry {
  /** Pending until the write answers; null once it was refused or changed nothing. */
  batch: Promise<string | null>
  /** A step of several writes: the batches made before `batch`, in the order made; a null one is skipped. */
  before?: Promise<string | null>[]
  model: string
  id: number | null
  /** A step of several writes: every row it wrote, repainted after its undo by the view on screen. */
  ids?: number[]
  /** Repaints what the step changed beside the rows, such as a record's files. */
  refresh?: () => void
}

/** The server's refusal of an undo; `undone` when a step went part-way: what went through, now the redo, to repaint. */
export type Refusal = Partial<ApiError> & { undone?: Entry }

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

/** The batches made before the step's own, last first: the order they are undone in. */
async function earlier(entry: Entry): Promise<string[]> {
  const made = await Promise.all(entry.before ?? [])
  return made.filter((batch) => batch !== null).toReversed()
}

/** What a step undone part-way still holds, `todo` in the order it is undone, as a step of its own. */
function remainder(entry: Entry, todo: string[]): Entry {
  const [batch, ...before] = todo
  return { ...entry, batch: Promise.resolve(batch), before: before.toReversed().map((made) => Promise.resolve(made)) }
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
  /** Resolves the entry undone or redone, null when there was none; rejects with the server's refusal, a `Refusal`. */
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

  /** The entry crosses at the press, so the next press sees it there; a refusal walks it back or drops it. */
  async function step(from: Entry[], to: Entry[]): Promise<Entry | null> {
    const entry = from.pop()
    if (!entry) return null
    const pending = pendingStep(1 + (entry.before?.length ?? 0))
    const back: Entry = { ...entry, batch: pending.batch, before: pending.before }
    to.push(back)
    changed()
    const batch = await entry.batch
    // Its write was refused or changed nothing: there is nothing to undo.
    const todo = batch === null ? [] : [batch, ...(await earlier(entry))]
    const undone: string[] = []
    const answered = () => {
      pending.settle(undone)
      if (undone.length === 0) without(back)
      changed()
    }
    try {
      for (const next of todo) undone.push(await send(next))
    } catch (error) {
      // Part-way through a step, what went through is the redo, and the rest is what a retry undoes.
      if (KEPT.has(String((error as Partial<ApiError> | null)?.code))) from.push(undone.length > 0 ? remainder(entry, todo.slice(undone.length)) : entry)
      answered()
      throw undone.length > 0 ? ({ ...(error as ApiError), undone: back } satisfies Refusal) : error
    }
    answered()
    return undone.length > 0 ? entry : null
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
