import { Database } from 'bun:sqlite'
import { beforeEach, describe, expect, test } from 'bun:test'
import type { Domain, SavedViewSeed } from '../src'
import { createService } from '../src/auth'
import { migrate, seedDomain } from '../src/migrate'
import { nodeOf } from '../src/registry'
import { seedMissing } from '../src/seed-missing'
import { DomainError, validateDomain } from '../src/validate'
import { domain as fixture, freshDb, send } from './fixture'
import { signIn, testEngine } from './sign-in'

// per_project reads taak, so its views belong to taak's rail node.
const domain: Domain = {
  ...fixture,
  queries: fixture.queries.map((q) => (q.name === 'per_project' ? { ...q, of: 'taak' } : q)),
}

let sqlite: Database
let app: ReturnType<typeof testEngine>
let admin: string
let editor: string

beforeEach(async () => {
  sqlite = freshDb()
  app = testEngine(sqlite, domain)
  admin = await signIn(app, 'administrator')
  editor = await signIn(app, 'editor')
})

const json = (value: unknown) => JSON.stringify(value)

async function viewAs(cookie: string, body: Record<string, unknown>): Promise<number> {
  const res = await send(app, cookie)('POST', '/api/views', {
    body: json({ name: 'Gedeeld', source: 'taak', ...body }),
  })
  expect(res.status).toBe(201)
  return res.body.id
}
const shared = (body: Record<string, unknown> = {}) => viewAs(admin, { shared: true, ...body })

const mark = (id: number, cookie = admin) => send(app, cookie)('PUT', `/api/views/${id}/default`, { body: '{}' })
const unmark = (id: number, cookie = admin) => send(app, cookie)('DELETE', `/api/views/${id}/default`, { type: null })

async function defaults(cookie = admin): Promise<number[]> {
  const res = await send(app, cookie)('GET', '/api/views')
  expect(res.status).toBe(200)
  return (res.body.views as { id: number; default: boolean }[]).filter((v) => v.default).map((v) => v.id)
}
const markedIds = () =>
  (sqlite.query('SELECT id FROM saved_view WHERE is_default = 1 ORDER BY id').all() as { id: number }[]).map(
    (r) => r.id,
  )

describe('nodeOf', () => {
  test('a dataset is its own node; a query is the node its `of` names, or its own without one', () => {
    expect(nodeOf(domain, 'taak')).toBe('taak')
    expect(nodeOf(domain, 'per_project')).toBe('taak')
    expect(nodeOf(domain, 'note_lijst')).toBe('note_lijst')
  })
})

describe('serving default', () => {
  test('a fresh fixture serves default: false on every view', async () => {
    const res = await send(app, admin)('GET', '/api/views')
    expect(res.body.views.length).toBeGreaterThan(0)
    for (const view of res.body.views) expect(view.default).toBe(false)
  })

  test('an administrator marks a shared view and only that view is served as default', async () => {
    const id = await shared()
    expect(await mark(id)).toEqual({ status: 200, body: { id, default: true } })
    expect(await defaults()).toEqual([id])
    expect(await defaults(editor)).toEqual([id])
  })

  test('a system view can be marked', async () => {
    expect((await mark(1)).status).toBe(200)
    expect(await defaults()).toEqual([1])
  })
})

describe('one default per node', () => {
  test('marking a second view of the node unmarks the first', async () => {
    const a = await shared()
    const b = await shared({ name: 'Tweede' })
    await mark(a)
    await mark(b)
    expect(markedIds()).toEqual([b])
  })

  test("a query view whose `of` names the dataset unmarks the dataset's default", async () => {
    const a = await shared()
    const q = await shared({ source: 'per_project', visible_fields: ['name'] })
    await mark(a)
    await mark(q)
    expect(markedIds()).toEqual([q])
  })

  test("marking in one node leaves another node's default", async () => {
    const a = await shared()
    const n = await shared({ source: 'note' })
    await mark(a)
    await mark(n)
    expect(markedIds()).toEqual([a, n])
  })

  test('DELETE unmarks', async () => {
    const a = await shared()
    await mark(a)
    expect(await unmark(a)).toEqual({ status: 200, body: { id: a, default: false } })
    expect(markedIds()).toEqual([])
  })

  test('marking the current default answers 200 and writes nothing', async () => {
    const a = await shared()
    await mark(a)
    const before = sqlite.query('SELECT COUNT(*) AS n FROM revision').get()
    expect(await mark(a)).toEqual({ status: 200, body: { id: a, default: true } })
    expect(sqlite.query('SELECT COUNT(*) AS n FROM revision').get()).toEqual(before)
  })

  test('mark A, delete A, mark B, restore A leaves B the only default', async () => {
    const a = await shared()
    const b = await shared({ name: 'Tweede' })
    await mark(a)
    expect((await send(app, admin)('DELETE', `/api/views/${a}`, { type: null })).status).toBe(200)
    await mark(b)
    expect((await send(app, admin)('POST', `/api/views/${a}/restore`, { body: '{}' })).status).toBe(200)
    expect(markedIds()).toEqual([b])
    expect(await defaults()).toEqual([b])
  })

  test('mark A, delete A, restore A leaves no view in the node marked', async () => {
    const a = await shared()
    await mark(a)
    expect((await send(app, admin)('DELETE', `/api/views/${a}`, { type: null })).status).toBe(200)
    expect((await send(app, admin)('POST', `/api/views/${a}/restore`, { body: '{}' })).status).toBe(200)
    expect(markedIds()).toEqual([])
  })
})

