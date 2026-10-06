import { Database } from 'bun:sqlite'
import { beforeEach, describe, expect, test } from 'bun:test'
import { type Actor, type DatasetDecl, type Domain, defineDataset, migrate, seedDomain, type Writer } from '../src'
import { contents, domain, freshDb, projectDeleteHook, projectDeletes, send } from './fixture'
import { signIn, testEngine } from './sign-in'

type Request = ReturnType<typeof send>

const OWN = { dataset: 'project', id: 1 }
const json = (value: unknown) => JSON.stringify(value)
const filter = (value: unknown) => `filter=${encodeURIComponent(json(value))}`
const ids = (body: Record<string, unknown>) => (body.rows as { id: number }[]).map((r) => r.id)

let sqlite: Database
let owner: Request
let editor: Request

const state = () =>
  Object.fromEntries(['project', 'taak', 'note', 'plat', 'revision'].map((t) => [t, contents(sqlite, t)]))

async function unchanged(
  call: Promise<{ status: number; body: Record<string, unknown> }>,
  status: number,
  code: string,
) {
  const before = state()
  const res = await call
  expect({ status: res.status, code: res.body.code }).toEqual({ status, code })
  expect(state()).toEqual(before)
  return res
}

beforeEach(async () => {
  projectDeletes.length = 0
  projectDeleteHook.run = () => {}
  sqlite = freshDb()
  const app = testEngine(sqlite, domain)
  owner = send(app, await signIn(app, 'owner', OWN))
  editor = send(app, await signIn(app, 'editor'))
  // Another subject's note, with a revision of its own; raw, since the writer refuses project 2.
  sqlite.run(
    `INSERT INTO note (project_id, tekst, lengte, custom, created_at, updated_at)
     VALUES (2, 'other', 5, '{}', '2026-10-01', '2026-10-01')`,
  )
  sqlite.run(
    `INSERT INTO revision (entity, record_id, field, old, new, actor_id, at, batch_id)
     VALUES ('note', 2, 'tekst', NULL, '"other"', 2, '2026-10-01', 'b')`,
  )
})

describe('an owner reads only its own subject', () => {
  test('rows by list: only rows whose owner column is the subject', async () => {
    const res = await owner('GET', '/api/rows/taak')
    expect({ status: res.status, ids: ids(res.body), total: res.body.total }).toEqual({
      status: 200,
      ids: [1, 2],
      total: 2,
    })
    expect(ids((await owner('GET', '/api/rows/project')).body)).toEqual([1])
    expect(ids((await owner('GET', '/api/rows/note')).body)).toEqual([1])
  })

  test("by filter: a filter naming another subject's rows finds nothing", async () => {
    const byId = await owner('GET', `/api/rows/taak?${filter({ id: 3 })}`)
    const byOwner = await owner('GET', `/api/rows/note?${filter({ project_id: 2 })}`)
    expect([byId.body.rows, byId.body.total, byOwner.body.rows]).toEqual([[], 0, []])
  })

  test('through a query with an owner column', async () => {
    const res = await owner('GET', '/api/rows/per_project')
    expect(res.status).toBe(200)
    expect(new Set((res.body.rows as { project_id: number }[]).map((r) => r.project_id))).toEqual(new Set([1]))
  })

  test('lookups still name the related row', async () => {
    const res = await owner('GET', '/api/rows/taak')
    expect(res.body.rows[0].lookups.project_id).toEqual({ id: 1, title: 'Alfa' })
  })

  test('/revisions of another subject’s row is 404 unknown_record; its own row answers', async () => {
    expect(await owner('GET', '/api/revisions/note/2')).toMatchObject({ status: 404, body: { code: 'unknown_record' } })
    expect(await owner('GET', '/api/revisions/note/999')).toMatchObject({
      status: 404,
      body: { code: 'unknown_record' },
    })
    expect((await editor('PATCH', '/api/rows/note/1', { body: json({ tekst: 'mine' }) })).status).toBe(200)
    expect((await owner('GET', '/api/revisions/note/1')).body.revisions).toHaveLength(2)
  })

  test('an unscoped source is 404 unknown_source, for a dataset and a query alike', async () => {
    for (const path of ['/api/rows/plat', '/api/rows/note_lijst', '/api/revisions/plat/1']) {
      expect(await owner('GET', path)).toMatchObject({ status: 404, body: { code: 'unknown_source' } })
    }
  })

  test('/schema lists only the sources the owner may read', async () => {
    const mine = Object.keys((await owner('GET', '/api/schema')).body.sources)
    const all = Object.keys((await editor('GET', '/api/schema')).body.sources)
    expect(mine.sort()).toEqual(['note', 'per_project', 'project', 'taak'])
    expect(all.sort()).toEqual(['note', 'note_lijst', 'per_project', 'plat', 'project', 'taak'])
  })

  test('/views lists the shared views on readable sources only', async () => {
    sqlite.run(
      `INSERT INTO saved_view (name, source_type, source, owner_id, shared, created_at, updated_at)
       VALUES ('Plat', 'dataset', 'plat', 2, 1, '2026-10-01', '2026-10-01')`,
    )
    const names = (body: Record<string, unknown>) => (body.views as { name: string }[]).map((v) => v.name)
    expect(names((await owner('GET', '/api/views')).body)).toEqual(['Open'])
    expect(names((await editor('GET', '/api/views')).body)).toEqual(['Open', 'Plat'])
  })
})

