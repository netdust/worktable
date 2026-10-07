import { Database } from 'bun:sqlite'
import { beforeEach, describe, expect, test } from 'bun:test'
import type { Hono } from 'hono'
import { type Domain, defineDataset, migrate, seedDomain } from '../src'
import { domain, freshDb } from './fixture'
import { signIn, testEngine } from './sign-in'

let sqlite: Database
let app: Hono
let cookie: string

beforeEach(async () => {
  sqlite = freshDb()
  app = testEngine(sqlite, domain)
  cookie = await signIn(app)
})

const counts = (): Record<string, number> => {
  const tables = sqlite.query("SELECT name FROM sqlite_master WHERE type = 'table'").all() as { name: string }[]
  return Object.fromEntries(
    tables.map(({ name }) => [name, (sqlite.query(`SELECT count(*) AS n FROM "${name}"`).get() as { n: number }).n]),
  )
}

async function get(path: string) {
  const res = await app.request(path, { headers: { host: '127.0.0.1:4310', cookie } })
  // biome-ignore lint/suspicious/noExplicitAny: response bodies are asserted structurally
  return { status: res.status, body: (await res.json()) as Record<string, any> }
}

const rows = (source: string, query = '') => get(`/api/rows/${source}${query ? `?${query}` : ''}`)
const filtered = (source: string, filter: unknown) =>
  rows(source, `filter=${encodeURIComponent(typeof filter === 'string' ? filter : JSON.stringify(filter))}`)

async function denied(path: string, status: number, code: string) {
  const before = counts()
  const { status: got, body } = await get(path)
  expect({ got, code: body.code }).toEqual({ got: status, code })
  expect(counts()).toEqual(before)
}

const badFilter = (filter: unknown) =>
  denied(
    `/api/rows/taak?filter=${encodeURIComponent(typeof filter === 'string' ? filter : JSON.stringify(filter))}`,
    400,
    'bad_filter',
  )

describe('denials', () => {
  test('filter key outside the declared columns is 400 bad_filter', () => badFilter({ 'heading) OR 1=1 --': 1 }))
  test('custom key with a quote is 400 bad_filter', () => badFilter({ "custom.x') --": 1 }))
  test('internal columns are not filterable', () => badFilter({ deleted_at: null }))

  test('value with SQL is matched literally', async () => {
    const before = counts()
    const { status, body } = await filtered('taak', { status: "x' OR '1'='1" })
    expect(status).toBe(200)
    expect(body.total).toBe(0)
    expect(counts()).toEqual(before)
  })

  test('sort on an undeclared key is 400 bad_sort', () =>
    denied('/api/rows/taak?sort=heading;DROP TABLE x', 400, 'bad_sort'))
  test('sort on custom.key is 400 bad_sort', () => denied('/api/rows/taak?sort=custom.colour', 400, 'bad_sort'))
  test('2001 sort keys is 400 bad_sort, not a 500', () =>
    denied(`/api/rows/taak?sort=${Array(2001).fill('id').join(',')}`, 400, 'bad_sort'))
  test('17 sort keys is 400 bad_sort for their number', async () => {
    const { status, body } = await rows('taak', `sort=${Array(17).fill('id').join(',')}`)
    expect({ status, code: body.code, message: body.message }).toEqual({
      status: 400,
      code: 'bad_sort',
      message: 'sort takes at most 16 keys',
    })
  })
  test('a sort key named twice, either way, is 400 bad_sort', () =>
    denied('/api/rows/taak?sort=id,-id', 400, 'bad_sort'))
  test('group on an undeclared key is 400 bad_group', () => denied('/api/rows/taak?group=nope', 400, 'bad_group'))

  test.each(['_migrations', 'sqlite_master', 'saved_view', 'nope'])('source %s is 404 unknown_source', (source) =>
    denied(`/api/rows/${source}`, 404, 'unknown_source'),
  )

  test('51 filter keys is 400', () =>
    badFilter(Object.fromEntries(Array.from({ length: 51 }, (_, i) => [`custom.k${i}`, 1]))))
  test('$contains with 101 values is 400', () =>
    badFilter({ 'custom.labels': { $contains: Array.from({ length: 101 }, (_, i) => `v${i}`) } }))
  test('$in with 101 values is 400', () =>
    badFilter({ status: { $in: Array.from({ length: 101 }, (_, i) => `v${i}`) } }))
  test('malformed JSON is 400', () => badFilter('{"status":'))
  test('a filter that is not an object is 400', () => badFilter('[1,2]'))
  test('unknown operator $regex is 400 bad_filter', () => badFilter({ status: { $regex: '.*' } }))
  test('$contains on a declared column is 400 bad_filter', () => badFilter({ status: { $contains: 'open' } }))
  test('array value without $in is 400 bad_filter', () => badFilter({ status: [1, 2] }))
  test('object value under $eq is 400 bad_filter', () => badFilter({ status: { $eq: { a: 1 } } }))
  test('object inside $in is 400 bad_filter', () => badFilter({ status: { $in: [{ a: 1 }] } }))
  test('a null filter is 400', () => badFilter('null'))

  test('custom.key on a query is 400 bad_filter', () =>
    denied(`/api/rows/per_project?filter=${encodeURIComponent('{"custom.colour":"rood"}')}`, 400, 'bad_filter'))
  test('custom.key on a dataset without custom is 400 bad_filter', () =>
    denied(`/api/rows/plat?filter=${encodeURIComponent('{"custom.colour":"rood"}')}`, 400, 'bad_filter'))

  test('window with a non-date is 400 bad_window', () =>
    denied("/api/rows/taak?from=2026-01-01' OR 1=1", 400, 'bad_window'))
  test('window to with a non-date is 400 bad_window', () => denied('/api/rows/taak?to=morgen', 400, 'bad_window'))
  test.each(['from=2026-13-45', 'from=2026-02-30', 'to=2026-02-30', 'to=2026-00-10'])('%s is 400 bad_window', (q) =>
    denied(`/api/rows/taak?${q}`, 400, 'bad_window'),
  )
  test.each(['5001', '0', '-1', 'abc', '1.5', ''])('limit=%s is 400 bad_limit', (v) =>
    denied(`/api/rows/taak?limit=${v}`, 400, 'bad_limit'),
  )

  test('window on a source without date column is 400 no_date_column', () =>
    denied('/api/rows/project?from=2026-10-12', 400, 'no_date_column'))
})

