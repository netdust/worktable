import { Database } from 'bun:sqlite'
import { beforeEach, describe, expect, test } from 'bun:test'
import type { Hono } from 'hono'
import {
  type ColumnDecl,
  createEngine,
  type DatasetDecl,
  type Domain,
  DomainError,
  defineDataset,
  migrate,
  seedDomain,
  validateDomain,
} from '../src'

const text: ColumnDecl = { type: 'text', label: 'T', nullable: true }
const rel = (relation: string): ColumnDecl => ({ type: 'integer', label: 'R', relation, nullable: true })
const states: ColumnDecl = { type: 'text', label: 'S', options: { a: 'A', b: 'B', c: 'C' } }

const member = defineDataset({ name: 'member', label: 'P', title: 'name', custom: false, columns: { name: text } })
const taak = defineDataset({
  name: 'taak',
  label: 'T',
  title: 'name',
  date: 'day',
  custom: false,
  columns: { name: text, day: { type: 'date', label: 'D' } },
})
const verlof = defineDataset({
  name: 'verlof',
  label: 'V',
  title: 'reason',
  date: 'start_at',
  custom: false,
  columns: { member_id: rel('member'), reason: text, start_at: { type: 'date', label: 'S' }, end_at: text },
})
const matrix = {
  down: 'taak_id',
  across: 'member_id',
  label: 'name',
  cell: 'state',
  note: 'note',
  keys: { x: 'a', y: 'b' },
  marks: { a: '?', b: '!' },
  count: 'b',
  away: { dataset: 'verlof', across: 'member_id', label: 'reason', end: 'end_at' },
}
const join = (over: Partial<DatasetDecl> = {}): DatasetDecl =>
  defineDataset({
    name: 'koppel',
    label: 'K',
    title: { via: 'member_id', else: 'name' },
    custom: false,
    columns: { taak_id: rel('taak'), member_id: rel('member'), name: text, state: states, note: text },
    matrix,
    ...over,
  })

const domainOf = (...datasets: DatasetDecl[]): Domain => ({
  datasets,
  queries: [],
  seed: (insert) => {
    insert('member', [{ name: 'Ann' }, { name: 'Bob' }])
    insert('taak', [
      { name: 'in', day: '2026-10-05' },
      { name: 'in2', day: '2026-10-06' },
      { name: 'out', day: '2026-11-01' },
    ])
    insert('koppel', [
      { taak_id: 1, member_id: 1, state: 'a' },
      { taak_id: 1, member_id: null, name: 'Vrij', state: 'b' },
      { taak_id: 2, member_id: 2, state: 'a' },
      { taak_id: 3, member_id: 1, state: 'a' },
    ])
  },
  views: [],
})

const full = (): Domain => domainOf(member, taak, verlof, join())

function failure(d: Domain): DomainError {
  try {
    validateDomain(d)
  } catch (e) {
    if (e instanceof DomainError) return e
    throw e
  }
  throw new Error('expected DomainError')
}

const withMatrix = (over: Record<string, unknown>): Domain =>
  domainOf(member, taak, verlof, join({ matrix: { ...matrix, ...over } as DatasetDecl['matrix'] }))

describe('validateDomain: matrix', () => {
  test('a valid matrix passes', () => expect(() => validateDomain(full())).not.toThrow())

  const bad: [string, Record<string, unknown>, string][] = [
    ['down not a relation', { down: 'name' }, 'name'],
    ['down undeclared', { down: 'nope' }, 'nope'],
    ['across not a relation', { across: 'state' }, 'state'],
    ['label not text', { label: 'taak_id' }, 'taak_id'],
    ['note undeclared', { note: 'nope' }, 'nope'],
    ['cell without options', { cell: 'name' }, 'name'],
    ['key to a non-option', { keys: { x: 'z' } }, 'z'],
    ['mark on a non-option', { marks: { z: '?' } }, 'z'],
    ['count a non-option', { count: 'z' }, 'z'],
    ['away dataset undeclared', { away: { ...matrix.away, dataset: 'nope' } }, 'nope'],
    ['away across undeclared', { away: { ...matrix.away, across: 'nope' } }, 'nope'],
    ['away label undeclared', { away: { ...matrix.away, label: 'nope' } }, 'nope'],
    ['away end undeclared', { away: { ...matrix.away, end: 'nope' } }, 'nope'],
    ['away across targets another dataset', { away: { ...matrix.away, across: 'taak_id' } }, 'taak_id'],
  ]
  for (const [name, over, word] of bad) {
    test(`${name} is refused`, () => {
      const e = failure(withMatrix(over))
      expect(e.declaration).toBe('koppel')
      expect(e.bad).toBe(word)
    })
  }

  test('an away dataset without a date is refused', () => {
    const { kind, date, ...rest } = verlof
    const noDate = defineDataset(rest)
    expect(failure(domainOf(member, taak, noDate, join())).bad).toBe('verlof')
  })

  test('two matrices on one down source are refused', () => {
    const second = join({ name: 'tweede' })
    expect(failure(domainOf(member, taak, verlof, join(), second)).bad).toBe('taak_id')
  })
})

