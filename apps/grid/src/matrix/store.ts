import type { CellError, SaveState } from '../grid/store'
import { errorText, type StringKey, t, undoText } from '../i18n'
import type { ApiError, MatrixCell, MatrixColumn, Row, Saved, View } from '../types'
import { cellsFor, cellsOf, OPEN } from './columns'
import { keyed } from './keys'

export interface MatrixApi {
  create: (model: string, data: Record<string, unknown>) => Promise<Saved>
  /** `expect`: the lifecycle value the cell held, sent only when the write changes it. */
  update: (model: string, id: number, data: Record<string, unknown>, expect?: Record<string, string>) => Promise<Saved>
  remove: (model: string, id: number) => Promise<unknown>
  /** Answers the undo's own batch, which undoes it in turn. */
  undoBatch: (batch: string) => Promise<string>
  /** Runs a declared action on one record, in one batch. */
  runAction: (name: string, id: number, input: Record<string, unknown>) => Promise<{ batch: string; created: { dataset: string; id: number }[] }>
}

export interface MatrixState {
  /** The rows as painted: the server's cells with every write still in flight on top. */
  rows: Row[]
  save: SaveState
  /** The last refusal, for the toolbar. */
  error: CellError | null
  canUndo: boolean
  canRedo: boolean
}

export interface MatrixStore {
  getState: () => MatrixState
  subscribe: (listener: () => void) => () => void
  /** null removes the cell's join record. True when the server took it. */
  set: (row: number, column: MatrixColumn, status: string | null) => Promise<boolean>
  setNote: (row: number, column: MatrixColumn, note: string) => Promise<boolean>
  /** Puts `record` on the open join row `cell` through the join's fill action: one undo step, undone by its batch. */
  fill: (row: number, cell: number, record: number) => Promise<boolean>
  /** The first row's status copied into the rest, in the order given: one undo step. */
  fillDown: (column: MatrixColumn, rowIds: number[]) => Promise<void>
  /** A block of keys, marks or values from the top-left of `at`: one undo step. */
  paste: (block: string[][], at: { rows: number[]; columns: MatrixColumn[] }) => Promise<void>
  undo: () => Promise<void>
  redo: () => Promise<void>
  cellError: (row: number, column: MatrixColumn) => CellError | null
}

interface Options {
  view: View
  rows: Row[]
  api: MatrixApi
  /** The window's rows again: asked after a refusal, which may mean this tab's cells are stale. */
  onStale?: () => Promise<Row[]>
  /** Says why an undo or redo left a change out. */
  onNotice?: (message: string) => void
}

/** What a cell holds; null is no join record. */
type Content = { status: string; note: string } | null

interface Op {
  row: number
  column: MatrixColumn
  before: Content
  after: Content
  /** The join record this change acts on, shared with its undo: null until known (a cell still being created). */
  record: { id: number | null }
  /**
   * On a lifecycle cell: the batch that last wrote this change, shared with its undo and redo, which go
   * through the batch undo and replace it. `created`: the first write made the record.
   */
  batch?: { id: string | null; created: boolean }
  /** An undo or redo of a lifecycle change: undoes `batch` instead of writing the cell. */
  replay?: 'undo' | 'redo'
  /** A fill of the open row `record` with the record `put`: the action decides what changes, so the row is read back after each step. */
  fill?: { put: number }
  /** The write landed but its row could not be read back: a refresh follows once it settles. */
  reread?: boolean
  /** The server refused this redo for good (its batch minted tokens): the step leaves the history. */
  dropped?: boolean
}

interface Job {
  op: Op
  ticket: number
}

type Target = { row: number; column: MatrixColumn; status: string | null }

function text(value: unknown): string {
  return typeof value === 'string' ? value : ''
}

function same(a: Content, b: Content): boolean {
  return a === b || (a !== null && b !== null && a.status === b.status && a.note === b.note)
}

function asCell(row: Row): MatrixCell {
  return { id: row.id, title: row.title, status: row.status, fields: row.fields, ...(row.lookups ? { lookups: row.lookups } : {}) }
}

function keyOf(row: number, column: MatrixColumn): string {
  return `${row}:${column.key}`
}