describe('rows', () => {
  test('rows of a dataset come back flat with custom parsed and lookups by relation title', async () => {
    const { status, body } = await rows('taak', 'sort=id')
    expect(status).toBe(200)
    expect(body.total).toBe(4)
    expect(body.rows[0]).toEqual({
      id: 1,
      project_id: 1,
      description: 'een',
      status: 'open',
      prio: 2,
      start_at: '2026-10-12T09:00',
      day: '2026-10-12',
      afgerond: false,
      title: 'een',
      custom: { colour: 'rood', labels: ['a', 'b'] },
      lookups: { project_id: { id: 1, title: 'Alfa' } },
    })
    expect(body.rows[1].afgerond).toBe(true)
    expect(body.rows[2].custom).toEqual({})
  })

  test('a null relation value gives a null lookup', async () => {
    sqlite.run('PRAGMA foreign_keys = OFF')
    sqlite.run('DELETE FROM project WHERE id = 2')
    const { body } = await rows('taak', 'sort=id')
    expect(body.rows[2].lookups).toEqual({ project_id: null })
  })

  test('a lookup to a row whose title is null gives title empty', async () => {
    const groep = defineDataset({
      name: 'groep',
      label: 'Groepen',
      title: 'name',
      custom: false,
      columns: { name: { type: 'text', label: 'Name', nullable: true } },
    })
    const lid = defineDataset({
      name: 'lid',
      label: 'Leden',
      title: 'name',
      custom: false,
      columns: {
        name: { type: 'text', label: 'Name' },
        groep_id: { type: 'integer', label: 'Groep', relation: 'groep' },
      },
    })
    const nullTitle: Domain = {
      datasets: [groep, lid],
      queries: [],
      seed: (insert) => {
        insert('groep', [{ name: null }])
        insert('lid', [{ name: 'x', groep_id: 1 }])
      },
      views: [],
    }
    sqlite = new Database(':memory:')
    migrate(sqlite, nullTitle)
    seedDomain(sqlite, nullTitle)
    app = testEngine(sqlite, nullTitle)
    cookie = await signIn(app)
    const { body } = await rows('lid')
    expect(body.rows[0].lookups).toEqual({ groep_id: { id: 1, title: '' } })
  })

  test('a view is served through the same route with its declared relation lookups', async () => {
    const { body } = await rows('per_project', 'sort=id')
    expect(body.total).toBe(3)
    expect(body.rows[0]).toEqual({
      id: 1,
      project_id: 1,
      name: 'Alfa',
      day: '2026-10-12',
      aantal: 2,
      title: 'Alfa',
      custom: {},
      lookups: { project_id: { id: 1, title: 'Alfa' } },
    })
  })

  test('rows with deleted_at set are not returned', async () => {
    sqlite.run("UPDATE taak SET deleted_at = '2026-10-13' WHERE id = 1")
    const { body } = await rows('taak')
    expect(body.rows.map((r: { id: number }) => r.id).sort()).toEqual([2, 3, 4])
    expect(body.total).toBe(3)
  })

  test('a filter matching nothing is 200 with rows [] and total 0', async () => {
    const { status, body } = await filtered('taak', { status: 'bestaat-niet' })
    expect({ status, rows: body.rows, total: body.total }).toEqual({ status: 200, rows: [], total: 0 })
  })

  test('sort -start_at orders descending', async () => {
    const { body } = await rows('taak', 'sort=-start_at')
    expect(body.rows.map((r: { id: number }) => r.id)).toEqual([4, 3, 1, 2])
  })

  test('group day orders by day before sort', async () => {
    const { body } = await rows('taak', 'group=day&sort=-start_at')
    expect(body.rows.map((r: { id: number }) => r.id)).toEqual([1, 2, 3, 4])
  })

  test('from/to keeps rows whose date column is inside the inclusive window', async () => {
    const { body } = await rows('taak', 'from=2026-10-13&to=2026-10-14&sort=id')
    expect(body.rows.map((r: { id: number }) => r.id)).toEqual([3])
    const both = await rows('taak', 'from=2026-10-12&to=2026-10-12&sort=id')
    expect(both.body.rows.map((r: { id: number }) => r.id)).toEqual([1, 2])
    const open = await rows('per_project', 'from=2026-10-14')
    expect(open.body.total).toBe(2)
  })

  test('unknown parameters are ignored', async () => {
    expect((await rows('taak', 'search=een')).body.total).toBe(4)
  })

  test('schema lists every declared source and no saved views: GET /api/views serves those', async () => {
    const { status, body } = await get('/api/schema')
    expect(status).toBe(200)
    expect(Object.keys(body.sources)).toEqual(['project', 'taak', 'plat', 'note', 'per_project', 'note_lijst'])
    expect(body.sources.taak).toMatchObject({ kind: 'dataset', label: 'Taken', title: 'description', date: 'day' })
    expect(body.sources.taak.columns.project_id).toEqual({ type: 'integer', label: 'Project', relation: 'project' })
    expect(body.sources.project.date).toBeNull()
    expect(body.sources.per_project.kind).toBe('query')
    expect(Object.keys(body)).toEqual(['sources'])
  })

  test('an unexpected failure is 500 internal without SQL', async () => {
    sqlite.run('DROP TABLE taak')
    const log = console.error
    console.error = () => {}
    const { status, body } = await rows('taak')
    console.error = log
    expect(status).toBe(500)
    expect(body).toEqual({ code: 'internal', message: 'Internal error' })
  })
})

