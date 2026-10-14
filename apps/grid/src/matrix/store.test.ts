import { afterEach, describe, expect, it, vi } from 'vitest'
import { setStrings } from '../i18n'
import type { MatrixColumn, Row, Saved, View } from '../types'
import { cellFor, cellsFor, OPEN } from './columns'
import { createMatrixStore, type MatrixApi } from './store'

const view: View = {
  key: 'bezetting', label: 'Bezetting', table: 'planning', model: 'activity', type: 'matrix', date_field: 'date',
  join: {
    model: 'assignment', row_field: 'activity', column_field: 'person', name_field: 'name', cell_field: 'status', note_field: 'note',
    keys: { x: 'confirmed', '1': 'confirmed', '?': 'maybe', '-': 'declined', '0': 'declined' },
    marks: { confirmed: '✓', requested: '·', maybe: '?', declined: '✕' }, count: 'confirmed',
  },
}

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

const join = (id: number, fields: Record<string, unknown>) => ({ id, title: `join ${id}`, status: 'publish', fields: { name: '', note: '', person: [], ...fields } })
const activity = (id: number, cells: ReturnType<typeof join>[] = []): Row => ({ id, title: `activity ${id}`, status: 'publish', fields: { date: '2026-05-18' }, rollups: { cells } })

const rows: Row[] = [
  activity(1, [join(11, { activity: [1], person: [5], status: 'confirmed', note: 'laat' }), join(12, { activity: [1], name: 'Lieve', status: 'maybe' })]),
  activity(2),
  activity(3, [join(31, { activity: [3], person: ['5'], status: 'maybe' }), join(30, { activity: [3], person: [5], status: 'confirmed', note: 'vroeg' })]),
  activity(4),
  activity(5),
]

const sien: MatrixColumn = { key: 'record:5', kind: 'record', id: 5, title: 'Sien' }
const lieve: MatrixColumn = { key: 'name:lieve', kind: 'name', title: 'Lieve' }
const mira: MatrixColumn = { key: 'record:9', kind: 'record', id: 9, title: 'Mira' }

let next = 100
let batches = 0
/** The server's answer: the record it stored, as the rows route returns it, and the batch it wrote it in. */
const stored = (id: number, fields: Record<string, unknown>): Saved => ({ row: { id, title: `join ${id}`, status: 'publish', fields: { name: '', note: '', person: [], ...fields } }, batch: `b${++batches}` })

/** A batch the fake server wrote: the record, and its fields before and after (null: absent). */
type Written = { id: number; before: Record<string, unknown> | null; after: Record<string, unknown> | null }

function setup(on: View = view, start: Row[] = rows) {
  const api = { create: vi.fn<MatrixApi['create']>(), update: vi.fn<MatrixApi['update']>(), remove: vi.fn<MatrixApi['remove']>(), undoBatch: vi.fn<MatrixApi['undoBatch']>(), runAction: vi.fn<MatrixApi['runAction']>() }
  // The server keeps every record whole: an update answers with all of its fields.
  const server = new Map<number, Record<string, unknown>>(start.flatMap((row) => (row.rollups?.cells as ReturnType<typeof join>[]).map((cell) => [cell.id, cell.fields])))
  const batches = new Map<string, Written>()
  const keep = (saved: Saved, before: Record<string, unknown> | null = null) => {
    server.set(saved.row.id, saved.row.fields)
    if (saved.batch) batches.set(saved.batch, { id: saved.row.id, before, after: saved.row.fields })
    return saved
  }
  api.create.mockImplementation(async (_model, data) => keep(stored(++next, data)))
  api.update.mockImplementation(async (_model, id, data) => keep(stored(id, { ...server.get(id), ...data }), server.get(id) ?? null))
  api.remove.mockImplementation(async (_model, id) => (server.delete(id), { deleted: true, id }))
  // Undo puts the record back as the batch found it, and is itself a batch a redo undoes.
  api.undoBatch.mockImplementation(async (batch) => {
    const done = batches.get(batch)
    if (!done) throw { code: 'unknown_batch', message: batch }
    if (done.before === null) server.delete(done.id)
    else server.set(done.id, done.before)
    const undone = `u${batch}`
    batches.set(undone, { id: done.id, before: done.after, after: done.before })
    return undone
  })
  // The rows route: each row with the records the server holds for it now.
  const window = () => start.map((row) => activity(row.id, [...server].filter(([, f]) => (f.activity as number[])?.[0] === row.id).map(([id, f]) => join(id, f))))
  const onStale = vi.fn(async () => window())
  const onNotice = vi.fn<(message: string) => void>()
  // Another tab puts Sien, confirmed, on activities 2 (record 400) and 4 (record 401).
  const otherTab = () => {
    server.set(400, join(400, { activity: [2], person: [5], status: 'confirmed' }).fields)
    server.set(401, join(401, { activity: [4], person: [5], status: 'confirmed' }).fields)
  }
  const store = createMatrixStore({ view: on, rows: start, api, onStale, onNotice })
  const cell = (row: number, column: MatrixColumn) => cellFor(on, store.getState().rows.find((r) => r.id === row)!, column)
  const status = (row: number, column: MatrixColumn) => cell(row, column)?.fields.status
  const held = (id: number) => server.get(id)?.status
  return { api, store, cell, status, onStale, onNotice, otherTab, window, keep, server, held }
}

const settled = () => new Promise((resolve) => setTimeout(resolve, 0))

afterEach(() => setStrings(undefined))

