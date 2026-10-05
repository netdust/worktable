import { afterEach, describe, expect, it, vi } from 'vitest'
import { setStrings } from '../i18n'
import type { MatrixColumn, Row, View } from '../types'
import { cellFor } from './columns'
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
/** The server's answer: the record it stored, as the rows route returns it. */
const stored = (id: number, fields: Record<string, unknown>): Row => ({ id, title: `join ${id}`, status: 'publish', fields: { name: '', note: '', person: [], ...fields } })

function setup() {
  const api = { create: vi.fn<MatrixApi['create']>(), update: vi.fn<MatrixApi['update']>(), remove: vi.fn<MatrixApi['remove']>() }
  // The server keeps every record whole: an update answers with all of its fields.
  const server = new Map<number, Record<string, unknown>>(rows.flatMap((row) => (row.rollups?.cells as ReturnType<typeof join>[]).map((cell) => [cell.id, cell.fields])))
  const keep = (row: Row) => (server.set(row.id, row.fields), row)
  api.create.mockImplementation(async (_model, data) => keep(stored(++next, data)))
  api.update.mockImplementation(async (_model, id, data) => keep(stored(id, { ...server.get(id), ...data })))
  api.remove.mockImplementation(async (_model, id) => (server.delete(id), { deleted: true, id }))
  // The rows route: each row with the records the server holds for it now.
  const window = () => rows.map((row) => activity(row.id, [...server].filter(([, f]) => (f.activity as number[])?.[0] === row.id).map(([id, f]) => join(id, f))))
  const onStale = vi.fn(async () => window())
  // Another tab puts Sien, confirmed, on activities 2 (record 400) and 4 (record 401).
  const otherTab = () => {
    server.set(400, join(400, { activity: [2], person: [5], status: 'confirmed' }).fields)
    server.set(401, join(401, { activity: [4], person: [5], status: 'confirmed' }).fields)
  }
  const store = createMatrixStore({ view, rows, api, onStale })
  const cell = (row: number, column: MatrixColumn) => cellFor(view, store.getState().rows.find((r) => r.id === row)!, column)
  const status = (row: number, column: MatrixColumn) => cell(row, column)?.fields.status
  return { api, store, cell, status, onStale, otherTab, window, keep }
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
    const answer = deferred<Row>()
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
    const answer = deferred<Row>()
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
    const first = deferred<Row>()
    const second = deferred<Row>()
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
    Promise.all(api.create.mock.results.map(async (result) => (await result.value as Row).id))

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
    const made = (await api.create.mock.results[0].value as Row).id

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
    const created = deferred<Row>()
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
    const updated = deferred<Row>()
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
    const updated = deferred<Row>()
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
    const updated = deferred<Row>()
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
    const created = deferred<Row>()
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
    const writes = [deferred<Row>(), deferred<Row>()]
    const changed = deferred<Row>()
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
    const created = deferred<Row>()
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
