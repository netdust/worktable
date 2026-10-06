import { afterEach, describe, expect, it, vi } from 'vitest'
import { create, forgetSchema, rowOf, undoBatch, update } from '../api'
import type { EngineSchema } from '../engine'
import type { Row, Saved } from '../types'
import { createHistory } from '../ui/history'
import { calais } from './calais.test.data'
import { createStore, type StoreApi } from './store'

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

function setup(rows: Row[] = calais) {
  const api = {
    update: vi.fn<StoreApi['update']>(), create: vi.fn<StoreApi['create']>(),
    read: vi.fn<NonNullable<StoreApi['read']>>(), undo: vi.fn<NonNullable<StoreApi['undo']>>(),
  }
  const history = createHistory(api.undo)
  const reload = vi.fn()
  const store = createStore({ model: 'activity', rows, api, history, reload })
  const row = (id: number) => store.getState().rows.find((r) => r.id === id)!
  return { api, store, row, history, reload }
}

const ok = (row: Row, batch: string | null = 'b1'): Saved => ({ row, batch })
const served = (row: Row, fields: Record<string, unknown>, extra: Partial<Row> = {}): Saved => ok({ ...row, fields: { ...row.fields, ...fields }, ...extra })

describe('apply', () => {
  it('paints the change before the server answers, then takes the row the server returns', async () => {
    const { api, store, row } = setup()
    const answer = deferred<Saved>()
    api.update.mockReturnValueOnce(answer.promise)

    const done = store.apply({ id: 103, field: 'kind', value: 'show' })

    expect(row(103).fields.kind).toBe('show')
    expect(store.getState().save).toBe('saving')
    expect(api.update).toHaveBeenCalledWith('activity', 103, { kind: 'show' }, expect.objectContaining({ id: 103 }))

    answer.resolve(served(calais[2], { kind: 'show' }, { rollups: { confirmed: 7 } }))
    await done

    expect(row(103).rollups).toEqual({ confirmed: 7 })
    expect(store.getState().save).toBe('saved')
  })

  it('writes the title as the title', async () => {
    const { api, store, row } = setup()
    api.update.mockResolvedValueOnce(ok({ ...calais[0], title: 'Auto Pavel' }))

    await store.apply({ id: 101, field: 'title', value: 'Auto Pavel' })

    expect(api.update).toHaveBeenCalledWith('activity', 101, { title: 'Auto Pavel' }, expect.objectContaining({ id: 101 }))
    expect(row(101).title).toBe('Auto Pavel')
  })

  it('reverts the cell on a refusal and raises the code and message on that cell', async () => {
    const { api, store, row } = setup()
    api.update.mockRejectedValueOnce({ code: 'title_required', message: 'A title is required.' })
    const listener = vi.fn()
    store.subscribe(listener)

    await store.apply({ id: 101, field: 'title', value: '' })

    expect(row(101).title).toBe('Auto Pavel + Sien')
    expect(store.getState().save).toBe('error')
    expect(store.getState().errors['101:title']).toEqual({ id: 101, field: 'title', code: 'title_required', message: 'A title is required.' })
    expect(store.getState().canUndo).toBe(false)
    expect(listener).toHaveBeenCalled()
  })

  it('clears the cell error once the next write to it lands', async () => {
    const { api, store } = setup()
    api.update.mockRejectedValueOnce({ code: 'bad', message: 'Bad.' }).mockResolvedValueOnce(served(calais[0], { start: '08:00' }))

    await store.apply({ id: 101, field: 'start', value: 'x' })
    await store.apply({ id: 101, field: 'start', value: '08:00' })

    expect(store.getState().errors).toEqual({})
    expect(store.getState().save).toBe('saved')
  })

  it('writes nothing when the value did not change', async () => {
    const { api, store } = setup()

    await store.apply({ id: 101, field: 'start', value: '07:30' })

    expect(api.update).not.toHaveBeenCalled()
  })
})

