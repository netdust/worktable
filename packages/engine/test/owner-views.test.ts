import { Database } from 'bun:sqlite'
import { beforeEach, describe, expect, test } from 'bun:test'
import { Hono } from 'hono'
import {
  type Actor,
  type ColumnDecl,
  type DatasetDecl,
  type Domain,
  DomainError,
  defineDataset,
  defineQuery,
  migrate,
  seedDomain,
  validateDomain,
} from '../src'
import type { AuthEnv } from '../src/auth'
import { ApiError } from '../src/params'
import { recordLinkFor } from '../src/record-link'
import { shareRoutes } from '../src/views'
import { contents, domain, freshDb, send } from './fixture'
import { signIn, TEST_LINK_SECRET, testEngine } from './sign-in'

const HOST = '127.0.0.1:4310'
const NO_STORE = { 'cache-control': 'no-store', 'referrer-policy': 'no-referrer', 'x-robots-tag': 'noindex' }
// Every key a row may carry besides the listed columns, none of which a for-owners view serves.
const NEVER = ['id', 'title', 'lookups', 'custom', 'links', 'project_id', 'cells', 'revision']

let sqlite: Database
let app: ReturnType<typeof testEngine>
let admin: string
let editor: string

beforeEach(async () => {
  sqlite = freshDb()
  // A second day for project 1, so its link reads two rows of per_project.
  sqlite.run(
    "INSERT INTO taak (project_id, description, status, start_at, day) VALUES (1, 'vijf', 'open', '2026-10-20T09:00', '2026-10-20')",
  )
  app = testEngine(sqlite, domain)
  admin = await signIn(app, 'administrator')
  editor = await signIn(app, 'editor')
})

const json = (value: unknown) => JSON.stringify(value)
const link = (id = 1) => recordLinkFor(sqlite, TEST_LINK_SECRET, 'project', id)

async function raw(path: string, headers: Record<string, string> = {}) {
  const res = await app.request(path, { headers: { host: HOST, ...headers } })
  // biome-ignore lint/suspicious/noExplicitAny: response bodies are asserted structurally
  return { status: res.status, headers: res.headers, body: (await res.json()) as Record<string, any> }
}
const asLink = (path: string, token = link()) => raw(path, { authorization: `RecordLink ${token}` })

async function viewAs(cookie: string, body: Record<string, unknown>): Promise<number> {
  const res = await send(app, cookie)('POST', '/api/views', {
    body: json({ name: 'Mijn dagen', source: 'per_project', visible_fields: ['name', 'day'], ...body }),
  })
  expect(res.status).toBe(201)
  return res.body.id
}
const forOwners = (id: number, cookie = admin, method = 'PUT') =>
  send(app, cookie)(method, `/api/views/${id}/for-owners`, method === 'PUT' ? { body: '{}' } : { type: null })

const forOwnersOf = (id: number) =>
  (sqlite.query('SELECT for_owners FROM saved_view WHERE id = ?').get(id) as { for_owners: number }).for_owners

// Inserted as it stands, bypassing setForOwners: an older row, or one a later declaration no longer allows.
function storedForOwners(fields: { visible: string[]; filters?: unknown; sort?: string[]; group?: string | null }) {
  const sql = `INSERT INTO saved_view (name, source_type, source, owner_id, shared, filters, sort, group_by, visible_fields, for_owners)
               VALUES ('Rauw', 'query', 'per_project', -1, 1, ?, ?, ?, ?, 1)`
  const { visible, filters = {}, sort = [], group = null } = fields
  return Number(sqlite.query(sql).run(json(filters), json(sort), group, json(visible)).lastInsertRowid)
}

const tables = () => Object.fromEntries(['saved_view', 'revision', 'batch'].map((t) => [t, contents(sqlite, t)]))

async function refused(
  call: () => Promise<{ status: number; body: Record<string, unknown> }>,
  code: string,
  key?: string,
) {
  const before = tables()
  const res = await call()
  expect(res.body.code).toBe(code)
  expect(res.status).toBe(code === 'unknown_view' ? 404 : code === 'forbidden' || code === 'owner_view' ? 403 : 400)
  if (key !== undefined) {
    expect(res.body.key).toBe(key)
    expect(String(res.body.message)).toContain(`"${key}"`)
  }
  expect(tables()).toEqual(before)
}

