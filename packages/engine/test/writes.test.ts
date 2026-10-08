import { Database } from 'bun:sqlite'
import { beforeEach, describe, expect, test } from 'bun:test'
import { createEngine, defineQuery, migrate, seedDomain } from '../src'
import { contents, domain, freshDb, probes, projectDeleteHook, projectDeletes, send } from './fixture'
import { signIn, testEngine } from './sign-in'

let sqlite: Database
let request: ReturnType<typeof send>

// The editor signed in for each test is the first account.
const ME = 1

beforeEach(async () => {
  projectDeletes.length = 0
  projectDeleteHook.run = () => {}
  sqlite = freshDb()
  const app = testEngine(sqlite, domain)
  request = send(app, await signIn(app))
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
  note: contents(sqlite, 'note'),
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
  return res
}

const quietly = async (run: () => Promise<unknown>): Promise<string[]> => {
  const log = console.error
  const logged: string[] = []
  console.error = (err: unknown) => void logged.push(err instanceof Error ? err.message : String(err))
  try {
    await run()
  } finally {
    console.error = log
  }
  return logged
}

describe('write denials', () => {
  test.each(['[1]', '"x"', 'null', '{"tekst":'])('body %s is 400 bad_body', (body) =>
    denied(() => request('PATCH', '/api/rows/note/1', { body }), 400, 'bad_body'),
  )

  test('id, deleted_at, custom, a readonly column and an undeclared key are dropped, not written', async () => {
    const dropped = { id: 99, deleted_at: '2020-01-01', created_at: 'x', custom: { a: 1 }, lengte: 999, onbekend: 1 }
    const before = state()
    const res = await patch('note/1', dropped)
    expect({ status: res.status, id: res.body.id, lengte: res.body.lengte }).toEqual({ status: 200, id: 1, lengte: 6 })
    expect(state()).toEqual(before)
    const created = await post('note', { ...dropped, project_id: 1, tekst: 'nieuw' })
    expect(created.body).toMatchObject({ id: 2, lengte: 5, custom: {} })
    expect(sqlite.query('SELECT deleted_at, created_at FROM note WHERE id = 2').get()).toMatchObject({
      deleted_at: null,
      created_at: expect.stringMatching(/^\d{4}-/),
    })
  })

  test.each([
    ['string into an integer column', { project_id: '1 OR 1=1' }, 'project_id'],
    ['object into a text column', { tekst: { a: 1 } }, 'tekst'],
    ['array into a boolean column', { klaar: [1] }, 'klaar'],
    ['null into a non-nullable column', { tekst: null }, 'tekst'],
    ['a date that is not YYYY-MM-DD', { day: '12/10/2026' }, 'day'],
    ['a date that is not a calendar date', { day: '2026-02-30' }, 'day'],
    ['a datetime that is not a datetime', { start_at: 'banana' }, 'start_at'],
    ['a datetime on a day that does not exist', { start_at: '2026-02-30T10:00' }, 'start_at'],
    ['a datetime at an hour that does not exist', { start_at: '2026-10-12T24:00' }, 'start_at'],
    ['an option outside the declared options', { kind: 'middel' }, 'kind'],
    ['an option that is an inherited key', { kind: 'constructor' }, 'kind'],
  ])('%s is 400 bad_value naming the column', (_, body, column) =>
    denied(() => patch('note/1', body), 400, 'bad_value', column),
  )

  test.each([
    ['taak/1', 405, 'read_only'],
    ['per_project/1', 405, 'read_only'],
    ['note_lijst/1', 405, 'read_only'],
    ['revision/1', 404, 'unknown_source'],
    ['saved_view/1', 404, 'unknown_source'],
    ['_migrations/1', 404, 'unknown_source'],
    ['nope/1', 404, 'unknown_source'],
  ])('PATCH %s is %d %s', (path, status, code) => denied(() => patch(path, { name: 'x' }), status, code))

  test('POST and DELETE on a dataset without a writer are 405 read_only', async () => {
    await denied(() => post('taak', { description: 'x' }), 405, 'read_only')
    await denied(() => remove('taak/1'), 405, 'read_only')
  })

  test.each(['999', 'abc', '1.5'])('PATCH and DELETE of unknown id %s are 404 unknown_record', async (id) => {
    await denied(() => patch(`note/${id}`, { tekst: 'x' }), 404, 'unknown_record')
    await denied(() => remove(`note/${id}`), 404, 'unknown_record')
  })

  test('PATCH and DELETE of a soft-deleted id are 404 unknown_record', async () => {
    softDelete('note', 1)
    await denied(() => patch('note/1', { tekst: 'x' }), 404, 'unknown_record')
    await denied(() => remove('note/1'), 404, 'unknown_record')
  })

  test('a writer that refuses after find() leaves table and revision unchanged and answers 422 with its message', async () => {
    const before = state()
    const res = await patch('note/1', { project_id: 2, tekst: 'verhuisd' })
    expect(res).toEqual({ status: 422, body: { code: 'refused', message: 'project Beta is gesloten' } })
    expect(state()).toEqual(before)
  })

  test('a create missing a non-nullable column is 400 bad_value naming it, not 500', () =>
    denied(() => post('note', { project_id: 1 }), 400, 'bad_value', 'tekst'))

  describe('a relation the writer does not check', () => {
    test.each([
      ['create', 'missing', () => post('note', { project_id: 999, tekst: 'x' })],
      ['update', 'missing', () => patch('note/1', { project_id: 999 })],
      ['create', 'soft-deleted', () => post('note', { project_id: 2, tekst: 'x' })],
      ['update', 'soft-deleted', () => patch('note/1', { project_id: 2 })],
    ])('a %s to a %s id is 400 bad_relation', (_, target, write) => {
      if (target === 'soft-deleted') softDelete('project', 2)
      return denied(write, 400, 'bad_relation', 'project_id')
    })
  })

  test('a failing Revision insert rolls the row write back', async () => {
    sqlite.run("CREATE TRIGGER no_revision BEFORE INSERT ON revision BEGIN SELECT RAISE(ABORT, 'x'); END")
    const log = console.error
    console.error = () => {}
    await denied(() => patch('note/1', { tekst: 'nooit' }), 500, 'internal')
    console.error = log
  })

  test('the served connection reports PRAGMA foreign_keys = 1', () => {
    const own = new Database(':memory:')
    migrate(own, domain)
    own.run('PRAGMA foreign_keys = OFF')
    createEngine(own, domain, { port: 4310 })
    expect(own.query('PRAGMA foreign_keys').get()).toEqual({ foreign_keys: 1 })
  })
})

describe('in-use denials', () => {
  test('delete of project 1 is 409 in_use with by per referencing dataset and the English fallback message', async () => {
    const res = await denied(() => remove('project/1'), 409, 'in_use')
    expect(res.body).toEqual({
      code: 'in_use',
      message: 'Still referenced by Taken (2), Notes (1)',
      by: [
        { label: 'Taken', count: 2 },
        { label: 'Notes', count: 1 },
      ],
    })
  })

  test("on a 409 the writer's delete ran first, and what it wrote is rolled back", async () => {
    projectDeleteHook.run = (id) => sqlite.run(`UPDATE project SET name = 'written' WHERE id = ${id}`)
    await denied(() => remove('project/1'), 409, 'in_use')
    expect(projectDeletes).toEqual([1])
  })

  const thrown: Record<keyof typeof probes, string> = {
    'probe undeclared': 'exists: "onbekend" is not a declared column of note',
    'probe id': 'exists: "id" is not a declared column of note',
    'probe null': 'exists: "day" may not be matched against null',
    'probe undefined': 'exists: "day" may not be matched against null',
    'probe empty': 'exists: a match names no column',
    'probe array': 'exists: "tekst" must be text',
    'probe revision': 'exists: "revision" is not a dataset',
    'probe saved_view': 'exists: "saved_view" is not a dataset',
    'probe query': 'exists: "per_project" is not a dataset',
  }

  test.each(Object.keys(probes))(
    'ctx.exists asked "%s" throws its own error: 500 internal, nothing written',
    async (probe) => {
      const logged = await quietly(async () => {
        await denied(() => patch('note/1', { tekst: probe }), 500, 'internal')
        await denied(() => post('note', { project_id: 1, tekst: probe }), 500, 'internal')
      })
      expect(logged).toEqual([thrown[probe], thrown[probe]] as string[])
    },
  )
})

describe('in use', () => {
  const live = (table: string, id: number) =>
    sqlite.query(`SELECT deleted_at FROM "${table}" WHERE id = ?`).get(id) as { deleted_at: string | null }

  test('/schema marks a dataset whose writer has delete as deletable, others not', async () => {
    const { body } = await request('GET', '/api/schema')
    const deletable = Object.fromEntries(
      Object.entries(body.sources).map(([n, s]) => [n, (s as { deletable: boolean }).deletable]),
    )
    expect(deletable).toEqual({
      project: true,
      taak: false,
      plat: false,
      note: true,
      koppel: false,
      merk: false,
      per_project: false,
      note_lijst: false,
    })
  })

  test('a soft-deleted referrer does not block', async () => {
    softDelete('taak', 1)
    softDelete('taak', 2)
    expect(await remove('project/1')).toMatchObject({ status: 409, body: { by: [{ label: 'Notes', count: 1 }] } })
    softDelete('taak', 3)
    softDelete('taak', 4)
    expect(await remove('project/2')).toEqual({ status: 200, body: { id: 2 } })
  })

  test('an unreferenced project, and one referenced only from a query, is deletable', async () => {
    const vast = defineQuery({
      name: 'vast',
      label: 'Vast',
      title: 'name',
      sql: "SELECT 3 AS id, 3 AS project_id, 'x' AS name",
      columns: {
        id: { type: 'integer', label: 'Id' },
        project_id: { type: 'integer', label: 'Project', relation: 'project' },
        name: { type: 'text', label: 'Name' },
      },
    })
    const withQuery = { ...domain, queries: [...domain.queries, vast] }
    sqlite = new Database(':memory:')
    migrate(sqlite, withQuery)
    seedDomain(sqlite, withQuery)
    const app = testEngine(sqlite, withQuery)
    request = send(app, await signIn(app))
    sqlite.run("INSERT INTO project (name) VALUES ('Gamma'), ('Delta')")
    expect((await request('GET', '/api/rows/vast')).body.total).toBe(1)
    expect(await remove('project/3')).toEqual({ status: 200, body: { id: 3 } })
    expect(await remove('project/4')).toEqual({ status: 200, body: { id: 4 } })
  })

  test("Revision rows that name a project's id do not count as references", async () => {
    sqlite.run("INSERT INTO project (name) VALUES ('Gamma')")
    sqlite.run(
      "INSERT INTO revision (entity, record_id, field, old, new, actor_id, at, batch_id) VALUES ('project', 3, 'name', NULL, '\"Gamma\"', 0, 'x', 'b'), ('taak', 1, 'project_id', '1', '3', 0, 'x', 'b')",
    )
    expect(await remove('project/3')).toEqual({ status: 200, body: { id: 3 } })
  })

  test('ctx.exists finds a live match, ignores soft-deleted rows and the excepted id', async () => {
    const duplicate = { status: 422, body: { code: 'refused', message: 'deze note bestaat al' } }
    expect(await post('note', { project_id: 1, tekst: 'eerste' })).toEqual(duplicate)
    expect((await patch('note/1', { tekst: 'eerste' })).status).toBe(200)
    expect((await post('note', { project_id: 1, tekst: 'tweede' })).status).toBe(201)
    expect(await patch('note/2', { tekst: 'eerste' })).toEqual(duplicate)
    softDelete('note', 1)
    expect((await patch('note/2', { tekst: 'eerste' })).status).toBe(200)
    expect((await post('note', { project_id: 1, tekst: 'tweede' })).status).toBe(201)
  })

  test('after the referrer is deleted, the delete succeeds, reaches the writer and is revised', async () => {
    softDelete('taak', 1)
    softDelete('taak', 2)
    expect((await remove('note/1')).status).toBe(200)
    expect(await remove('project/1')).toEqual({ status: 200, body: { id: 1 } })
    expect(projectDeletes).toEqual([1])
    const { deleted_at } = live('project', 1)
    expect(deleted_at).toMatch(/^\d{4}-/)
    expect(changes(await revisionsOf('project', 1))).toEqual([['deleted_at', null, deleted_at]])
  })
})

type Revision = {
  field: string
  old: unknown
  new: unknown
  actor_id: number
  at: string
  batch_id: string
}
const revisionsOf = async (dataset: string, id: number) => (await revisions(dataset, id)).body.revisions as Revision[]
const changes = (rows: Revision[]) => rows.map((r) => [r.field, r.old, r.new])

describe('writes', () => {
  test('create returns 201 with the stored row, marks the create and writes one revision per stored field with old null', async () => {
    const res = await post('note', { project_id: 1, tekst: 'hallo', klaar: true })
    expect(res).toEqual({
      status: 201,
      body: {
        id: 2,
        project_id: 1,
        tekst: 'hallo',
        lengte: 5,
        klaar: true,
        kind: 'kort',
        day: null,
        start_at: null,
        title: 'hallo',
        extra: null,
        custom: {},
        lookups: { project_id: { id: 1, title: 'Alfa' } },
        revision: {
          batch_id: expect.stringMatching(/^[0-9a-f-]{36}$/),
          changed: ['project_id', 'tekst', 'lengte', 'klaar', 'kind'],
        },
      },
    })
    const rows = await revisionsOf('note', 2)
    expect(changes(rows)).toEqual([
      ['id', null, 2],
      ['project_id', null, 1],
      ['tekst', null, 'hallo'],
      ['lengte', null, 5],
      ['klaar', null, true],
      ['kind', null, 'kort'],
    ])
    expect(new Set(rows.map((r) => r.batch_id)).size).toBe(1)
  })

  test('update writes one revision per changed field only, sharing a batch_id, with the signed-in account as actor', async () => {
    const res = await patch('note/1', { project_id: 1, tekst: 'ander' })
    expect(res.status).toBe(200)
    expect(res.body).toMatchObject({ id: 1, tekst: 'ander', lengte: 5 })
    const rows = await revisionsOf('note', 1)
    expect(changes(rows)).toEqual([
      ['tekst', 'eerste', 'ander'],
      ['lengte', 6, 5],
    ])
    expect(rows.map((r) => r.actor_id)).toEqual([ME, ME])
    expect(rows[0]?.batch_id).toBe(rows[1]?.batch_id as string)
    expect(rows[0]?.batch_id).toMatch(/^[0-9a-f-]{36}$/)
  })

  test('a create revises the columns the database filled with a default, old null', async () => {
    await post('note', { project_id: 1, tekst: 'x' })
    expect(changes(await revisionsOf('note', 2))).toContainEqual(['klaar', null, false])
    expect(changes(await revisionsOf('note', 2))).toContainEqual(['kind', null, 'kort'])
  })

  test('valid date, datetime with and without seconds, and option values are stored', async () => {
    const values = { day: '2028-02-29', start_at: '2026-10-12T09:30:15', kind: 'lang' }
    expect((await patch('note/1', values)).body).toMatchObject(values)
    expect((await patch('note/1', { start_at: '2026-10-12T23:59' })).status).toBe(200)
  })

  test('revision old and new are the decoded values: json not double-encoded, booleans true/false', async () => {
    await patch('note/1', { extra: { a: [1, 'b'] }, klaar: true })
    await patch('note/1', { extra: { a: 2 }, klaar: false })
    expect(changes(await revisionsOf('note', 1))).toEqual([
      ['klaar', false, true],
      ['extra', null, { a: [1, 'b'] }],
      ['klaar', true, false],
      ['extra', { a: [1, 'b'] }, { a: 2 }],
    ])
    expect(sqlite.query("SELECT old, new FROM revision WHERE field = 'extra' ORDER BY id").all()).toEqual([
      { old: null, new: '{"a":[1,"b"]}' },
      { old: '{"a":[1,"b"]}', new: '{"a":2}' },
    ])
  })

  test('an update that changes nothing writes no revision', async () => {
    const before = state()
    const res = await patch('note/1', { tekst: 'eerste', klaar: false })
    expect({ status: res.status, tekst: res.body.tekst }).toEqual({ status: 200, tekst: 'eerste' })
    expect(state()).toEqual(before)
  })

  test('a writer-derived readonly column is stored and revised', async () => {
    await patch('note/1', { tekst: 'veel langer', lengte: 1 })
    expect(sqlite.query('SELECT lengte FROM note WHERE id = 1').get()).toEqual({ lengte: 11 })
    expect(changes(await revisionsOf('note', 1))).toContainEqual(['lengte', 6, 11])
  })

  test('delete is soft: the row leaves /rows, deleted_at is revised', async () => {
    expect(await remove('note/1')).toEqual({ status: 200, body: { id: 1 } })
    expect((await request('GET', '/api/rows/note')).body.total).toBe(0)
    const stored = sqlite.query('SELECT deleted_at FROM note WHERE id = 1').get() as { deleted_at: string }
    expect(stored.deleted_at).toMatch(/^\d{4}-\d{2}-\d{2}T/)
    expect(changes(await revisionsOf('note', 1))).toEqual([['deleted_at', null, stored.deleted_at]])
  })

  test('GET /api/revisions returns them oldest first; unknown dataset 404', async () => {
    await patch('note/1', { tekst: 'twee' })
    await patch('note/1', { tekst: 'drie' })
    expect(changes(await revisionsOf('note', 1)).map(([, , n]) => n)).toEqual(['twee', 4, 'drie'])
    expect(await revisions('note', 42)).toEqual({ status: 200, body: { revisions: [] } })
    for (const name of ['nope', 'revision', 'saved_view', 'per_project', 'taak']) {
      expect(await revisions(name, 1)).toMatchObject({ status: 404, body: { code: 'unknown_source' } })
    }
  })

  test('GET /api/revisions answers at most 5000, the oldest first', async () => {
    const add = sqlite.query(
      "INSERT INTO revision (entity, record_id, field, old, new, actor_id, at, batch_id) VALUES ('note', 1, 'tekst', NULL, ?, 0, 'x', 'b')",
    )
    sqlite.transaction(() => {
      for (let i = 0; i < 5001; i++) add.run(json(`v${i}`))
    })()
    const rows = await revisionsOf('note', 1)
    expect(rows.length).toBe(5000)
    expect([rows[0]?.new, rows[4999]?.new]).toEqual(['v0', 'v4999'])
  })

  test('a body naming actor_id and batch_id does not forge the audit; POST /api/rows/revision is 404', async () => {
    await patch('note/1', { tekst: 'ander', actor_id: 99, batch_id: 'x' })
    const rows = await revisionsOf('note', 1)
    expect(rows.map((r) => r.actor_id)).toEqual([ME, ME])
    expect(rows.every((r) => /^[0-9a-f-]{36}$/.test(r.batch_id))).toBe(true)
    await denied(
      () => post('revision', { entity: 'note', record_id: 1, field: 'tekst', actor_id: 99 }),
      404,
      'unknown_source',
    )
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
      note: true,
      koppel: false,
      merk: false,
      per_project: false,
      note_lijst: true,
    })
  })
})