describe('unsharing', () => {
  test('an editor unsharing a marked view clears its mark, with a revision', async () => {
    const id = await viewAs(editor, { shared: true })
    expect((await mark(id)).status).toBe(200)
    const res = await send(app, editor)('PATCH', `/api/views/${id}`, { body: json({ shared: false }) })
    expect(res.status).toBe(200)
    expect(markedIds()).toEqual([])
    const me = (await send(app, editor)('GET', '/api/auth/me')).body.id
    const unmarked = sqlite
      .query(
        "SELECT old, new, actor_id FROM revision WHERE entity = 'saved_view' AND record_id = ? AND field = 'is_default' AND old = 'true'",
      )
      .all(id)
    expect(unmarked).toEqual([{ old: 'true', new: 'false', actor_id: me }])
    expect(await defaults(editor)).toEqual([])
  })
})

describe('who may mark', () => {
  test('an editor, an owner and an administrator service account are refused 403', async () => {
    const a = await shared()
    const owner = await signIn(app, 'owner', { dataset: 'project', id: 1 })
    const token = createService(sqlite, 'bot', 'administrator')
    for (const cookie of [editor, owner]) {
      expect(await mark(a, cookie)).toMatchObject({ status: 403, body: { code: 'forbidden' } })
      expect((await unmark(a, cookie)).status).toBe(403)
    }
    for (const method of ['PUT', 'DELETE']) {
      const res = await app.request(`/api/views/${a}/default`, {
        method,
        headers: { host: '127.0.0.1:4310', authorization: `Bearer ${token}`, 'content-type': 'application/json' },
        body: method === 'PUT' ? '{}' : undefined,
      })
      expect(res.status).toBe(403)
    }
    expect(markedIds()).toEqual([])
  })

  test("a colleague's unshared view is 404 unknown_view", async () => {
    const id = await viewAs(editor, {})
    expect(await mark(id)).toMatchObject({ status: 404, body: { code: 'unknown_view' } })
  })

  test('an own unshared view is 400 not_shared', async () => {
    const id = await viewAs(admin, {})
    expect(await mark(id)).toMatchObject({ status: 400, body: { code: 'not_shared' } })
  })

  test('a dashboard is 400 dashboard_not_default', async () => {
    const id = await viewAs(admin, { skin: 'dashboard', source: null, shared: true })
    expect(await mark(id)).toMatchObject({ status: 400, body: { code: 'dashboard_not_default' } })
  })

  test('a deleted view is 404', async () => {
    const a = await shared()
    await send(app, admin)('DELETE', `/api/views/${a}`, { type: null })
    expect(await mark(a)).toMatchObject({ status: 404, body: { code: 'unknown_view' } })
  })
})

describe('the mark and its history', () => {
  test('the mark writes a revision with the administrator as actor, on both sides of the move', async () => {
    const a = await shared()
    const b = await shared({ name: 'Tweede' })
    await mark(a)
    await mark(b)
    const me = (await send(app, admin)('GET', '/api/auth/me')).body.id
    const rows = sqlite
      .query("SELECT record_id, old, new, actor_id FROM revision WHERE entity = 'saved_view' AND field = 'is_default'")
      .all() as { record_id: number; old: string; new: string; actor_id: number }[]
    const moves = rows.filter((r) => r.old !== null)
    expect(moves).toEqual([
      { record_id: a, old: 'false', new: 'true', actor_id: me },
      { record_id: a, old: 'true', new: 'false', actor_id: me },
      { record_id: b, old: 'false', new: 'true', actor_id: me },
    ])
  })

  test('a marked seeded view is still brought up to its declaration by a reseed', async () => {
    expect((await mark(1)).status).toBe(200)
    const changed: Domain = {
      ...domain,
      views: domain.views.map((v) => (v.name === 'Open' ? { ...v, filters: { status: 'klaar' } } : v)),
    }
    seedMissing(sqlite, changed)
    const row = sqlite.query('SELECT filters, is_default FROM saved_view WHERE id = 1').get()
    expect(row).toEqual({ filters: json({ status: 'klaar' }), is_default: 1 })
  })
})

