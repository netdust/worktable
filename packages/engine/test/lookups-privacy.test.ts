import { Database } from 'bun:sqlite'
import { describe, expect, test } from 'bun:test'
import { drizzle } from 'drizzle-orm/bun-sqlite'
import {
  type DatasetDecl,
  type Domain,
  DomainError,
  defineQuery,
  migrate,
  type QueryDecl,
  seedDomain,
  validateDomain,
} from '../src'
import { sha256 } from '../src/auth'
import { parseRowsParams } from '../src/params'
import { recordLinkFor } from '../src/record-link'
import { readRows } from '../src/rows'
import { freshDb, domain as ownerDomain, send } from './fixture'
import lookupDomain from './fixtures/lookup-domain'
import { signIn, TEST_LINK_SECRET, testEngine } from './sign-in'

const HOST = '127.0.0.1:4310'
const json = JSON.stringify

const datasetOf = (domain: Domain, name: string) => domain.datasets.find((d) => d.name === name) as DatasetDecl

// The lookup domain with team owned through a record link, and a query over item that smuggles a lookup.
const smuggling = defineQuery({
  name: 'item_list',
  label: 'Item list',
  title: 'name',
  sql: 'SELECT i.id, i.team_id, i.name FROM item i WHERE i.deleted_at IS NULL',
  owners: { owner: 'team_id' },
  columns: {
    id: { type: 'integer', label: 'Id' },
    team_id: { type: 'integer', label: 'Team', relation: 'team' },
    name: { type: 'text', label: 'Name', owner_visible: true },
  },
  ...{ lookups: { team_name: { label: 'Team name', via: 'team_id', field: 'name' } } },
} as QueryDecl)
const ownedTeam = { ...datasetOf(lookupDomain, 'team'), owners: { owner: 'id' }, record_link: {} }
const domain: Domain = {
  ...lookupDomain,
  datasets: lookupDomain.datasets.map((d) => (d.name === 'team' ? ownedTeam : d)),
  queries: [smuggling],
}

async function engineOf(of: Domain) {
  const sqlite = new Database(':memory:')
  migrate(sqlite, of)
  seedDomain(sqlite, of)
  const app = testEngine(sqlite, of)
  const admin = send(app, await signIn(app, 'administrator'))
  const editor = send(app, await signIn(app, 'editor'))
  return { sqlite, app, admin, editor }
}

async function asLink(app: ReturnType<typeof testEngine>, path: string, token: string) {
  const res = await app.request(path, { headers: { host: HOST, authorization: `RecordLink ${token}` } })
  // biome-ignore lint/suspicious/noExplicitAny: response bodies are asserted structurally
  return { status: res.status, body: (await res.json()) as Record<string, any> }
}

function forgeView(sqlite: Database, source: string, visible: string[], extra: Record<string, unknown>): number {
  const columns = ['name', 'source_type', 'source', 'owner_id', 'shared', 'filters', 'sort', 'visible_fields']
  const values: unknown[] = ['Forged', 'query', source, -1, 1, '{}', '[]', json(visible)]
  for (const [key, value] of Object.entries(extra)) {
    columns.push(key)
    values.push(value)
  }
  const sql = `INSERT INTO saved_view (${columns.join(', ')}) VALUES (${columns.map(() => '?').join(', ')})`
  // biome-ignore lint/suspicious/noExplicitAny: bun:sqlite binds plain values
  return Number(sqlite.query(sql).run(...(values as any[])).lastInsertRowid)
}

function refusalOf(of: Domain): string {
  try {
    validateDomain(of)
  } catch (e) {
    if (e instanceof DomainError) return `${e.bad}: ${e.message}`
    throw e
  }
  return ''
}

const withOwnedItem = (): Domain => ({
  ...domain,
  datasets: domain.datasets.map((d) => (d.name === 'item' ? { ...d, owners: { owner: 'team_id' } } : d)),
})