describe('set', () => {
  it('creates the join record for a first value in an empty record cell, through the join model and no view', async () => {
    const { api, store, status } = setup()

    expect(await store.set(2, sien, 'confirmed')).toBe(true)

    expect(api.create).toHaveBeenCalledWith('assignment', { activity: [2], person: [5], status: 'confirmed' })
    expect(status(2, sien)).toBe('confirmed')
  })

  it('creates a name column with its first-seen spelling', async () => {
    const { api, store, status } = setup()

    await store.set(2, lieve, 'maybe')

    expect(api.create).toHaveBeenCalledWith('assignment', { activity: [2], name: 'Lieve', status: 'maybe' })
    expect(status(2, lieve)).toBe('maybe')
  })

  it('updates the one field on a change', async () => {
    const { api, store, status } = setup()

    await store.set(1, sien, 'maybe')

    expect(api.update).toHaveBeenCalledWith('assignment', 11, { status: 'maybe' })
    expect(status(1, sien)).toBe('maybe')
  })

  it('writes nothing when the status is the same', async () => {
    const { api, store } = setup()

    expect(await store.set(1, sien, 'confirmed')).toBe(true)
    expect(api.update).not.toHaveBeenCalled()
    expect(store.getState().canUndo).toBe(false)
  })

  it('removes the join record on a Delete', async () => {
    const { api, store, cell } = setup()

    await store.set(1, sien, null)

    expect(api.remove).toHaveBeenCalledWith('assignment', 11)
    expect(cell(1, sien)).toBeUndefined()
    expect(cell(1, lieve)?.id).toBe(12)
  })

  it('writes the note alone', async () => {
    const { api, store, cell } = setup()

    await store.setNote(1, sien, 'vroeg')

    expect(api.update).toHaveBeenCalledWith('assignment', 11, { note: 'vroeg' })
    expect(cell(1, sien)?.fields.note).toBe('vroeg')
  })

  it('paints the cell before the server answers, then takes the record it returns', async () => {
    const { api, store, cell } = setup()
    const answer = deferred<Saved>()
    api.create.mockReturnValueOnce(answer.promise)

    const done = store.set(2, sien, 'confirmed')

    expect(cell(2, sien)?.fields.status).toBe('confirmed')
    expect(store.getState().save).toBe('saving')
    answer.resolve(stored(77, { activity: [2], person: [5], status: 'confirmed' }))
    await done

    expect(cell(2, sien)?.id).toBe(77)
    expect(store.getState().save).toBe('saved')
  })

  it('reverts a refused cell and raises the writer\'s refusal in the site\'s words', async () => {
    setStrings({ 'error.duplicate_assignment': 'Deze persoon staat al op deze activiteit' })
    const { api, store, cell } = setup()
    api.create.mockRejectedValueOnce({ code: 'duplicate_assignment', message: 'This person is already on this activity.' })
    const listener = vi.fn()
    store.subscribe(listener)

    expect(await store.set(2, sien, 'confirmed')).toBe(false)

    expect(cell(2, sien)).toBeUndefined()
    expect(store.cellError(2, sien)?.message).toBe('Deze persoon staat al op deze activiteit')
    expect(store.cellError(2, lieve)).toBeNull()
    expect(store.getState()).toMatchObject({ save: 'error', canUndo: false, error: { code: 'duplicate_assignment', message: 'Deze persoon staat al op deze activiteit' } })
    expect(listener).toHaveBeenCalled()
  })

  it('clears the cell error once a write to it lands', async () => {
    const { api, store } = setup()
    api.create.mockRejectedValueOnce({ code: 'bad', message: 'No.' })

    await store.set(2, sien, 'confirmed')
    await store.set(2, sien, 'confirmed')

    expect(store.cellError(2, sien)).toBeNull()
    expect(store.getState().save).toBe('saved')
  })

  it('writes the lowest join id of a shared cell, never the other', async () => {
    const { api, store, cell } = setup()

    await store.set(3, sien, 'declined')
    await store.set(3, sien, null)

    expect(api.update).toHaveBeenCalledWith('assignment', 30, { status: 'declined' })
    expect(api.remove).toHaveBeenCalledWith('assignment', 30)
    expect(api.update).not.toHaveBeenCalledWith('assignment', 31, expect.anything())
    expect(api.remove).not.toHaveBeenCalledWith('assignment', 31)
    expect(cell(3, sien)?.id).toBe(31)
  })

  it('sends one write at a time per cell: a change after a create waits for its id', async () => {
    const { api, store, status } = setup()
    const answer = deferred<Saved>()
    api.create.mockReturnValueOnce(answer.promise)
    api.update.mockImplementationOnce(async (_m, id, data) => stored(id, { activity: [2], person: [5], ...data }))

    const first = store.set(2, sien, 'confirmed')
    const second = store.set(2, sien, 'maybe')
    await Promise.resolve()
    expect(api.update).not.toHaveBeenCalled()
    expect(status(2, sien)).toBe('maybe')

    answer.resolve(stored(78, { activity: [2], person: [5], status: 'confirmed' }))
    await Promise.all([first, second])

    expect(api.update).toHaveBeenCalledWith('assignment', 78, { status: 'maybe' })
    expect(status(2, sien)).toBe('maybe')
  })
})

