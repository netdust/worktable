import { afterEach, describe, expect, it, vi } from 'vitest'
import { forgetSchema, update } from '../api'
import type { EngineSchema } from '../engine'
import type { Row } from '../types'
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
  const api = { update: vi.fn<StoreApi['update']>(), create: vi.fn<StoreApi['create']>() }
  const store = createStore({ model: 'activity', rows, api })
  const row = (id: number) => store.getState().rows.find((r) => r.id === id)!
  return { api, store, row }
}

const served = (row: Row, fields: Record<string, unknown>, extra: Partial<Row> = {}): Row => ({ ...row, fields: { ...row.fields, ...fields }, ...extra })

describe('apply', () => {
  it('paints the change before the server answers, then takes the row the server returns', async () => {
    const { api, store, row } = setup()
    const answer = deferred<Row>()
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
    api.update.mockResolvedValueOnce({ ...calais[0], title: 'Auto Pavel' })

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

describe('undo and redo', () => {
  it('undo issues the inverse write, and redo writes the change again', async () => {
    const { api, store, row } = setup()
    api.update.mockImplementation(async (_m, id, data) => served(calais.find((r) => r.id === id)!, data))

    await store.apply({ id: 103, field: 'kind', value: 'show' })
    expect(store.getState().canUndo).toBe(true)

    await store.undo()
    expect(api.update).toHaveBeenLastCalledWith('activity', 103, { kind: 'meal' }, expect.objectContaining({ id: 103 }))
    expect(row(103).fields.kind).toBe('meal')
    expect(store.getState()).toMatchObject({ canUndo: false, canRedo: true })

    await store.redo()
    expect(api.update).toHaveBeenLastCalledWith('activity', 103, { kind: 'show' }, expect.objectContaining({ id: 103 }))
    expect(row(103).fields.kind).toBe('show')
    expect(store.getState()).toMatchObject({ canUndo: true, canRedo: false })
  })

  it('undoes the change just typed even before its write returns', async () => {
    const { api, store, row } = setup()
    const first = deferred<Row>()
    api.update.mockReturnValueOnce(first.promise).mockImplementation(async (_m, id, data) => served(calais.find((r) => r.id === id)!, data))

    const typed = store.apply({ id: 103, field: 'kind', value: 'show' })
    expect(store.getState().canUndo).toBe(true)
    const undone = store.undo()
    expect(row(103).fields.kind).toBe('meal')

    first.resolve(served(calais[2], { kind: 'show' }))
    await Promise.all([typed, undone])
    expect(api.update).toHaveBeenLastCalledWith('activity', 103, { kind: 'meal' }, expect.objectContaining({ id: 103 }))
    expect(row(103).fields.kind).toBe('meal')
    expect(store.getState()).toMatchObject({ canUndo: false, canRedo: true })
  })

  it('moves the entry between the stacks at the press, so a quick redo then undo undoes the redone change', async () => {
    const { api, store } = setup()
    api.update.mockImplementation(async (_m, id, data) => served(calais.find((r) => r.id === id)!, data))
    await store.apply({ id: 101, field: 'start', value: '08:00' })
    await store.apply({ id: 102, field: 'start', value: '11:00' })
    await store.undo()

    const redoAnswer = deferred<Row>()
    api.update.mockReturnValueOnce(redoAnswer.promise)
    const redone = store.redo()
    const undone = store.undo()
    redoAnswer.resolve(served(calais[1], { start: '11:00' }))
    await Promise.all([redone, undone])

    expect(api.update).toHaveBeenLastCalledWith('activity', 102, { start: '10:00' }, expect.objectContaining({ id: 102 }))
    expect(api.update).not.toHaveBeenCalledWith('activity', 101, { start: '07:30' }, expect.objectContaining({ id: 101 }))
  })

  it('ends at the original after type, undo, redo, undo, undo pressed inside one round-trip', async () => {
    const { api, store, row } = setup()
    const sent: Record<string, unknown>[] = []
    const answers: ReturnType<typeof deferred<Row>>[] = []
    api.update.mockImplementation((_m, _id, data) => {
      sent.push(data)
      const answer = deferred<Row>()
      answers.push(answer)
      return answer.promise
    })

    const presses = [store.apply({ id: 102, field: 'start', value: '15:00' }), store.undo(), store.redo(), store.undo(), store.undo()]
    for (let i = 0; i < 6; i++) {
      await new Promise((resolve) => setTimeout(resolve, 0))
      answers[i]?.resolve(served(calais[1], sent[i]))
    }
    await Promise.all(presses)

    expect(row(102).fields.start).toBe('10:00')
    expect(store.getState()).toMatchObject({ canUndo: false, canRedo: true })
  })

  it('leaves one entry when an undo is refused after a quick redo took it back', async () => {
    const { api, store } = setup()
    api.update.mockImplementation(async (_m, id, data) => served(calais.find((r) => r.id === id)!, data))
    await store.apply({ id: 102, field: 'start', value: '11:00' })
    const refused = deferred<Row>()
    api.update.mockReturnValueOnce(refused.promise)

    const undone = store.undo()
    const redone = store.redo()
    refused.reject({ code: 'x', message: 'No.' })
    await Promise.all([undone, redone])

    let presses = 0
    while (store.getState().canUndo && presses < 5) {
      await store.undo()
      presses++
    }
    expect(presses).toBe(1)
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
    const one = deferred<Row>()
    const two = deferred<Row>()
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

  it('a fresh change empties the redo stack', async () => {
    const { api, store } = setup()
    api.update.mockImplementation(async (_m, id, data) => served(calais.find((r) => r.id === id)!, data))

    await store.apply({ id: 103, field: 'kind', value: 'show' })
    await store.undo()
    await store.apply({ id: 104, field: 'start', value: '11:00' })

    expect(store.getState().canRedo).toBe(false)
  })

  it('keeps the change undoable when the undo write is refused', async () => {
    const { api, store, row } = setup()
    api.update.mockResolvedValueOnce(served(calais[2], { kind: 'show' })).mockRejectedValueOnce({ code: 'x', message: 'No.' })

    await store.apply({ id: 103, field: 'kind', value: 'show' })
    await store.undo()

    expect(row(103).fields.kind).toBe('show')
    expect(store.getState()).toMatchObject({ canUndo: true, canRedo: false, save: 'error' })
  })

  it('does nothing with an empty stack', async () => {
    const { api, store } = setup()

    await store.undo()
    await store.redo()

    expect(api.update).not.toHaveBeenCalled()
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
    api.create.mockResolvedValueOnce({ id: 300, title: 'Ann op Montage', status: 'publish', fields: { activity: [102], person: [5] } })

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
    api.create.mockResolvedValueOnce({ ...calais[0], id: 200, title: 'Soundcheck', fields: { date: '2026-05-18', kind: 'travel', status: 'confirmed' } })

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
    const answer = deferred<Row>()
    api.create.mockReturnValueOnce(answer.promise)

    store.draft({ date: '2026-05-18' })
    const first = store.apply({ id: -1, field: 'title', value: 'Soundcheck' })
    const second = store.apply({ id: -1, field: 'title', value: 'Soundcheck 2' })
    answer.resolve({ ...calais[0], id: 200, title: 'Soundcheck', fields: { date: '2026-05-18' } })
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
    api.create.mockResolvedValueOnce({ ...calais[0], id: 300, title: 'Composed' })

    await store.create({ date: '2026-05-18' })

    expect(api.create).toHaveBeenCalledWith('activity', { date: '2026-05-18' })
    expect(store.getState().rows[0].id).toBe(300)
  })
})

describe('remove', () => {
  function removable() {
    const api = { update: vi.fn<StoreApi['update']>(), create: vi.fn<StoreApi['create']>(), remove: vi.fn<NonNullable<StoreApi['remove']>>() }
    const store = createStore({ model: 'activity', rows: calais, api })
    return { api, store, ids: () => store.getState().rows.map((r) => r.id) }
  }

  it('drops the row and its undo entries once the engine answers', async () => {
    const { api, store, ids } = removable()
    api.update.mockImplementation(async (_m, id, data) => served(calais.find((r) => r.id === id)!, data))
    api.remove.mockResolvedValueOnce({ id: 103 })
    await store.apply({ id: 101, field: 'kind', value: 'show' })
    await store.apply({ id: 103, field: 'kind', value: 'show' })

    await store.remove(103)

    expect(api.remove).toHaveBeenCalledWith('activity', 103)
    expect(ids()).not.toContain(103)
    expect(store.getState()).toMatchObject({ save: 'saved', error: null, canUndo: true })
    await store.undo()
    expect(api.update).toHaveBeenLastCalledWith('activity', 101, { kind: 'travel' }, expect.objectContaining({ id: 101 }))
    expect(store.getState().canUndo).toBe(false)
  })

  it('waits for a write still in flight on the record before it deletes', async () => {
    const { api, store } = removable()
    const answer = deferred<Row>()
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

  it('undo of a dagplanning edit PATCHes /rows/activiteit/<row[key]> with the old value', async () => {
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
    const fetcher = vi.fn<typeof fetch>(async (input) => {
      const path = String(input).split('?')[0]
      if (path === '/api/schema') return json(engine)
      return path === '/api/rows/dagplanning' ? json({ rows: [], total: 0 }) : json({ id: 7, custom: {}, lookups: {} })
    })
    vi.stubGlobal('fetch', fetcher)
    const planned: Row = { id: 40, title: 'opbouw Gent', status: '', fields: { activiteit_id: 7, status: 'optie' }, lookups: {} }
    const store = createStore({ model: 'dagplanning', rows: [planned], api: { update, create: vi.fn() } })

    await store.apply({ id: 40, field: 'status', value: 'bevestigd' })
    await store.undo()

    const patches = fetcher.mock.calls.filter(([, init]) => init?.method === 'PATCH').map(([input, init]) => [String(input), init?.body])
    expect(patches).toEqual([
      ['/api/rows/activiteit/7', JSON.stringify({ status: 'bevestigd' })],
      ['/api/rows/activiteit/7', JSON.stringify({ status: 'optie' })],
    ])
    expect(store.getState().rows[0]).toMatchObject({ id: 40, fields: { status: 'optie' } })
  })
})

describe('a query row written in one PATCH', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    forgetSchema()
  })

  it('sends every column that writes to the same record in one PATCH, and drops a column no writer takes', async () => {
    const engine: EngineSchema = {
      sources: {
        dagplanning: {
          kind: 'query', label: 'Dagplanning', title: 'omschrijving', date: 'plandag', writable: true,
          columns: {
            activiteit_id: { type: 'integer', label: 'Activiteit' },
            omschrijving: { type: 'text', label: 'Omschrijving' },
            start_at: { type: 'datetime', label: 'Start', writes: { dataset: 'activiteit', field: 'start_at', key: 'activiteit_id' } },
            datum: { type: 'date', label: 'Datum', writes: { dataset: 'activiteit', field: 'datum', key: 'activiteit_id' } },
            plandag: { type: 'date', label: 'Plandag' },
          },
        },
      },
    }
    const json = (body: unknown) => new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } })
    const fetcher = vi.fn<typeof fetch>(async (input) => {
      const path = String(input).split('?')[0]
      if (path === '/api/schema') return json(engine)
      return path === '/api/rows/dagplanning' ? json({ rows: [], total: 0 }) : json({ id: 7, custom: {}, lookups: {} })
    })
    vi.stubGlobal('fetch', fetcher)
    const planned: Row = { id: 40, title: 'opbouw Gent', status: '', fields: { activiteit_id: 7, start_at: '2026-10-14T20:00', datum: '2026-10-14' }, lookups: {} }

    await update('dagplanning', 40, { start_at: null, datum: '2026-10-12', plandag: '2026-10-12' }, planned)

    const patches = fetcher.mock.calls.filter(([, init]) => init?.method === 'PATCH').map(([input, init]) => [String(input), init?.body])
    expect(patches).toEqual([['/api/rows/activiteit/7', JSON.stringify({ start_at: null, datum: '2026-10-12' })]])
  })
})

describe('undo restores every column the edit changed', () => {
  const untimed: Row = { id: 201, title: 'Repetitie', status: '', fields: { start_at: null, datum: '2026-10-12', plandag: '2026-10-12' }, lookups: {} }
  const assigned: Row = {
    id: 301, title: 'Ada', status: '', fields: { persoon_id: 5, naam: null, state: 'bevestigd' },
    lookups: { persoon_id: { id: 5, title: 'Ada', status: '', fields: {} } },
  }
  const editable = (field: string) => field !== 'plandag' && field !== 'title'

  function widening(rows: Row[]) {
    const api = { update: vi.fn<StoreApi['update']>(), create: vi.fn<StoreApi['create']>() }
    const store = createStore({ model: 'activiteit', rows, api, editable })
    const row = (id: number) => store.getState().rows.find((r) => r.id === id)!
    return { api, store, row }
  }

  it('a time set on an untimed row on another day: undo puts the day back with it, in one write', async () => {
    const { api, store, row } = widening([untimed])
    api.update
      .mockResolvedValueOnce(served(untimed, { start_at: '2026-10-14T20:00', datum: '2026-10-14', plandag: '2026-10-14' }))
      .mockResolvedValueOnce(untimed)

    await store.apply({ id: 201, field: 'start_at', value: '2026-10-14T20:00' })
    await store.undo()

    expect(api.update).toHaveBeenCalledTimes(2)
    expect(api.update).toHaveBeenLastCalledWith('activiteit', 201, { start_at: null, datum: '2026-10-12' }, expect.objectContaining({ id: 201 }))
    expect(row(201).fields).toMatchObject({ start_at: null, datum: '2026-10-12', plandag: '2026-10-12' })
  })

  it('redo writes the day the server derived, with the time', async () => {
    const { api, store } = widening([untimed])
    const timed = served(untimed, { start_at: '2026-10-14T20:00', datum: '2026-10-14', plandag: '2026-10-14' })
    api.update.mockResolvedValueOnce(timed).mockResolvedValueOnce(untimed).mockResolvedValueOnce(timed)

    await store.apply({ id: 201, field: 'start_at', value: '2026-10-14T20:00' })
    await store.undo()
    await store.redo()

    expect(api.update).toHaveBeenLastCalledWith('activiteit', 201, { start_at: '2026-10-14T20:00', datum: '2026-10-14' }, expect.objectContaining({ id: 201 }))
  })

  it('an undo pressed before the answer still sends the whole before-image', async () => {
    const { api, store } = widening([untimed])
    const answer = deferred<Row>()
    api.update.mockReturnValueOnce(answer.promise).mockResolvedValueOnce(untimed)

    const typed = store.apply({ id: 201, field: 'start_at', value: '2026-10-14T20:00' })
    const undone = store.undo()
    answer.resolve(served(untimed, { start_at: '2026-10-14T20:00', datum: '2026-10-14', plandag: '2026-10-14' }))
    await Promise.all([typed, undone])

    expect(api.update).toHaveBeenLastCalledWith('activiteit', 201, { start_at: null, datum: '2026-10-12' }, expect.objectContaining({ id: 201 }))
  })

  it('a person switched to a free name: undo writes the person and clears the name, and shows the person again', async () => {
    const { api, store, row } = widening([assigned])
    api.update
      .mockResolvedValueOnce({ ...served(assigned, { persoon_id: null, naam: 'Gastspeler' }), title: 'Gastspeler', lookups: { persoon_id: null } })
      .mockImplementationOnce(() => new Promise(() => undefined))

    await store.apply({ id: 301, field: 'naam', value: 'Gastspeler' })
    void store.undo()

    expect(api.update).toHaveBeenLastCalledWith('activiteit', 301, { naam: null, persoon_id: 5 }, expect.objectContaining({ id: 301 }))
    expect(row(301).fields).toMatchObject({ naam: null, persoon_id: 5 })
    expect(row(301).lookups?.persoon_id).toEqual({ id: 5, title: 'Ada', status: '', fields: {} })
  })

  it('never writes back a column the model does not let the grid edit', async () => {
    const { api, store } = widening([untimed])
    api.update.mockResolvedValueOnce({ ...served(untimed, { datum: '2026-10-13', plandag: '2026-10-13' }), title: 'Anders' }).mockResolvedValueOnce(untimed)

    await store.apply({ id: 201, field: 'datum', value: '2026-10-13' })
    await store.undo()

    expect(api.update).toHaveBeenLastCalledWith('activiteit', 201, { datum: '2026-10-12' }, expect.objectContaining({ id: 201 }))
  })
})