describe('undo and redo, by batch on the server', () => {
  const meal = calais[2]
  const show = { ...meal, fields: { ...meal.fields, kind: 'show' } }

  it('undo calls POST /batches/<batch of the edit>/undo and repaints by re-reading the affected row', async () => {
    const { api, store, row } = setup()
    api.update.mockResolvedValueOnce(ok(show, 'b-edit'))
    api.undo.mockResolvedValueOnce('b-undo')
    api.read.mockResolvedValueOnce({ ...meal, rollups: { confirmed: 2 } })

    await store.apply({ id: 103, field: 'kind', value: 'show' })
    expect(store.getState().canUndo).toBe(true)
    await store.undo()

    expect(api.undo).toHaveBeenCalledExactlyOnceWith('b-edit')
    expect(api.update).toHaveBeenCalledTimes(1)
    expect(api.read).toHaveBeenCalledWith('activity', 103)
    expect(row(103)).toMatchObject({ fields: { kind: 'meal' }, rollups: { confirmed: 2 } })
    expect(store.getState()).toMatchObject({ canUndo: false, canRedo: true, save: 'saved' })
  })

  it('redo undoes the undo batch', async () => {
    const { api, store, row } = setup()
    api.update.mockResolvedValueOnce(ok(show, 'b-edit'))
    api.undo.mockResolvedValueOnce('b-undo').mockResolvedValueOnce('b-redo')
    api.read.mockResolvedValueOnce(meal).mockResolvedValueOnce(show)

    await store.apply({ id: 103, field: 'kind', value: 'show' })
    await store.undo()
    await store.redo()

    expect(api.undo).toHaveBeenLastCalledWith('b-undo')
    expect(row(103).fields.kind).toBe('show')
    expect(store.getState()).toMatchObject({ canUndo: true, canRedo: false })
    await store.undo()
    expect(api.undo).toHaveBeenLastCalledWith('b-redo')
  })

  it('a redo answered not_undoable drops the redo entry and shows the localised message', async () => {
    const { api, store } = setup()
    api.update.mockResolvedValueOnce(ok(show, 'b-edit'))
    api.undo.mockResolvedValueOnce('b-undo').mockRejectedValueOnce({ code: 'not_undoable', message: 'a batch holding a delete cannot be undone' })
    api.read.mockResolvedValue(meal)

    await store.apply({ id: 103, field: 'kind', value: 'show' })
    await store.undo()
    await store.redo()

    expect(store.getState()).toMatchObject({ canUndo: false, canRedo: false, save: 'error' })
    expect(store.getState().error).toMatchObject({ code: 'not_undoable', message: 'Dit kan niet ongedaan gemaakt worden.' })
  })

  it('already_undone drops the entry and says so in Dutch', async () => {
    const { api, store } = setup()
    api.update.mockResolvedValueOnce(ok(show, 'b-edit'))
    api.undo.mockRejectedValueOnce({ code: 'already_undone', message: 'this batch is already undone' })

    await store.apply({ id: 103, field: 'kind', value: 'show' })
    await store.undo()

    expect(store.getState()).toMatchObject({ canUndo: false, canRedo: false })
    expect(store.getState().error?.message).toBe('Dit is al ongedaan gemaakt.')
  })

  it("changed_since keeps the entry, shows the Dutch message naming the column's label, and the row keeps the server's value", async () => {
    const { api, store, row } = setup()
    api.update.mockResolvedValueOnce(ok(show, 'b-edit'))
    api.undo.mockRejectedValueOnce({ code: 'changed_since', message: '"kind" changed since', column: 'kind', label: 'Soort' })

    await store.apply({ id: 103, field: 'kind', value: 'show' })
    await store.undo()

    expect(row(103).fields.kind).toBe('show')
    expect(api.read).not.toHaveBeenCalled()
    expect(store.getState()).toMatchObject({ canUndo: true, canRedo: false, save: 'error' })
    expect(store.getState().error?.message).toBe('Soort is intussen gewijzigd; ongedaan maken kan niet.')
  })

  it('a record removed since is named by its dataset label', async () => {
    const { api, store } = setup()
    api.update.mockResolvedValueOnce(ok(show, 'b-edit'))
    api.undo.mockRejectedValueOnce({ code: 'changed_since', message: '"deleted_at" changed since', column: 'deleted_at', label: 'Activiteiten' })

    await store.apply({ id: 103, field: 'kind', value: 'show' })
    await store.undo()

    expect(store.getState().error?.message).toBe('Activiteiten: dit record is intussen verwijderd; ongedaan maken kan niet.')
  })

  it("an undo pressed before the edit's answer waits for its batch id", async () => {
    const { api, store, row } = setup()
    const answer = deferred<Saved>()
    api.update.mockReturnValueOnce(answer.promise)
    api.undo.mockResolvedValueOnce('b-undo')
    api.read.mockResolvedValueOnce(meal)

    const typed = store.apply({ id: 103, field: 'kind', value: 'show' })
    const undone = store.undo()
    await Promise.resolve()
    expect(api.undo).not.toHaveBeenCalled()
    expect(store.getState()).toMatchObject({ canUndo: false, canRedo: true })

    answer.resolve(ok(show, 'b-late'))
    await Promise.all([typed, undone])
    expect(api.undo).toHaveBeenCalledExactlyOnceWith('b-late')
    expect(row(103).fields.kind).toBe('meal')
  })

  it('a quick redo waits for the undo batch it undoes', async () => {
    const { api, store } = setup()
    api.update.mockResolvedValueOnce(ok(show, 'b-edit'))
    const undoing = deferred<string>()
    api.undo.mockReturnValueOnce(undoing.promise).mockResolvedValueOnce('b-redo')
    api.read.mockResolvedValue(meal)
    await store.apply({ id: 103, field: 'kind', value: 'show' })

    const undone = store.undo()
    const redone = store.redo()
    undoing.resolve('b-undo')
    await Promise.all([undone, redone])

    expect(api.undo.mock.calls).toEqual([['b-edit'], ['b-undo']])
    expect(store.getState()).toMatchObject({ canUndo: true, canRedo: false })
  })

  it('a refused edit leaves no entry, and an undo pressed before the refusal sends nothing', async () => {
    const { api, store } = setup()
    const answer = deferred<Saved>()
    api.update.mockReturnValueOnce(answer.promise)

    const typed = store.apply({ id: 103, field: 'kind', value: 'show' })
    const undone = store.undo()
    answer.reject({ code: 'refused', message: 'No.' })
    await Promise.all([typed, undone])

    expect(api.undo).not.toHaveBeenCalled()
    expect(store.getState()).toMatchObject({ canUndo: false, canRedo: false })
  })

  it('an edit the server answers with no batch, as it changed nothing, leaves no entry', async () => {
    const { api, store } = setup()
    api.update.mockResolvedValueOnce(ok(show, null))

    await store.apply({ id: 103, field: 'kind', value: 'show' })

    expect(store.getState().canUndo).toBe(false)
  })

  it("an undo of another view's step, or of an action, reloads the view instead of re-reading a row", async () => {
    const { api, store, history, reload } = setup()
    api.undo.mockResolvedValue('b-undo')
    history.push({ batch: Promise.resolve('b-action'), model: 'activity', id: null })
    history.push({ batch: Promise.resolve('b-other'), model: 'speelreeks', id: 7 })

    await store.undo()
    await store.undo()

    expect(api.undo.mock.calls).toEqual([['b-other'], ['b-action']])
    expect(api.read).not.toHaveBeenCalled()
    expect(reload).toHaveBeenCalledTimes(2)
  })

  it('follows the history another store pushed to', async () => {
    const { store, history } = setup()
    const listener = vi.fn()
    store.subscribe(listener)

    history.push({ batch: Promise.resolve('b-action'), model: 'speelreeks', id: null })

    expect(listener).toHaveBeenCalled()
    expect(store.getState().canUndo).toBe(true)
  })

  it('a fresh change empties the redo stack', async () => {
    const { api, store } = setup()
    api.update.mockImplementation(async (_m, id, data) => served(calais.find((r) => r.id === id)!, data))
    api.undo.mockResolvedValue('b-undo')
    api.read.mockResolvedValue(meal)

    await store.apply({ id: 103, field: 'kind', value: 'show' })
    await store.undo()
    await store.apply({ id: 104, field: 'start', value: '11:00' })

    expect(store.getState().canRedo).toBe(false)
  })

  it('reverts two refused writes to one field to the value the server last confirmed', async () => {
    const { api, store, row } = setup()
    api.update.mockRejectedValue({ code: 'bad', message: 'No.' })

    await Promise.all([
      store.apply({ id: 102, field: 'start', value: '11:00' }),
      store.apply({ id: 102, field: 'start', value: '12:00' }),
    ])

    expect(row(102).fields.start).toBe('10:00')
  })

  it('sends one write at a time per record and paints the last answer', async () => {
    const { api, store, row } = setup()
    const one = deferred<Saved>()
    const two = deferred<Saved>()
    api.update.mockReturnValueOnce(one.promise).mockReturnValueOnce(two.promise)

    const first = store.apply({ id: 102, field: 'start', value: '11:00' })
    const second = store.apply({ id: 102, field: 'place', value: 'Zaal 2' })
    await Promise.resolve()
    expect(api.update).toHaveBeenCalledTimes(1)

    one.resolve(served(calais[1], { start: '11:00' }))
    await vi.waitFor(() => expect(api.update).toHaveBeenCalledTimes(2))
    expect(row(102).fields).toMatchObject({ start: '11:00', place: 'Zaal 2' })

    two.resolve(served(calais[1], { start: '11:00', place: 'Zaal 2 (server)' }))
    await Promise.all([first, second])
    expect(row(102).fields.place).toBe('Zaal 2 (server)')
  })

  it('does nothing with an empty history', async () => {
    const { api, store } = setup()

    await store.undo()
    await store.redo()

    expect(api.undo).not.toHaveBeenCalled()
    expect(store.getState().save).toBe('saved')
  })
})