describe('undo and redo', () => {
  it('keeps both records when two cells of one row land out of step, and changes and undoes the first one by its id', async () => {
    const { api, store, status } = setup()
    const first = deferred<Saved>()
    const second = deferred<Saved>()
    api.create.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise)

    const a = store.set(2, sien, 'confirmed')
    const b = store.set(2, mira, 'confirmed')
    first.resolve(stored(201, { activity: [2], person: [5], status: 'confirmed' }))
    await a
    second.resolve(stored(202, { activity: [2], person: [9], status: 'confirmed' }))
    await b
    api.update.mockImplementation(async (_m, id, data) => stored(id, { activity: [2], person: [5], ...data }))
    await store.set(2, sien, 'maybe')

    expect(api.create).toHaveBeenCalledTimes(2)
    expect(api.update).toHaveBeenCalledTimes(1)
    expect(api.update).toHaveBeenCalledWith('assignment', 201, { status: 'maybe' })
    expect(status(2, sien)).toBe('maybe')

    await store.undo()
    await store.undo()
    await store.undo()
    expect(api.remove).toHaveBeenCalledWith('assignment', 202)
    expect(api.remove).toHaveBeenLastCalledWith('assignment', 201)
    expect(api.create).toHaveBeenCalledTimes(2)
  })

  const createdIds = (api: { create: { mock: { results: { value: unknown }[] } } }) =>
    Promise.all(api.create.mock.results.map(async (result) => (await result.value as Saved).row.id))

  it('undoes a change, a Delete, then the change again on the record the undo re-created; redo walks the same record', async () => {
    const { api, store, status } = setup()

    await store.set(1, sien, 'maybe')
    await store.set(1, sien, null)
    await store.undo()
    await store.undo()

    const [made] = await createdIds(api)
    expect(api.create).toHaveBeenCalledTimes(1)
    expect(api.update).toHaveBeenLastCalledWith('assignment', made, { status: 'confirmed' })
    expect(status(1, sien)).toBe('confirmed')

    await store.redo()
    await store.redo()
    expect(api.update).toHaveBeenLastCalledWith('assignment', made, { status: 'maybe' })
    expect(api.remove).toHaveBeenLastCalledWith('assignment', made)
    expect(api.create).toHaveBeenCalledTimes(1)
  })

  it('undoes a create, a Delete, then the create again by removing the record the undo re-created; redo walks the same record', async () => {
    const { api, store, cell } = setup()

    await store.set(2, sien, 'confirmed')
    await store.set(2, sien, null)
    await store.undo()
    await store.undo()

    const [first, again] = await createdIds(api)
    expect(api.remove.mock.calls).toEqual([['assignment', first], ['assignment', again]])
    expect(cell(2, sien)).toBeUndefined()

    await store.redo()
    await store.redo()
    const [, , third] = await createdIds(api)
    expect(api.create).toHaveBeenCalledTimes(3)
    expect(api.remove).toHaveBeenLastCalledWith('assignment', third)
    expect(cell(2, sien)).toBeUndefined()
  })

  it('undoes a Delete in a shared cell by creating the record again, leaving the other join alone; redo removes the new one', async () => {
    const { api, store } = setup()

    await store.set(3, sien, null)
    expect(api.remove).toHaveBeenCalledWith('assignment', 30)
    await store.undo()

    expect(api.create).toHaveBeenCalledWith('assignment', { activity: [3], person: [5], status: 'confirmed', note: 'vroeg' })
    expect(api.update).not.toHaveBeenCalled()
    const made = (await api.create.mock.results[0].value as Saved).row.id

    await store.redo()
    expect(api.remove).toHaveBeenLastCalledWith('assignment', made)
    expect(api.remove).not.toHaveBeenCalledWith('assignment', 31)
  })

  it('undoes and redoes one change', async () => {
    const { api, store, status } = setup()

    await store.set(1, sien, 'maybe')
    await store.undo()

    expect(api.update).toHaveBeenLastCalledWith('assignment', 11, { status: 'confirmed' })
    expect(status(1, sien)).toBe('confirmed')
    expect(store.getState()).toMatchObject({ canUndo: false, canRedo: true })

    await store.redo()
    expect(api.update).toHaveBeenLastCalledWith('assignment', 11, { status: 'maybe' })
    expect(store.getState()).toMatchObject({ canUndo: true, canRedo: false })
  })

  it('undoes a create by removing the record it made', async () => {
    const { api, store, cell } = setup()

    await store.set(2, sien, 'confirmed')
    const made = cell(2, sien)!.id
    await store.undo()

    expect(api.remove).toHaveBeenCalledWith('assignment', made)
    expect(cell(2, sien)).toBeUndefined()
  })

  it('undoes a Delete by creating the record again with its status and its note', async () => {
    const { api, store, cell } = setup()

    await store.set(1, sien, null)
    await store.undo()

    expect(api.create).toHaveBeenCalledWith('assignment', { activity: [1], person: [5], status: 'confirmed', note: 'laat' })
    expect(cell(1, sien)?.fields).toMatchObject({ status: 'confirmed', note: 'laat' })
  })
})

describe('move', () => {
  it('puts another person on the same join record in one write, keeping its other fields, and one undo takes it back', async () => {
    const s = setup()
    const before = { ...s.server.get(11)! }
    s.server.set(11, { ...before, role: [8], note: 'brengt gitaar' })

    expect(await s.store.move(1, 11, 9)).toBe(true)

    expect(s.api.update).toHaveBeenCalledTimes(1)
    expect(s.api.update).toHaveBeenCalledWith('assignment', 11, { person: [9] })
    expect([s.api.create, s.api.remove].map((f) => f.mock.calls.length)).toEqual([0, 0])
    expect(s.server.get(11)).toMatchObject({ person: [9], role: [8], note: 'brengt gitaar', status: before.status })
    expect(s.status(1, mira)).toBe(before.status)
    expect(s.cell(1, sien)).toBeUndefined()

    await s.store.undo()
    expect(s.api.undoBatch).toHaveBeenCalledTimes(1)
    expect(s.server.get(11)).toMatchObject({ person: [5], role: [8] })
    expect(s.status(1, sien)).toBe(before.status)
  })
})