describe('PUT /views/:id/for-owners (attack 13)', () => {
  test('sets for_owners on a view whose every key is owner-visible, and revises it', async () => {
    const id = await viewAs(admin, { filters: { aantal: { $gte: 1 } }, sort: ['-day'], group_by: 'name' })
    const res = await forOwners(id)
    expect(res.status).toBe(200)
    expect(res.body).toMatchObject({ id, for_owners: true })
    expect(forOwnersOf(id)).toBe(1)
    const revised = sqlite
      .query("SELECT old, new FROM revision WHERE entity = 'saved_view' AND record_id = ? AND field = 'for_owners'")
      .all(id)
    expect(revised).toEqual([
      { old: null, new: 'false' },
      { old: 'false', new: 'true' },
    ])
  })

  test('a view on a dataset is not_query', async () => {
    const id = await viewAs(admin, { source: 'taak', visible_fields: ['description'] })
    await refused(() => forOwners(id), 'not_query')
  })

  test('a query that declares no owner column is no_owner_column', async () => {
    const id = await viewAs(admin, { source: 'note_lijst', visible_fields: ['tekst'] })
    await refused(() => forOwners(id), 'no_owner_column')
  })

  test('a public view is already_public', async () => {
    const id = await viewAs(admin, { visible_fields: ['name'] })
    expect((await send(app, admin)('PUT', `/api/views/${id}/share-token`, { body: '{}' })).status).toBe(200)
    await refused(() => forOwners(id), 'already_public')
  })

  test.each([
    ['a visible field that is not owner-visible', { visible_fields: ['name', 'id'] }, 'id'],
    ['the owner column', { visible_fields: ['name', 'project_id'] }, 'project_id'],
    ['a stored filter key', { filters: { id: 1 } }, 'id'],
    ['a stored filter key inside $or', { filters: { $or: [{ name: 'Alfa' }, { project_id: 2 }] } }, 'project_id'],
    ['a stored sort key', { sort: ['name', '-id'] }, 'id'],
    ['a stored group key', { group_by: 'project_id' }, 'project_id'],
  ])('%s is column_not_owner_visible, naming it', async (_, body, key) => {
    const id = await viewAs(admin, body)
    await refused(() => forOwners(id), 'column_not_owner_visible', key)
  })

  test('a link key is link_not_allowed, naming it', async () => {
    const linked = linkedDomain()
    const db = migrated(linked)
    const engine = testEngine(db, linked)
    const cookie = await signIn(engine, 'administrator')
    const body = { name: 'Met merken', source: 'stempel_lijst', visible_fields: ['tekst', 'merken'] }
    const created = await send(engine, cookie)('POST', '/api/views', { body: json(body) })
    expect(created.status).toBe(201)
    const res = await send(engine, cookie)('PUT', `/api/views/${created.body.id}/for-owners`, { body: '{}' })
    expect(res).toMatchObject({ status: 400, body: { code: 'link_not_allowed', key: 'merken' } })
  })

  test('an editor and an owner get 403, tables unchanged', async () => {
    const id = await viewAs(admin, { shared: true })
    await refused(() => forOwners(id, editor), 'forbidden')
    await refused(() => forOwners(id, editor, 'DELETE'), 'forbidden')
    const owner = await signIn(app, 'owner', { dataset: 'project', id: 1 })
    await refused(() => forOwners(id, owner), 'forbidden')
  })

  test('a service account with the administrator role is refused in the handler: 403, tables unchanged', async () => {
    const id = await viewAs(admin, { shared: true })
    const service: Actor = { id: 77, role: 'administrator', subject: null, kind: 'service' }
    const bare = new Hono<AuthEnv>()
    bare.use(async (c, next) => {
      c.set('actor', service)
      await next()
    })
    shareRoutes(bare, { sqlite, domain } as Parameters<typeof shareRoutes>[1])
    bare.onError((err, c) =>
      err instanceof ApiError ? c.json({ code: err.code }, err.status) : c.json({ code: 'internal' }, 500),
    )
    const call = (method: string) => async () => {
      const res = await bare.request(`/views/${id}/for-owners`, { method })
      return { status: res.status, body: (await res.json()) as Record<string, unknown> }
    }
    await refused(call('PUT'), 'forbidden')
    await refused(call('DELETE'), 'forbidden')
  })

  test('an unknown view, or another person`s private one, is 404', async () => {
    await refused(() => forOwners(999), 'unknown_view')
    const theirs = await viewAs(editor, { shared: false })
    await refused(() => forOwners(theirs), 'unknown_view')
  })

  test('DELETE clears it, and is revised', async () => {
    const id = await viewAs(admin, {})
    await forOwners(id)
    const res = await forOwners(id, admin, 'DELETE')
    expect(res).toMatchObject({ status: 200, body: { id, for_owners: false } })
    expect(forOwnersOf(id)).toBe(0)
  })

  test('PUT share-token on a view for owners is already_for_owners', async () => {
    const id = await viewAs(admin, {})
    await forOwners(id)
    await refused(() => send(app, admin)('PUT', `/api/views/${id}/share-token`, { body: '{}' }), 'already_for_owners')
  })

  test('a later PATCH adding a hidden column, filter, sort or group is refused naming it', async () => {
    const id = await viewAs(admin, {})
    await forOwners(id)
    const patch = (body: unknown) => () => send(app, admin)('PATCH', `/api/views/${id}`, { body: json(body) })
    await refused(patch({ visible_fields: ['name', 'id'] }), 'column_not_owner_visible', 'id')
    await refused(patch({ filters: { $or: [{ id: 1 }, { name: 'x' }] } }), 'column_not_owner_visible', 'id')
    await refused(patch({ sort: ['project_id'] }), 'column_not_owner_visible', 'project_id')
    await refused(patch({ group_by: 'id' }), 'column_not_owner_visible', 'id')
    expect((await send(app, admin)('PATCH', `/api/views/${id}`, { body: json({ name: 'Mijn data' }) })).status).toBe(
      200,
    )
  })

  test('an editor may not change a view for owners: 403 owner_view', async () => {
    const id = await viewAs(editor, { shared: true })
    expect((await forOwners(id)).status).toBe(200)
    const listed = (await send(app, editor)('GET', '/api/views')).body.views.find((v: { id: number }) => v.id === id)
    expect(listed).toMatchObject({ for_owners: true, mine: true, editable: false })
    await refused(
      () => send(app, editor)('PATCH', `/api/views/${id}`, { body: json({ name: 'Anders' }) }),
      'owner_view',
    )
    await refused(() => send(app, editor)('DELETE', `/api/views/${id}`, { type: null }), 'owner_view')
  })

  test('a deleted then restored view is not for owners', async () => {
    const id = await viewAs(admin, {})
    await forOwners(id)
    expect((await send(app, admin)('DELETE', `/api/views/${id}`, { type: null })).status).toBe(200)
    expect(forOwnersOf(id)).toBe(0)
    expect((await send(app, admin)('POST', `/api/views/${id}/restore`, { body: '{}' })).status).toBe(200)
    expect(forOwnersOf(id)).toBe(0)
    expect((await asLink('/api/owner/views')).body.views).toEqual([])
  })
})