export function createMatrixStore({ view, rows, api, onStale, onNotice }: Options): MatrixStore {
  const join = view.join!
  const lifecycle = join.lifecycle !== undefined && join.lifecycle === join.cell_field
  let state: MatrixState = { rows, save: 'saved', error: null, canUndo: false, canRedo: false }
  const listeners = new Set<() => void>()
  const undoStack: Op[][] = []
  const redoStack: Op[][] = []
  const errors = new Map<string, CellError>()
  // What the server last said each row's cells are: a refusal reverts to this, never to another write's paint.
  const confirmed = new Map<number, MatrixCell[]>(rows.map((row) => [row.id, cellsOf(row)]))
  const queues = new Map<string, Promise<unknown>>()
  const latest = new Map<string, number>()
  // A record an undo re-created has a new id: every op that names the old one follows it here.
  const renamed = new Map<number, number>()
  let pending = 0
  // Per row: writes painted and not yet settled, and requests on the wire. A refresh repaints a row with
  // none of the first, and takes the server's cells for a row with none of the second (an answer may predate them).
  const busy = new Map<number, number>()
  const sending = new Map<number, number>()
  // Bumped when a row's request starts and when it settles: a refresh leaves a row whose count moved while it was out.
  const generation = new Map<number, number>()
  // A refresh after a refusal: every write waits for it, so it decides against what the server holds.
  let refreshing: Promise<void> | null = null
  // A refresh asked for while one is out: one follow-up runs when it settles, whatever its outcome.
  let again = false
  let ticket = 0
  let placeholder = 0

  function publish(next: Partial<MatrixState>): void {
    state = { ...state, ...next, canUndo: undoStack.length > 0, canRedo: redoStack.length > 0 }
    listeners.forEach((listener) => listener())
  }

  function rowOf(id: number): Row | undefined {
    return state.rows.find((row) => row.id === id)
  }

  function contentOf(cell: MatrixCell | undefined): Content {
    if (!cell) return null
    return { status: text(cell.fields[join.cell_field]), note: join.note_field ? text(cell.fields[join.note_field]) : '' }
  }

  function shown(row: number, column: MatrixColumn): Content {
    const painted = rowOf(row)
    return painted ? contentOf(cellsFor(view, painted, column)[0]) : null
  }

  function withCells(row: Row, cells: MatrixCell[]): Row {
    return { ...row, rollups: { ...row.rollups, cells } }
  }

  /** The row's cells with this column's swapped for `cells`. */
  function swap(row: Row, column: MatrixColumn, cells: MatrixCell[]): Row {
    const mine = new Set(cellsFor(view, row, column).map((cell) => cell.id))
    return withCells(row, [...cellsOf(row).filter((cell) => !mine.has(cell.id)), ...cells])
  }

  function patchRow(id: number, update: (row: Row) => Row): void {
    publish({ rows: state.rows.map((row) => (row.id === id ? update(row) : row)) })
  }

  /** Only the join's own fields: the row, the column (a record or a name), the status and the note. */
  function created(row: number, column: MatrixColumn, content: { status: string; note: string }): Record<string, unknown> {
    const data: Record<string, unknown> = { [join.row_field]: [row] }
    if (column.kind === 'record') data[join.column_field] = [column.id]
    else if (join.name_field) data[join.name_field] = column.title
    data[join.cell_field] = content.status
    if (join.note_field && content.note !== '') data[join.note_field] = content.note
    return data
  }

  function changed(cell: MatrixCell, content: { status: string; note: string }): Record<string, unknown> {
    const now = contentOf(cell)!
    const data: Record<string, unknown> = {}
    if (now.status !== content.status) data[join.cell_field] = content.status
    if (join.note_field && now.note !== content.note) data[join.note_field] = content.note
    return data
  }

  function latestId(id: number | null): number | null {
    let at = id
    while (at !== null && renamed.has(at)) at = renamed.get(at)!
    return at
  }

  function paint(op: Op): void {
    if (op.fill) return
    patchRow(op.row, (row) => {
      const current = cellsFor(view, row, op.column)
      const target = current.find((cell) => cell.id === latestId(op.record.id)) ?? current[0]
      const rest = current.filter((cell) => cell !== target)
      if (op.after === null) return swap(row, op.column, rest)
      if (op.before !== null && target) {
        const fields = { ...target.fields, [join.cell_field]: op.after.status, ...(join.note_field ? { [join.note_field]: op.after.note } : {}) }
        return swap(row, op.column, [{ ...target, fields }, ...rest])
      }
      const fields = { ...created(op.row, op.column, op.after), ...(op.column.kind === 'name' ? { [join.column_field]: [] } : {}) }
      return swap(row, op.column, [...current, { id: --placeholder, title: '', status: 'publish', fields }])
    })
  }

  /** The cell as the server last confirmed it: after a write lands, or to revert one that did not. */
  function settle(row: number, column: MatrixColumn): void {
    const server = confirmed.get(row) ?? []
    patchRow(row, (painted) => swap(painted, column, cellsFor(view, withCells(painted, server), column)))
  }

  /** Decided when it is sent, against what the server confirmed: a create still in flight has its id by then. */
  /**
   * Acts on the op's own record once known, else on the cell's lowest confirmed join. A cell that had
   * no record before always creates one, even beside another join of the same cell.
   */
  async function write(op: Op): Promise<void> {
    while (refreshing) await refreshing
    const count = (delta: number) => {
      sending.set(op.row, (sending.get(op.row) ?? 0) + delta)
      generation.set(op.row, (generation.get(op.row) ?? 0) + 1)
    }
    count(1)
    try {
      await decide(op)
    } finally {
      count(-1)
    }
  }

  /** The confirmed join record the op acts on: its own once known, else the cell's lowest. */
  function currentOf(op: Op): MatrixCell | undefined {
    const mine = cellsFor(view, withCells({ id: op.row, title: '', status: '', fields: {} }, confirmed.get(op.row) ?? []), op.column)
    const known = latestId(op.record.id)
    return known === null ? mine[0] : mine.find((cell) => cell.id === known)
  }

  async function decide(op: Op): Promise<void> {
    if (op.replay) return replay(op)
    if (op.fill) return runFill(op, op.fill.put)
    const { row, column, after, record } = op
    const known = latestId(record.id)
    const current = currentOf(op)
    // Re-read after the await: another cell of this row may have landed meanwhile.
    const land = (change: (cells: MatrixCell[]) => MatrixCell[]): void => void confirmed.set(row, change(confirmed.get(row) ?? []))
    if (after === null) {
      if (!current) return
      await api.remove(join.model, current.id)
      record.id = current.id
      return land((cells) => cells.filter((cell) => cell.id !== current.id))
    }
    if (!current) {
      // A note's undo or redo on a lifecycle join never re-creates: that would enter a hooked state again.
      if (lifecycle && !op.batch) return
      const made = await api.create(join.model, created(row, column, after))
      const saved = asCell(made.row)
      if (known !== null) renamed.set(known, saved.id)
      record.id = saved.id
      if (op.batch) Object.assign(op.batch, { id: made.batch, created: true })
      return land((cells) => [...cells, saved])
    }
    record.id = current.id
    // This tab saw no record where the server has one: the undo goes back to what the server held.
    if (op.before === null) op.before = contentOf(current)
    const data = changed(current, after)
    if (Object.keys(data).length === 0) return
    const expect = expectOf(current, data)
    const written = await (expect ? api.update(join.model, current.id, data, expect) : api.update(join.model, current.id, data))
    if (op.batch) op.batch.id = written.batch
    const saved = asCell(written.row)
    land((cells) => cells.map((cell) => (cell.id === saved.id ? saved : cell)))
  }

  /** The state the server last confirmed, when this write changes it: a write after another tab's lands as 409. */
  function expectOf(cell: MatrixCell, data: Record<string, unknown>): Record<string, string> | undefined {
    if (!lifecycle || !Object.hasOwn(data, join.cell_field)) return undefined
    return { [join.cell_field]: contentOf(cell)!.status }
  }

  async function runFill(op: Op, put: number): Promise<void> {
    const open = join.open!
    const done = await api.runAction(open.action, op.record.id!, { [open.input]: put })
    Object.assign(op.batch!, { id: done.batch, created: done.created.length > 0 })
    await reload(op)
  }

  /**
   * The row's cells as the server now holds them, after a write whose outcome only the server knows. The
   * write has landed, so a failed read never fails the op: it asks for a refresh once the op settles.
   */
  async function reload(op: Op): Promise<void> {
    if (!onStale) return
    const sent = generation.get(op.row)
    const fresh = await onStale().then((rows) => rows.find((row) => row.id === op.row), () => undefined)
    // Unread, or another write on this row moved meanwhile: the general refresh sorts it out.
    if (!fresh || generation.get(op.row) !== sent) return void (op.reread = true)
    confirmed.set(op.row, cellsOf(fresh))
    patchRow(op.row, (painted) => withCells(painted, cellsOf(fresh)))
  }

  /** Undoes the change's last batch and lands what that leaves: an undone create is gone, else the cell holds `after`. */
  async function replay(op: Op): Promise<void> {
    const batch = op.batch!
    if (batch.id === null) return
    const id = latestId(op.record.id)
    batch.id = await api.undoBatch(batch.id)
    if (op.fill) return reload(op)
    const land = (change: (cells: MatrixCell[]) => MatrixCell[]): void => void confirmed.set(op.row, change(confirmed.get(op.row) ?? []))
    if (op.replay === 'undo' && batch.created) return land((cells) => cells.filter((cell) => cell.id !== id))
    const status = op.after?.status ?? ''
    land((cells) => cells.map((cell) => (cell.id === id ? { ...cell, fields: { ...cell.fields, [join.cell_field]: status } } : cell)))
  }

  /** One write in flight per cell: two connections could otherwise land an undo before the write it undoes. */
  function queued(op: Op): Promise<void> {
    const key = keyOf(op.row, op.column)
    const previous = queues.get(key)
    const run = () => write(op)
    const next = previous ? previous.catch(() => undefined).then(run) : run()
    queues.set(key, next)
    const done = () => {
      if (queues.get(key) === next) queues.delete(key)
    }
    next.then(done, done)
    return next
  }

  function begin(op: Op): Job {
    const mine = ++ticket
    latest.set(keyOf(op.row, op.column), mine)
    pending++
    busy.set(op.row, (busy.get(op.row) ?? 0) + 1)
    paint(op)
    publish({ save: 'saving', error: null })
    return { op, ticket: mine }
  }

  function end(job: Job): void {
    pending--
    busy.set(job.op.row, (busy.get(job.op.row) ?? 1) - 1)
    if (latest.get(keyOf(job.op.row, job.op.column)) === job.ticket) settle(job.op.row, job.op.column)
    publish({ save: pending > 0 ? 'saving' : state.error ? 'error' : 'saved' })
  }

  async function send(job: Job): Promise<boolean> {
    const key = keyOf(job.op.row, job.op.column)
    try {
      await queued(job.op)
      errors.delete(key)
      end(job)
      if (job.op.reread) {
        job.op.reread = false
        refresh()
      }
      return true
    } catch (error) {
      const refused = (error ?? {}) as Partial<ApiError>
      const known = String(refused.code ?? 'unknown')
      if (job.op.replay === 'redo' && known === 'not_undoable') {
        job.op.dropped = true
        onNotice?.(t('redoSkipped'))
        end(job)
        return false
      }
      const said = job.op.replay ? undoText(refused) : errorText(known, String(refused.message ?? error))
      const raised: CellError = { id: job.op.row, field: job.op.column.key, code: known, message: said }
      errors.set(key, raised)
      publish({ error: raised })
      end(job)
      return false
    }
  }

  /** Painted at once, sent in order, stopped at the first refusal: the cells after it go back unsent. */
  async function execute(ops: Op[]): Promise<Op[]> {
    const jobs = ops.map(begin)
    for (const [i, job] of jobs.entries()) {
      if (await send(job)) continue
      jobs.slice(i + 1).forEach(end)
      refresh()
      return ops.slice(0, i)
    }
    return ops
  }

  /** The server's cells for every row this store holds; the undo stacks and the refusal's message stay. */
  function refresh(): void {
    if (!onStale) return
    if (refreshing) {
      again = true
      return
    }
    const sent = new Map(generation)
    refreshing = onStale().then((fresh) => {
      for (const row of fresh) {
        if (!confirmed.has(row.id) || sending.get(row.id) || generation.get(row.id) !== sent.get(row.id)) continue
        confirmed.set(row.id, cellsOf(row))
        if (!busy.get(row.id)) patchRow(row.id, (painted) => withCells(painted, cellsOf(row)))
      }
    }, () => undefined).finally(() => {
      refreshing = null
      if (!again) return
      again = false
      refresh()
    })
  }

  /** The shown cell's record, once the server has given it an id. */
  function recordAt(row: number, column: MatrixColumn): { id: number | null } {
    const painted = rowOf(row)
    const id = painted ? cellsFor(view, painted, column)[0]?.id : undefined
    return { id: id !== undefined && id > 0 ? id : null }
  }

  function opFor({ row, column, status }: Target): Op | null {
    const before = shown(row, column)
    const after: Content = status === null ? null : { status, note: before?.note ?? '' }
    if (same(before, after)) return null
    return { row, column, before, after, record: recordAt(row, column), ...(lifecycle ? { batch: { id: null, created: false } } : {}) }
  }

  async function block(targets: Target[]): Promise<void> {
    const ops = targets.map(opFor).filter((op): op is Op => op !== null)
    if (ops.length === 0) return
    const landed = await execute(ops)
    if (landed.length === 0) return
    undoStack.push(landed)
    redoStack.length = 0
    publish({})
  }

  async function single(op: Op | null): Promise<boolean> {
    if (!op) return true
    // On the stack at paint, so an undo pressed before the server answers undoes this change.
    const step = [op]
    undoStack.push(step)
    redoStack.length = 0
    if ((await execute(step)).length === 1) return true
    for (const stack of [undoStack, redoStack]) if (stack.includes(step)) stack.splice(stack.indexOf(step), 1)
    publish({})
    return false
  }

  /**
   * A lifecycle change undone by its batch would otherwise re-create into a hooked state (a re-invite), and
   * an undone create's batch holds a delete, which has no undo: both are left out, with a word why. So is a
   * note change whose record is gone: re-creating it would enter a hooked state too.
   */
  function skipped(op: Op, forward: boolean): StringKey | null {
    if (op.fill) return forward && op.batch!.created ? 'redoSkipped' : null
    if (!op.batch) return lifecycle && !currentOf(op) ? 'undoDeleteSkipped' : null
    if (!forward && op.after === null) return 'undoDeleteSkipped'
    if (forward && op.batch.created) return 'redoSkipped'
    return null
  }

  function turn(op: Op, forward: boolean): Op {
    const replay = op.batch ? { replay: forward ? 'redo' as const : 'undo' as const } : {}
    return forward ? { ...op, ...replay } : { ...op, before: op.after, after: op.before, ...replay }
  }

  /** A step crosses at the press; what a refusal leaves undone stays behind as its own step, and a skipped change is dropped. */
  async function step(from: Op[][], to: Op[][], forward: boolean): Promise<void> {
    const pressed = from.pop()
    if (!pressed) return
    const skips = new Set(pressed.map((op) => skipped(op, forward)).filter((key): key is StringKey => key !== null))
    skips.forEach((key) => onNotice?.(t(key)))
    const taken = skips.size === 0 ? pressed : pressed.filter((op) => skipped(op, forward) === null)
    if (taken.length === 0) return publish({})
    to.push(taken)
    publish({})
    const ops = forward ? taken : [...taken].reverse()
    const turned = ops.map((op) => turn(op, forward))
    const count = (await execute(turned)).length
    if (count === ops.length) return
    const at = to.indexOf(taken)
    // A later press may already have carried it on; walking it back twice would duplicate it.
    if (at < 0) return
    to.splice(at, 1)
    const moved = forward ? taken.slice(0, count) : taken.slice(taken.length - count)
    const left = forward ? taken.slice(count) : taken.slice(0, taken.length - count)
    if (moved.length > 0) to.push(moved)
    const kept = turned[count]?.dropped ? left.filter((op) => op !== ops[count]) : left
    if (kept.length > 0) from.push(kept)
    publish({})
  }

  /** A pasted word as a status: a value, a declared key, or a mark; empty clears; anything else is skipped. */
  function statusOf(word: string): string | null | undefined {
    const trimmed = word.trim()
    if (trimmed === '') return null
    if (Object.hasOwn(join.marks, trimmed) || Object.values(join.keys).includes(trimmed)) return trimmed
    const status = keyed(join.keys, trimmed)
    if (status !== undefined) return status
    return Object.entries(join.marks).find(([, mark]) => mark === trimmed)?.[0]
  }

  return {
    getState: () => state,
    subscribe(listener) {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    set: (row, column, status) => single(opFor({ row, column, status })),
    fill(row, cell, record) {
      if (!join.open) return Promise.resolve(false)
      const batch = { id: null, created: false }
      return single({ row, column: OPEN, before: null, after: null, record: { id: cell }, batch, fill: { put: record } })
    },
    setNote(row, column, note) {
      const before = shown(row, column)
      if (before === null || before.note === note) return Promise.resolve(before !== null)
      return single({ row, column, before, after: { ...before, note }, record: recordAt(row, column) })
    },
    fillDown(column, rowIds) {
      const [first, ...rest] = rowIds
      const source = first === undefined ? null : shown(first, column)
      return block(rest.map((row) => ({ row, column, status: source?.status ?? null })))
    },
    paste(words, at) {
      const targets: Target[] = []
      words.forEach((line, i) => line.forEach((word, j) => {
        const row = at.rows[i]
        const column = at.columns[j]
        const status = statusOf(word)
        if (row !== undefined && column && status !== undefined) targets.push({ row, column, status })
      }))
      return block(targets)
    },
    undo: () => step(undoStack, redoStack, false),
    redo: () => step(redoStack, undoStack, true),
    cellError: (row, column) => errors.get(keyOf(row, column)) ?? null,
  }
}