describe('a new row', () => {
  it('a second refusal replaces the first message', async () => {
    const { api, store } = setup()
    api.create.mockRejectedValueOnce({ code: 'person_or_name', message: 'A person or a name is required.' })
    api.create.mockRejectedValueOnce({ code: 'duplicate_assignment', message: 'Already on this activity.' })

    store.draft({ status: 'requested' }, ['activity'], ['activity', 'person'])
    await store.apply({ id: -1, field: 'activity', value: [102] })
    await store.apply({ id: -1, field: 'person', value: [5] })

    const errors = Object.values(store.getState().errors).filter((e) => e.id === -1)
    expect(errors.map((e) => [e.field, e.message])).toEqual([['person', 'Already on this activity.']])
    expect(store.getState().error?.message).toBe('Already on this activity.')
    expect(store.getState().rows[0]).toMatchObject({ id: -1, fields: { activity: [102], person: [5] } })
  })

  it('a refusal of an empty field asks for that field again first', async () => {
    const { api, store } = setup()
    api.create.mockRejectedValueOnce({ code: 'title_required', message: 'A title is required.' })

    store.draft({ date: '2026-05-18' }, ['title'], ['location'])
    await store.apply({ id: -1, field: 'title', value: '' })

    expect(store.getState().needs).toEqual(['title', 'location'])
  })

  it('a refused draft create is retried with the next field', async () => {
    const { api, store } = setup()
    api.create.mockRejectedValueOnce({ code: 'person_or_name', message: 'A person or a name is required.' })
    api.create.mockResolvedValueOnce(ok({ id: 300, title: 'Ann op Montage', status: 'publish', fields: { activity: [102], person: [5] } }))

    store.draft({ status: 'requested' }, ['activity'], ['activity', 'person', 'venue'])
    await store.apply({ id: -1, field: 'activity', value: [102] })

    expect(api.create).toHaveBeenLastCalledWith('activity', { status: 'requested', activity: [102], title: '' })
    expect(store.getState().rows[0]).toMatchObject({ id: -1, fields: { activity: [102] } })
    expect(store.getState().error?.message).toBe('A person or a name is required.')
    expect(store.getState().needs).toEqual(['person', 'venue'])

    await store.apply({ id: -1, field: 'person', value: [5] })

    expect(api.create).toHaveBeenCalledTimes(2)
    expect(api.create).toHaveBeenLastCalledWith('activity', { status: 'requested', activity: [102], person: [5], title: '' })
    expect(store.getState().rows[0]).toMatchObject({ id: 300 })
    expect(store.getState().rows.some((r) => r.id === -1)).toBe(false)
    expect(store.getState()).toMatchObject({ error: null, needs: [], save: 'saved' })
  })

  it('sits on top as a draft and becomes a record when its title is written', async () => {
    const { api, store } = setup()
    api.create.mockResolvedValueOnce(ok({ ...calais[0], id: 200, title: 'Soundcheck', fields: { date: '2026-05-18', kind: 'travel', status: 'confirmed' } }))

    store.draft({ date: '2026-05-18', kind: 'travel', status: 'confirmed' })
    expect(store.getState().rows[0]).toMatchObject({ id: -1, title: '' })

    await store.apply({ id: -1, field: 'title', value: 'Soundcheck' })

    expect(api.create).toHaveBeenCalledWith('activity', { date: '2026-05-18', kind: 'travel', status: 'confirmed', title: 'Soundcheck' })
    expect(store.getState().rows[0]).toMatchObject({ id: 200, title: 'Soundcheck' })
    expect(store.getState().rows.some((r) => r.id === -1)).toBe(false)
  })

  it('is dropped by discard, and keeps its error on a refused create', async () => {
    const { api, store } = setup()
    api.create.mockRejectedValueOnce({ code: 'title_required', message: 'A title is required.' })

    store.draft({ date: '2026-05-18' })
    await store.apply({ id: -1, field: 'title', value: '' })
    expect(store.getState().errors['-1:title'].message).toBe('A title is required.')

    store.discard()
    expect(store.getState().rows).toHaveLength(calais.length)
  })

  it('a second title commit during the create does not create twice', async () => {
    const { api, store } = setup()
    const answer = deferred<Saved>()
    api.create.mockReturnValueOnce(answer.promise)

    store.draft({ date: '2026-05-18' })
    const first = store.apply({ id: -1, field: 'title', value: 'Soundcheck' })
    const second = store.apply({ id: -1, field: 'title', value: 'Soundcheck 2' })
    answer.resolve(ok({ ...calais[0], id: 200, title: 'Soundcheck', fields: { date: '2026-05-18' } }))
    await Promise.all([first, second])

    expect(api.create).toHaveBeenCalledTimes(1)
    expect(store.getState().rows.filter((r) => r.id === 200)).toHaveLength(1)
    expect(store.getState().save).toBe('saved')
  })

  it("paints a draft's other fields locally until the title makes it a record", async () => {
    const { api, store } = setup()

    store.draft({ date: '2026-05-18' })
    await store.apply({ id: -1, field: 'start', value: '09:00' })

    expect(api.create).not.toHaveBeenCalled()
    expect(store.getState().rows[0].fields).toEqual({ date: '2026-05-18', start: '09:00' })
  })

  it('creates a record at once for a model that composes its own title', async () => {
    const { api, store } = setup()
    api.create.mockResolvedValueOnce(ok({ ...calais[0], id: 300, title: 'Composed' }))

    await store.create({ date: '2026-05-18' })

    expect(api.create).toHaveBeenCalledWith('activity', { date: '2026-05-18' })
    expect(store.getState().rows[0].id).toBe(300)
  })
})