describe('a lookup never reaches a view for owners or a public view', () => {
  test('a view on a dataset with lookups can be neither for owners nor shared publicly', async () => {
    const { admin } = await engineOf(domain)
    const made = await admin('POST', '/api/views', {
      body: json({ name: 'L', source: 'item', visible_fields: ['name', 'team_name'], shared: true }),
    })
    expect(made.status).toBe(201)
    const owners = await admin('PUT', `/api/views/${made.body.id}/for-owners`, { body: '{}' })
    const shared = await admin('PUT', `/api/views/${made.body.id}/share-token`, { body: '{}' })
    expect([owners.status, owners.body.code]).toEqual([400, 'not_query'])
    expect([shared.status, shared.body.code]).toEqual([400, 'not_query'])
  })

  test('lookups on a query declaration are not served: neither in /schema nor in its rows', async () => {
    const { editor } = await engineOf(domain)
    const schema = await editor('GET', '/api/schema')
    expect(schema.body.sources.item_list).not.toHaveProperty('lookups')
    const rows = await editor('GET', '/api/rows/item_list')
    expect(rows.status).toBe(200)
    expect(rows.body.rows[0]).not.toHaveProperty('team_name')
  })

  test('lookups on a query declaration cannot be filtered, sorted or shown in a view', async () => {
    const { editor, admin } = await engineOf(domain)
    const filter = await editor('GET', `/api/rows/item_list?filter=${encodeURIComponent(json({ team_name: 'One' }))}`)
    const sort = await editor('GET', '/api/rows/item_list?sort=team_name')
    const view = await admin('POST', '/api/views', {
      body: json({ name: 'Q', source: 'item_list', visible_fields: ['team_name'] }),
    })
    expect([filter.status, filter.body.code]).toEqual([400, 'bad_filter'])
    expect([sort.status, sort.body.code]).toEqual([400, 'bad_sort'])
    expect([view.status, view.body.code]).toEqual([400, 'bad_view'])
  })

  test('a public view on a query cannot be changed to show a lookup key', async () => {
    const { admin } = await engineOf(domain)
    const made = await admin('POST', '/api/views', {
      body: json({ name: 'P', source: 'item_list', visible_fields: ['name'], shared: true }),
    })
    expect((await admin('PUT', `/api/views/${made.body.id}/share-token`, { body: '{}' })).status).toBe(200)
    const patched = await admin('PATCH', `/api/views/${made.body.id}`, {
      body: json({ visible_fields: ['name', 'team_name'] }),
    })
    expect(patched.status).toBe(400)
  })

  test('a forged public or for-owners view whose source is a dataset with lookups is not served', async () => {
    const { sqlite, app } = await engineOf(domain)
    const token = 'forged-token-abc'
    forgeView(sqlite, 'item', ['team_name'], { public: 1, share_token: sha256(token) })
    const pub = await app.request(`/api/public/views/${token}`, { headers: { host: HOST } })
    expect(pub.status).toBe(404)
    const id = forgeView(sqlite, 'item', ['team_name'], { for_owners: 1 })
    const own = await asLink(app, `/api/owner/views/${id}/rows`, recordLinkFor(sqlite, TEST_LINK_SECRET, 'team', 1))
    expect(own.status).toBe(404)
  })

  test('a forged for-owners view on a query listing a lookup key is not served', async () => {
    const { sqlite, app } = await engineOf(domain)
    const id = forgeView(sqlite, 'item_list', ['name', 'team_name'], { for_owners: 1 })
    const own = await asLink(app, `/api/owner/views/${id}/rows`, recordLinkFor(sqlite, TEST_LINK_SECRET, 'team', 1))
    expect(own.status).toBe(404)
  })
})

describe('an owner names only listed, owner-visible keys', () => {
  test.each([
    ['a filter on a lookup name', { filter: json({ project_name: 'Alfa' }) }, 'project_name'],
    [
      'a filter on a lookup name inside $or',
      { filter: json({ $or: [{ name: 'Alfa' }, { project_name: 'Alfa' }] }) },
      'project_name',
    ],
    [
      'a filter on a hidden column inside $or',
      { filter: json({ $or: [{ name: 'Alfa' }, { project_id: 1 }] }) },
      'project_id',
    ],
    ['a filter on an inherited flag', { filter: json({ 'inherited:team': true }) }, 'inherited:team'],
    ['a filter on the lookups key', { filter: json({ lookups: 1 }) }, 'lookups'],
    ['a sort on a lookup name', { sort: 'name,-project_name' }, 'project_name'],
    ['a sort on a hidden column', { sort: '-id' }, 'id'],
    ['a group on a lookup name', { group: 'project_name' }, 'project_name'],
    ['a group on a hidden column', { group: 'project_id' }, 'project_id'],
  ])('%s is refused, naming the key', async (_, query, key) => {
    const sqlite = freshDb()
    const app = testEngine(sqlite, ownerDomain)
    const admin = send(app, await signIn(app, 'administrator'))
    const made = await admin('POST', '/api/views', {
      body: json({ name: 'V', source: 'per_project', visible_fields: ['name', 'day'] }),
    })
    expect((await admin('PUT', `/api/views/${made.body.id}/for-owners`, { body: '{}' })).status).toBe(200)
    const token = recordLinkFor(sqlite, TEST_LINK_SECRET, 'project', 1)
    const res = await asLink(app, `/api/owner/views/${made.body.id}/rows?${new URLSearchParams(query)}`, token)
    expect([res.status, res.body.code, res.body.key]).toEqual([400, 'column_not_owner_visible', key])
  })
})

