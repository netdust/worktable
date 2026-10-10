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
import type { LookupDecl } from '../src/declare'
import { withLookups } from '../src/rows'
import { send } from './fixture'
import domain from './fixtures/lookup-domain'
import { signIn, testEngine } from './sign-in'

type Row = Record<string, unknown> & { id: number; inherited?: string[]; lookups: Record<string, unknown> }

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
    expect(inheriting.stage).toBe('open')
    expect(inheriting.inherited).toContain('stage')
    const ownPhase = byId(rows, 3)
    expect(ownPhase.stage).toBe('done')
    expect(ownPhase.inherited).toEqual(['team'])
    expect(Object.keys(ownPhase).some((key) => key.startsWith('inherited:'))).toBe(false)
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
    expect(body.sources.line.lookups.stage).toMatchObject({ options: { open: 'Open', done: 'Done' } })
    expect(body.sources.line.lookups.stage).not.toHaveProperty('default')
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
    expect(body.inherited).toEqual(['stage'])
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
    const team = { label: 'Team', via: 'item_id', field: 'team_id' }
    expect(bad(changed('line', { lookups: { team: { ...team, own: 'name' } } }))).toBe('name')
    expect(bad(changed('line', { lookups: { team: { ...team, own: 'item_id' } } }))).toBe('item_id')
    expect(bad(changed('line', { lookups: { team: { ...team, own: 'nope' } } }))).toBe('nope')
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
  })

  test('filter on a text lookup', async () => {
    const { status, body } = await q('item', { filter: '{"team_name":{"$like":"On"}}' })
    expect(status).toBe(200)
    expect(names(body)).toEqual(['First'])
  })

  test('sort on a lookup', async () => {
    const { body } = await q('line', { sort: '-team' })
    expect(names(body)[0]).toBe('Own team')
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