describe('limit', () => {
  test('limit=2 returns 2 rows and total counts all matching rows', async () => {
    const { status, body } = await rows('taak', 'sort=id&limit=2')
    expect({ status, rows: body.rows.length, total: body.total }).toEqual({ status: 200, rows: 2, total: 4 })
  })

  test('total counts the filtered set, not the page', async () => {
    const { body } = await rows('taak', `limit=1&filter=${encodeURIComponent('{"status":"open"}')}`)
    expect({ rows: body.rows.length, total: body.total }).toEqual({ rows: 1, total: 3 })
  })

  test('default limit is 5000', async () => {
    const insert = sqlite.prepare(
      "INSERT INTO taak (project_id, description, status, start_at, day) VALUES (1, 'x', 'open', '2026-10-12T09:00', '2026-10-12')",
    )
    sqlite.transaction(() => {
      for (let i = 0; i < 4997; i++) insert.run()
    })()
    const { body } = await rows('taak')
    expect({ rows: body.rows.length, total: body.total }).toEqual({ rows: 5000, total: 5001 })
  })
})

describe('cost', () => {
  test('a 100-value $contains over 20k rows answers within 2600 ms, count included', async () => {
    const all = Array.from({ length: 100 }, (_, i) => `v${i}`)
    const insert = sqlite.prepare(
      "INSERT INTO taak (project_id, description, status, start_at, day, custom) VALUES (1, 'x', 'open', '2026-10-12T09:00', '2026-10-12', ?)",
    )
    sqlite.transaction(() => {
      for (let i = 0; i < 20_000; i++) insert.run(JSON.stringify({ labels: i % 1000 === 0 ? all : all.slice(0, 99) }))
    })()
    const started = performance.now()
    const { status, body } = await filtered('taak', { 'custom.labels': { $contains: all } })
    const took = performance.now() - started
    console.log(`$contains 100 values over 20k rows: ${took.toFixed(0)} ms`)
    expect({ status, total: body.total, rows: body.rows.length }).toEqual({ status: 200, total: 20, rows: 20 })
    expect(took).toBeLessThan(2600)
  })
})