describe('GET /rows/<down>?cells=1', () => {
  let app: Hono
  let sqlite: Database

  beforeEach(() => {
    sqlite = new Database(':memory:')
    const d = full()
    migrate(sqlite, d)
    seedDomain(sqlite, d)
    app = createEngine(sqlite, d, { port: 4310 })
  })

  async function get(path: string) {
    const res = await app.request(path, { headers: { host: '127.0.0.1:4310' } })
    // biome-ignore lint/suspicious/noExplicitAny: response bodies are asserted structurally
    return { status: res.status, body: (await res.json()) as Record<string, any> }
  }
  const cells = (query = 'from=2026-10-01&to=2026-10-31') => get(`/api/rows/taak?cells=1&${query}&sort=id`)

  test('each row in the window carries the live join rows of that row, with titles and lookups', async () => {
    const { status, body } = await cells()
    expect(status).toBe(200)
    expect(body.rows.map((r: { id: number }) => r.id)).toEqual([1, 2])
    expect(body.rows[0].cells.map((c: { title: string }) => c.title)).toEqual(['Ann', 'Vrij'])
    expect(body.rows[0].cells[0].lookups.member_id).toEqual({ id: 1, title: 'Ann' })
    expect(body.rows[1].cells.map((c: { member_id: number }) => c.member_id)).toEqual([2])
  })

  test('a soft-deleted join row is absent', async () => {
    sqlite.run("UPDATE koppel SET deleted_at = '2026-10-01T00:00:00Z' WHERE id = 1")
    const { body } = await cells()
    expect(body.rows[0].cells.map((c: { id: number }) => c.id)).toEqual([2])
  })

  test('a row without cells gets an empty list', async () => {
    sqlite.run('DELETE FROM koppel WHERE taak_id = 2')
    expect((await cells()).body.rows[1].cells).toEqual([])
  })

  test('without cells=1 rows carry no cells', async () => {
    expect((await get('/api/rows/taak')).body.rows[0].cells).toBeUndefined()
  })

  test('cells without a window is 400 window_required', async () => {
    for (const q of ['', 'from=2026-10-01', 'to=2026-10-31']) {
      const { status, body } = await get(`/api/rows/taak?cells=1&${q}`)
      expect({ status, code: body.code }).toEqual({ status: 400, code: 'window_required' })
    }
  })

  test('cells over a window of 93 days is 400 window_too_wide; 92 days is served', async () => {
    const wide = await get('/api/rows/taak?cells=1&from=2026-10-01&to=2027-01-01')
    expect({ status: wide.status, code: wide.body.code }).toEqual({ status: 400, code: 'window_too_wide' })
    expect((await get('/api/rows/taak?cells=1&from=2026-10-01&to=2026-12-31')).status).toBe(200)
  })

  test('cells on a source that is no matrix down is 400 no_matrix', async () => {
    const { status, body } = await get('/api/rows/verlof?cells=1&from=2026-10-01&to=2026-10-31')
    expect({ status, code: body.code }).toEqual({ status: 400, code: 'no_matrix' })
  })

  test('the /rows limit bounds the down rows', async () => {
    const { body } = await cells('from=2026-10-01&to=2026-10-31&limit=1')
    expect(body.rows).toHaveLength(1)
  })

  test('more down rows than one query chunk still get their cells', async () => {
    const insert = sqlite.prepare("INSERT INTO taak (name, day) VALUES ('m', '2026-10-10')")
    const link = sqlite.prepare('INSERT INTO koppel (taak_id, member_id, state) VALUES (?, 1, ?)')
    sqlite.transaction(() => {
      for (let i = 0; i < 1500; i++) link.run(Number(insert.run().lastInsertRowid), 'a')
    })()
    const { body } = await cells()
    expect(body.rows.filter((r: { cells: unknown[] }) => r.cells.length === 1)).toHaveLength(1501)
  })

  test('/schema serves the declaration on the join and matrix_join on the down source', async () => {
    const { body } = await get('/api/schema')
    expect(body.sources.koppel.matrix).toEqual(matrix)
    expect(body.sources.taak.matrix_join).toBe('koppel')
    expect(body.sources.verlof.matrix_join).toBeUndefined()
    expect(body.sources.taak.matrix).toBeUndefined()
  })
})
