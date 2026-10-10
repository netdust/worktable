import { Database } from 'bun:sqlite'
import { beforeEach, describe, expect, test } from 'bun:test'
import { drizzle } from 'drizzle-orm/bun-sqlite'
import {
  type ColumnDecl,
  type DatasetDecl,
  type Domain,
  DomainError,
  defineDataset,
  migrate,
  seedDomain,
  validateDomain,
} from '../src'
import { createService } from '../src/auth'
import type { LookupDecl } from '../src/declare'
import { parseRowsParams } from '../src/params'
import { readRows, withLookups } from '../src/rows'
import { viewOf } from '../src/views'
import { send } from './fixture'
import domain from './fixtures/lookup-domain'
import { signIn, testEngine } from './sign-in'

const JSON_WRITE = { host: '127.0.0.1:4310', 'content-type': 'application/json' }

type Row = Record<string, unknown> & { id: number; inherited?: string[]; lookups: Record<string, unknown> }

const lineSource = domain.datasets.find((d) => d.name === 'line') as DatasetDecl

let sqlite: Database
let editor: ReturnType<typeof send>

beforeEach(async () => {
  sqlite = new Database(':memory:')
  migrate(sqlite, domain)
  seedDomain(sqlite, domain)
  const app = testEngine(sqlite, domain)
  editor = send(app, await signIn(app, 'editor'))
})

async function rowsOf(source: string): Promise<Row[]> {
  const { status, body } = await editor('GET', `/api/rows/${source}`)
  expect(status).toBe(200)
  return body.rows as Row[]
}

const byId = (rows: Row[], id: number) => rows.find((r) => r.id === id) as Row

describe('reading lookups', () => {
  test('a plain lookup reads the related field', async () => {
    const [first] = await rowsOf('item')
    expect(first?.team_name).toBe('One')
    expect(first).not.toHaveProperty('inherited')
  })

  test('an inherited lookup reads own, else the relation', async () => {
    const rows = await rowsOf('line')
    const own = byId(rows, 1)
    expect(own.team).toBe(2)
    expect(own.inherited).not.toContain('team')
    expect(own.lookups.team).toEqual({ id: 2, title: 'Two' })
    const inheriting = byId(rows, 2)
    expect(inheriting.team).toBe(1)
    expect(inheriting.inherited).toContain('team')
    expect((inheriting.lookups.team as { title: string }).title).toBe('One')
    expect(Object.keys(inheriting).some((key) => key.startsWith('inherited:'))).toBe(false)
  })

  test('a self-relation reads the parent', async () => {
    const rows = await rowsOf('node')
    expect(byId(rows, 2).parent_name).toBe('Root')
    expect(byId(rows, 1).parent_name).toBeNull()
  })

  test('a deleted target reads null', async () => {
    sqlite.run("UPDATE item SET deleted_at = '2026-01-01T00:00:00Z' WHERE id = 1")
    const rows = await rowsOf('line')
    const inheriting = byId(rows, 2)
    expect(inheriting.team).toBeNull()
    expect(inheriting.lookups.team).toBeNull()
    expect(inheriting.inherited).not.toContain('team')
    expect(byId(rows, 1).team).toBe(2)
  })

  test('schema serves lookups', async () => {
    const { body } = await editor('GET', '/api/schema')
    const team = body.sources.line.lookups.team
    expect(team).toMatchObject({ type: 'integer', relation: 'team', inherited: true, from: 'Item', label: 'Team' })
    expect(team).not.toHaveProperty('readonly')
    const teamName = body.sources.item.lookups.team_name
    expect(teamName).toMatchObject({ type: 'text', readonly: true, label: 'Team name', nullable: true })
    expect(teamName).not.toHaveProperty('default')
    expect(body.sources.line.columns).not.toHaveProperty('team')
    expect(body.sources.team).not.toHaveProperty('lookups')
  })

  test('a write reply carries the lookup', async () => {
    const { status, body } = await editor('PATCH', '/api/rows/line/1', { body: JSON.stringify({ name: 'x' }) })
    expect(status).toBe(200)
    expect(body.team).toBe(2)
    expect(body.inherited).toEqual([])
  })

  test('a raw without lookup keys gets none', () => {
    const item = domain.datasets.find((d) => d.name === 'item') as DatasetDecl
    const raws = sqlite.query('SELECT * FROM item').all() as Record<string, unknown>[]
    const [row] = withLookups(drizzle(sqlite), domain, item, raws)
    expect(row).not.toHaveProperty('team_name')
    expect(row).not.toHaveProperty('inherited')
  })
})