describe('title through a relation', () => {
  const groep = defineDataset({
    name: 'groep',
    label: 'Groepen',
    title: 'name',
    custom: false,
    columns: { name: { type: 'text', label: 'Name' } },
  })
  const regel = defineDataset({
    name: 'regel',
    label: 'Regels',
    title: { via: 'groep_id', else: 'reason' },
    custom: false,
    columns: {
      groep_id: { type: 'integer', label: 'Groep', relation: 'groep', nullable: true },
      reason: { type: 'text', label: 'Reason', nullable: true },
    },
  })
  const via: Domain = {
    datasets: [groep, regel],
    queries: [],
    writers: { regel: { create: (v) => v } },
    seed: (insert) => {
      insert('groep', [{ name: 'Alfa' }, { name: 'Beta' }])
      insert('regel', [{ groep_id: 1 }, { groep_id: null, reason: 'ziek' }, { groep_id: 2, reason: 'x' }])
    },
    views: [],
  }

  beforeEach(async () => {
    sqlite = new Database(':memory:')
    migrate(sqlite, via)
    seedDomain(sqlite, via)
    app = testEngine(sqlite, via)
    cookie = await signIn(app)
  })

  test('resolves to the target title, else the fallback column, else empty', async () => {
    const { body } = await rows('regel', 'sort=id')
    expect(body.rows.map((r: { title: string }) => r.title)).toEqual(['Alfa', 'ziek', 'Beta'])
    sqlite.run('INSERT INTO regel (groep_id, reason) VALUES (NULL, NULL)')
    expect((await rows('regel', 'sort=-id&limit=1')).body.rows[0].title).toBe('')
  })

  test('renaming the target changes the title on the next read', async () => {
    sqlite.run("UPDATE groep SET name = 'Gamma' WHERE id = 1")
    expect((await rows('regel', 'sort=id')).body.rows[0].title).toBe('Gamma')
  })

  test('a write reply carries the title', async () => {
    const res = await app.request('/api/rows/regel', {
      method: 'POST',
      headers: { host: '127.0.0.1:4310', 'content-type': 'application/json', cookie },
      body: JSON.stringify({ groep_id: 2 }),
    })
    expect(res.status).toBe(201)
    expect(((await res.json()) as { title: string }).title).toBe('Beta')
  })

  test('/schema keeps title as the else column and names the relation', async () => {
    const { body } = await get('/api/schema')
    expect(body.sources.regel).toMatchObject({ title: 'reason', title_via: 'groep_id' })
    expect(body.sources.groep.title_via).toBeUndefined()
  })
})

test('a column title is carried as title on every row', async () => {
  expect((await rows('plat')).body.rows[0].title).toBe('x')
})

describe('offset', () => {
  test('offset=2&limit=2 pages with an exact total', async () => {
    const all = (await rows('taak', 'sort=id')).body.rows.map((r: { id: number }) => r.id)
    const { body } = await rows('taak', 'sort=id&offset=2&limit=2')
    expect(body.rows.map((r: { id: number }) => r.id)).toEqual(all.slice(2, 4))
    expect(body.total).toBe(all.length)
  })

  test('offset defaults to 0', async () => {
    expect((await rows('taak', 'sort=id&limit=1')).body.rows[0].id).toBe(1)
  })

  test.each(['-1', 'abc', '1.5', ''])('offset=%s is 400 bad_offset', (v) =>
    denied(`/api/rows/taak?offset=${v}`, 400, 'bad_offset'),
  )
})