describe('GET /owner/views', () => {
  test('lists the live views for owners with their columns, labels and types; nothing else', async () => {
    const id = await viewAs(admin, { visible_fields: ['name', 'day', 'aantal'], sort: ['-day'] })
    await forOwners(id)
    await viewAs(admin, { name: 'Niet gedeeld', shared: true })
    const res = await asLink('/api/owner/views')
    expect(res.status).toBe(200)
    expect(res.body).toEqual({
      views: [
        {
          id,
          name: 'Mijn dagen',
          source: 'per_project',
          skin: 'table',
          date: 'day',
          sort: ['-day'],
          group_by: null,
          columns: [
            { key: 'name', label: 'Name', type: 'text' },
            { key: 'day', label: 'Day', type: 'date' },
            { key: 'aantal', label: 'Aantal', type: 'integer' },
          ],
        },
      ],
    })
  })

  test('an owner session and a link for the same subject read the same list; an editor or administrator is 403', async () => {
    await forOwners(await viewAs(admin, {}))
    const owner = await signIn(app, 'owner', { dataset: 'project', id: 1 })
    const viaLink = await asLink('/api/owner/views')
    const viaSession = await send(app, owner)('GET', '/api/owner/views')
    expect(viaSession.status).toBe(200)
    expect(viaSession.body).toEqual(viaLink.body)
    expect(viaLink.body.views).toHaveLength(1)
    expect(await send(app, editor)('GET', '/api/owner/views')).toMatchObject({
      status: 403,
      body: { code: 'forbidden' },
    })
    expect(await send(app, admin)('GET', '/api/owner/views')).toMatchObject({
      status: 403,
      body: { code: 'forbidden' },
    })
  })

  test('a stored view that no longer holds to owner-visible keys is not listed, and its rows are 404', async () => {
    const ids = [
      storedForOwners({ visible: ['name', 'id'] }),
      storedForOwners({ visible: ['name'], filters: { id: 1 } }),
      storedForOwners({ visible: ['name'], sort: ['-project_id'] }),
      storedForOwners({ visible: ['name'], group: 'id' }),
    ]
    expect((await asLink('/api/owner/views')).body.views).toEqual([])
    for (const id of ids) {
      expect(await asLink(`/api/owner/views/${id}/rows`)).toMatchObject({ status: 404, body: { code: 'unknown_view' } })
    }
  })
})