describe('fill-down and paste', () => {
  it('fills the first row\'s status down a column as one undo step', async () => {
    const { api, store, status } = setup()

    await store.fillDown(sien, [1, 2, 3, 4])

    expect(api.create).toHaveBeenCalledTimes(2)
    expect(api.create).toHaveBeenCalledWith('assignment', { activity: [2], person: [5], status: 'confirmed' })
    expect(api.create).toHaveBeenCalledWith('assignment', { activity: [4], person: [5], status: 'confirmed' })
    expect(api.update).not.toHaveBeenCalled()
    expect([2, 4].map((row) => status(row, sien))).toEqual(['confirmed', 'confirmed'])

    await store.undo()
    expect(api.remove).toHaveBeenCalledTimes(2)
    expect([2, 4].map((row) => status(row, sien))).toEqual([undefined, undefined])
    expect(store.getState().canUndo).toBe(false)
  })

  it('pastes a block of keys, marks or values as one undo step', async () => {
    const { api, store, status } = setup()

    await store.paste([['x', '?'], ['✕', 'confirmed']], { rows: [2, 4], columns: [sien, lieve] })

    expect([status(2, sien), status(2, lieve), status(4, sien), status(4, lieve)]).toEqual(['confirmed', 'maybe', 'declined', 'confirmed'])
    expect(api.create).toHaveBeenCalledTimes(4)
    await store.undo()
    expect([status(2, sien), status(2, lieve), status(4, sien), status(4, lieve)]).toEqual([undefined, undefined, undefined, undefined])
    expect(store.getState().canUndo).toBe(false)
  })

  it('skips a pasted word it cannot read, and clears on an empty one', async () => {
    const { api, store, status } = setup()

    await store.paste([['banana'], ['']], { rows: [2, 1], columns: [sien] })

    expect(api.create).not.toHaveBeenCalled()
    expect(api.remove).toHaveBeenCalledWith('assignment', 11)
    expect(status(1, sien)).toBeUndefined()
  })

  it.each(['constructor', 'toString', '__proto__'])('reads a pasted %j as no status: nothing is created or changed', async (word) => {
    const { api, store, status } = setup()

    await store.paste([[word], [word]], { rows: [2, 1], columns: [sien] })

    expect(api.create).not.toHaveBeenCalled()
    expect(api.update).not.toHaveBeenCalled()
    expect(api.remove).not.toHaveBeenCalled()
    expect([status(2, sien), status(1, sien)]).toEqual([undefined, 'confirmed'])
  })

  it('stops a fill at the first refusal: the rest is never sent, what landed is the one undo step', async () => {
    const { keep, api, store, status } = setup()
    api.create
      .mockImplementationOnce(async (_m, data) => keep(stored(201, data)))
      .mockRejectedValueOnce({ code: 'duplicate_assignment', message: 'No.' })

    await store.fillDown(sien, [1, 2, 4, 5])

    expect(api.create).toHaveBeenCalledTimes(2)
    expect([status(2, sien), status(4, sien), status(5, sien)]).toEqual(['confirmed', undefined, undefined])
    expect(store.cellError(4, sien)?.code).toBe('duplicate_assignment')
    await store.undo()
    expect(api.remove).toHaveBeenCalledWith('assignment', 201)
    expect(status(2, sien)).toBeUndefined()
    expect(store.getState().canUndo).toBe(false)
  })

  it('stops a paste at the first refusal and leaves no step when nothing landed', async () => {
    const { api, store, status } = setup()
    api.create.mockRejectedValueOnce({ code: 'rate_limited', message: 'Slow down.' })

    await store.paste([['x', 'x']], { rows: [2], columns: [sien, lieve] })

    expect(api.create).toHaveBeenCalledTimes(1)
    expect([status(2, sien), status(2, lieve)]).toEqual([undefined, undefined])
    expect(store.getState().canUndo).toBe(false)
  })
})

describe('a stale cell', () => {
  const duplicate = { code: 'duplicate_assignment', message: 'This person is already on this activity.' }

  it('asks once for the window\'s rows after a refusal, and paints what the server holds under the message', async () => {
    setStrings({ 'error.duplicate_assignment': 'Deze persoon staat al op deze activiteit' })
    const { api, store, status, onStale, otherTab } = setup()
    otherTab()
    api.create.mockRejectedValueOnce(duplicate)

    expect(await store.set(2, sien, 'confirmed')).toBe(false)
    await settled()

    expect(onStale).toHaveBeenCalledTimes(1)
    expect(status(2, sien)).toBe('confirmed')
    expect(store.cellError(2, sien)?.message).toBe('Deze persoon staat al op deze activiteit')
  })

  it('makes a retry an update of the record it did not know, even one typed before the refresh answers; its undo restores it', async () => {
    const { api, store, status, onStale, otherTab, window } = setup()
    otherTab()
    api.create.mockRejectedValueOnce(duplicate)
    const answer = deferred<Row[]>()
    onStale.mockReturnValueOnce(answer.promise)

    await store.set(2, sien, 'confirmed')
    const retry = store.set(2, sien, 'maybe')
    await settled()
    expect(api.create).toHaveBeenCalledTimes(1)
    answer.resolve(window())
    await retry

    expect(onStale).toHaveBeenCalledTimes(1)
    expect(api.create).toHaveBeenCalledTimes(1)
    expect(api.update).toHaveBeenCalledWith('assignment', 400, { status: 'maybe' })
    expect(status(2, sien)).toBe('maybe')
    expect(store.cellError(2, sien)).toBeNull()

    await store.undo()
    expect(api.update).toHaveBeenLastCalledWith('assignment', 400, { status: 'confirmed' })
    expect(api.remove).not.toHaveBeenCalled()
  })

  it('stops a fill at the refusal, refreshes once, and keeps what landed as its one undo step', async () => {
    const { keep, api, store, status, onStale, otherTab } = setup()
    otherTab()
    api.create.mockImplementationOnce(async (_m, data) => keep(stored(201, data))).mockRejectedValueOnce(duplicate)

    await store.fillDown(sien, [1, 2, 4, 5])
    await settled()

    expect(onStale).toHaveBeenCalledTimes(1)
    expect(api.create).toHaveBeenCalledTimes(2)
    expect(status(4, sien)).toBe('confirmed')
    expect(store.getState().canUndo).toBe(true)
    await store.undo()
    expect(api.remove).toHaveBeenCalledTimes(1)
    expect(store.getState().canUndo).toBe(false)
  })
})

