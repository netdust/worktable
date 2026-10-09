import { errorText, inUse, undoText } from '../i18n'
import type { ApiError, Lookup, Row, Saved } from '../types'
import { createHistory, type Entry, type History } from '../ui/history'

export type SaveState = 'saved' | 'saving' | 'error'

export interface Change {
  id: number
  /** `title` or a field key. */
  field: string
  value: unknown
  /** A picked relation's record, painted with the id until the server answers. */
  lookup?: Lookup | null
}

export interface CellError {
  id: number
  field: string
  code: string
  message: string
}

export interface StoreApi {
  /** `row` as it was before the write: a query routes the write by its key. */
  update: (model: string, id: number, data: Record<string, unknown>, row: Row) => Promise<Saved>
  create: (model: string, data: Record<string, unknown>) => Promise<Saved>
  remove?: (model: string, id: number) => Promise<unknown>
  /** One row as the source computes it now; null once it left the source. */
  read?: (model: string, id: number) => Promise<Row | null>
  /** Undoes a batch; answers the undo's own batch. Only for a store holding its own history. */
  undo?: (batch: string) => Promise<string>
}

export interface StoreState {
  rows: Row[]
  save: SaveState
  /** The last refusal, for the toolbar. */
  error: CellError | null
  /** Refusals by `id:field`, for the cells. */
  errors: Record<string, CellError>
  canUndo: boolean
  canRedo: boolean
  /** The draft's fields still empty before it can be created, in the order to fill them. */
  needs: string[]
  /** Counts `+ New` pressed while a draft is open: the grid takes it as "show me its next field". */
  asked: number
}

export interface Store {
  getState: () => StoreState
  subscribe: (listener: () => void) => () => void
  apply: (change: Change) => Promise<void>
  undo: () => Promise<void>
  redo: () => Promise<void>
  /** The row as the server now holds it, painted over what this store had. */
  replace: (row: Row) => void
  /** `offers`: the fields to ask for once the writer refused the create, when the schema could not say they were needed. */
  draft: (fields: Record<string, unknown>, needs?: string[], offers?: string[]) => void
  discard: () => void
  create: (fields: Record<string, unknown>) => Promise<void>
  /** Soft-deletes the record; a refusal keeps the row and raises the notice. No undo. */
  remove: (id: number) => Promise<void>
  dismiss: (id: number, field: string) => void
}

interface Options {
  model: string
  rows: Row[]
  api: StoreApi
  /** The tab's undo history, shared by every view; the store's own without one. */
  history?: History
  /** Reads the view again: after an undo of a step this store cannot repaint by its row. */
  reload?: () => void
}

export const DRAFT = -1
/** The pending count an undo or redo in flight holds, beside the records' own. */
const UNDOING = -2

const noUndo = () => Promise.reject({ code: 'not_undoable', message: 'no undo here' } satisfies ApiError)

export function cellKey(id: number, field: string): string {
  return `${id}:${field}`
}

export function read(row: Row, field: string): unknown {
  return field === 'title' ? row.title : row.fields[field]
}

function write(row: Row, field: string, value: unknown, lookup?: Lookup | null): Row {
  if (field === 'title') return { ...row, title: String(value ?? '') }
  const written = { ...row, fields: { ...row.fields, [field]: value } }
  return lookup === undefined ? written : { ...written, lookups: { ...row.lookups, [field]: lookup } }
}

function empty(value: unknown): boolean {
  return value === undefined || value === null || value === '' || (Array.isArray(value) && value.length === 0)
}

function same(a: unknown, b: unknown): boolean {
  return JSON.stringify(a ?? '') === JSON.stringify(b ?? '')
}

function toError(change: Change, error: unknown): CellError {
  const { code, message, by } = (error ?? {}) as Partial<ApiError>
  const known = String(code ?? 'unknown')
  const said = known === 'in_use' && by?.length ? inUse(by) : String(message ?? error)
  return { id: change.id, field: change.field, code: known, message: errorText(known, said) }
}