describe('validateDomain refuses a lookups declaration', () => {
  const datasetOf = (name: string) => domain.datasets.find((d) => d.name === name) as DatasetDecl
  const changed = (name: string, over: Partial<DatasetDecl>): Domain => ({
    ...domain,
    datasets: domain.datasets.map((d) => (d.name === name ? { ...d, ...over } : d)),
  })
  const onItem = (lookups: Record<string, LookupDecl>, over: Partial<DatasetDecl> = {}) =>
    changed('item', { lookups, ...over })
  const ofTeamColumn = (column: string, decl: ColumnDecl): Domain => ({
    ...domain,
    datasets: domain.datasets.map((d) => {
      if (d.name === 'team') return { ...d, columns: { ...d.columns, [column]: decl } }
      return d.name === 'item' ? { ...d, lookups: { [column]: lookup({ field: column }) } } : d
    }),
  })
  const lookup = (over: Partial<LookupDecl> = {}): LookupDecl => ({
    label: 'Team name',
    via: 'team_id',
    field: 'name',
    ...over,
  })
  function bad(d: Domain): string {
    try {
      validateDomain(d)
    } catch (e) {
      if (e instanceof DomainError) return e.bad
      throw e
    }
    throw new Error('expected DomainError')
  }

  test('the fixture passes', () => {
    expect(() => validateDomain(domain)).not.toThrow()
  })

  test('a via that is not a relation', () => {
    expect(bad(onItem({ team_name: lookup({ via: 'phase' }) }))).toBe('phase')
    expect(bad(onItem({ team_name: lookup({ via: 'nope' }) }))).toBe('nope')
  })

  test('a field that is not a target column', () => {
    expect(bad(onItem({ team_name: lookup({ field: 'nope' }) }))).toBe('nope')
    expect(bad(onItem({ team_name: lookup({ field: 'id' }) }))).toBe('id')
  })

  test('a json field', () => {
    expect(bad(ofTeamColumn('meta', { type: 'json', label: 'Meta', nullable: true }))).toBe('meta')
  })

  test('a boolean field', () => {
    expect(bad(ofTeamColumn('active', { type: 'boolean', label: 'Active', default: true }))).toBe('active')
  })

  test('an own of another type or another relation', () => {
    const team = { label: 'Team', via: 'item_id', field: 'team_id', from: 'Item' }
    expect(bad(changed('line', { lookups: { team: { ...team, own: 'name' } } }))).toBe('name')
    expect(bad(changed('line', { lookups: { team: { ...team, own: 'item_id' } } }))).toBe('item_id')
    expect(bad(changed('line', { lookups: { team: { ...team, own: 'nope' } } }))).toBe('nope')
  })

  const teamOwn = { label: 'Team', via: 'item_id', field: 'team_id', own: 'team_id', from: 'Item' }
  const lineColumns = (over: Record<string, ColumnDecl>) => ({ ...datasetOf('line').columns, ...over })

  test('an own that is the lifecycle column', () => {
    const stage = { label: 'Stage', via: 'item_id', field: 'phase', own: 'phase', from: 'Item' }
    expect(bad(changed('line', { lookups: { team: teamOwn, stage } }))).toBe('phase')
  })

  test('an own that is readonly or not nullable', () => {
    const own = datasetOf('line').columns.team_id as ColumnDecl
    expect(bad(changed('line', { columns: lineColumns({ team_id: { ...own, readonly: true } }) }))).toBe('team_id')
    expect(bad(changed('line', { columns: lineColumns({ team_id: { ...own, nullable: false } }) }))).toBe('team_id')
  })

  test('an own that is the record link address', () => {
    const contact: ColumnDecl = { type: 'text', label: 'Contact', nullable: true }
    const lookups = { contact_name: { label: 'Contact', via: 'item_id', field: 'name', own: 'contact', from: 'Item' } }
    const d = changed('line', { columns: lineColumns({ contact }), lookups, record_link: { email: 'contact' } })
    expect(() => validateDomain(d)).toThrow(DomainError)
  })

  test('two lookups sharing one own', () => {
    expect(bad(changed('line', { lookups: { team: teamOwn, team2: { ...teamOwn, label: 'Team 2' } } }))).toBe('team2')
  })

  test('an own without from', () => {
    const { from: _, ...noFrom } = teamOwn
    expect(bad(changed('line', { lookups: { team: noFrom } }))).toBe('team')
  })

  test('a lookup named like a column or a link', () => {
    expect(bad(onItem({ phase: lookup() }))).toBe('phase')
    const links = { lines: { label: 'Lines', item: 'Line', dataset: 'line', key: 'item_id', target: 'team_id' } }
    expect(bad(onItem({ lines: lookup() }, { links }))).toBe('lines')
  })

  for (const name of ['id', 'custom', 'deleted_at', 'lookups', 'inherited', 'cells', 'title']) {
    test(`the reserved name ${name}`, () => {
      expect(bad(onItem({ [name]: lookup() }))).toBe(name)
    })
  }

  test('a column named inherited', () => {
    const columns = {
      ...datasetOf('item').columns,
      inherited: { type: 'text', label: 'X', nullable: true } as ColumnDecl,
    }
    expect(bad(changed('item', { columns }))).toBe('inherited')
  })

  test('refuses lookups on an owned dataset', () => {
    expect(bad(onItem({ team_name: lookup() }, { owners: { owner: 'id' } }))).toBe('team_name')
  })

  test('defineDataset refuses a lookup name that is not an identifier', () => {
    const { kind: _, ...item } = datasetOf('item')
    expect(() => defineDataset({ ...item, lookups: { 'Team-name': lookup() } })).toThrow()
  })
})