describe('a refresh racing a write on another row', () => {
  const refused = { code: 'duplicate_assignment', message: 'This person is already on this activity.' }

  /** A refusal on row 2 asks for a refresh that answers only when `answer` is resolved, with the snapshot taken now. */
  async function refusalWithHeldRefresh(t: ReturnType<typeof setup>, snapshot: Row[]) {
    const answer = deferred<Row[]>()
    t.onStale.mockReturnValueOnce(answer.promise)
    t.api.create.mockRejectedValueOnce(refused)
    await t.store.set(2, sien, 'confirmed')
    expect(t.onStale).toHaveBeenCalledTimes(1)
    return () => answer.resolve(snapshot)
  }

  it('keeps a create that landed while the refresh was out, and its undo removes that record', async () => {
    const t = setup()
    const created = deferred<Saved>()
    t.api.create.mockReturnValueOnce(created.promise)
    const writing = t.store.set(4, mira, 'confirmed')
    const answer = await refusalWithHeldRefresh(t, t.window())

    created.resolve(t.keep(stored(500, { activity: [4], person: [9], status: 'confirmed' })))
    await writing
    answer()
    await settled()

    expect(t.status(4, mira)).toBe('confirmed')
    await t.store.set(4, mira, 'maybe')
    expect(t.api.update).toHaveBeenCalledWith('assignment', 500, { status: 'maybe' })
    await t.store.undo()
    await t.store.undo()
    expect(t.api.remove).toHaveBeenCalledWith('assignment', 500)
  })

  it('keeps an update that landed while the refresh was out', async () => {
    const t = setup()
    const updated = deferred<Saved>()
    t.api.update.mockReturnValueOnce(updated.promise)
    const writing = t.store.set(1, sien, 'maybe')
    const answer = await refusalWithHeldRefresh(t, t.window())

    updated.resolve(stored(11, { activity: [1], person: [5], status: 'maybe', note: 'laat' }))
    await writing
    answer()
    await settled()

    expect(t.status(1, sien)).toBe('maybe')
  })

  it('keeps a Delete that landed while the refresh was out', async () => {
    const t = setup()
    const removed = deferred<unknown>()
    t.api.remove.mockReturnValueOnce(removed.promise)
    const writing = t.store.set(1, sien, null)
    const answer = await refusalWithHeldRefresh(t, t.window())

    removed.resolve({ deleted: true, id: 11 })
    await writing
    answer()
    await settled()

    expect(t.cell(1, sien)).toBeUndefined()
  })

  it('counts a write refused while the refresh was out: that row is not overwritten either', async () => {
    const t = setup()
    const updated = deferred<Saved>()
    t.api.update.mockReturnValueOnce(updated.promise)
    const writing = t.store.set(1, sien, 'maybe')
    const snapshot = t.window().map((row) => (row.id === 1
      ? activity(1, [join(11, { activity: [1], person: [5], status: 'declined', note: 'laat' }), join(12, { activity: [1], name: 'Lieve', status: 'maybe' })])
      : row))
    const answer = await refusalWithHeldRefresh(t, snapshot)

    updated.reject({ code: 'bad', message: 'No.' })
    await writing
    answer()
    await settled()

    expect(t.status(1, sien)).toBe('confirmed')
  })

  it('refreshes a row nothing touched while the refresh was out', async () => {
    const t = setup()
    const updated = deferred<Saved>()
    t.api.update.mockReturnValueOnce(updated.promise)
    const writing = t.store.set(1, sien, 'maybe')
    t.otherTab()
    const answer = await refusalWithHeldRefresh(t, t.window())

    updated.resolve(stored(11, { activity: [1], person: [5], status: 'maybe', note: 'laat' }))
    await writing
    answer()
    await settled()

    expect(t.status(4, sien)).toBe('confirmed')
    expect(t.status(1, sien)).toBe('maybe')
  })
})

describe('refusals while a refresh is out', () => {
  const refused = { code: 'duplicate_assignment', message: 'This person is already on this activity.' }
  const ticks = async () => {
    for (let i = 0; i < 5; i++) await settled()
  }

  it('runs one follow-up refresh for a row refused during the window, so its retry updates the record it did not know', async () => {
    const t = setup()
    t.otherTab()
    const held = deferred<Row[]>()
    t.onStale.mockReturnValueOnce(held.promise)
    const created = deferred<Saved>()
    t.api.create.mockReturnValueOnce(created.promise).mockRejectedValueOnce(refused)
    const row4 = t.store.set(4, sien, 'confirmed')
    await t.store.set(2, sien, 'confirmed')
    const snapshot = t.window()

    created.reject(refused)
    expect(await row4).toBe(false)
    held.resolve(snapshot)
    await ticks()

    expect(t.onStale).toHaveBeenCalledTimes(2)
    expect(t.status(4, sien)).toBe('confirmed')
    expect(t.cell(4, sien)?.id).toBe(401)
    await t.store.set(4, sien, 'maybe')
    expect(t.api.update).toHaveBeenCalledWith('assignment', 401, { status: 'maybe' })
    expect(t.api.create).toHaveBeenCalledTimes(2)
  })

  it('coalesces many refusals during one window into one follow-up', async () => {
    const t = setup()
    const held = deferred<Row[]>()
    t.onStale.mockReturnValueOnce(held.promise)
    const writes = [deferred<Saved>(), deferred<Saved>()]
    const changed = deferred<Saved>()
    t.api.create.mockReturnValueOnce(writes[0].promise).mockReturnValueOnce(writes[1].promise).mockRejectedValueOnce(refused)
    t.api.update.mockReturnValueOnce(changed.promise)
    const pending = [t.store.set(4, sien, 'confirmed'), t.store.set(5, sien, 'confirmed'), t.store.set(1, sien, 'maybe')]
    await t.store.set(2, sien, 'confirmed')

    writes.forEach((w) => w.reject(refused))
    changed.reject(refused)
    await Promise.all(pending)
    held.resolve(t.window())
    await ticks()

    expect(t.onStale).toHaveBeenCalledTimes(2)
  })

  it('refreshes once for a refusal while no refresh is out', async () => {
    const t = setup()
    t.api.create.mockRejectedValueOnce(refused)

    await t.store.set(2, sien, 'confirmed')
    await ticks()

    expect(t.onStale).toHaveBeenCalledTimes(1)
  })

  it('does not loop on a refresh that fails: alone it is not retried; asked for during its window, one follow-up, then none', async () => {
    const t = setup()
    t.onStale.mockRejectedValue({ code: 'unknown', message: 'offline' })
    t.api.create.mockRejectedValueOnce(refused)
    await t.store.set(2, sien, 'confirmed')
    await ticks()
    expect(t.onStale).toHaveBeenCalledTimes(1)

    const held = deferred<Row[]>()
    t.onStale.mockReturnValueOnce(held.promise)
    const created = deferred<Saved>()
    t.api.create.mockReturnValueOnce(created.promise).mockRejectedValueOnce(refused)
    const row4 = t.store.set(4, sien, 'confirmed')
    await t.store.set(2, sien, 'confirmed')
    created.reject(refused)
    await row4
    held.reject({ code: 'unknown', message: 'offline' })
    await ticks()

    expect(t.onStale).toHaveBeenCalledTimes(3)
  })

})

