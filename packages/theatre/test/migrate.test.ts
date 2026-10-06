import { Database } from 'bun:sqlite'
import { expect, test } from 'bun:test'
import { existsSync, mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { type Domain, defineDataset, migrate, seedDomain } from '@worktable/engine'
import { signIn, testEngine } from '@worktable/engine/test/sign-in'
import theatre from '../src'

const extra = { spare_ref: { type: 'integer', label: 'Spare', nullable: true, readonly: true } } as const

const withExtra: Domain = {
  ...theatre,
  datasets: theatre.datasets.map((d) => defineDataset({ ...d, columns: { ...d.columns, ...extra } })),
}

const tables = (sqlite: Database) =>
  Object.fromEntries(theatre.datasets.map((d) => [d.name, sqlite.query(`SELECT * FROM ${d.name} ORDER BY id`).all()]))

test('a seeded theatre database takes a new nullable column by ALTER, keeping every row', async () => {
  const file = join(mkdtempSync(join(tmpdir(), 'wt-theatre-')), 'db.sqlite')
  const sqlite = new Database(file, { create: true })
  migrate(sqlite, theatre)
  seedDomain(sqlite, theatre)
  const before = tables(sqlite)
  const app = testEngine(sqlite, theatre)
  const cookie = await signIn(app)
  const read = async () => {
    const res = await app.request('/api/rows/voorstellingen', { headers: { host: '127.0.0.1:4310', cookie } })
    return res.json()
  }
  const shows = await read()

  migrate(sqlite, withExtra)

  expect(existsSync(`${file}.pre-migrate`)).toBe(false)
  const after = tables(sqlite)
  for (const d of theatre.datasets) {
    const rows = after[d.name] as Record<string, unknown>[]
    expect(rows.every((r) => r.spare_ref === null)).toBe(true)
    expect(rows.map(({ spare_ref: _l, ...rest }) => rest)).toEqual(before[d.name] as Record<string, unknown>[])
  }
  expect(await read()).toEqual(shows)
})
