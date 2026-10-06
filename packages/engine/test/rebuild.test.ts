import { Database } from 'bun:sqlite'
import { expect, test } from 'bun:test'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { type Domain, defineDataset, migrate } from '../src'
import { send } from './fixture'
import { signIn, testEngine } from './sign-in'

const parent = defineDataset({
  name: 'parent',
  label: 'Parents',
  title: 'name',
  custom: true,
  columns: { name: { type: 'text', label: 'Name' } },
})

const childColumns = {
  label: { type: 'text', label: 'Label' },
  parent_id: { type: 'integer', label: 'Parent', nullable: true },
} as const

const child = (columns: Record<string, object> = childColumns) =>
  defineDataset({ name: 'child', label: 'Children', title: 'label', custom: false, columns: columns as never })

const open = { create: (v: Record<string, unknown>) => v, update: (v: Record<string, unknown>) => v, delete: () => {} }

const domainOf = (p = parent, c = child()): Domain => ({
  datasets: [p, c],
  queries: [],
  writers: { parent: open, child: open },
  seed: () => {},
  views: [],
})

const snapshot = (sqlite: Database) => ({
  parent: sqlite.query('SELECT * FROM parent ORDER BY id').all(),
  child: sqlite.query('SELECT * FROM child ORDER BY id').all(),
  revision: sqlite.query('SELECT * FROM revision ORDER BY id').all(),
  sequence: sqlite.query('SELECT * FROM sqlite_sequence ORDER BY name').all(),
})

test('a populated database survives a rebuild with every row, revision and id', async () => {
  const file = join(mkdtempSync(join(tmpdir(), 'wt-rebuild-')), 'db.sqlite')
  const sqlite = new Database(file, { create: true })
  migrate(sqlite, domainOf())
  const first = testEngine(sqlite, domainOf())
  const call = send(first, await signIn(first))
  const body = (v: object) => ({ body: JSON.stringify(v) })

  for (const name of ['Ann', 'Bo', 'Cy'])
    expect((await call('POST', '/api/rows/parent', body({ name }))).status).toBe(201)
  for (const [label, parent_id] of [
    ['a', 1],
    ['b', 2],
    ['c', null],
    ['d', 3],
  ] as const)
    expect((await call('POST', '/api/rows/child', body({ label, parent_id }))).status).toBe(201)
  expect((await call('PATCH', '/api/rows/child/2', body({ label: 'b2', parent_id: 1 }))).status).toBe(200)
  expect((await call('PATCH', '/api/rows/parent/3', body({ name: 'Cyd' }))).status).toBe(200)
  expect((await call('DELETE', '/api/rows/child/4')).status).toBe(200)
  const before = snapshot(sqlite)
  expect(before.revision.length).toBeGreaterThan(8)

  const withNote = defineDataset({
    ...parent,
    columns: { ...parent.columns, note: { type: 'text', label: 'Note', nullable: true } },
  })
  const related = child({ ...childColumns, parent_id: { ...childColumns.parent_id, relation: 'parent' } })
  const next = domainOf(withNote, related)
  migrate(sqlite, next)

  const after = snapshot(sqlite)
  expect((after.parent as Record<string, unknown>[]).map(({ note: _n, ...rest }) => rest)).toEqual(before.parent)
  expect(after.child).toEqual(before.child)
  expect(after.revision).toEqual(before.revision)
  expect(after.sequence).toEqual(before.sequence)
  expect(sqlite.query('PRAGMA foreign_key_check').all()).toEqual([])
  expect(sqlite.query('PRAGMA foreign_keys').get()).toEqual({ foreign_keys: 1 })

  const rebuilt = testEngine(sqlite, next)
  const again = send(rebuilt, await signIn(rebuilt))
  const created = await again('POST', '/api/rows/child', body({ label: 'e', parent_id: 1 }))
  expect(created.status).toBe(201)
  expect(created.body.id).toBe(5)
  const missing = await again('PATCH', '/api/rows/child/1', body({ parent_id: 99 }))
  expect(missing.status).toBeGreaterThanOrEqual(400)
  expect(missing.status).toBeLessThan(500)
})