describe('on a join whose cell is its lifecycle column', () => {
  // 'invited' and 'confirmed' stand for uitgenodigd and bevestigd; a write-mode PATCH back would be a refused transition.
  const lifecycle: View = { ...view, join: { ...view.join!, lifecycle: 'status', keys: { u: 'invited', b: 'confirmed' }, marks: { ...view.join!.marks, invited: '?' } } }
  const DELETE_SKIPPED = 'Verwijderen kan niet ongedaan gemaakt worden'
  const REDO_SKIPPED = 'Opnieuw doen kan hier niet'
  const madeId = async (api: ReturnType<typeof setup>['api'], nth: number) => ((await api.create.mock.results[nth].value) as Saved).row.id

  it('u then b, then Ctrl+Z restores through the batch undo and sends no PATCH back; redo undoes the undo', async () => {
    const { api, store, status, held } = setup(lifecycle)

    await store.set(2, sien, 'invited')
    await store.set(2, sien, 'confirmed')
    const made = await madeId(api, 0)
    const changed = ((await api.update.mock.results[0].value) as Saved).batch
    expect(api.update).toHaveBeenCalledWith('assignment', made, { status: 'confirmed' }, { status: 'invited' })

    await store.undo()
    expect(api.undoBatch).toHaveBeenCalledWith(changed)
    expect(api.update).toHaveBeenCalledTimes(1)
    expect([status(2, sien), held(made)]).toEqual(['invited', 'invited'])

    await store.redo()
    expect(api.undoBatch).toHaveBeenLastCalledWith(`u${changed}`)
    expect(api.update).toHaveBeenCalledTimes(1)
    expect([status(2, sien), held(made)]).toEqual(['confirmed', 'confirmed'])
    expect(store.getState()).toMatchObject({ canUndo: true, canRedo: false })
  })

  it('undoes interleaved state and note edits in order from one stack; a note goes back by its PATCH, without expect', async () => {
    const { api, store, status, cell, held } = setup(lifecycle)

    await store.set(1, sien, 'invited')
    await store.setNote(1, sien, 'vroeg')
    await store.set(1, sien, 'confirmed')
    expect(api.update.mock.calls[1]).toEqual(['assignment', 11, { note: 'vroeg' }])
    const [first, , third] = await Promise.all(api.update.mock.results.map(async (r) => ((await r.value) as Saved).batch))

    await store.undo()
    expect(api.undoBatch.mock.calls).toEqual([[third]])
    await store.undo()
    expect(api.update.mock.calls[3]).toEqual(['assignment', 11, { note: 'laat' }])
    await store.undo()
    expect(api.undoBatch.mock.calls).toEqual([[third], [first]])
    expect([status(1, sien), cell(1, sien)?.fields.note, held(11)]).toEqual(['confirmed', 'laat', 'confirmed'])
    expect(store.getState().canUndo).toBe(false)
  })

  it('a redo the server refuses as not_undoable (an undone invite) shows the notice; the step is gone, the cell as undone', async () => {
    const { api, store, onNotice, status, held } = setup(lifecycle)
    await store.set(1, sien, 'invited')
    await store.undo()
    expect([status(1, sien), held(11)]).toEqual(['confirmed', 'confirmed'])

    api.undoBatch.mockRejectedValueOnce({ code: 'not_undoable', message: 'a batch that minted tokens is not redone' })
    await store.redo()
    await settled()

    expect(onNotice).toHaveBeenCalledWith(REDO_SKIPPED)
    expect(store.cellError(1, sien)).toBeNull()
    expect([status(1, sien), held(11)]).toEqual(['confirmed', 'confirmed'])
    expect(store.getState()).toMatchObject({ canUndo: false, canRedo: false })
  })

  it('Ctrl+Z after clearing a cell shows the notice and writes nothing; the step is gone', async () => {
    const { api, store, onNotice, cell } = setup(lifecycle)

    await store.set(1, sien, null)
    await store.undo()

    expect(onNotice).toHaveBeenCalledWith(DELETE_SKIPPED)
    expect(api.create).not.toHaveBeenCalled()
    expect(api.undoBatch).not.toHaveBeenCalled()
    expect(cell(1, sien)).toBeUndefined()
    expect(store.getState()).toMatchObject({ canUndo: false, canRedo: false })
  })

  it('paste empty over an invited cell, Ctrl+Z: the notice shows and nothing is written', async () => {
    const { api, store, onNotice, cell } = setup(lifecycle)
    await store.set(2, sien, 'invited')

    await store.paste([['']], { rows: [2], columns: [sien] })
    expect(api.remove).toHaveBeenCalledWith('assignment', await madeId(api, 0))
    await store.undo()

    expect(onNotice).toHaveBeenCalledWith(DELETE_SKIPPED)
    expect(api.create).toHaveBeenCalledTimes(1)
    expect(api.undoBatch).not.toHaveBeenCalled()
    expect(cell(2, sien)).toBeUndefined()
    expect(store.getState().canRedo).toBe(false)
  })

  it('a fill-down of b over three u cells undoes per op through the batch undo, last first', async () => {
    const { api, store, status } = setup(lifecycle)
    for (const row of [2, 4, 5]) await store.set(row, sien, 'invited')
    await store.set(1, sien, 'confirmed')

    await store.fillDown(sien, [1, 2, 4, 5])
    const ids = await Promise.all([0, 1, 2].map((n) => madeId(api, n)))
    expect(api.update.mock.calls).toEqual(ids.map((id) => ['assignment', id, { status: 'confirmed' }, { status: 'invited' }]))
    const filled = await Promise.all(api.update.mock.results.map(async (r) => ((await r.value) as Saved).batch))

    await store.undo()
    expect(api.undoBatch.mock.calls).toEqual([...filled].reverse().map((batch) => [batch]))
    expect([2, 4, 5].map((row) => status(row, sien))).toEqual(['invited', 'invited', 'invited'])
    expect(api.update).toHaveBeenCalledTimes(3)
  })

  it('empty → u, Ctrl+Z, Ctrl+Shift+Z: the undo removes it by its batch, the redo is skipped with its notice', async () => {
    const { api, store, onNotice, cell } = setup(lifecycle)

    await store.set(2, sien, 'invited')
    await store.undo()
    expect(api.undoBatch).toHaveBeenCalledTimes(1)
    expect(cell(2, sien)).toBeUndefined()

    await store.redo()
    expect(onNotice).toHaveBeenCalledWith(REDO_SKIPPED)
    expect(api.undoBatch).toHaveBeenCalledTimes(1)
    expect(api.create).toHaveBeenCalledTimes(1)
    expect(cell(2, sien)).toBeUndefined()
    expect(store.getState()).toMatchObject({ canUndo: false, canRedo: false })
  })

  it('clear a cell after an earlier u → b: Ctrl+Z shows the notice, a second Ctrl+Z undoes the u → b', async () => {
    const { api, store, onNotice, status } = setup(lifecycle)
    await store.set(2, sien, 'invited')
    await store.set(2, sien, 'confirmed')
    await store.set(1, lieve, null)

    await store.undo()
    expect(onNotice).toHaveBeenCalledWith(DELETE_SKIPPED)
    expect(api.undoBatch).not.toHaveBeenCalled()

    await store.undo()
    expect(api.undoBatch).toHaveBeenCalledWith(((await api.update.mock.results[0].value) as Saved).batch)
    expect(status(2, sien)).toBe('invited')
  })

  it('paste b and empty over two u cells: Ctrl+Z restores the b cell to u and skips the cleared one', async () => {
    const { api, store, onNotice, status, cell } = setup(lifecycle)
    await store.set(2, sien, 'invited')
    await store.set(4, sien, 'invited')

    await store.paste([['b'], ['']], { rows: [2, 4], columns: [sien] })
    await store.undo()

    expect(api.undoBatch).toHaveBeenCalledTimes(1)
    expect(onNotice).toHaveBeenCalledWith(DELETE_SKIPPED)
    expect(status(2, sien)).toBe('invited')
    expect(cell(4, sien)).toBeUndefined()
    expect(store.getState()).toMatchObject({ canUndo: true, canRedo: true })

    await store.redo()
    expect(api.undoBatch).toHaveBeenCalledTimes(2)
    expect(status(2, sien)).toBe('confirmed')
  })

  it('a note on a cell later cleared: Ctrl+Z skips the clear, then the note, never re-creating; a third reaches the older state change', async () => {
    const { api, store, onNotice, cell, status } = setup(lifecycle)
    await store.set(2, sien, 'invited')
    await store.setNote(1, sien, 'vroeg')
    await store.set(1, sien, null)

    await store.undo()
    await store.undo()
    expect(onNotice.mock.calls).toEqual([[DELETE_SKIPPED], [DELETE_SKIPPED]])
    expect(api.create).toHaveBeenCalledTimes(1)
    expect(cell(1, sien)).toBeUndefined()

    await store.undo()
    expect(api.undoBatch).toHaveBeenCalledTimes(1)
    expect(cell(2, sien)).toBeUndefined()
    expect(status(1, lieve)).toBe('maybe')
    expect(api.create).toHaveBeenCalledTimes(1)
    expect(store.getState().canUndo).toBe(false)
  })

  it('empty → u, a note, Ctrl+Z twice, then Ctrl+Shift+Z twice: both redos are skipped and nothing is re-created', async () => {
    const { api, store, onNotice, cell } = setup(lifecycle)
    await store.set(2, sien, 'invited')
    await store.setNote(2, sien, 'vroeg')

    await store.undo()
    await store.undo()
    expect(cell(2, sien)).toBeUndefined()
    await store.redo()
    await store.redo()

    expect(onNotice.mock.calls).toEqual([[REDO_SKIPPED], [DELETE_SKIPPED]])
    expect(api.create).toHaveBeenCalledTimes(1)
    expect(cell(2, sien)).toBeUndefined()
    expect(store.getState()).toMatchObject({ canUndo: false, canRedo: false })
  })

  it('a state key on a cell whose state moved on the server is 409: the cell refreshes and the Dutch message shows', async () => {
    const { api, store, status, server, onStale } = setup(lifecycle)
    server.set(11, { ...server.get(11), status: 'declined' })
    api.update.mockRejectedValueOnce({ code: 'transition_lost', message: '"status" is no longer confirmed' })

    expect(await store.set(1, sien, 'invited')).toBe(false)
    await settled()

    expect(api.update).toHaveBeenCalledWith('assignment', 11, { status: 'invited' }, { status: 'confirmed' })
    expect(onStale).toHaveBeenCalledTimes(1)
    expect(status(1, sien)).toBe('declined')
    expect(store.cellError(1, sien)?.message).toBe('De status is intussen gewijzigd. De cel toont nu wat er staat.')
  })
})

