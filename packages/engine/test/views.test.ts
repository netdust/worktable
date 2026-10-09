import { Database } from 'bun:sqlite'
import { beforeEach, describe, expect, test } from 'bun:test'
import { drizzle } from 'drizzle-orm/bun-sqlite'
import { Hono } from 'hono'
import { type Actor, type ColumnDecl, type Domain, defineDataset, defineQuery, migrate, seedDomain } from '../src'
import type { AuthEnv } from '../src/auth'
import { silentMailer } from '../src/mailer'
import { viewRoutes } from '../src/views'
import { contents, type Sent, send } from './fixture'
import { signIn, testEngine } from './sign-in'

const text: ColumnDecl = { type: 'text', label: 'T', nullable: true }
const rel = (relation: string): ColumnDecl => ({ type: 'integer', label: 'R', relation, nullable: true })

const member = defineDataset({ name: 'member', label: 'P', title: 'name', custom: false, columns: { name: text } })
const taak = defineDataset({
  name: 'taak',
  label: 'T',
  title: 'name',
  custom: true,
  columns: { name: text, status: { type: 'text', label: 'S', options: { open: 'Open', klaar: 'Klaar' } } },
})
const koppel = defineDataset({
  name: 'koppel',
  label: 'K',
  title: 'name',
  custom: false,
  columns: { taak_id: rel('taak'), member_id: rel('member'), name: text, state: { ...text, options: { a: 'A' } } },
  matrix: { down: 'taak_id', across: 'member_id', cell: 'state', keys: { x: 'a' }, marks: { a: '!' }, count: 'a' },
})
const perStatus = defineQuery({
  name: 'per_status',
  label: 'Per status',
  title: 'status',
  sql: 'SELECT status AS id, status FROM taak',
  columns: { id: { type: 'text', label: 'Id' }, status: { type: 'text', label: 'S' } },
})