describe('remove', () => {
  function removable() {
    const api = {
      update: vi.fn<StoreApi['update']>(), create: vi.fn<StoreApi['create']>(), remove: vi.fn<NonNullable<StoreApi['remove']>>(),
      read: vi.fn<NonNullable<StoreApi['read']>>(), undo: vi.fn<NonNullable<StoreApi['undo']>>(),
    }
    const store = createStore({ model: 'activity', rows: calais, api })
    return { api, store, ids: () => store.getState().rows.map((r) => r.id) }
  }

  it('drops the row and its undo entries once the engine answers', async () => {
    const { api, store, ids } = removable()
    api.update.mockImplementation(async (_m, id, data) => ok({ ...calais.find((r) => r.id === id)!, fields: data }, `b${id}`))
    api.remove.mockResolvedValueOnce({ id: 103 })
    api.undo.mockResolvedValue('u1')
    api.read.mockResolvedValue(calais[0])
    await store.apply({ id: 101, field: 'kind', value: 'show' })
    await store.apply({ id: 103, field: 'kind', value: 'show' })

    await store.remove(103)

    expect(api.remove).toHaveBeenCalledWith('activity', 103)
    expect(ids()).not.toContain(103)
    expect(store.getState()).toMatchObject({ save: 'saved', error: null, canUndo: true })
    await store.undo()
    expect(api.undo).toHaveBeenCalledExactlyOnceWith('b101')
    expect(store.getState().canUndo).toBe(false)
  })

  it('waits for a write still in flight on the record before it deletes', async () => {
    const { api, store } = removable()
    const answer = deferred<Saved>()
    api.update.mockReturnValueOnce(answer.promise)
    api.remove.mockResolvedValueOnce({ id: 103 })

    const writing = store.apply({ id: 103, field: 'kind', value: 'show' })
    const removing = store.remove(103)
    await Promise.resolve()
    expect(api.remove).not.toHaveBeenCalled()

    answer.resolve(served(calais[2], { kind: 'show' }))
    await Promise.all([writing, removing])
    expect(api.remove).toHaveBeenCalledWith('activity', 103)
  })

  it('sends no write to a row while its DELETE is in flight, nor after it', async () => {
    const { api, store, ids } = removable()
    const answer = deferred<unknown>()
    api.remove.mockReturnValueOnce(answer.promise)

    const removing = store.remove(103)
    await store.apply({ id: 103, field: 'kind', value: 'show' })
    answer.resolve({ id: 103 })
    await removing
    await store.apply({ id: 103, field: 'kind', value: 'build' })

    expect(api.update).not.toHaveBeenCalled()
    expect(ids()).not.toContain(103)
  })

  it('on a 409 in_use keeps the row and raises the Dutch sentence built from by', async () => {
    const { api, store, ids } = removable()
    api.remove.mockRejectedValueOnce({ code: 'in_use', message: 'Still referenced by Activiteiten (3), Personen (1)', by: [{ label: 'Activiteiten', count: 3 }, { label: 'Personen', count: 1 }] })

    await store.remove(103)

    expect(ids()).toContain(103)
    expect(store.getState().save).toBe('error')
    expect(store.getState().error).toMatchObject({ id: 103, code: 'in_use', message: 'Nog in gebruik door Activiteiten (3) en Personen (1).' })
  })

  it('on a 404 unknown_record drops the row and its undo entries, with no notice', async () => {
    const { api, store, ids } = removable()
    api.update.mockImplementation(async (_m, id, data) => served(calais.find((r) => r.id === id)!, data))
    api.remove.mockRejectedValueOnce({ code: 'unknown_record', message: 'unknown record 103' })
    await store.apply({ id: 103, field: 'kind', value: 'show' })

    await store.remove(103)

    expect(ids()).not.toContain(103)
    expect(store.getState()).toMatchObject({ save: 'saved', error: null, canUndo: false })
  })

  it("on a 422 keeps the row and raises the writer's message", async () => {
    const { api, store, ids } = removable()
    api.remove.mockRejectedValueOnce({ code: 'refused', message: 'Een bevestigde activiteit verwijder je niet.' })

    await store.remove(103)

    expect(ids()).toContain(103)
    expect(store.getState().error).toMatchObject({ code: 'refused', message: 'Een bevestigde activiteit verwijder je niet.' })
  })
})