describe('a lookup behaves like a column in a view', () => {
  const q = (path: string, params: Record<string, string>) =>
    editor('GET', `/api/rows/${path}?${new URLSearchParams(params)}`)
  const names = (body: unknown) => (body as { rows: Row[] }).rows.map((r) => r.name)

  test('filter on a lookup', async () => {
    const { status, body } = await q('line', { filter: '{"team":1}' })
    expect(status).toBe(200)
    expect(names(body)).toEqual(['Inherits', 'Own phase'])
    sqlite.run("UPDATE item SET deleted_at = '2026-01-01T00:00:00Z' WHERE id = 1")
    const gone = await q('line', { filter: '{"team":{"$exists":false}}' })
    expect(names(gone.body)).toEqual(['Inherits', 'Own phase'])
    expect(names((await q('line', { filter: '{"team":{"$exists":true}}' })).body)).toEqual(['Own team'])
  })

  test('filter on a text lookup', async () => {
    const { status, body } = await q('item', { filter: '{"team_name":{"$like":"On"}}' })
    expect(status).toBe(200)
    expect(names(body)).toEqual(['First'])
  })

  test('sort on a lookup', async () => {
    const { body } = await q('line', { sort: '-team' })
    expect(names(body)).toEqual(['Own team', 'Inherits', 'Own phase'])
  })

  test('group on a lookup', async () => {
    const { status, body } = await q('line', { group: 'team' })
    expect(status).toBe(200)
    expect(names(body)).toEqual(['Inherits', 'Own phase', 'Own team'])
  })

  test('a saved view on a lookup', async () => {
    const view = {
      name: 'By team',
      source: 'line',
      filters: { team: 1 },
      sort: ['team'],
      group_by: 'team',
      visible_fields: ['team'],
    }
    const made = await editor('POST', '/api/views', { body: JSON.stringify(view) })
    expect(made.status).toBe(201)
    const { body } = await q('line', { filter: JSON.stringify(view.filters), sort: 'team', group: 'team' })
    expect(names(body)).toEqual(['Inherits', 'Own phase'])
    const stored = viewOf(
      sqlite.query('SELECT * FROM saved_view WHERE id = ?').get(made.body.id) as Record<string, unknown>,
    )
    const params = { ...parseRowsParams(lineSource, { sort: stored.sort.join(',') }), stored: stored.filters }
    const read = readRows(drizzle(sqlite), domain, lineSource, params, 'all')
    expect(read.rows.map((r) => r.name)).toEqual(['Inherits', 'Own phase'])
  })

  test('visible_fields longer than the source has fields is refused', async () => {
    const fields = ['name', 'item_id', 'team_id', 'phase', 'team', 'id', 'name2', 'x']
    const res = await editor('POST', '/api/views', {
      body: JSON.stringify({ name: 'Long', source: 'line', visible_fields: fields }),
    })
    expect([res.status, res.body.message]).toEqual([400, 'visible_fields takes at most 6 keys'])
    const five = await editor('POST', '/api/views', {
      body: JSON.stringify({
        name: 'Five',
        source: 'line',
        visible_fields: ['name', 'item_id', 'team_id', 'phase', 'team'],
      }),
    })
    expect(five.status).toBe(201)
  })

  test('an unknown key stays 400', async () => {
    const filter = await q('line', { filter: '{"nope":1}' })
    expect([filter.status, (filter.body as { code: string }).code]).toEqual([400, 'bad_filter'])
    const sort = await q('line', { sort: 'nope' })
    expect([sort.status, (sort.body as { code: string }).code]).toEqual([400, 'bad_sort'])
  })

  test('history filters on a lookup', async () => {
    const { status } = await editor('GET', `/api/history/line?${new URLSearchParams({ filter: '{"team":1}' })}`)
    expect(status).toBe(200)
  })
})

