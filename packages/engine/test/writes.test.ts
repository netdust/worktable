import { Database } from 'bun:sqlite'
import { beforeEach, describe, expect, test } from 'bun:test'
import { createEngine, migrate } from '../src'
import { contents, domain, freshDb, send } from './fixture'

let sqlite: Database
let request: ReturnType<typeof send>

beforeEach(() => {
  sqlite = freshDb()
  request = send(createEngine(sqlite, domain, { port: 4310 }))
})

const json = (value: unknown) => JSON.stringify(value)
const post = (dataset: string, body: unknown) => request('POST', `/api/rows/${dataset}`, { body: json(body) })
const patch = (path: string, body: unknown) => request('PATCH', `/api/rows/${path}`, { body: json(body) })
const remove = (path: string) => request('DELETE', `/api/rows/${path}`, { type: null })
const revisions = (dataset: string, id: number | string) => request('GET', `/api/revisions/${dataset}/${id}`)
const softDelete = (table: string, id: number) =>
  sqlite.run(`UPDATE ${table} SET deleted_at = '2026-10-01T00:00:00.000Z' WHERE id = ${id}`)

const state = () => ({
  project: contents(sqlite, 'project'),
  taak: contents(sqlite, 'taak'),
  notitie: contents(sqlite, 'notitie'),
  revision: contents(sqlite, 'revision'),
})

async function denied(
  write: () => Promise<{ status: number; body: Record<string, unknown> }>,
  status: number,
  code: string,
  names?: string,
) {
  const before = state()
  const res = await write()
  expect({ status: res.status, code: res.body.code }).toEqual({ status, code })
  if (names) expect(res.body.message).toContain(names)
  expect(state()).toEqual(before)
}

describe('write denials', () => {
  test.each(['[1]', '"x"', 'null', '{"tekst":'])('body %s is 400 bad_body', (body) =>
    denied(() => request('PATCH', '/api/rows/notitie/1', { body }), 400, 'bad_body'),
  )

  test('id, deleted_at, custom, a readonly column and an undeclared key are dropped, not written', async () => {
    const dropped = { id: 99, deleted_at: '2020-01-01', created_at: 'x', custom: { a: 1 }, lengte: 999, onbekend: 1 }
    const before = state()
    const res = await patch('notitie/1', dropped)
    expect({ status: res.status, id: res.body.id, lengte: res.body.lengte }).toEqual({ status: 200, id: 1, lengte: 6 })
    expect(state()).toEqual(before)
    const created = await post('notitie', { ...dropped, project_id: 1, tekst: 'nieuw' })
    expect(created.body).toMatchObject({ id: 2, lengte: 5, custom: {} })
    expect(sqlite.query('SELECT deleted_at, created_at FROM notitie WHERE id = 2').get()).toMatchObject({
      deleted_at: null,
      created_at: expect.stringMatching(/^\d{4}-/),
    })
  })

  test.each([
    ['string into an integer column', { project_id: '1 OR 1=1' }, 'project_id'],
    ['object into a text column', { tekst: { a: 1 } }, 'tekst'],
    ['array into a boolean column', { klaar: [1] }, 'klaar'],
    ['null into a non-nullable column', { tekst: null }, 'tekst'],
  ])('%s is 400 bad_value naming the column', (_, body, column) =>
    denied(() => patch('notitie/1', body), 400, 'bad_value', column),
  )

  test.each([
    ['taak/1', 405, 'read_only'],
    ['per_project/1', 405, 'read_only'],
    ['notitie_lijst/1', 405, 'read_only'],
    ['revision/1', 404, 'unknown_source'],
    ['saved_view/1', 404, 'unknown_source'],
    ['_migrations/1', 404, 'unknown_source'],
    ['nope/1', 404, 'unknown_source'],
  ])('PATCH %s is %d %s', (path, status, code) => denied(() => patch(path, { naam: 'x' }), status, code))

  test('POST and DELETE on a dataset without a writer are 405 read_only', async () => {
    await denied(() => post('taak', { omschrijving: 'x' }), 405, 'read_only')
    await denied(() => remove('taak/1'), 405, 'read_only')
  })

  test.each(['999', 'abc', '1.5'])('PATCH and DELETE of unknown id %s are 404 unknown_record', async (id) => {
    await denied(() => patch(`notitie/${id}`, { tekst: 'x' }), 404, 'unknown_record')
    await denied(() => remove(`notitie/${id}`), 404, 'unknown_record')
  })

  test('PATCH and DELETE of a soft-deleted id are 404 unknown_record', async () => {
    softDelete('notitie', 1)
    await denied(() => patch('notitie/1', { tekst: 'x' }), 404, 'unknown_record')
    await denied(() => remove('notitie/1'), 404, 'unknown_record')
  })

  test('a writer that refuses after find() leaves table and revision unchanged and answers 422 with its message', async () => {
    const before = state()
    const res = await patch('notitie/1', { project_id: 2, tekst: 'verhuisd' })
    expect(res).toEqual({ status: 422, body: { code: 'refused', message: 'project Beta is gesloten' } })
    expect(state()).toEqual(before)
  })

  test('a create missing a non-nullable column is 400 bad_value naming it, not 500', () =>
    denied(() => post('notitie', { project_id: 1 }), 400, 'bad_value', 'tekst'))

  describe('a relation the writer does not check', () => {
    test.each([
      ['create', 'missing', () => post('notitie', { project_id: 999, tekst: 'x' })],
      ['update', 'missing', () => patch('notitie/1', { project_id: 999 })],
      ['create', 'soft-deleted', () => post('notitie', { project_id: 2, tekst: 'x' })],
      ['update', 'soft-deleted', () => patch('notitie/1', { project_id: 2 })],
    ])('a %s to a %s id is 400 bad_relation', (_, target, write) => {
      if (target === 'soft-deleted') softDelete('project', 2)
      return denied(write, 400, 'bad_relation', 'project_id')
    })
  })

  test('the served connection reports PRAGMA foreign_keys = 1', () => {
    const own = new Database(':memory:')
    migrate(own, domain)
    own.run('PRAGMA foreign_keys = OFF')
    createEngine(own, domain, { port: 4310 })
    expect(own.query('PRAGMA foreign_keys').get()).toEqual({ foreign_keys: 1 })
  })
})

