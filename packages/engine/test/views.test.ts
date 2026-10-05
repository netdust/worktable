import { Database } from 'bun:sqlite'
import { beforeEach, describe, expect, test } from 'bun:test'
import { type ColumnDecl, createEngine, type Domain, defineDataset, defineQuery, migrate, seedDomain } from '../src'
import { contents, type Sent, send } from './fixture'

const text: ColumnDecl = { type: 'text', label: 'T', nullable: true }
const rel = (relation: string): ColumnDecl => ({ type: 'integer', label: 'R', relation, nullable: true })

const persoon = defineDataset({ name: 'persoon', label: 'P', title: 'naam', custom: false, columns: { naam: text } })
const taak = defineDataset({
  name: 'taak',
  label: 'T',
  title: 'naam',
  custom: true,
  columns: { naam: text, status: { type: 'text', label: 'S', options: { open: 'Open', klaar: 'Klaar' } } },
})
const koppel = defineDataset({
  name: 'koppel',
  label: 'K',
  title: 'naam',
  custom: false,
  columns: { taak_id: rel('taak'), persoon_id: rel('persoon'), naam: text, state: { ...text, options: { a: 'A' } } },
  matrix: { down: 'taak_id', across: 'persoon_id', cell: 'state', keys: { x: 'a' }, marks: { a: '!' }, count: 'a' },
})
const perStatus = defineQuery({
  name: 'per_status',
  label: 'Per status',
  title: 'status',
  sql: 'SELECT status AS id, status FROM taak',
  columns: { id: { type: 'text', label: 'Id' }, status: { type: 'text', label: 'S' } },
})

const domain: Domain = {
  datasets: [persoon, taak, koppel],
  queries: [perStatus],
  seed: (insert) => insert('taak', [{ naam: 'een', status: 'open' }]),
  views: [
    {
      name: 'Alles',
      source_type: 'dataset',
      source: 'taak',
      skin: 'table',
      filters: { status: 'open' },
      sort: ['naam'],
      group_by: null,
      visible_fields: ['naam'],
    },
  ],
}

let sqlite: Database
let request: ReturnType<typeof send>

function foreign(name: string, shared: boolean, deleted = false): number {
  const sql = `INSERT INTO saved_view (name, source_type, source, owner_id, shared, deleted_at)
               VALUES (?, 'dataset', 'taak', 7, ?, ?)`
  return Number(sqlite.query(sql).run(name, shared ? 1 : 0, deleted ? '2026-10-01T00:00:00Z' : null).lastInsertRowid)
}

const SEEDED = 1
const SHARED = 2
const UNSHARED = 3
const SHARED_DELETED = 4
const UNSHARED_DELETED = 5

beforeEach(() => {
  sqlite = new Database(':memory:')
  migrate(sqlite, domain)
  seedDomain(sqlite, domain)
  foreign('Van Zeven gedeeld', true)
  foreign('Van Zeven privé', false)
  foreign('Van Zeven gedeeld weg', true, true)
  foreign('Van Zeven privé weg', false, true)
  request = send(createEngine(sqlite, domain, { port: 4310 }))
})

const state = () => ({ saved_view: contents(sqlite, 'saved_view'), revision: contents(sqlite, 'revision') })
const json = (value: unknown) => JSON.stringify(value)
const body = (value: unknown): Sent => ({ body: json(value) })
const NEW = { name: 'Mijn taken', source: 'taak' }

async function denied(method: string, path: string, sent: Sent, status: number, code: string) {
  const before = state()
  const res = await request(method, path, sent)
  expect({ status: res.status, code: res.body.code }).toEqual({ status, code })
  expect(state()).toEqual(before)
}

const view = async (id: number) =>
  ((await request('GET', '/api/views')).body.views as { id: number }[]).find((v) => v.id === id)