describe('lookups and who reads them', () => {
  test('an owner reads no dataset with lookups, and /schema lists none', async () => {
    const { app } = await engineOf(domain)
    const owner = send(app, await signIn(app, 'owner', { dataset: 'team', id: 1 }))
    expect((await owner('GET', '/api/rows/item')).status).toBe(404)
    expect((await owner('GET', '/api/rows/line')).status).toBe(404)
    const schema = await owner('GET', '/api/schema')
    expect(schema.body.sources).not.toHaveProperty('item')
  })

  test('validation accepts lookups on a dataset with owners', () => {
    expect(refusalOf(withOwnedItem())).toBe('')
  })

  test('a scoped read serves no lookup value', () => {
    const sqlite = new Database(':memory:')
    migrate(sqlite, lookupDomain)
    seedDomain(sqlite, lookupDomain)
    const item = datasetOf(lookupDomain, 'item')
    const scoped = readRows(drizzle(sqlite), lookupDomain, item, parseRowsParams(item, {}), {
      column: 'team_id',
      id: 1,
    })
    expect(scoped.rows.length).toBeGreaterThan(0)
    for (const row of scoped.rows) expect(Object.hasOwn(row, 'team_name')).toBe(false)
  })

  test('a deleted target reads null, plain and inherited', async () => {
    const { sqlite, editor } = await engineOf(lookupDomain)
    sqlite.run("UPDATE team SET deleted_at = '2026-01-01T00:00:00Z' WHERE id = 1")
    const items = await editor('GET', '/api/rows/item')
    expect(items.body.rows[0].team_name).toBeNull()
    sqlite.run("UPDATE item SET deleted_at = '2026-01-01T00:00:00Z' WHERE id = 1")
    const lines = await editor('GET', '/api/rows/line')
    const inheriting = lines.body.rows.find((r: { id: number }) => r.id === 2)
    expect(inheriting.team).toBeNull()
  })

  test('an inherited lookup through a live record still titles a deleted second-hop target, as a stored relation does', async () => {
    const { sqlite, editor } = await engineOf(lookupDomain)
    sqlite.run("UPDATE team SET deleted_at = '2026-01-01T00:00:00Z' WHERE id = 1")
    const lines = await editor('GET', '/api/rows/line')
    const inheriting = lines.body.rows.find((r: { id: number }) => r.id === 2)
    expect(inheriting.team).toBe(1)
    expect(inheriting.lookups.team).toEqual({ id: 1, title: 'One' })
  })
})

const withLookupOn = (of: Domain, target: Partial<DatasetDecl>, lookup: Record<string, unknown>): Domain => ({
  ...of,
  datasets: of.datasets.map((d) => {
    if (d.name === 'team') return { ...d, ...target }
    if (d.name !== 'item') return d
    const lookups = d.lookups as DatasetDecl['lookups'] & { team_name: object }
    return { ...d, lookups: { team_name: { ...lookups.team_name, ...lookup } } } as DatasetDecl
  }),
})

const visibleName = { columns: { name: { type: 'text', label: 'Name', owner_visible: true } } } as Partial<DatasetDecl>
const withWritableName = (of: Domain): Domain => ({
  ...of,
  datasets: of.datasets.map((d) =>
    d.name === 'item'
      ? {
          ...d,
          columns: { ...d.columns, name: { type: 'text', label: 'Name', owner_visible: true, owner_writable: true } },
        }
      : d,
  ),
})
const withOwnerVisibleName = (): Domain => withLookupOn(withOwnedItem(), visibleName, { owner_visible: true })