describe('an owner writes only its own subject', () => {
  test("PATCH and DELETE of another subject's row are 404, tables unchanged", async () => {
    await unchanged(owner('PATCH', '/api/rows/note/2', { body: json({ tekst: 'gone' }) }), 404, 'unknown_record')
    await unchanged(owner('DELETE', '/api/rows/note/2', { type: null }), 404, 'unknown_record')
  })

  test('a create with a foreign owner value is 403 forbidden, tables unchanged', async () => {
    await unchanged(owner('POST', '/api/rows/note', { body: json({ project_id: 2, tekst: 'x' }) }), 403, 'forbidden')
  })

  test('a create forces the owner column to the subject', async () => {
    const res = await owner('POST', '/api/rows/note', { body: json({ tekst: 'bare' }) })
    expect(res).toMatchObject({ status: 201, body: { project_id: 1, tekst: 'bare' } })
  })

  test('a delete of another subject, scoped by its own id, is 404, tables unchanged', async () => {
    await unchanged(owner('DELETE', '/api/rows/project/2', { type: null }), 404, 'unknown_record')
  })

  test('a PATCH moving its own row to another subject is 403, tables unchanged', async () => {
    await unchanged(owner('PATCH', '/api/rows/note/1', { body: json({ project_id: 2 }) }), 403, 'forbidden')
    expect((await owner('PATCH', '/api/rows/note/1', { body: json({ project_id: 1, tekst: 'same' }) })).status).toBe(
      200,
    )
  })

  test('a write to an unscoped source is 404 unknown_source, not 405', async () => {
    await unchanged(owner('POST', '/api/rows/plat', { body: json({ name: 'y' }) }), 404, 'unknown_source')
    await unchanged(owner('DELETE', '/api/rows/plat/1', { type: null }), 404, 'unknown_source')
  })

  test('a delete of a referenced row the writer forbids is 403 with no by, tables unchanged', async () => {
    const res = await unchanged(owner('DELETE', '/api/rows/project/1', { type: null }), 403, 'forbidden')
    expect(res.body).not.toHaveProperty('by')
    expect(projectDeletes).toEqual([1])
  })

  test('an owner may not write views', async () => {
    const body = json({ name: 'Mine', source: 'taak' })
    await unchanged(owner('POST', '/api/views', { body }), 403, 'forbidden')
  })
})