describe('views denials: another owner (attack 1)', () => {
  const writes: [string, (id: number) => string, Sent][] = [
    ['PATCH', (id) => `/api/views/${id}`, body({ name: 'Mijn naam nu' })],
    ['DELETE', (id) => `/api/views/${id}`, { type: null }],
  ]
  for (const [method, path, sent] of writes) {
    test(`${method} on an unshared foreign view is 404 unknown_view`, () =>
      denied(method, path(UNSHARED), sent, 404, 'unknown_view'))
    test(`${method} on a shared foreign view is 403 not_owner`, () =>
      denied(method, path(SHARED), sent, 403, 'not_owner'))
    test.each(['999', '0', 'abc', '1.5'])(`${method} on view %s is 404 unknown_view`, (id) =>
      denied(method, `/api/views/${id}`, sent, 404, 'unknown_view'),
    )
  }
  test('restore of an unshared deleted foreign view is 404 unknown_view', () =>
    denied('POST', `/api/views/${UNSHARED_DELETED}/restore`, body({}), 404, 'unknown_view'))
  test('restore of a shared deleted foreign view is 403 not_owner', () =>
    denied('POST', `/api/views/${SHARED_DELETED}/restore`, body({}), 403, 'not_owner'))
  test('restore of an unknown view is 404 unknown_view', () =>
    denied('POST', '/api/views/999/restore', body({}), 404, 'unknown_view'))
  test('a deleted view of my own is 404 unknown_view to PATCH and DELETE', async () => {
    sqlite.run("UPDATE saved_view SET deleted_at = '2026-10-01T00:00:00Z' WHERE id = 1")
    await denied('PATCH', `/api/views/${SEEDED}`, body({ name: 'x' }), 404, 'unknown_view')
    await denied('DELETE', `/api/views/${SEEDED}`, { type: null }, 404, 'unknown_view')
  })
})

describe('views denials: forged ownership and audit (attack 2)', () => {
  const forged = { owner_id: 7, id: 99, deleted_at: '2026-01-01', share_token: 'tok', public: true, scope: 'x' }

  test('a POST cannot set owner, id, deleted_at, share_token, public or scope', async () => {
    const res = await request('POST', '/api/views', body({ ...NEW, ...forged }))
    expect(res.status).toBe(201)
    expect(res.body).toMatchObject({ id: 6, owner_id: 0, mine: true })
    const stored = sqlite.query('SELECT owner_id, deleted_at, share_token, public FROM saved_view WHERE id = 6').get()
    expect(stored).toEqual({ owner_id: 0, deleted_at: null, share_token: null, public: 0 })
    expect(sqlite.query('SELECT COUNT(*) AS n FROM saved_view WHERE id = 99').get()).toEqual({ n: 0 })
  })

  test('a PATCH of only forged fields changes nothing', async () => {
    const before = state()
    const res = await request('PATCH', `/api/views/${SEEDED}`, body(forged))
    expect(res.status).toBe(200)
    expect(res.body).toMatchObject({ id: SEEDED, owner_id: 0 })
    expect(state()).toEqual(before)
  })

  test.each([{ source: 'persoon' }, { skin: 'matrix' }, { source: 'taak' }, { skin: 'table' }])(
    'a PATCH naming %p is 400 bad_view',
    (patch) => denied('PATCH', `/api/views/${SEEDED}`, body(patch), 400, 'bad_view'),
  )
})

const hostile: [string, Record<string, unknown>][] = [
  ['an unknown filter key', { filters: { nope: 1 } }],
  ['a quoted filter key', { filters: { 'naam" OR 1=1 --': 1 } }],
  ['an unknown operator', { filters: { naam: { $regex: 'x' } } }],
  ['an array filter', { filters: [] }],
  ['a string filter', { filters: 'naam = 1' }],
  ['an $in over 100 values', { filters: { naam: { $in: Array.from({ length: 101 }, (_, i) => `n${i}`) } } }],
  ['$contains on a column', { filters: { naam: { $contains: 'x' } } }],
  ['a bad custom key', { filters: { 'custom.a-b': 1 } }],
  ['a sort on an unknown column', { sort: ['nope'] }],
  ['a quoted sort', { sort: ['-naam"; DROP TABLE taak; --'] }],
  ['a sort that is a string', { sort: 'naam' }],
  ['a sort of numbers', { sort: [1] }],
  ['a group on an unknown column', { group_by: 'nope' }],
  ['a group that is a number', { group_by: 1 }],
  ['an unknown visible field', { visible_fields: ['naam', 'nope'] }],
  ['visible fields as an object', { visible_fields: { naam: true } }],
  ['shared as a string', { shared: 'true' }],
  ['shared as 1', { shared: 1 }],
  ['an empty name', { name: '' }],
  ['a blank name', { name: '   ' }],
  ['a name of 81 characters', { name: 'a'.repeat(81) }],
  ['a name that is a number', { name: 5 }],
]