const domain: Domain = {
  datasets: [member, taak, koppel],
  queries: [perStatus],
  seed: (insert) => insert('taak', [{ name: 'een', status: 'open' }]),
  views: [
    {
      name: 'Alles',
      source_type: 'dataset',
      source: 'taak',
      skin: 'table',
      filters: { status: 'open' },
      sort: ['name'],
      group_by: null,
      visible_fields: ['name'],
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
// The editor signed in for each test is the first account; the seeded view is handed to it to stand for one of mine.
const ME = 1

function seeded(): Database {
  const db = new Database(':memory:')
  migrate(db, domain)
  seedDomain(db, domain)
  return db
}

beforeEach(async () => {
  sqlite = seeded()
  foreign('Van Zeven gedeeld', true)
  foreign('Van Zeven privé', false)
  foreign('Van Zeven gedeeld weg', true, true)
  foreign('Van Zeven privé weg', false, true)
  const app = testEngine(sqlite, domain)
  request = send(app, await signIn(app))
  sqlite.run('UPDATE saved_view SET owner_id = ? WHERE id = ?', [ME, SEEDED])
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
    ['PATCH', (id) => `/api/views/${id}`, body({ name: 'Mijn name nu' })],
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
  // A deleted view is gone from every list, so its existence is not told to another actor, shared or not.
  test('restore of a shared deleted foreign view is 404 unknown_view', () =>
    denied('POST', `/api/views/${SHARED_DELETED}/restore`, body({}), 404, 'unknown_view'))
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
    expect(res.body).toMatchObject({ id: 6, owner_id: ME, mine: true })
    const stored = sqlite.query('SELECT owner_id, deleted_at, share_token, public FROM saved_view WHERE id = 6').get()
    expect(stored).toEqual({ owner_id: ME, deleted_at: null, share_token: null, public: 0 })
    expect(sqlite.query('SELECT COUNT(*) AS n FROM saved_view WHERE id = 99').get()).toEqual({ n: 0 })
  })

  test('a PATCH of only forged fields changes nothing', async () => {
    const before = state()
    const res = await request('PATCH', `/api/views/${SEEDED}`, body(forged))
    expect(res.status).toBe(200)
    expect(res.body).toMatchObject({ id: SEEDED, owner_id: ME })
    expect(state()).toEqual(before)
  })

  test.each([{ source: 'member' }, { skin: 'matrix' }, { source: 'taak' }, { skin: 'table' }])(
    'a PATCH naming %p is 400 bad_view',
    (patch) => denied('PATCH', `/api/views/${SEEDED}`, body(patch), 400, 'bad_view'),
  )
})

function insertAs(owner: number, extra: { public?: number; deleted?: boolean } = {}): number {
  const sql = `INSERT INTO saved_view (name, source_type, source, owner_id, shared, public, deleted_at)
               VALUES ('Systeem', 'dataset', 'taak', ?, 1, ?, ?)`
  const deleted = extra.deleted ? '2026-10-01T00:00:00Z' : null
  return Number(sqlite.query(sql).run(owner, extra.public ?? 0, deleted).lastInsertRowid)
}

describe('views denials: system views and public views (attack 8)', () => {
  test('PATCH, DELETE and restore of a system view are 403 read_only_view', async () => {
    const id = insertAs(-1)
    await denied('PATCH', `/api/views/${id}`, body({ name: 'x' }), 403, 'read_only_view')
    await denied('DELETE', `/api/views/${id}`, { type: null }, 403, 'read_only_view')
    await denied('POST', `/api/views/${insertAs(-1, { deleted: true })}/restore`, body({}), 403, 'read_only_view')
  })

  test("an editor's PATCH, DELETE and restore of their own public view are 403 public_view", async () => {
    const id = insertAs(ME, { public: 1 })
    await denied('PATCH', `/api/views/${id}`, body({ visible_fields: ['name', 'status'] }), 403, 'public_view')
    await denied('DELETE', `/api/views/${id}`, { type: null }, 403, 'public_view')
    const gone = insertAs(ME, { public: 1, deleted: true })
    await denied('POST', `/api/views/${gone}/restore`, body({}), 403, 'public_view')
  })
})

const hostile: [string, Record<string, unknown>][] = [
  ['an unknown filter key', { filters: { nope: 1 } }],
  ['a quoted filter key', { filters: { 'name" OR 1=1 --': 1 } }],
  ['an unknown operator', { filters: { name: { $regex: 'x' } } }],
  ['an array filter', { filters: [] }],
  ['a string filter', { filters: 'name = 1' }],
  ['an $in over 100 values', { filters: { name: { $in: Array.from({ length: 101 }, (_, i) => `n${i}`) } } }],
  ['$contains on a column', { filters: { name: { $contains: 'x' } } }],
  ['a bad custom key', { filters: { 'custom.a-b': 1 } }],
  ['a sort on an unknown column', { sort: ['nope'] }],
  ['a quoted sort', { sort: ['-name"; DROP TABLE taak; --'] }],
  ['a sort that is a string', { sort: 'name' }],
  ['a sort of numbers', { sort: [1] }],
  ['a group on an unknown column', { group_by: 'nope' }],
  ['a group that is a number', { group_by: 1 }],
  ['an unknown visible field', { visible_fields: ['name', 'nope'] }],
  ['visible fields as an object', { visible_fields: { name: true } }],
  ['shared as a string', { shared: 'true' }],
  ['shared as 1', { shared: 1 }],
  ['an empty name', { name: '' }],
  ['a blank name', { name: '   ' }],
  ['a name of 81 characters', { name: 'a'.repeat(81) }],
  ['a name that is a number', { name: 5 }],
  ['a sort of 17 keys', { sort: Array(17).fill('name') }],
  ['a sort naming a key twice', { sort: ['name', '-name'] }],
  ['visible fields of 17 keys', { visible_fields: Array(17).fill('name') }],
  ['visible fields naming a key twice', { visible_fields: ['name', 'name'] }],
  ['a name holding a NUL', { name: 'Mijn\u0000taken' }],
  ['a name holding a bidi override', { name: 'Mijn \u202Etaken' }],
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
    ['a matrix skin on a source with no matrix', { ...NEW, source: 'member', skin: 'matrix' }],
  ])('a POST with %s is 400 bad_view', (_, sent) => denied('POST', '/api/views', body(sent), 400, 'bad_view'))

  test('a POST whose stored view would exceed 16 kB is 400 view_too_large', () => {
    const big = Array.from({ length: 20 }, (_, i) => `${i}${'x'.repeat(1000)}`)
    return denied('POST', '/api/views', body({ ...NEW, filters: { name: { $in: big } } }), 400, 'view_too_large')
  })

  test('a PATCH that grows a view past 16 kB is 400 view_too_large', () => {
    const big = Array.from({ length: 20 }, (_, i) => `${i}${'x'.repeat(1000)}`)
    return denied('PATCH', `/api/views/${SEEDED}`, body({ filters: { name: { $in: big } } }), 400, 'view_too_large')
  })

  // JSON.stringify cannot carry 1e999, so the body is written by hand; JSON.parse reads it as Infinity.
  test('a filter number that is not finite is 400 bad_view, on POST and PATCH', async () => {
    const filters = '{"custom.prio":{"$gte":1e999}}'
    await denied('POST', '/api/views', { body: `{"name":"x","source":"taak","filters":${filters}}` }, 400, 'bad_view')
    await denied('PATCH', `/api/views/${SEEDED}`, { body: `{"filters":${filters}}` }, 400, 'bad_view')
  })

  test('a sort of 17 keys is refused for their number', async () => {
    const res = await request('POST', '/api/views', body({ ...NEW, sort: Array(17).fill('name') }))
    expect({ status: res.status, message: res.body.message }).toEqual({
      status: 400,
      message: 'sort takes at most 16 keys',
    })
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

  test('a seeded view is owned by the system owner, shared, and neither mine nor editable', async () => {
    const fresh = seeded()
    const app = testEngine(fresh, domain)
    const { body } = await send(app, await signIn(app))('GET', '/api/views')
    expect(body.views).toEqual([
      {
        id: SEEDED,
        name: 'Alles',
        source_type: 'dataset',
        source: 'taak',
        skin: 'table',
        filters: { status: 'open' },
        sort: ['name'],
        group_by: null,
        visible_fields: ['name'],
        shared: true,
        public: false,
        owner_id: -1,
        mine: false,
        editable: false,
      },
    ])
  })

  test('POST creates a view with defaults, owned by me, unshared, revised with my id', async () => {
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
      public: false,
      owner_id: ME,
      mine: true,
      editable: true,
    })
    expect(await view(6)).toEqual(res.body)
    const revised = revisions(6)
    expect(revised.every((r) => r.actor_id === ME && r.old === null)).toBe(true)
    expect(revised.find((r) => r.field === 'name')?.new).toBe('"Mijn taken"')
    expect(revised.find((r) => r.field === 'owner_id')?.new).toBe(String(ME))
  })

  test('POST keeps a full arrangement, on a query and as a matrix', async () => {
    const arrangement = {
      filters: { status: 'open', name: { $in: ['a', 'b'] }, 'custom.prio': { $gte: 2 } },
      sort: ['-name', 'id'],
      group_by: 'status',
      visible_fields: ['status', 'name'],
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
      { field: 'name', old: '"Mijn taken"', new: '"Anders"', actor_id: ME },
      { field: 'shared', old: 'false', new: 'true', actor_id: ME },
    ])
  })

  test('PATCH keeps the arrangement fields it is not given', async () => {
    const res = await request('PATCH', `/api/views/${SEEDED}`, body({ sort: ['-name'] }))
    expect(res.body).toMatchObject({ name: 'Alles', filters: { status: 'open' }, sort: ['-name'] })
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
      ['deleted_at', true, false, ME],
      ['deleted_at', false, true, ME],
    ])
  })

  test('restore of a live view of my own changes nothing', async () => {
    const before = state()
    const res = await request('POST', `/api/views/${SEEDED}/restore`, body({}))
    expect(res.status).toBe(200)
    expect(state()).toEqual(before)
  })

  test('/schema serves no views: neither a foreign unshared one nor a deleted one leaks through it', async () => {
    const res = await request('GET', '/api/schema')
    expect(res.status).toBe(200)
    expect(res.body.views).toBeUndefined()
    expect(JSON.stringify(res.body)).not.toContain('Van Zeven')
  })
})