describe('the stored owner column is the subject, whatever the writer returns', () => {
  // Returns a fresh object: the owner column only when the description asks for a foreign one.
  const fresh: Writer = {
    create: (values) => ({
      description: values.description,
      status: 'open',
      start_at: '2026-10-20T09:00',
      day: '2026-10-20',
      ...(values.description === 'foreign' ? { project_id: 2 } : {}),
    }),
  }
  let scoped: Request

  beforeEach(async () => {
    const app = testEngine(sqlite, { ...domain, writers: { ...domain.writers, taak: fresh } })
    scoped = send(app, await signIn(app, 'owner', OWN))
  })

  test('a writer that drops the owner column still stores the subject', async () => {
    const res = await scoped('POST', '/api/rows/taak', { body: json({ description: 'dropped' }) })
    expect(res).toMatchObject({ status: 201, body: { project_id: 1, description: 'dropped' } })
  })

  test('a writer that returns a foreign owner value is 403, tables unchanged', async () => {
    await unchanged(scoped('POST', '/api/rows/taak', { body: json({ description: 'foreign' }) }), 403, 'forbidden')
  })
})

describe('an owner without a subject', () => {
  let none: Request
  beforeEach(async () => {
    const app = testEngine(sqlite, domain)
    none = send(app, await signIn(app, 'owner'))
  })

  test('sees nothing on a scoped source', async () => {
    const res = await none('GET', '/api/rows/taak')
    expect([res.status, res.body.rows, res.body.total]).toEqual([200, [], 0])
    expect(await none('GET', '/api/revisions/note/1')).toMatchObject({ status: 404, body: { code: 'unknown_record' } })
  })

  test('every scoped write is a 404, tables unchanged', async () => {
    await unchanged(none('PATCH', '/api/rows/note/1', { body: json({ tekst: 'x' }) }), 404, 'unknown_record')
    await unchanged(none('DELETE', '/api/rows/note/1', { type: null }), 404, 'unknown_record')
    await unchanged(
      none('POST', '/api/rows/note', { body: json({ project_id: 1, tekst: 'x' }) }),
      404,
      'unknown_record',
    )
  })
})

describe('?cells=1 filters the join to scope', () => {
  const join = (owners?: DatasetDecl['owners']): DatasetDecl =>
    defineDataset({
      name: 'assignment',
      label: 'Assignments',
      title: 'state',
      custom: false,
      ...(owners ? { owners } : {}),
      columns: {
        taak_id: { type: 'integer', label: 'Task', relation: 'taak' },
        project_id: { type: 'integer', label: 'Project', relation: 'project' },
        state: { type: 'text', label: 'State', options: { a: 'A', b: 'B' } },
      },
      matrix: { down: 'taak_id', across: 'project_id', cell: 'state', keys: { x: 'a' }, marks: { a: '?' }, count: 'a' },
    })

  async function cellsAs(withJoin: DatasetDecl): Promise<Record<number, number[]>> {
    const extended: Domain = {
      ...domain,
      datasets: [...domain.datasets, withJoin],
      seed: (insert) => {
        domain.seed(insert)
        insert('assignment', [
          { taak_id: 1, project_id: 1, state: 'a' },
          { taak_id: 1, project_id: 2, state: 'a' },
          { taak_id: 3, project_id: 2, state: 'b' },
        ])
      },
    }
    const own = new Database(':memory:')
    migrate(own, extended)
    seedDomain(own, extended)
    const app = testEngine(own, extended)
    const res = await send(app, await signIn(app, 'owner', OWN))(
      'GET',
      '/api/rows/taak?cells=1&from=2026-10-01&to=2026-10-31',
    )
    expect(res.status).toBe(200)
    const rows = res.body.rows as { id: number; cells: { id: number }[] }[]
    return Object.fromEntries(rows.map((r) => [r.id, r.cells.map((c) => c.id)]))
  }

  test('a join with an owner column: only the join rows in scope', async () => {
    expect(await cellsAs(join({ owner: 'project_id' }))).toEqual({ 1: [1], 2: [] })
  })

  test('a join without an owner column: no cells at all', async () => {
    expect(await cellsAs(join())).toEqual({ 1: [], 2: [] })
  })
})

