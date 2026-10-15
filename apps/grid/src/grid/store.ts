import { errorText, inUse, t, undoText } from '../i18n'
import type { ApiError, Lookup, Row, Saved } from '../types'
import { createHistory, type Entry, type History, pendingStep, type Refusal } from '../ui/history'

export type SaveState = 'saved' | 'saving' | 'error'

export interface Change {
  id: number
  /** `title` or a field key. */
  field: string
  value: unknown
  /** A picked relation's record, painted with the id until the server answers. */
  lookup?: Lookup | null
  /** An inherited lookup: a value paints as the row's own, an empty one as inherited again. */
  inherits?: boolean
  /** More fields written in the same PATCH, painted and reverted with `field`. */
  with?: Record<string, unknown>
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
  /**
   * Writes that one undo takes back together: all painted at once, all but the last sent together, then the last.
   * A refusal among the others cancels the last; a refused last leaves the others written. Answers whether the last landed.
   */
  applyStep: (changes: Change[]) => Promise<boolean>
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
  /** A step made outside the rows, such as a file added in the drawer, into the undo history. */
  push: (entry: Entry) => void
  dismiss: (id: number, field: string) => void
}

/** A change painted and not yet answered: `row` as it was before the paint, `mine` its ticket. */
interface Painted {
  change: Change
  row: Row
  mine: number
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
/** A step's last write once a write before it was refused: never sent, reverted without a notice of its own. */
const CANCELLED = Symbol('cancelled')

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

function valuesOf(change: Change): Record<string, unknown> {
  return { [change.field]: change.value, ...change.with }
}

function painted(row: Row, change: Change): Row {
  const beside = Object.entries(change.with ?? {}).reduce((r, [field, value]) => write(r, field, value), row)
  const written = write(beside, change.field, change.value, change.lookup)
  if (!change.inherits) return written
  const others = (row.inherited ?? []).filter((key) => key !== change.field)
  return { ...written, inherited: empty(change.value) ? [...others, change.field] : others }
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
  // Inside `together`: the sets wait for one notification at its end.
  let holding = false
  let held = false

  function withoutDraftErrors(): Record<string, CellError> {
    return Object.fromEntries(Object.entries(state.errors).filter(([, error]) => error.id !== DRAFT))
  }

  /** `quiet`: a step's answer, told to the listeners only when the step settles. */
  function set(next: Partial<StoreState>, quiet = false): void {
    state = { ...state, ...next, canUndo: history.canUndo(), canRedo: history.canRedo() }
    if (holding) held = true
    else if (!quiet) notify()
  }

  function notify(): void {
    listeners.forEach((listener) => listener())
  }

  /** Runs `work`, telling the listeners once for every set it made. */
  function together<T>(work: () => T): T {
    holding = true
    held = false
    try {
      return work()
    } finally {
      holding = false
      if (held) notify()
    }
  }

  function patch(id: number, update: (row: Row) => Row): Row[] {
    return state.rows.map((row) => (row.id === id ? update(row) : row))
  }

  function track(id: number, delta: number): void {
    const count = (pending.get(id) ?? 0) + delta
    if (count === 0) pending.delete(id)
    else pending.set(id, count)
  }

  function settle(error = state.error): SaveState {
    if (pending.size > 0) return 'saving'
    return error ? 'error' : 'saved'
  }

  /**
   * One write in flight per record: two connections could otherwise land an undo before the write it undoes.
   * A write held by `ready` takes its place in the queue now and is sent once `ready` says so.
   */
  function queued(change: Change, row: Row, ready?: Promise<boolean>): Promise<Saved> {
    const start = () => (ready ? ready.then((go) => (go ? send(change, row) : Promise.reject(CANCELLED))) : send(change, row))
    const previous = queues.get(change.id)
    const next = previous ? previous.catch(() => undefined).then(start) : start()
    queues.set(change.id, next)
    const done = () => {
      if (queues.get(change.id) === next) queues.delete(change.id)
    }
    next.then(done, done)
    return next
  }

  function send(change: Change, row: Row): Promise<Saved> {
    const data = valuesOf(change)
    if (change.id !== DRAFT) return api.update(model, change.id, data, row)
    const { title, ...fields } = { ...row.fields, title: row.title, ...data }
    return api.create(model, { ...fields, title })
  }

  /** The batch the server recorded it under once it took it; undefined when it refused. */
  async function commit(change: Change): Promise<string | null | undefined> {
    const shown = paint(change)
    return shown ? land(shown) : undefined
  }

  function paint(change: Change): Painted | undefined {
    const row = state.rows.find((r) => r.id === change.id)
    if (!row || removed.has(change.id)) return undefined
    // A draft carries one refusal at a time: each retry clears the last.
    const errors = change.id === DRAFT ? withoutDraftErrors() : { ...state.errors }
    delete errors[cellKey(change.id, change.field)]

    const mine = ++ticket
    latest.set(change.id, mine)
    track(change.id, 1)
    set({ rows: patch(change.id, (r) => painted(r, change)), errors, error: null, save: 'saving' })
    return { change, row, mine }
  }

  /** `quiet`: an answer within a step, which tells the listeners once it settles. */
  async function land({ change, row, mine }: Painted, ready?: Promise<boolean>, quiet = false): Promise<string | null | undefined> {
    const key = cellKey(change.id, change.field)
    try {
      const { row: saved, batch } = await queued(change, row, ready)
      confirmed.set(saved.id, saved)
      track(change.id, -1)
      // Answers come in order; one with a later write still queued would repaint over that write's paint.
      if (change.id === DRAFT) {
        refused = false
        set({ rows: patch(DRAFT, () => saved), needs: [], errors: withoutDraftErrors(), save: settle() }, quiet)
      } else set({ rows: latest.get(change.id) === mine ? patch(change.id, () => saved) : state.rows, save: settle() }, quiet)
      return batch
    } catch (error) {
      track(change.id, -1)
      if (error === CANCELLED) {
        set({ rows: patch(change.id, (r) => reverted(r, change, row)), save: settle() }, quiet)
        return undefined
      }
      const raised = toError(change, error)
      if (change.id === DRAFT) {
        // The draft keeps what was typed and asks for what the writer may be missing.
        refused = true
        const draft = state.rows.find((r) => r.id === DRAFT)
        const again = empty(change.value) ? [change.field] : []
        const needs = draft ? [...again, ...offers.filter((field) => field !== change.field && empty(read(draft, field)))] : again
        set({ errors: { ...state.errors, [key]: raised }, error: raised, needs, save: settle(raised) }, quiet)
        return undefined
      }
      set({ rows: patch(change.id, (r) => reverted(r, change, row)), errors: { ...state.errors, [key]: raised }, error: raised, save: settle(raised) }, quiet)
      // The state moved on meanwhile: show what it holds now, never the value this tab still had.
      if (raised.code === 'transition_lost') {
        await reread(change.id)
        set({ save: settle() }, quiet)
      }
      return undefined
    }
  }

  /** Back to what the server last confirmed, each field a later write has not painted over since. */
  function reverted(r: Row, change: Change, before: Row): Row {
    if (!same(read(r, change.field), change.value)) return r
    const server = confirmed.get(change.id)
    const back = (row: Row, [field, value]: [string, unknown]) =>
      same(read(row, field), value) ? write(row, field, read(server ?? before, field), server?.lookups?.[field]) : row
    const written = Object.entries(valuesOf(change)).reduce(back, r)
    return change.inherits ? { ...written, inherited: (server ?? before).inherited } : written
  }

  function replace(row: Row): void {
    confirmed.set(row.id, row)
    set({ rows: patch(row.id, () => row) })
  }

  async function reread(id: number): Promise<void> {
    const found = api.read ? await api.read(model, id).catch(() => null) : null
    if (found) replace(found)
  }

  /** Repaints the undone step's rows as the server now has them; a step on another view's rows, or an action, reloads; a step with its own refresh runs it. */
  async function repaint(entry: Entry): Promise<void> {
    if (entry.refresh) return entry.refresh()
    const ids = entry.ids ?? (entry.id === null ? [] : [entry.id])
    const read = api.read
    const found = entry.model === model && ids.length > 0 && read ? await Promise.all(ids.map((id) => read(model, id).catch(() => null))) : [null]
    for (const row of found) if (row) replace(row)
    if (found.includes(null)) reload()
  }

  async function travel(step: () => Promise<Entry | null>, forward: boolean): Promise<void> {
    track(UNDOING, 1)
    set({ save: 'saving', error: null })
    try {
      const entry = await step()
      if (entry) await repaint(entry)
    } catch (error) {
      const refused = (error ?? {}) as Refusal
      const code = String(refused.code ?? 'unknown')
      // A redo is an undo of the undo; the server refuses it after a batch that minted tokens.
      const message = forward && code === 'not_undoable' ? t('redoSkipped') : undoText(refused)
      set({ error: { id: 0, field: '', code, message } })
      if (refused.undone) await repaint(refused.undone)
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
      if (Object.entries(valuesOf(change)).every(([field, value]) => same(read(row, field), value))) return
      // In the history at paint, so an undo pressed before the server answers waits for this change's batch.
      let answered: (batch: string | null) => void = () => undefined
      const entry: Entry = { batch: new Promise((resolve) => (answered = resolve)), model, id: change.id }
      history.push(entry)
      const batch = await commit(change)
      answered(batch ?? null)
      if (!batch) history.drop(entry)
    },
    async applyStep(changes) {
      // The listeners hear of a step twice: its paint, and once every write answered or the refusal snapped the card back.
      const painted = together(() => {
        const last = changes.at(-1)
        const dropped = last && paint(last)
        if (!dropped) return null
        const others = changes.slice(0, -1).map(paint)
        // In the history at paint, like apply's, and pending until every write answered.
        const pending = pendingStep(changes.length)
        const entry: Entry = { batch: pending.batch, before: pending.before, model, id: dropped.change.id, ids: changes.map((change) => change.id) }
        history.push(entry)
        return { dropped, others, pending, entry }
      })
      if (!painted) return false
      const { dropped, others, pending, entry } = painted
      let release: (go: boolean) => void = () => undefined
      // Queued on its record now, so a later write there waits for it; sent once the others answered.
      const lastly = land(dropped, new Promise((resolve) => (release = resolve)), true)
      const answers = await Promise.all(others.map((shown) => (shown ? land(shown, undefined, true) : undefined)))
      release(!answers.includes(undefined))
      const batch = await lastly
      const landed = [...answers, batch].filter((made) => typeof made === 'string')
      together(() => {
        pending.settle(landed)
        if (landed.length === 0) history.drop(entry)
        set({ save: settle() })
      })
      return batch !== undefined
    },
    undo: () => travel(history.undo, false),
    redo: () => travel(history.redo, true),
    push: history.push,
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
