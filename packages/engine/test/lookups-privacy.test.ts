import { Database } from 'bun:sqlite'
import { describe, expect, test } from 'bun:test'
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
import { send } from './fixture'
import lookupDomain from './fixtures/lookup-domain'
import { signIn, testEngine } from './sign-in'

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
})

describe('lookups and who reads them', () => {
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

  // The item's owner is the item itself, so team 1 belongs to another owner: its name must not reach the item's owner.
  test('owner_visible on a lookup that can reach another owner’s record is refused', () => {
    const itemOwnsItself: Domain = {
      ...domain,
      datasets: domain.datasets.map((d) => (d.name === 'item' ? { ...d, owners: { owner: 'id' } } : d)),
    }
    const of = withLookupOn(itemOwnsItself, visibleName, { owner_visible: true })
    expect(refusalOf({ ...of, queries: [] })).toContain('team_name')
  })

  test('owner_visible on a lookup into a dataset owned through another column is refused', () => {
    const teamOwnedByItem = { ...visibleName, owners: { owner: 'lead_id' }, record_link: undefined }
    const withLead = withLookupOn(withOwnedItem(), teamOwnedByItem, { owner_visible: true })
    const of: Domain = {
      ...withLead,
      queries: [],
      datasets: withLead.datasets.map((d) =>
        d.name === 'team'
          ? {
              ...d,
              columns: { ...d.columns, lead_id: { type: 'integer', label: 'Lead', relation: 'item', nullable: true } },
            }
          : d,
      ),
    }
    expect(refusalOf(of)).toContain('team_name')
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