const openDefault: Domain = {
  ...domain,
  views: domain.views.map((v) => (v.name === 'Open' ? { ...v, default: true } : v)),
}
const perProject: SavedViewSeed = {
  name: 'Per project',
  source_type: 'query',
  source: 'per_project',
  skin: 'table',
  filters: {},
  sort: [],
  group_by: null,
  visible_fields: ['name'],
}
const refusal = (d: Domain): DomainError => {
  try {
    validateDomain(d)
  } catch (err) {
    if (err instanceof DomainError) return err
    throw err
  }
  throw new Error('validateDomain accepted the domain')
}

describe('a seed declares a default', () => {
  test('a fresh database writes the declared default', () => {
    const d: Domain = { ...openDefault, views: [...openDefault.views, perProject] }
    const fresh = new Database(':memory:')
    migrate(fresh, d)
    seedDomain(fresh, d)
    const rows = fresh.query('SELECT name, is_default FROM saved_view ORDER BY id').all()
    expect(rows).toEqual([
      { name: 'Open', is_default: 1 },
      { name: 'Per project', is_default: 0 },
    ])
  })

  test('two seeds marked default in one node are refused at startup, naming the source and the seed', () => {
    const err = refusal({ ...openDefault, views: [...openDefault.views, { ...perProject, default: true }] })
    expect(err.declaration).toBe('per_project')
    expect(err.bad).toBe('Per project')
  })

  test('a dashboard seed marked default is refused at startup', () => {
    const dashboard: SavedViewSeed = {
      name: 'Overzicht',
      skin: 'dashboard',
      filters: {},
      sort: [],
      group_by: null,
      visible_fields: [],
      layout: { sections: [], actions: [] },
      default: true,
    }
    const err = refusal({ ...domain, views: [...domain.views, dashboard] })
    expect(err.bad).toBe('Overzicht')
    expect(err.message).toContain('dashboard')
  })

  test('--seed-missing marks the declared default of a node without one, with a system revision, once', () => {
    const report = seedMissing(sqlite, openDefault)
    expect(report.batch).not.toBeNull()
    expect(markedIds()).toEqual([1])
    const marked = sqlite
      .query(
        "SELECT old, new, actor_id FROM revision WHERE entity = 'saved_view' AND record_id = 1 AND field = 'is_default' AND new = 'true'",
      )
      .all()
    expect(marked).toEqual([{ old: 'false', new: 'true', actor_id: -1 }])
    expect(seedMissing(sqlite, openDefault).batch).toBeNull()
  })

  test("--seed-missing leaves an administrator's choice and names the seed's view", async () => {
    const b = await shared()
    await mark(b)
    const report = seedMissing(sqlite, openDefault)
    expect(markedIds()).toEqual([b])
    expect(report.named).toContain('view "Open" (taak) default left as chosen')
  })

  test("a node whose default was deleted gets the seed's default back", async () => {
    const b = await shared()
    await mark(b)
    expect((await send(app, admin)('DELETE', `/api/views/${b}`, { type: null })).status).toBe(200)
    seedMissing(sqlite, openDefault)
    expect(markedIds()).toEqual([1])
  })

  test("a seed's deleted view is not marked", async () => {
    expect((await send(app, admin)('DELETE', '/api/views/1', { type: null })).status).toBe(200)
    seedMissing(sqlite, openDefault)
    expect(markedIds()).toEqual([])
  })

  test("an editor unsharing an administrator's mark lets --seed-missing mark the seed's default", async () => {
    const id = await viewAs(editor, { shared: true })
    await mark(id)
    expect((await send(app, editor)('PATCH', `/api/views/${id}`, { body: json({ shared: false }) })).status).toBe(200)
    seedMissing(sqlite, openDefault)
    expect(markedIds()).toEqual([1])
  })
})
