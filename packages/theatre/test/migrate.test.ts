import { Database } from 'bun:sqlite'
import { expect, test } from 'bun:test'
import { existsSync, mkdtempSync, readFileSync } from 'node:fs'
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

const step1 = readFileSync(join(import.meta.dir, 'fixtures', 'step-1.sql'), 'utf8')
const columns = (sqlite: Database, table: string) =>
  (sqlite.query(`PRAGMA table_info(${table})`).all() as { name: string }[]).map((c) => c.name)
const hasTable = (sqlite: Database, name: string) =>
  sqlite.query("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?").get(name) !== null

// Characterises Tasks 3, 4, 9b and 10 against a database written by the step-1 code (fixtures/step-1.sql).
test('a step-1 theatre database migrates to step 2 keeping every row, revision and id', () => {
  const file = join(mkdtempSync(join(tmpdir(), 'wt-step1-')), 'db.sqlite')
  const sqlite = new Database(file, { create: true })
  sqlite.run(step1)
  const rows = (table: string) =>
    sqlite.query(`SELECT * FROM "${table}" ORDER BY rowid`).all() as Record<string, unknown>[]
  const names = (sqlite.query("SELECT name FROM sqlite_master WHERE type = 'table'").all() as { name: string }[])
    .map((t) => t.name)
    .filter((n) => !n.startsWith('sqlite_') && n !== '_migrations')
  const before = Object.fromEntries(names.map((n) => [n, rows(n)]))
  expect(columns(sqlite, 'toewijzing')).not.toContain('rol_id')
  expect(before.revision?.length).toBeGreaterThan(0)

  migrate(sqlite, theatre)

  expect(columns(sqlite, 'toewijzing')).toEqual(expect.arrayContaining(['rol_id', 'aantal']))
  expect(columns(sqlite, 'saved_view')).toContain('for_owners')
  expect(hasTable(sqlite, 'record_link')).toBe(true)
  expect(hasTable(sqlite, 'action_token')).toBe(true)
  expect(columns(sqlite, 'account')).toEqual(expect.arrayContaining(['kind', 'name', 'token_hash']))
  expect(existsSync(`${file}.pre-migrate`)).toBe(true)

  const added: Record<string, string[]> = {
    toewijzing: ['rol_id', 'aantal'],
    beschikbaarheid: ['soort'],
    saved_view: ['for_owners'],
    account: ['kind', 'name', 'token_hash'],
  }
  for (const n of names) {
    const dropped = added[n] ?? []
    const stripped = rows(n).map((r) => Object.fromEntries(Object.entries(r).filter(([k]) => !dropped.includes(k))))
    expect(stripped).toEqual(before[n] as Record<string, unknown>[])
  }
  expect(sqlite.query('PRAGMA foreign_key_check').all()).toEqual([])
  expect(sqlite.query('PRAGMA integrity_check').get()).toEqual({ integrity_check: 'ok' })
})

test('imported Toewijzingen keep a null role and take one place on migrating', () => {
  const sqlite = new Database(':memory:')
  sqlite.run(step1)
  const count = (sqlite.query('SELECT count(*) AS n FROM toewijzing').get() as { n: number }).n
  expect(count).toBeGreaterThan(0)

  migrate(sqlite, theatre)

  const rows = sqlite.query('SELECT rol_id, aantal FROM toewijzing').all()
  expect(rows).toHaveLength(count)
  expect(rows.every((r) => (r as { rol_id: unknown }).rol_id === null)).toBe(true)
  expect(rows.every((r) => (r as { aantal: unknown }).aantal === 1)).toBe(true)
})

test('the migrated database serves its rows and runs the Task 10 query', async () => {
  const sqlite = new Database(':memory:')
  sqlite.run(step1)
  migrate(sqlite, theatre)
  const app = testEngine(sqlite, theatre)
  const cookie = await signIn(app)
  const res = await app.request('/api/rows/toewijzing', { headers: { host: '127.0.0.1:4310', cookie } })
  expect(res.status).toBe(200)
  expect(sqlite.query('SELECT count(*) FROM mijn_producties').get()).toBeDefined()
})

test('soort is added to an existing beschikbaarheid table by ALTER', () => {
  const file = join(mkdtempSync(join(tmpdir(), 'wt-soort-')), 'db.sqlite')
  const sqlite = new Database(file, { create: true })
  const withoutSoort: Domain = {
    ...theatre,
    datasets: theatre.datasets.map((d) =>
      d.name === 'beschikbaarheid'
        ? defineDataset({ ...d, columns: Object.fromEntries(Object.entries(d.columns).filter(([k]) => k !== 'soort')) })
        : d,
    ),
  }
  migrate(sqlite, withoutSoort)
  sqlite.run("INSERT INTO persoon (voornaam, achternaam, weergavenaam) VALUES ('Tine', 'Proef', 'Tine Proef')")
  sqlite.run(
    "INSERT INTO beschikbaarheid (persoon_id, start_at, eind_at) VALUES (1, '2026-10-20T09:00', '2026-10-20T17:00')",
  )
  expect(columns(sqlite, 'beschikbaarheid')).not.toContain('soort')

  migrate(sqlite, theatre)

  expect(existsSync(`${file}.pre-migrate`)).toBe(false)
  expect(sqlite.query('SELECT soort FROM beschikbaarheid').all()).toEqual([{ soort: 'afwezig' }])
})