type Role = 'none' | Actor['role']

// Written by hand from the Decisions table, never derived from may(), so a wrong cell cannot pass both sides.
const EXPECTED: { method: string; path: string; body?: unknown; status: Record<Role, number> }[] = [
  {
    method: 'POST',
    path: '/api/auth/request',
    body: { email: 'x@example.test' },
    status: { none: 200, owner: 200, editor: 200, administrator: 200 },
  },
  { method: 'GET', path: '/api/auth/me', status: { none: 401, owner: 200, editor: 200, administrator: 200 } },
  {
    method: 'POST',
    path: '/api/auth/signout',
    body: {},
    status: { none: 401, owner: 200, editor: 200, administrator: 200 },
  },
  { method: 'GET', path: '/api/schema', status: { none: 401, owner: 200, editor: 200, administrator: 200 } },
  { method: 'GET', path: '/api/rows/taak', status: { none: 401, owner: 200, editor: 200, administrator: 200 } },
  { method: 'GET', path: '/api/rows/plat', status: { none: 401, owner: 404, editor: 200, administrator: 200 } },
  { method: 'GET', path: '/api/revisions/note/1', status: { none: 401, owner: 200, editor: 200, administrator: 200 } },
  {
    method: 'POST',
    path: '/api/rows/note',
    body: { project_id: 1, tekst: 'fresh' },
    status: { none: 401, owner: 201, editor: 201, administrator: 201 },
  },
  {
    method: 'PATCH',
    path: '/api/rows/note/1',
    body: { tekst: 'changed' },
    status: { none: 401, owner: 200, editor: 200, administrator: 200 },
  },
  { method: 'DELETE', path: '/api/rows/note/1', status: { none: 401, owner: 200, editor: 200, administrator: 200 } },
  { method: 'DELETE', path: '/api/rows/project/1', status: { none: 401, owner: 403, editor: 409, administrator: 409 } },
  { method: 'GET', path: '/api/views', status: { none: 401, owner: 200, editor: 200, administrator: 200 } },
  {
    method: 'POST',
    path: '/api/views',
    body: { name: 'Mine', source: 'taak' },
    status: { none: 401, owner: 403, editor: 201, administrator: 201 },
  },
  {
    method: 'PATCH',
    path: '/api/views/2',
    body: { name: 'Renamed' },
    status: { none: 401, owner: 403, editor: 200, administrator: 200 },
  },
  { method: 'DELETE', path: '/api/views/2', status: { none: 401, owner: 403, editor: 200, administrator: 200 } },
  {
    method: 'POST',
    path: '/api/views/2/restore',
    body: {},
    status: { none: 401, owner: 403, editor: 200, administrator: 200 },
  },
]

describe('the permissions matrix', () => {
  const roles: Role[] = ['none', 'owner', 'editor', 'administrator']
  for (const { method, path, body, status } of EXPECTED) {
    for (const role of roles) {
      test(`${method} ${path} as ${role} is ${status[role]}`, async () => {
        const own = freshDb()
        const app = testEngine(own, domain)
        const cookie = role === 'none' ? undefined : await signIn(app, role, role === 'owner' ? OWN : null)
        // View 2 belongs to whoever signed in (account 1), so only the role decides.
        own.run(
          `INSERT INTO saved_view (name, source_type, source, owner_id, created_at, updated_at)
           VALUES ('Own', 'dataset', 'taak', 1, '2026-10-01', '2026-10-01')`,
        )
        const res = await send(app, cookie)(method, path, body === undefined ? { type: null } : { body: json(body) })
        expect(res.status).toBe(status[role])
      })
    }
  }
})
