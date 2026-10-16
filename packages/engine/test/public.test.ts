import type { Database } from 'bun:sqlite'
import { beforeEach, describe, expect, test } from 'bun:test'
import { contents, domain, freshDb, send } from './fixture'
import { signIn, testEngine } from './sign-in'

type Request = ReturnType<typeof send>

let sqlite: Database
let app: ReturnType<typeof testEngine>
let admin: Request
let editor: Request
let anyone: Request

const json = (value: unknown) => JSON.stringify(value)
const state = () => ({ saved_view: contents(sqlite, 'saved_view'), revision: contents(sqlite, 'revision') })

type Over = { owner_id?: number; shared?: number; filters?: unknown }

function insertView(source: string, visible: string[], over: Over = {}): number {
  const sql = `INSERT INTO saved_view (name, source_type, source, owner_id, shared, filters, sort, visible_fields)
               VALUES ('Publiek', ?, ?, ?, ?, ?, '["-day"]', ?)`
  const kind = source === 'taak' ? 'dataset' : 'query'
  const args = [kind, source, over.owner_id ?? 1, over.shared ?? 1, json(over.filters ?? {})]
  return Number(sqlite.query(sql).run(...args, json(visible)).lastInsertRowid)
}

async function denied(call: Promise<{ status: number; body: Record<string, unknown> }>, status: number, code?: string) {
  const before = state()
  const res = await call
  expect(res.status).toBe(status)
  if (code) expect(res.body.code).toBe(code)
  expect(state()).toEqual(before)
  return res
}

const share = (id: number, as = admin) => as('PUT', `/api/views/${id}/share-token`, { body: '{}' })
const unshare = (id: number, as = admin) => as('DELETE', `/api/views/${id}/share-token`, { type: null })
const read = (token: string, query = '') => anyone('GET', `/api/public/views/${token}${query}`, { type: null })

beforeEach(async () => {
  sqlite = freshDb()
  app = testEngine(sqlite, domain)
  admin = send(app, await signIn(app, 'administrator'))
  editor = send(app, await signIn(app, 'editor'))
  anyone = send(app)
})

describe('share-token denials (attack 8)', () => {
  test("an editor's PUT and DELETE share-token are 403, tables unchanged", async () => {
    const id = insertView('per_project', ['name'], { owner_id: 2 })
    await denied(share(id, editor), 403, 'forbidden')
    await denied(unshare(id, editor), 403, 'forbidden')
  })

  test('an anonymous PUT share-token is 401', async () => {
    const id = insertView('per_project', ['name'])
    await denied(share(id, anyone), 401, 'unauthenticated')
  })

  test('a dataset view is 400 not_query, tables unchanged', async () => {
    await denied(share(insertView('taak', ['description'])), 400, 'not_query')
  })

  test('a view whose visible_fields holds the owner column is 400 owner_column_visible', async () => {
    await denied(share(insertView('per_project', ['name', 'project_id'])), 400, 'owner_column_visible')
  })

  test("another account's unshared view and an unknown view are 404 unknown_view", async () => {
    await denied(share(insertView('per_project', ['name'], { owner_id: 2, shared: 0 })), 404, 'unknown_view')
    await denied(share(999), 404, 'unknown_view')
  })
})

describe('public route denials (attack 10)', () => {
  test('an unknown, malformed or overlong token is 404', async () => {
    for (const token of ['x', 'A'.repeat(43), 'a'.repeat(200)]) await denied(read(token), 404, 'unknown_view')
  })

  test('a rotated token is 404; the new one answers', async () => {
    const id = insertView('per_project', ['name'])
    const old = (await share(id)).body.token as string
    const fresh = (await share(id)).body.token as string
    expect(fresh).not.toBe(old)
    await denied(read(old), 404, 'unknown_view')
    expect((await read(fresh)).status).toBe(200)
  })

  test('a public view whose source is not a query is 404', async () => {
    const id = insertView('per_project', ['name'])
    const { token } = (await share(id)).body
    sqlite.run("UPDATE saved_view SET source = 'taak' WHERE id = ?", [id])
    await denied(read(token), 404, 'unknown_view')
  })

  test('a token cleared by DELETE is 404', async () => {
    const id = insertView('per_project', ['name'])
    const { token } = (await share(id)).body
    expect(await unshare(id)).toEqual({ status: 200, body: { id } })
    await denied(read(token), 404, 'unknown_view')
  })

  test("a deleted public view's token is 404", async () => {
    const id = insertView('per_project', ['name'])
    const { token } = (await share(id)).body
    sqlite.run("UPDATE saved_view SET deleted_at = '2026-10-01T00:00:00Z' WHERE id = ?", [id])
    await denied(read(token), 404, 'unknown_view')
  })

  test('deleting a public view revokes it: restored, its old token is 404 and it is no longer public', async () => {
    const id = insertView('per_project', ['name'])
    const { token } = (await share(id)).body
    expect((await read(token)).status).toBe(200)
    expect((await admin('DELETE', `/api/views/${id}`, { type: null })).status).toBe(200)
    const restored = await admin('POST', `/api/views/${id}/restore`, { body: '{}' })
    expect(restored).toMatchObject({ status: 200, body: { id, public: false } })
    await denied(read(token), 404, 'unknown_view')
    expect(sqlite.query('SELECT public, share_token FROM saved_view WHERE id = ?').get(id)).toEqual({
      public: 0,
      share_token: null,
    })
  })

  test('a parameter other than from and to is 400, filter included', async () => {
    const { token } = (await share(insertView('per_project', ['name']))).body
    for (const query of ['?filter={}', '?sort=name', '?limit=1', '?from=2026-10-01&cells=1']) {
      await denied(read(token, query), 400, 'bad_param')
    }
  })

  test('no Access-Control header is set', async () => {
    const { token } = (await share(insertView('per_project', ['name']))).body
    const res = await app.request(`/api/public/views/${token}`, {
      headers: { host: '127.0.0.1:4310', origin: 'https://elsewhere.example' },
    })
    expect(res.status).toBe(200)
    expect([...res.headers.keys()].filter((k) => k.startsWith('access-control'))).toEqual([])
  })

  test('a foreign Host is 403 forbidden_host', async () => {
    const { token } = (await share(insertView('per_project', ['name']))).body
    await denied(anyone('GET', `/api/public/views/${token}`, { type: null, host: 'evil.example' }), 403)
  })

  test('the 61st call in a minute from one address is 429 rate_limited', async () => {
    const left = 60_000 - (Date.now() % 60_000)
    if (left < 5_000) await Bun.sleep(left)
    const { token } = (await share(insertView('per_project', ['name']))).body
    for (let i = 0; i < 60; i++) expect((await read(token)).status).toBe(200)
    await denied(read(token), 429, 'rate_limited')
  })

  test('a limiter that fails answers 429, failing closed', async () => {
    const { token } = (await share(insertView('per_project', ['name']))).body
    sqlite.run('DROP TABLE rate_limit')
    await denied(read(token), 429, 'rate_limited')
  })

  test('the stored share_token is the hash, never the token', async () => {
    const id = insertView('per_project', ['name'])
    const { token } = (await share(id)).body
    expect(token).toMatch(/^[\w-]{43}$/)
    const stored = sqlite.query('SELECT share_token, public FROM saved_view WHERE id = ?').get(id)
    const hash = new Bun.CryptoHasher('sha256').update(token).digest('hex')
    expect(stored).toEqual({ share_token: hash, public: 1 })
    expect(JSON.stringify(await admin('GET', '/api/views'))).not.toContain(hash)
  })
})