describe('views denials: hostile filters, sorts, columns and names (attacks 3, 4)', () => {
  test.each(hostile)('a POST with %s is 400 bad_view', (_, over) =>
    denied('POST', '/api/views', body({ ...NEW, ...over }), 400, 'bad_view'),
  )
  test.each(hostile)('a PATCH with %s is 400 bad_view', (_, over) =>
    denied('PATCH', `/api/views/${SEEDED}`, body(over), 400, 'bad_view'),
  )

  test.each([
    ['no source', { name: 'x' }],
    ['no name', { source: 'taak' }],
    ['an unknown source', { ...NEW, source: 'nope' }],
    ['the engine table saved_view', { ...NEW, source: 'saved_view' }],
    ['the engine table revision', { ...NEW, source: 'revision' }],
    ['a skin of calendar', { ...NEW, skin: 'calendar' }],
    ['a matrix skin on a source with no matrix', { ...NEW, source: 'persoon', skin: 'matrix' }],
  ])('a POST with %s is 400 bad_view', (_, sent) => denied('POST', '/api/views', body(sent), 400, 'bad_view'))

  test('a POST whose stored view would exceed 16 kB is 400 view_too_large', () => {
    const big = Array.from({ length: 20 }, (_, i) => `${i}${'x'.repeat(1000)}`)
    return denied('POST', '/api/views', body({ ...NEW, filters: { naam: { $in: big } } }), 400, 'view_too_large')
  })

  test('a PATCH that grows a view past 16 kB is 400 view_too_large', () => {
    const big = Array.from({ length: 20 }, (_, i) => `${i}${'x'.repeat(1000)}`)
    return denied('PATCH', `/api/views/${SEEDED}`, body({ filters: { naam: { $in: big } } }), 400, 'view_too_large')
  })

  test('a body over 64 kB is 413 body_too_large', () =>
    denied('POST', '/api/views', body({ ...NEW, name: 'a'.repeat(70_000) }), 413, 'body_too_large'))

  test('a body that is not JSON is 400 bad_body', () =>
    denied('POST', '/api/views', { body: '{"name":' }, 400, 'bad_body'))

  test('a body that is an array is 400 bad_body', () => denied('POST', '/api/views', body([NEW]), 400, 'bad_body'))
})

describe('views denials: cross-site writes (attack 7)', () => {
  const writes: [string, string, Sent][] = [
    ['POST', '/api/views', body(NEW)],
    ['PATCH', `/api/views/${SEEDED}`, body({ name: 'x' })],
    ['DELETE', `/api/views/${SEEDED}`, { type: null }],
    ['POST', `/api/views/${SEEDED}/restore`, body({})],
  ]
  for (const site of ['cross-site', 'same-site']) {
    test.each(writes)(`Sec-Fetch-Site: ${site} is 403 forbidden_site on %s %s`, (method, path, sent) =>
      denied(method, path, { ...sent, site }, 403, 'forbidden_site'),
    )
  }
  test.each(writes)('Origin without Sec-Fetch-Site is 403 forbidden_site on %s %s', (method, path, sent) =>
    denied(method, path, { ...sent, origin: 'http://localhost:3999' }, 403, 'forbidden_site'),
  )
  test.each(writes.filter(([method]) => method !== 'DELETE'))(
    'text/plain is 415 bad_content_type on %s %s',
    (method, path, sent) => denied(method, path, { ...sent, type: 'text/plain' }, 415, 'bad_content_type'),
  )
  test.each(writes)('Host evil.example is 403 forbidden_host on %s %s', (method, path, sent) =>
    denied(method, path, { ...sent, host: 'evil.example' }, 403, 'forbidden_host'),
  )
})

const revisions = (id: number) =>
  sqlite
    .query('SELECT field, old, new, actor_id FROM revision WHERE entity = ? AND record_id = ? ORDER BY id')
    .all('saved_view', id) as { field: string; old: string | null; new: string | null; actor_id: number }[]