describe('system views', () => {
  test('"save as new" from a system view is a plain POST, owned by the caller', async () => {
    const system = (await view(insertAs(-1))) as Record<string, unknown>
    expect(system).toMatchObject({ owner_id: -1, mine: false, editable: false })
    const { id, owner_id, mine, editable, shared, public: _, source_type, ...copy } = system
    const res = await request('POST', '/api/views', body({ ...copy, name: 'Mijn kopie' }))
    expect(res.status).toBe(201)
    expect(res.body).toMatchObject({ name: 'Mijn kopie', owner_id: ME, mine: true, editable: true })
  })
})

describe('the owner-0 migration', () => {
  const owners = (db: Database) =>
    db.query('SELECT name, owner_id FROM saved_view ORDER BY id').all() as { name: string; owner_id: number }[]
  const legacy = (db: Database, name: string, source: string) =>
    db
      .query(`INSERT INTO saved_view (name, source_type, source, owner_id, shared) VALUES (?, 'dataset', ?, 0, 1)`)
      .run(name, source)

  function oldDatabase(): Database {
    const db = new Database(':memory:')
    migrate(db, domain)
    legacy(db, 'Alles', 'taak')
    legacy(db, 'Alles', 'member')
    legacy(db, 'Eigen', 'taak')
    return db
  }

  test('a seed match moves to -1, any other to the lowest administrator, each revised by -1', () => {
    const db = oldDatabase()
    db.run("INSERT INTO account (email, role) VALUES ('ed@example.test', 'editor')")
    db.run("INSERT INTO account (email, role) VALUES ('a2@example.test', 'administrator')")
    db.run("INSERT INTO account (email, role) VALUES ('a3@example.test', 'administrator')")
    migrate(db, domain)
    expect(owners(db)).toEqual([
      { name: 'Alles', owner_id: -1 },
      { name: 'Alles', owner_id: 2 },
      { name: 'Eigen', owner_id: 2 },
    ])
    const audit = db
      .query("SELECT record_id, field, old, new, actor_id FROM revision WHERE entity = 'saved_view'")
      .all()
    expect(audit).toEqual([
      { record_id: 1, field: 'owner_id', old: '0', new: '-1', actor_id: -1 },
      { record_id: 2, field: 'owner_id', old: '0', new: '2', actor_id: -1 },
      { record_id: 3, field: 'owner_id', old: '0', new: '2', actor_id: -1 },
    ])
  })

  test('with no administrator the others stay at 0 and startup logs their count', () => {
    const db = oldDatabase()
    const logged: string[] = []
    const log = console.log
    console.log = (line: string) => logged.push(line)
    try {
      migrate(db, domain)
    } finally {
      console.log = log
    }
    expect(owners(db).map((v) => v.owner_id)).toEqual([-1, 0, 0])
    expect(logged.some((line) => line.includes('2 views'))).toBe(true)
  })
})

test('view writes credit the actor of the request', async () => {
  const api = new Hono<AuthEnv>().basePath('/api')
  const actor: Actor = { id: 5, role: 'editor', subject: null }
  api.use((c, next) => {
    c.set('actor', actor)
    return next()
  })
  viewRoutes(api, { sqlite, db: drizzle(sqlite), domain, mailer: silentMailer, appUrl: '' })
  const as5 = send(api)
  const created = await as5('POST', '/api/views', body(NEW))
  expect(created.body).toMatchObject({ owner_id: 5, mine: true })
  await as5('PATCH', `/api/views/${created.body.id}`, body({ name: 'Anders' }))
  await as5('DELETE', `/api/views/${created.body.id}`, { type: null })
  const actors = revisions(created.body.id).map((r) => r.actor_id)
  expect(actors.length).toBeGreaterThan(2)
  expect(new Set(actors)).toEqual(new Set([5]))
})