describe('lookups on a dataset with owners', () => {
  const q = (params: Record<string, string>) => new URLSearchParams(params).toString()
  const byName = q({ filter: json({ team_name: 'One' }) })

  async function owned(of: Domain = withOwnedItem()) {
    const engine = await engineOf(of)
    const owner = send(engine.app, await signIn(engine.app, 'owner', { dataset: 'team', id: 1 }))
    const rename = (name: string) => owner('PATCH', '/api/rows/item/1', { body: json({ name }) })
    return { ...engine, owner, rename }
  }

  test("an owner's rows carry no lookup", async () => {
    const { owner } = await owned()
    const rows = await owner('GET', '/api/rows/item')
    expect(rows.status).toBe(200)
    expect(rows.body.rows.length).toBeGreaterThan(0)
    for (const row of rows.body.rows) expect(Object.hasOwn(row, 'team_name')).toBe(false)
  })

  test("an owner's write reply carries no lookup", async () => {
    const { rename } = await owned(withWritableName(withOwnedItem()))
    const res = await rename('Renamed')
    expect([res.status, res.body.name]).toEqual([200, 'Renamed'])
    expect(Object.hasOwn(res.body, 'team_name')).toBe(false)
  })

  test("an owner's filter on a lookup is 400 bad_filter", async () => {
    const { owner } = await owned()
    const res = await owner('GET', `/api/rows/item?${byName}`)
    expect([res.status, res.body.code]).toEqual([400, 'bad_filter'])
    const inOr = await owner(
      'GET',
      `/api/rows/item?${q({ filter: json({ $or: [{ name: 'x' }, { team_name: 'One' }] }) })}`,
    )
    expect([inOr.status, inOr.body.code]).toEqual([400, 'bad_filter'])
  })

  test("an owner's sort on a lookup is 400 bad_sort", async () => {
    const { owner } = await owned()
    const res = await owner('GET', '/api/rows/item?sort=-team_name')
    expect([res.status, res.body.code]).toEqual([400, 'bad_sort'])
  })

  test("an owner's group on a lookup is 400", async () => {
    const { owner } = await owned()
    const res = await owner('GET', '/api/rows/item?group=team_name')
    expect([res.status, res.body.code]).toEqual([400, 'bad_group'])
  })

  test("an owner's /history filter on a lookup is 400", async () => {
    const { owner } = await owned()
    const res = await owner('GET', `/api/history/item?${byName}`)
    expect([res.status, res.body.code]).toEqual([400, 'bad_filter'])
  })

  test('/schema for an owner serves no lookup', async () => {
    const { owner } = await owned()
    const schema = await owner('GET', '/api/schema')
    expect(schema.body.sources).toHaveProperty('item')
    expect(schema.body.sources.item).not.toHaveProperty('lookups')
  })

  test('an editor reads, filters and sorts it', async () => {
    const { editor } = await owned()
    const filtered = await editor('GET', `/api/rows/item?${byName}&sort=-team_name`)
    expect(filtered.status).toBe(200)
    expect(filtered.body.rows.map((r: { team_name: string }) => r.team_name)).toEqual(['One'])
    const none = await editor('GET', `/api/rows/item?${q({ filter: json({ team_name: 'Two' }) })}`)
    expect(none.body.rows).toEqual([])
    const schema = await editor('GET', '/api/schema')
    expect(schema.body.sources.item.lookups).toHaveProperty('team_name')
  })

  test('owner_visible on a lookup whose field is not owner_visible is refused', () => {
    expect(refusalOf(withLookupOn(withOwnedItem(), {}, { owner_visible: true }))).toContain('team_name')
  })

  test('owner_visible on a lookup whose target dataset declares no owners is refused', () => {
    const noOwners = { ...visibleName, owners: undefined, record_link: undefined }
    const of = withLookupOn(withOwnedItem(), noOwners, { owner_visible: true })
    expect(refusalOf({ ...of, queries: [] })).toContain('team_name')
  })

  test('an owner_visible lookup is served, filtered and sorted for its owner', async () => {
    expect(refusalOf(withOwnerVisibleName())).toBe('')
    const { owner } = await owned(withOwnerVisibleName())
    const rows = await owner('GET', `/api/rows/item?${byName}&sort=-team_name&group=team_name`)
    expect(rows.status).toBe(200)
    expect(rows.body.rows.map((r: { team_name: string }) => r.team_name)).toEqual(['One'])
    const schema = await owner('GET', '/api/schema')
    expect(schema.body.sources.item.lookups).toHaveProperty('team_name')
    const { rename } = await owned(withWritableName(withOwnerVisibleName()))
    expect((await rename('Renamed')).body.team_name).toBe('One')
  })
})