type Revision = {
  field: string
  old: string | null
  new: string | null
  actor_id: number
  at: string
  batch_id: string
}
const revisionsOf = async (dataset: string, id: number) => (await revisions(dataset, id)).body.revisions as Revision[]
const changes = (rows: Revision[]) => rows.map((r) => [r.field, r.old, r.new])

describe('writes', () => {
  test('create returns 201 with the stored row and writes one revision per stored field with old null', async () => {
    const res = await post('notitie', { project_id: 1, tekst: 'hallo', klaar: true })
    expect(res).toEqual({
      status: 201,
      body: {
        id: 2,
        project_id: 1,
        tekst: 'hallo',
        lengte: 5,
        klaar: true,
        custom: {},
        lookups: { project_id: { id: 1, title: 'Alfa' } },
      },
    })
    const rows = await revisionsOf('notitie', 2)
    expect(changes(rows)).toEqual([
      ['project_id', null, '1'],
      ['tekst', null, '"hallo"'],
      ['lengte', null, '5'],
      ['klaar', null, '1'],
    ])
    expect(new Set(rows.map((r) => r.batch_id)).size).toBe(1)
  })

  test('update writes one revision per changed field only, sharing a batch_id, with actor_id 0', async () => {
    const res = await patch('notitie/1', { project_id: 1, tekst: 'ander' })
    expect(res.status).toBe(200)
    expect(res.body).toMatchObject({ id: 1, tekst: 'ander', lengte: 5 })
    const rows = await revisionsOf('notitie', 1)
    expect(changes(rows)).toEqual([
      ['tekst', '"eerste"', '"ander"'],
      ['lengte', '6', '5'],
    ])
    expect(rows.map((r) => r.actor_id)).toEqual([0, 0])
    expect(rows[0]?.batch_id).toBe(rows[1]?.batch_id as string)
    expect(rows[0]?.batch_id).toMatch(/^[0-9a-f-]{36}$/)
  })

  test('an update that changes nothing writes no revision', async () => {
    const before = state()
    const res = await patch('notitie/1', { tekst: 'eerste', klaar: false })
    expect({ status: res.status, tekst: res.body.tekst }).toEqual({ status: 200, tekst: 'eerste' })
    expect(state()).toEqual(before)
  })

  test('a writer-derived readonly column is stored and revised', async () => {
    await patch('notitie/1', { tekst: 'veel langer', lengte: 1 })
    expect(sqlite.query('SELECT lengte FROM notitie WHERE id = 1').get()).toEqual({ lengte: 11 })
    expect(changes(await revisionsOf('notitie', 1))).toContainEqual(['lengte', '6', '11'])
  })

  test('delete is soft: the row leaves /rows, deleted_at is revised', async () => {
    expect(await remove('notitie/1')).toEqual({ status: 200, body: { id: 1 } })
    expect((await request('GET', '/api/rows/notitie')).body.total).toBe(0)
    const stored = sqlite.query('SELECT deleted_at FROM notitie WHERE id = 1').get() as { deleted_at: string }
    expect(stored.deleted_at).toMatch(/^\d{4}-\d{2}-\d{2}T/)
    expect(changes(await revisionsOf('notitie', 1))).toEqual([['deleted_at', null, json(stored.deleted_at)]])
  })

  test('GET /api/revisions returns them oldest first; unknown dataset 404', async () => {
    await patch('notitie/1', { tekst: 'twee' })
    await patch('notitie/1', { tekst: 'drie' })
    expect(changes(await revisionsOf('notitie', 1)).map(([, , n]) => n)).toEqual(['"twee"', '4', '"drie"'])
    expect(await revisions('notitie', 42)).toEqual({ status: 200, body: { revisions: [] } })
    for (const name of ['nope', 'revision', 'saved_view', 'per_project']) {
      expect((await revisions(name, 1)).body.code).toBe('unknown_source')
    }
  })

  test('/schema marks a dataset with an update writer and a query with a mapped column writable, others not', async () => {
    const { body } = await request('GET', '/api/schema')
    const writable = Object.fromEntries(
      Object.entries(body.sources).map(([n, s]) => [n, (s as { writable: boolean }).writable]),
    )
    expect(writable).toEqual({
      project: false,
      taak: false,
      plat: false,
      notitie: true,
      per_project: false,
      notitie_lijst: true,
    })
  })
})