describe('a lifecycle undo the server refuses', () => {
  it('says why in Dutch on the cell, refreshes, and keeps the step to try again', async () => {
    const lifecycle: View = { ...view, join: { ...view.join!, lifecycle: 'status' } }
    const { api, store, onStale } = setup(lifecycle)
    await store.set(1, sien, 'maybe')
    api.undoBatch.mockRejectedValueOnce({ code: 'changed_since', message: 'changed since', column: 'status', label: 'Status' })

    await store.undo()
    await settled()

    expect(store.cellError(1, sien)?.message).toBe('Status is intussen gewijzigd; ongedaan maken kan niet.')
    expect(onStale).toHaveBeenCalledTimes(1)
    expect(store.getState()).toMatchObject({ canUndo: true, canRedo: false })
  })
})

describe('filling an open slot', () => {
  // 'pencilled' stands for voorlopig: the fill writes it, and an open row has no person and no name.
  const open: View = {
    ...view,
    join: { ...view.join!, lifecycle: 'status', marks: { ...view.join!.marks, pencilled: '~' }, open: { match_field: 'role', count_field: 'size', action: 'fill_slot', input: 'person' } },
  }
  const REDO_SKIPPED = 'Opnieuw doen kan hier niet'
  const start = (size: number): Row[] => [activity(1), activity(2, [join(70, { activity: [2], role: [8], size, status: 'open' })])]
  const slots = (s: ReturnType<typeof setup>) => cellsFor(open, s.store.getState().rows.find((r) => r.id === 2)!, OPEN).map((c) => c.fields.size)

  function filling(size: number) {
    const s = setup(open, start(size))
    const before = { ...s.server.get(70)! }
    s.api.runAction.mockImplementation(async (_name, id, input) => {
      const filled = { activity: [2], role: [8], size: 1, person: [input.person], status: 'pencilled' }
      if (size === 1) return s.server.set(id, { ...s.server.get(id), ...filled }), { batch: 'f1', created: [] }
      s.server.set(id, { ...s.server.get(id), size: size - 1 })
      s.server.set(71, filled)
      return { batch: 'f1', created: [{ dataset: 'assignment', id: 71 }] }
    })
    s.api.undoBatch.mockImplementation(async (batch) => {
      s.server.set(70, before)
      s.server.delete(71)
      return `u${batch}`
    })
    return s
  }

  it('fills in place through the action, and paints what the server then holds', async () => {
    const s = filling(1)

    expect(await s.store.fill(2, 70, 5)).toBe(true)

    expect(s.api.runAction).toHaveBeenCalledWith('fill_slot', 70, { person: 5 })
    expect(s.status(2, sien)).toBe('pencilled')
    expect(slots(s)).toEqual([])
  })

  it('undoes the fill by its batch, re-sending no write; redo undoes the undo', async () => {
    const s = filling(1)
    await s.store.fill(2, 70, 5)

    await s.store.undo()
    expect(s.api.undoBatch).toHaveBeenCalledWith('f1')
    expect([s.api.update, s.api.create, s.api.remove].map((f) => f.mock.calls.length)).toEqual([0, 0, 0])
    expect(s.api.runAction).toHaveBeenCalledTimes(1)
    expect(s.cell(2, sien)).toBeUndefined()
    expect(slots(s)).toEqual([1])

    s.api.undoBatch.mockImplementationOnce(async (batch) => {
      s.server.set(70, { ...s.server.get(70), person: [5], status: 'pencilled' })
      return `u${batch}`
    })
    await s.store.redo()
    expect(s.api.undoBatch).toHaveBeenLastCalledWith('uf1')
    expect(s.api.runAction).toHaveBeenCalledTimes(1)
    expect(s.status(2, sien)).toBe('pencilled')
  })

  it('a split fill undoes by its batch to the one open row; its redo would re-create, so it is skipped with the notice', async () => {
    const s = filling(3)
    await s.store.fill(2, 70, 5)
    expect([s.status(2, sien), slots(s)]).toEqual(['pencilled', [2]])

    await s.store.undo()
    expect(s.api.undoBatch).toHaveBeenCalledWith('f1')
    expect([s.cell(2, sien), slots(s)]).toEqual([undefined, [3]])

    await s.store.redo()
    expect(s.onNotice).toHaveBeenCalledWith(REDO_SKIPPED)
    expect(s.api.undoBatch).toHaveBeenCalledTimes(1)
    expect(s.api.runAction).toHaveBeenCalledTimes(1)
    expect(s.store.getState()).toMatchObject({ canUndo: false, canRedo: false })
  })

  it('a fill whose re-read fails keeps its undo step, and the cells come from a refresh', async () => {
    const s = filling(1)
    s.onStale.mockRejectedValueOnce(new Error('offline'))

    expect(await s.store.fill(2, 70, 5)).toBe(true)
    await settled()

    expect(s.store.getState()).toMatchObject({ canUndo: true, error: null })
    expect(s.onStale).toHaveBeenCalledTimes(2)
    expect(s.status(2, sien)).toBe('pencilled')
    await s.store.undo()
    expect(s.api.undoBatch).toHaveBeenCalledWith('f1')
  })

  it('an undo whose re-read fails stays undone: the next Ctrl+Z does not re-apply the fill, the step waits on redo', async () => {
    const s = filling(1)
    await s.store.fill(2, 70, 5)
    s.onStale.mockRejectedValueOnce(new Error('offline'))

    await s.store.undo()
    await settled()
    expect(s.store.getState()).toMatchObject({ canUndo: false, canRedo: true })

    await s.store.undo()
    expect(s.api.undoBatch).toHaveBeenCalledTimes(1)
    expect(s.cell(2, sien)).toBeUndefined()
    expect(slots(s)).toEqual([1])
  })

  it('a slot filled meanwhile is refused in Dutch on the open cell, refreshes, and leaves no undo step', async () => {
    const s = filling(1)
    s.api.runAction.mockRejectedValueOnce({ code: 'transition_lost', message: '"status" is no longer open' })

    expect(await s.store.fill(2, 70, 5)).toBe(false)
    await settled()

    expect(s.store.cellError(2, OPEN)?.message).toBe('De status is intussen gewijzigd. De cel toont nu wat er staat.')
    expect(s.onStale).toHaveBeenCalledTimes(1)
    expect(s.store.getState().canUndo).toBe(false)
  })
})
