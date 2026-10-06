import { Database } from 'bun:sqlite'
import { expect, test } from 'bun:test'
import { existsSync, mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createEngine, type Domain, defineDataset, migrate, seedDomain } from '@worktable/engine'
import theatre from '../src'

const legacy = { legacy_post_id: { type: 'integer', label: 'Legacy post', nullable: true, readonly: true } } as const

const withLegacy: Domain = {
  ...theatre,
  datasets: theatre.datasets.map((d) => defineDataset({ ...d, columns: { ...d.columns, ...legacy } })),
}

const tables = (sqlite: Database) =>
  Object.fromEntries(theatre.datasets.map((d) => [d.name, sqlite.query(`SELECT * FROM ${d.name} ORDER BY id`).all()]))

test('a seeded theatre database takes legacy_post_id by ALTER, keeping every row', async () => {
  const file = join(mkdtempSync(join(tmpdir(), 'wt-theatre-')), 'db.sqlite')
  const sqlite = new Database(file, { create: true })
  migrate(sqlite, theatre)
  seedDomain(sqlite, theatre)
  const before = tables(sqlite)
  const read = async () => {
    const res = await createEngine(sqlite, theatre, { port: 4310 }).request('/api/rows/voorstellingen', {
      headers: { host: '127.0.0.1:4310' },
    })
    return res.json()
  }
  const shows = await read()

  migrate(sqlite, withLegacy)

  expect(existsSync(`${file}.pre-migrate`)).toBe(false)
  const after = tables(sqlite)
  for (const d of theatre.datasets) {
    const rows = after[d.name] as Record<string, unknown>[]
    expect(rows.every((r) => r.legacy_post_id === null)).toBe(true)
    expect(rows.map(({ legacy_post_id: _l, ...rest }) => rest)).toEqual(before[d.name] as Record<string, unknown>[])
  }
  expect(await read()).toEqual(shows)
})
