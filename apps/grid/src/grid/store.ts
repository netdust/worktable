import { errorText, inUse } from '../i18n'
import type { ApiError, Lookup, Row } from '../types'

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
  update: (model: string, id: number, data: Record<string, unknown>, row: Row) => Promise<Row>
  create: (model: string, data: Record<string, unknown>) => Promise<Row>
  remove?: (model: string, id: number) => Promise<unknown>
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
}

interface Entry {
  id: number
  field: string
  before: unknown
  after: unknown
}

export const DRAFT = -1

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

export function createStore({ model, rows, api }: Options): Store {
  let state: StoreState = { rows, save: 'saved', error: null, errors: {}, canUndo: false, canRedo: false, needs: [], asked: 0 }
  const listeners = new Set<() => void>()
  const undoStack: Entry[] = []
  const redoStack: Entry[] = []
  const pending = new Map<number, number>()
  const latest = new Map<number, number>()
  const queues = new Map<number, Promise<unknown>>()
  // What the server last said each record holds: a refusal reverts to this, never to another write's paint.
  const confirmed = new Map<number, Row>(rows.map((row) => [row.id, row]))
  let ticket = 0
  // A refused create sends again on the draft's next write: the writer's own rules decide, not the schema's.
  let refused = false
  let touched = false
  let offers: string[] = []

  function withoutDraftErrors(): Record<string, CellError> {
    return Object.fromEntries(Object.entries(state.errors).filter(([, error]) => error.id !== DRAFT))
  }

  function set(next: Partial<StoreState>): void {
    state = { ...state, ...next, canUndo: undoStack.length > 0, canRedo: redoStack.length > 0 }
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
  function queued(change: Change, row: Row): Promise<Row> {
    const previous = queues.get(change.id)
    const next = previous ? previous.catch(() => undefined).then(() => send(change, row)) : send(change, row)
    queues.set(change.id, next)
    const done = () => {
      if (queues.get(change.id) === next) queues.delete(change.id)
    }
    next.then(done, done)
    return next
  }

  function send(change: Change, row: Row): Promise<Row> {
    const data = { [change.field]: change.value }
    if (change.id !== DRAFT) return api.update(model, change.id, data, row)
    const { title, ...fields } = { ...row.fields, title: row.title, ...data }
    return api.create(model, { ...fields, title })
  }

  /** True when the server took it; the stacks are the caller's. */
  async function commit(change: Change): Promise<boolean> {
    const row = state.rows.find((r) => r.id === change.id)
    if (!row) return false
    const before = read(row, change.field)
    const key = cellKey(change.id, change.field)
    // A draft carries one refusal at a time: each retry clears the last.
    const errors = change.id === DRAFT ? withoutDraftErrors() : { ...state.errors }
    delete errors[key]

    const mine = ++ticket
    latest.set(change.id, mine)
    track(change.id, 1)
    set({ rows: patch(change.id, (r) => write(r, change.field, change.value, change.lookup)), errors, error: null, save: 'saving' })

    try {
      const saved = await queued(change, row)
      confirmed.set(saved.id, saved)
      track(change.id, -1)
      // Answers come in order; one with a later write still queued would repaint over that write's paint.
      if (change.id === DRAFT) {
        refused = false
        set({ rows: patch(DRAFT, () => saved), needs: [], errors: withoutDraftErrors() })
      } else if (latest.get(change.id) === mine) set({ rows: patch(change.id, () => saved) })
      set({ save: settle() })
      return true
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
        return false
      }
      const server = confirmed.get(change.id)
      const back = server ? read(server, change.field) : before
      const reverted = patch(change.id, (r) => (same(read(r, change.field), change.value) ? write(r, change.field, back) : r))
      set({ rows: reverted, errors: { ...state.errors, [key]: raised }, error: raised })
      set({ save: settle() })
      return false
    }
  }

  /** The entry crosses at the press, so the next press sees it there; a refusal walks it back. */
  async function step(from: Entry[], to: Entry[], value: (entry: Entry) => unknown): Promise<void> {
    const entry = from.pop()
    if (!entry) return
    to.push(entry)
    set({})
    if (await commit({ id: entry.id, field: entry.field, value: value(entry) })) return
    // A later press may already have carried it back; walking it back twice would duplicate it.
    if (!to.includes(entry)) return
    to.splice(to.indexOf(entry), 1)
    from.push(entry)
    set({})
  }

  return {
    getState: () => state,
    subscribe(listener) {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    async apply(change) {
      const row = state.rows.find((r) => r.id === change.id)
      if (!row) return
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
      // On the stack at paint, so an undo pressed before the server answers undoes this change.
      const entry: Entry = { id: change.id, field: change.field, before: read(row, change.field), after: change.value }
      undoStack.push(entry)
      redoStack.length = 0
      if (await commit(change)) return
      for (const stack of [undoStack, redoStack]) if (stack.includes(entry)) stack.splice(stack.indexOf(entry), 1)
      set({})
    },
    undo: () => step(undoStack, redoStack, (entry) => entry.before),
    redo: () => step(redoStack, undoStack, (entry) => entry.after),
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
        const row = await api.create(model, fields)
        confirmed.set(row.id, row)
        set({ rows: [row, ...state.rows] })
      } catch (error) {
        set({ error: toError({ id: DRAFT, field: 'title', value: '' }, error) })
      }
      set({ save: settle() })
    },
    async remove(id) {
      if (!api.remove) return
      track(id, 1)
      set({ save: 'saving', error: null })
      try {
        // After any write still queued for the record, as an undo waits for the write it undoes.
        await queues.get(id)?.catch(() => undefined)
        await api.remove(model, id)
        track(id, -1)
        // An undo would PATCH a soft-deleted record.
        for (const stack of [undoStack, redoStack]) stack.splice(0, stack.length, ...stack.filter((entry) => entry.id !== id))
        confirmed.delete(id)
        const errors = Object.fromEntries(Object.entries(state.errors).filter(([, error]) => error.id !== id))
        set({ rows: state.rows.filter((r) => r.id !== id), errors })
      } catch (error) {
        track(id, -1)
        set({ error: toError({ id, field: 'title', value: undefined }, error) })
      }
      set({ save: settle() })
    },
    dismiss(id, field) {
      const errors = { ...state.errors }
      delete errors[cellKey(id, field)]
      set({ errors })
    },
  }
}