describe('dismiss', () => {
  it('drops the notice on a cell', async () => {
    const { api, store } = setup()
    api.update.mockRejectedValueOnce({ code: 'bad', message: 'Bad.' })
    await store.apply({ id: 101, field: 'start', value: 'x' })

    store.dismiss(101, 'start')

    expect(store.getState().errors).toEqual({})
  })
})

describe('writes through the engine', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    forgetSchema()
  })

  it("a refused update reverts the cell and keeps the writer's message on it", async () => {
    const { api, store, row } = setup()
    api.update.mockRejectedValueOnce({ code: 'refused', message: 'Een bevestigde activiteit heeft een starttijd nodig.' })

    await store.apply({ id: 105, field: 'status', value: 'confirmed' })

    expect(row(105).fields.status).toBe('option')
    expect(store.getState().errors['105:status']).toEqual({ id: 105, field: 'status', code: 'refused', message: 'Een bevestigde activiteit heeft een starttijd nodig.' })
  })

  it("a query-row edit's batch comes from the PATCH reply, and its undo re-reads the query row", async () => {
    const engine: EngineSchema = {
      sources: {
        dagplanning: {
          kind: 'query', label: 'Dagplanning', title: 'omschrijving', date: 'plandag', writable: true,
          columns: {
            activiteit_id: { type: 'integer', label: 'Activiteit' },
            omschrijving: { type: 'text', label: 'Omschrijving' },
            status: { type: 'text', label: 'Status', writes: { dataset: 'activiteit', field: 'status', key: 'activiteit_id' } },
          },
        },
      },
    }
    const json = (body: unknown) => new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } })
    const planned: Row = { id: 40, title: 'opbouw Gent', status: '', fields: { activiteit_id: 7, status: 'optie' }, lookups: {} }
    const reread = (status: string) => ({ rows: [{ id: 40, activiteit_id: 7, status, title: 'opbouw Gent', custom: {}, lookups: {} }], total: 1 })
    let now = 'optie'
    const fetcher = vi.fn<typeof fetch>(async (input) => {
      const path = String(input).split('?')[0]
      if (path === '/api/schema') return json(engine)
      if (path === '/api/rows/dagplanning') return json(reread(now))
      now = path === '/api/batches/b-7/undo' ? 'optie' : 'bevestigd'
      if (now === 'optie') return json({ batch_id: 'b-undo', affected: [{ dataset: 'activiteit', id: 7 }] })
      return json({ id: 7, status: now, custom: {}, lookups: {}, revision: { batch_id: 'b-7', changed: ['status'] } })
    })
    vi.stubGlobal('fetch', fetcher)
    const store = createStore({ model: 'dagplanning', rows: [planned], api: { update, create, read: rowOf }, history: createHistory(undoBatch) })

    await store.apply({ id: 40, field: 'status', value: 'bevestigd' })
    await store.undo()

    const writes = fetcher.mock.calls.filter(([, init]) => init?.method === 'PATCH' || init?.method === 'POST').map(([input, init]) => [String(input), init?.method, init?.body])
    expect(writes).toEqual([
      ['/api/rows/activiteit/7', 'PATCH', JSON.stringify({ status: 'bevestigd' })],
      ['/api/batches/b-7/undo', 'POST', '{}'],
    ])
    expect(store.getState().rows[0]).toMatchObject({ id: 40, fields: { status: 'optie' } })
  })
})