describe('the public route', () => {
  test('serves the view rows projected to visible_fields, with columns in their order', async () => {
    const visible = ['day', 'name', 'aantal']
    // Project 1's row counts 2, so this stored filter leaves out one fixture row.
    const { token } = (await share(insertView('per_project', visible, { filters: { aantal: 1 } }))).body
    const res = await read(token)
    expect(res.status).toBe(200)
    expect(res.body.columns).toEqual([
      { key: 'day', label: 'Day', type: 'date' },
      { key: 'name', label: 'Name', type: 'text' },
      { key: 'aantal', label: 'Aantal', type: 'integer' },
    ])
    const all = await admin('GET', '/api/rows/per_project?sort=-day', { type: null })
    const projected = all.body.rows
      .filter((r: Record<string, unknown>) => r.aantal === 1)
      .map((r: Record<string, unknown>) => Object.fromEntries(visible.map((key) => [key, r[key]])))
    expect(projected.length).toBeGreaterThan(1)
    expect(projected.length).toBeLessThan(all.body.rows.length)
    expect(res.body.rows).toEqual(projected)
    expect(res.body.total).toBe(projected.length)
    for (const row of res.body.rows) expect(Object.keys(row)).toEqual(visible)
    expect(JSON.stringify(res.body)).not.toContain('owner_id')
  })

  test('an administrator who adds the owner column to a published view still never serves it', async () => {
    const id = insertView('per_project', ['name'])
    const { token } = (await share(id)).body
    // Sharing refuses a visible owner column; a later PATCH is not re-checked, so the public read must strip it.
    const patched = await admin('PATCH', `/api/views/${id}`, { body: json({ visible_fields: ['name', 'project_id'] }) })
    expect(patched.status).toBe(200)
    expect(patched.body.visible_fields).toEqual(['name', 'project_id'])
    const res = await read(token)
    expect(res.status).toBe(200)
    expect(res.body.columns.map((c: { key: string }) => c.key)).toEqual(['name'])
    expect(res.body.rows.length).toBeGreaterThan(0)
    for (const row of res.body.rows) expect(Object.keys(row)).toEqual(['name'])
    expect(JSON.stringify(res.body)).not.toContain('project_id')
  })

  test('no id unless listed; id when listed', async () => {
    const { token } = (await share(insertView('per_project', ['name']))).body
    expect(Object.keys((await read(token)).body.rows[0])).toEqual(['name'])
    const listed = (await share(insertView('per_project', ['id', 'name']))).body.token
    expect(Object.keys((await read(listed)).body.rows[0])).toEqual(['id', 'name'])
  })

  test('from and to narrow the window', async () => {
    const { token } = (await share(insertView('per_project', ['day']))).body
    const res = await read(token, '?from=2026-10-14&to=2026-10-14')
    expect(res.body.rows).toEqual([{ day: '2026-10-14' }])
  })

  test('an administrator shares a shared view of an editor, and the view lists as public without its token', async () => {
    const id = insertView('per_project', ['name'], { owner_id: 2 })
    const { token } = (await share(id)).body
    const listed = (await editor('GET', '/api/views')).body.views.find((v: { id: number }) => v.id === id)
    expect(listed).toMatchObject({ public: true, mine: true, editable: false })
    expect(listed).not.toHaveProperty('share_token')
    expect(JSON.stringify(listed)).not.toContain(token)
  })
})