describe('writing through a lookup', () => {
  const patch = (id: number, body: unknown, source = 'line') =>
    editor('PATCH', `/api/rows/${source}/${id}`, { body: JSON.stringify(body) })

  test('inherited write lands on own', async () => {
    const { status, body } = await patch(2, { team: 2 })
    expect(status).toBe(200)
    expect(body.team).toBe(2)
    expect(body.inherited).not.toContain('team')
    const { body: history } = await editor('GET', '/api/revisions/line/2')
    expect(JSON.stringify(history.revisions)).toContain('team_id')
  })

  test('null inherits again', async () => {
    await patch(2, { team: 2 })
    const { body } = await patch(2, { team: null })
    expect(body.team).toBe(1)
    expect(body.inherited).toContain('team')
  })

  test('inherited write goes through the writer', async () => {
    expect((await patch(2, { team: 99 })).status).toBe(422)
    const missing = await patch(2, { team: 98 })
    expect([missing.status, missing.body.code]).toEqual([400, 'bad_relation'])
  })

  test('a renamed write still meets the transition check on its other columns', async () => {
    const res = await patch(3, { team: 2, phase: 'open' })
    expect(res.status).toBe(422)
    expect(byId(await rowsOf('line'), 3).team).toBe(1)
  })

  test('the related row is untouched', async () => {
    await patch(2, { team: 2 })
    const item = (await rowsOf('item'))[0]
    expect(item?.team_id).toBe(1)
  })

  test('both names are 400', async () => {
    const res = await patch(2, { team: 2, team_id: 2 })
    expect([res.status, res.body.code]).toEqual([400, 'bad_value'])
    expect(res.body.message).toBe('"team" and "team_id" name one value')
    expect(byId(await rowsOf('line'), 2).team).toBe(1)
  })

  test('a service write through a lookup is judged by the expect rule on the columns it lands on', async () => {
    const token = createService(sqlite, 'bot', 'editor')
    const service = (body: unknown) =>
      testEngine(sqlite, domain).request('/api/rows/line/2', {
        method: 'PATCH',
        headers: { ...JSON_WRITE, authorization: `Bearer ${token}` },
        body: JSON.stringify(body),
      })
    const refused = await service({ team: 2, phase: 'done' })
    expect([refused.status, ((await refused.json()) as { code: string }).code]).toEqual([400, 'bad_body'])
    expect(byId(await rowsOf('line'), 2).team).toBe(1)
    expect((await service({ team: 2 })).status).toBe(200)
  })

  test('a __proto__ key in a write body changes nothing', async () => {
    const res = await editor('PATCH', '/api/rows/line/2', { body: '{"__proto__":{"team_id":2,"phase":"done"}}' })
    expect(res.status).toBe(200)
    expect(res.body.revision.changed).toEqual([])
    expect(byId(await rowsOf('line'), 2).team).toBe(1)
  })

  test('a plain lookup is dropped', async () => {
    const res = await patch(1, { team_name: 'x' }, 'item')
    expect(res.status).toBe(200)
    expect(res.body.revision.changed).toEqual([])
  })
})