export function createStore({ model, rows, api, history = createHistory(api.undo ?? noUndo), reload = () => undefined }: Options): Store {
  let state: StoreState = { rows, save: 'saved', error: null, errors: {}, canUndo: history.canUndo(), canRedo: history.canRedo(), needs: [], asked: 0 }
  const listeners = new Set<() => void>()
  let unwatch = () => {}
  const pending = new Map<number, number>()
  const latest = new Map<number, number>()
  const queues = new Map<number, Promise<unknown>>()
  // What the server last said each record holds: a refusal reverts to this, never to another write's paint.
  const confirmed = new Map<number, Row>(rows.map((row) => [row.id, row]))
  // Records whose DELETE is in flight or landed: no write goes to them.
  const removed = new Set<number>()
  let ticket = 0
  // A refused create sends again on the draft's next write: the writer's own rules decide, not the schema's.
  let refused = false
  let touched = false
  let offers: string[] = []

  function withoutDraftErrors(): Record<string, CellError> {
    return Object.fromEntries(Object.entries(state.errors).filter(([, error]) => error.id !== DRAFT))
  }

  function set(next: Partial<StoreState>): void {
    state = { ...state, ...next, canUndo: history.canUndo(), canRedo: history.canRedo() }
    listeners.forEach((listener) => listener())
  }

  function patch(id: number, update: (row: Row) => Row): Row[] {
    return state.rows.map((row) => (row.id === id ? update(row) : row))
  }

  function track(id: number, delta: number): void {
    const count = (pending.get(id) ?? 0) + delta
    if (count === 0) pending.delete(id)
    else pending.set(id, count)
  }

  function settle(): SaveState {
    if (pending.size > 0) return 'saving'
    return state.error ? 'error' : 'saved'
  }

  /** One write in flight per record: two connections could otherwise land an undo before the write it undoes. */
  function queued(change: Change, row: Row): Promise<Saved> {
    const previous = queues.get(change.id)
    const next = previous ? previous.catch(() => undefined).then(() => send(change, row)) : send(change, row)
    queues.set(change.id, next)
    const done = () => {
      if (queues.get(change.id) === next) queues.delete(change.id)
    }
    next.then(done, done)
    return next
  }

  function send(change: Change, row: Row): Promise<Saved> {
    const data = { [change.field]: change.value }
    if (change.id !== DRAFT) return api.update(model, change.id, data, row)
    const { title, ...fields } = { ...row.fields, title: row.title, ...data }
    return api.create(model, { ...fields, title })
  }

  /** The batch the server recorded it under once it took it; undefined when it refused. */
  async function commit(change: Change): Promise<string | null | undefined> {
    const row = state.rows.find((r) => r.id === change.id)
    if (!row || removed.has(change.id)) return undefined
    const key = cellKey(change.id, change.field)
    // A draft carries one refusal at a time: each retry clears the last.
    const errors = change.id === DRAFT ? withoutDraftErrors() : { ...state.errors }
    delete errors[key]

    const mine = ++ticket
    latest.set(change.id, mine)
    track(change.id, 1)
    set({ rows: patch(change.id, (r) => write(r, change.field, change.value, change.lookup)), errors, error: null, save: 'saving' })

    try {
      const { row: saved, batch } = await queued(change, row)
      confirmed.set(saved.id, saved)
      track(change.id, -1)
      // Answers come in order; one with a later write still queued would repaint over that write's paint.
      if (change.id === DRAFT) {
        refused = false
        set({ rows: patch(DRAFT, () => saved), needs: [], errors: withoutDraftErrors() })
      } else if (latest.get(change.id) === mine) set({ rows: patch(change.id, () => saved) })
      set({ save: settle() })
      return batch
    } catch (error) {
      track(change.id, -1)
      const raised = toError(change, error)
      if (change.id === DRAFT) {
        // The draft keeps what was typed and asks for what the writer may be missing.
        refused = true
        const draft = state.rows.find((r) => r.id === DRAFT)
        const again = empty(change.value) ? [change.field] : []
        const needs = draft ? [...again, ...offers.filter((field) => field !== change.field && empty(read(draft, field)))] : again
        set({ errors: { ...state.errors, [key]: raised }, error: raised, needs })
        set({ save: settle() })
        return undefined
      }
      const server = confirmed.get(change.id)
      const revert = (r: Row) => {
        if (!same(read(r, change.field), change.value)) return r
        return write(r, change.field, server ? read(server, change.field) : read(row, change.field), server?.lookups?.[change.field])
      }
      set({ rows: patch(change.id, revert), errors: { ...state.errors, [key]: raised }, error: raised })
      // The state moved on meanwhile: show what it holds now, never the value this tab still had.
      if (raised.code === 'transition_lost') await reread(change.id)
      set({ save: settle() })
      return undefined
    }
  }

  function replace(row: Row): void {
    confirmed.set(row.id, row)
    set({ rows: patch(row.id, () => row) })
  }

  async function reread(id: number): Promise<void> {
    const found = api.read ? await api.read(model, id).catch(() => null) : null
    if (found) replace(found)
  }

  /** Repaints the undone step's row as the server now has it; a step on another view's rows, or an action, reloads. */
  async function repaint(entry: Entry): Promise<void> {
    const found = entry.model === model && entry.id !== null && api.read ? await api.read(model, entry.id).catch(() => null) : null
    if (found) replace(found)
    else reload()
  }

  async function travel(step: () => Promise<Entry | null>): Promise<void> {
    track(UNDOING, 1)
    set({ save: 'saving', error: null })
    try {
      const entry = await step()
      if (entry) await repaint(entry)
    } catch (error) {
      const refused = (error ?? {}) as Partial<ApiError>
      set({ error: { id: 0, field: '', code: String(refused.code ?? 'unknown'), message: undoText(refused) } })
    }
    track(UNDOING, -1)
    set({ save: settle() })
  }

  /** The history is the tab's: another store, or an action, may have changed it since. */
  function current(): StoreState {
    if (state.canUndo !== history.canUndo() || state.canRedo !== history.canRedo()) state = { ...state, canUndo: history.canUndo(), canRedo: history.canRedo() }
    return state
  }

  return {
    getState: current,
    subscribe(listener) {
      if (listeners.size === 0) unwatch = history.subscribe(() => set({}))
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
        if (listeners.size === 0) unwatch()
      }
    },
    async apply(change) {
      const row = state.rows.find((r) => r.id === change.id)
      if (!row || removed.has(change.id)) return
      if (change.id === DRAFT) {
        // The draft's create is in flight; a second write would create a second record.
        if (pending.has(DRAFT)) return
        touched = true
        if (refused) return void (await commit(change))
        const painted = write(row, change.field, change.value, change.lookup)
        // The field just written goes to the server even empty: its refusal says what is wrong.
        const needs = state.needs.filter((field) => field !== change.field && empty(read(painted, field)))
        if (needs.length === 0) await commit(change)
        else set({ rows: patch(DRAFT, () => painted), needs })
        return
      }
      if (same(read(row, change.field), change.value)) return
      // In the history at paint, so an undo pressed before the server answers waits for this change's batch.
      let answered: (batch: string | null) => void = () => undefined
      const entry: Entry = { batch: new Promise((resolve) => (answered = resolve)), model, id: change.id }
      history.push(entry)
      const batch = await commit(change)
      answered(batch ?? null)
      if (!batch) history.drop(entry)
    },
    undo: () => travel(history.undo),
    redo: () => travel(history.redo),
    replace,
    draft(fields, needs = ['title'], offered = []) {
      const open = state.rows.some((r) => r.id === DRAFT)
      if (open && touched) return set({ asked: state.asked + 1 })
      refused = false
      touched = false
      offers = offered
      const row: Row = { id: DRAFT, title: '', status: 'draft', fields, lookups: {}, rollups: {} }
      set({ rows: [row, ...state.rows.filter((r) => r.id !== DRAFT)], needs, asked: state.asked + 1 })
    },
    discard() {
      refused = false
      set({ rows: state.rows.filter((r) => r.id !== DRAFT), errors: withoutDraftErrors(), needs: [], error: state.error?.id === DRAFT ? null : state.error })
      set({ save: settle() })
    },
    async create(fields) {
      set({ save: 'saving', error: null })
      try {
        const { row } = await api.create(model, fields)
        confirmed.set(row.id, row)
        set({ rows: [row, ...state.rows] })
      } catch (error) {
        set({ error: toError({ id: DRAFT, field: 'title', value: '' }, error) })
      }
      set({ save: settle() })
    },
    async remove(id) {
      const send = api.remove
      if (!send || removed.has(id)) return
      removed.add(id)
      track(id, 1)
      set({ save: 'saving', error: null })
      // In the record's queue: after any write still in flight, before any that follows.
      const previous = queues.get(id)
      const removal = (previous ? previous.catch(() => undefined) : Promise.resolve()).then(() => send(model, id))
      queues.set(id, removal)
      try {
        // A 404 means the record is already gone: drop it like a success.
        await removal.catch((error: unknown) => {
          if ((error as Partial<ApiError> | null)?.code !== 'unknown_record') throw error
        })
        track(id, -1)
        // An undo of an edit to a deleted record would only be refused.
        history.forget(model, id)
        confirmed.delete(id)
        const errors = Object.fromEntries(Object.entries(state.errors).filter(([, error]) => error.id !== id))
        set({ rows: state.rows.filter((r) => r.id !== id), errors })
      } catch (error) {
        removed.delete(id)
        track(id, -1)
        set({ error: toError({ id, field: 'title', value: undefined }, error) })
      }
      if (queues.get(id) === removal) queues.delete(id)
      set({ save: settle() })
    },
    dismiss(id, field) {
      const errors = { ...state.errors }
      delete errors[cellKey(id, field)]
      set({ errors })
    },
  }
}