describe('GET /owner/views/:id/rows (attack 12)', () => {
  const VIEWS = [
    { visible_fields: ['name'] },
    { visible_fields: ['name', 'day', 'aantal'], sort: ['-day'] },
    { visible_fields: ['day', 'aantal'], filters: { aantal: { $gte: 1 } }, group_by: 'day' },
    { visible_fields: ['aantal'], filters: { $or: [{ name: 'Alfa' }, { day: '2026-10-20' }] } },
  ]

  // The leak script as a test.
  test('for every view for owners, every key of every row is owner-visible and listed, and only the subject`s rows', async () => {
    for (const [n, body] of VIEWS.entries()) await forOwners(await viewAs(admin, { name: `View ${n}`, ...body }))
    const source = domain.queries.find((q) => q.name === 'per_project')
    const ownerVisible = (key: string) => (source?.columns[key] as ColumnDecl | undefined)?.owner_visible === true
    const listed = await asLink('/api/owner/views')
    expect(listed.body.views).toHaveLength(VIEWS.length)
    for (const view of listed.body.views as { id: number; columns: { key: string }[] }[]) {
      const keys = view.columns.map((c) => c.key)
      expect(keys.every(ownerVisible)).toBe(true)
      const res = await asLink(`/api/owner/views/${view.id}/rows`)
      expect(res.status).toBe(200)
      expect(res.body.rows.length).toBeGreaterThan(0)
      expect(res.body.total).toBe(res.body.rows.length)
      for (const row of res.body.rows as Record<string, unknown>[]) {
        for (const key of Object.keys(row)) {
          expect(keys).toContain(key)
          expect(ownerVisible(key)).toBe(true)
        }
        for (const key of NEVER) expect(Object.hasOwn(row, key)).toBe(false)
      }
      expect(Object.keys(res.body).sort()).toEqual(['columns', 'rows', 'total'])
    }
  })

  test('reads within the subject`s scope only, with total counted in scope; from and to narrow', async () => {
    const id = await viewAs(admin, { visible_fields: ['name', 'day'], sort: ['day'] })
    await forOwners(id)
    const mine = await asLink(`/api/owner/views/${id}/rows`)
    expect(mine.body).toMatchObject({
      rows: [
        { name: 'Alfa', day: '2026-10-12' },
        { name: 'Alfa', day: '2026-10-20' },
      ],
      total: 2,
    })
    const theirs = await asLink(`/api/owner/views/${id}/rows`, link(2))
    expect(theirs.body.rows.map((r: { name: string }) => r.name)).toEqual(['Beta', 'Beta'])
    const narrowed = await asLink(`/api/owner/views/${id}/rows?from=2026-10-15&to=2026-10-31`)
    expect(narrowed.body).toMatchObject({ rows: [{ name: 'Alfa', day: '2026-10-20' }], total: 1 })
  })

  test('the stored filter applies, and a request filter, sort, group, limit and offset on listed keys narrow it', async () => {
    const id = await viewAs(admin, { visible_fields: ['name', 'day', 'aantal'], filters: { aantal: { $gte: 1 } } })
    await forOwners(id)
    const path = `/api/owner/views/${id}/rows`
    const filtered = await asLink(`${path}?filter=${encodeURIComponent(json({ aantal: 2 }))}`)
    expect(filtered.body).toMatchObject({ rows: [{ day: '2026-10-12', aantal: 2 }], total: 1 })
    const sorted = await asLink(`${path}?sort=-day&group=name&limit=1&offset=0`)
    expect(sorted.body).toMatchObject({ rows: [{ day: '2026-10-20' }], total: 2 })
    expect(sorted.body.rows).toHaveLength(1)
  })

  test.each([
    ['filter on a hidden column', { filter: json({ id: 1 }) }, 'id'],
    ['filter on the owner column', { filter: json({ project_id: 2 }) }, 'project_id'],
    ['filter on a hidden column inside $or', { filter: json({ $or: [{ name: 'Alfa' }, { id: { $gt: 0 } }] }) }, 'id'],
    ['filter on an owner-visible column outside the view', { filter: json({ aantal: 2 }) }, 'aantal'],
    ['filter on a custom key', { filter: json({ 'custom.colour': 'rood' }) }, 'custom.colour'],
    ['filter on an unknown key', { filter: json({ nope: 1 }) }, 'nope'],
    ['sort on a hidden column', { sort: 'name,-id' }, 'id'],
    ['sort on the owner column', { sort: 'project_id' }, 'project_id'],
    ['group on a hidden column', { group: 'id' }, 'id'],
    ['group on an owner-visible column outside the view', { group: 'aantal' }, 'aantal'],
  ])('%s is 400 column_not_owner_visible, naming it', async (_, query, key) => {
    const id = await viewAs(admin, { visible_fields: ['name', 'day'] })
    await forOwners(id)
    const res = await asLink(`/api/owner/views/${id}/rows?${new URLSearchParams(query)}`)
    expect(res.status).toBe(400)
    expect(res.body).toMatchObject({ code: 'column_not_owner_visible', key })
    expect(String(res.body.message)).toContain(`"${key}"`)
  })

  test('from and to need the date column to be listed and owner-visible', async () => {
    const id = await viewAs(admin, { visible_fields: ['name'] })
    await forOwners(id)
    const res = await asLink(`/api/owner/views/${id}/rows?from=2026-10-01`)
    expect(res).toMatchObject({ status: 400, body: { code: 'column_not_owner_visible', key: 'day' } })
  })

  test('an unknown parameter is 400 bad_param; a limit above 5000 is 400 as on /rows', async () => {
    const id = await viewAs(admin, {})
    await forOwners(id)
    expect(await asLink(`/api/owner/views/${id}/rows?cells=1`)).toMatchObject({
      status: 400,
      body: { code: 'bad_param' },
    })
    expect(await asLink(`/api/owner/views/${id}/rows?limit=5001`)).toMatchObject({
      status: 400,
      body: { code: 'bad_limit' },
    })
  })

  test('a view not for owners, a deleted one and an unknown id are 404; a subject outside its scope reads none', async () => {
    const plain = await viewAs(admin, { shared: true })
    expect(await asLink(`/api/owner/views/${plain}/rows`)).toMatchObject({
      status: 404,
      body: { code: 'unknown_view' },
    })
    expect(await asLink('/api/owner/views/999/rows')).toMatchObject({ status: 404 })
    expect(await asLink('/api/owner/views/abc/rows')).toMatchObject({ status: 404 })
    const gone = await viewAs(admin, {})
    await forOwners(gone)
    await send(app, admin)('DELETE', `/api/views/${gone}`, { type: null })
    expect(await asLink(`/api/owner/views/${gone}/rows`)).toMatchObject({ status: 404 })
  })

  test('an editor session is 403 on the rows too', async () => {
    const id = await viewAs(admin, {})
    await forOwners(id)
    expect(await send(app, editor)('GET', `/api/owner/views/${id}/rows`)).toMatchObject({ status: 403 })
  })
})