describe('views', () => {
  test('GET lists my views and the shared ones, live, by id, never another unshared view', async () => {
    const { status, body } = await request('GET', '/api/views')
    expect(status).toBe(200)
    expect(body.views.map((v: { id: number }) => v.id)).toEqual([SEEDED, SHARED])
    expect(body.views[1]).toMatchObject({ name: 'Van Zeven gedeeld', owner_id: 7, mine: false, editable: false })
  })

  test('a seeded view is owned by the dev actor, shared, mine and editable', async () => {
    expect(await view(SEEDED)).toEqual({
      id: SEEDED,
      name: 'Alles',
      source_type: 'dataset',
      source: 'taak',
      skin: 'table',
      filters: { status: 'open' },
      sort: ['naam'],
      group_by: null,
      visible_fields: ['naam'],
      shared: true,
      owner_id: 0,
      mine: true,
      editable: true,
    })
  })

  test('POST creates a view with defaults, owned by me, unshared, revised with actor 0', async () => {
    const res = await request('POST', '/api/views', body({ ...NEW, name: '  Mijn taken  ' }))
    expect(res.status).toBe(201)
    expect(res.body).toEqual({
      id: 6,
      name: 'Mijn taken',
      source_type: 'dataset',
      source: 'taak',
      skin: 'table',
      filters: {},
      sort: [],
      group_by: null,
      visible_fields: [],
      shared: false,
      owner_id: 0,
      mine: true,
      editable: true,
    })
    expect(await view(6)).toEqual(res.body)
    const revised = revisions(6)
    expect(revised.every((r) => r.actor_id === 0 && r.old === null)).toBe(true)
    expect(revised.find((r) => r.field === 'name')?.new).toBe('"Mijn taken"')
    expect(revised.find((r) => r.field === 'owner_id')?.new).toBe('0')
  })

  test('POST keeps a full arrangement, on a query and as a matrix', async () => {
    const arrangement = {
      filters: { status: 'open', naam: { $in: ['a', 'b'] }, 'custom.prio': { $gte: 2 } },
      sort: ['-naam', 'id'],
      group_by: 'status',
      visible_fields: ['status', 'naam'],
      shared: true,
    }
    const res = await request('POST', '/api/views', body({ ...NEW, ...arrangement }))
    expect(res.status).toBe(201)
    expect(res.body).toMatchObject(arrangement)
    const query = await request('POST', '/api/views', body({ name: 'Q', source: 'per_status', sort: ['status'] }))
    expect(query.body).toMatchObject({ source_type: 'query', source: 'per_status' })
    const matrix = await request('POST', '/api/views', body({ name: 'M', source: 'taak', skin: 'matrix' }))
    expect({ status: matrix.status, skin: matrix.body.skin }).toEqual({ status: 201, skin: 'matrix' })
  })

  test('PATCH renames and shares, revising only what changed', async () => {
    const created = (await request('POST', '/api/views', body(NEW))).body
    const before = revisions(created.id).length
    const res = await request('PATCH', `/api/views/${created.id}`, body({ name: 'Anders', shared: true }))
    expect(res.status).toBe(200)
    expect(res.body).toMatchObject({ name: 'Anders', shared: true, mine: true, editable: true })
    expect(revisions(created.id).slice(before)).toEqual([
      { field: 'name', old: '"Mijn taken"', new: '"Anders"', actor_id: 0 },
      { field: 'shared', old: 'false', new: 'true', actor_id: 0 },
    ])
  })

  test('PATCH keeps the arrangement fields it is not given', async () => {
    const res = await request('PATCH', `/api/views/${SEEDED}`, body({ sort: ['-naam'] }))
    expect(res.body).toMatchObject({ name: 'Alles', filters: { status: 'open' }, sort: ['-naam'] })
  })

  test('DELETE hides a view, restore brings it back, both revised', async () => {
    const res = await request('DELETE', `/api/views/${SEEDED}`, { type: null })
    expect(res).toEqual({ status: 200, body: { id: SEEDED } })
    expect(await view(SEEDED)).toBeUndefined()
    const restored = await request('POST', `/api/views/${SEEDED}/restore`, body({}))
    expect(restored.status).toBe(200)
    expect(restored.body).toMatchObject({ id: SEEDED, name: 'Alles', mine: true })
    expect(await view(SEEDED)).toEqual(restored.body)
    const audit = revisions(SEEDED)
    expect(audit.map((r) => [r.field, r.old === null, r.new === null, r.actor_id])).toEqual([
      ['deleted_at', true, false, 0],
      ['deleted_at', false, true, 0],
    ])
  })

  test('restore of a live view of my own changes nothing', async () => {
    const before = state()
    const res = await request('POST', `/api/views/${SEEDED}/restore`, body({}))
    expect(res.status).toBe(200)
    expect(state()).toEqual(before)
  })

  test('/schema still serves the views', async () => {
    const res = await request('GET', '/api/schema')
    expect(res.body.views[0]).toMatchObject({ id: SEEDED, name: 'Alles' })
  })
})