describe('owner responses (attack 15) and the read limit', () => {
  const noStore = (headers: Headers) => {
    for (const [name, value] of Object.entries(NO_STORE)) expect(headers.get(name)).toBe(value)
    expect([...headers.keys()].some((name) => name.startsWith('access-control-'))).toBe(false)
  }

  test('every /owner/views* response carries the three headers, 401, 403, 400 and 404 included', async () => {
    const id = await viewAs(admin, {})
    await forOwners(id)
    const cookie = (value: string) => ({ cookie: value })
    const responses = [
      await asLink('/api/owner/views'),
      await asLink(`/api/owner/views/${id}/rows`),
      await asLink(`/api/owner/views/${id}/rows?sort=id`),
      await asLink('/api/owner/views/999/rows'),
      await asLink('/api/owner/views', 'project.1.bad'),
      await raw('/api/owner/views'),
      await raw(`/api/owner/views/${id}/rows`, cookie(editor)),
    ]
    expect(responses.map((r) => r.status)).toEqual([200, 200, 400, 404, 401, 401, 403])
    for (const res of responses) noStore(res.headers)
  })

  test('the 61st read from one address in a minute is 429, counting every request', async () => {
    for (let n = 0; n < 30; n++) expect((await asLink('/api/owner/views')).status).toBe(200)
    for (let n = 0; n < 30; n++) expect((await raw('/api/owner/views')).status).toBe(401)
    const res = await asLink('/api/owner/views')
    expect(res).toMatchObject({ status: 429, body: { code: 'rate_limited' } })
    noStore(res.headers)
  })

  test('a broken limiter fails closed', async () => {
    sqlite.run('DROP TABLE rate_limit')
    expect((await asLink('/api/owner/views')).status).toBe(429)
  })
})

describe('validateDomain: owner_visible', () => {
  const base = domain
  const withColumns = (name: string, over: Record<string, Partial<ColumnDecl>>): Domain => ({
    ...base,
    datasets: base.datasets.map((d) =>
      d.name === name
        ? {
            ...d,
            columns: Object.fromEntries(
              Object.entries(d.columns).map(([k, c]) => [k, { ...c, ...over[k] } as ColumnDecl]),
            ),
          }
        : d,
    ),
  })
  const refusedNaming = (d: Domain, bad: string) => {
    try {
      validateDomain(d)
      throw new Error('validateDomain accepted it')
    } catch (err) {
      expect(err).toBeInstanceOf(DomainError)
      expect((err as DomainError).bad).toBe(bad)
    }
  }

  test('owner_visible on a json column is refused', () => {
    refusedNaming(withColumns('note', { extra: { owner_visible: true } }), 'extra')
  })

  test('owner_visible on the owner column is refused, on a dataset and on a query', () => {
    refusedNaming(withColumns('taak', { project_id: { owner_visible: true } }), 'project_id')
    const query = base.queries.find((q) => q.name === 'per_project')
    if (!query) throw new Error('fixture lost per_project')
    const marked = {
      ...query,
      columns: { ...query.columns, project_id: { ...query.columns.project_id, owner_visible: true } },
    }
    refusedNaming({ ...base, queries: base.queries.map((q) => (q.name === 'per_project' ? marked : q)) }, 'project_id')
  })

  test('a token_projection column must be owner-visible', () => {
    const ticket = (projection: string[], visible: boolean): DatasetDecl =>
      defineDataset({
        name: 'ticket',
        label: 'Tickets',
        title: 'note',
        custom: false,
        owners: { owner: 'project_id' },
        columns: {
          project_id: { type: 'integer', label: 'Project', relation: 'project' },
          state: { type: 'text', label: 'State', options: { a: 'A', b: 'B' }, owner_visible: visible },
          note: { type: 'text', label: 'Note', nullable: true },
        },
        lifecycle: {
          column: 'state',
          transitions: [{ from: '*', to: 'b', roles: ['editor'] }],
          token_projection: projection,
        },
      })
    const with_ = (d: DatasetDecl): Domain => ({ ...base, datasets: [...base.datasets, d] })
    refusedNaming(with_(ticket(['state'], false)), 'state')
    refusedNaming(with_(ticket(['state', 'note'], true)), 'note')
    refusedNaming(with_(ticket(['project_id'], true)), 'project_id')
    expect(() => validateDomain(with_(ticket(['state'], true)))).not.toThrow()
  })
})

// The fixture's stempel_lijst, with a link to the merken of each stempel.
function linkedDomain(): Domain {
  const stempelMerk = defineDataset({
    name: 'stempel_merk',
    label: 'Stempelmerken',
    title: 'tekst',
    custom: false,
    columns: {
      stempel_id: { type: 'integer', label: 'Stempel', relation: 'stempel' },
      plat_id: { type: 'integer', label: 'Plat', relation: 'plat' },
      tekst: { type: 'text', label: 'Tekst' },
    },
  })
  const queries = domain.queries.map((q) =>
    q.name === 'stempel_lijst'
      ? defineQuery({
          ...q,
          columns: { ...q.columns, tekst: { ...q.columns.tekst, owner_visible: true } as ColumnDecl },
          links: {
            merken: { label: 'Merken', item: 'Merk', dataset: 'stempel_merk', key: 'stempel_id', target: 'plat_id' },
          },
        })
      : q,
  )
  return { ...domain, datasets: [...domain.datasets, stempelMerk], queries }
}

function migrated(d: Domain): Database {
  const db = new Database(':memory:')
  migrate(db, d)
  seedDomain(db, d)
  return db
}
