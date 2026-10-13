import type { Database } from 'bun:sqlite'
import { chmodSync, rmSync, writeFileSync } from 'node:fs'
import { seededLayout } from './dashboard'
import { datasetDdl, viewDdl } from './ddl'
import type { DatasetDecl, Domain, QueryDecl } from './declare'
import { engineTables, MIGRATIONS } from './engine-tables'
import { MigrationError } from './migration-error'
import { savedView } from './saved-view'
import { applyChange, type Change, planChange } from './schema-diff'
import { validateDomain } from './validate'
import { SYSTEM, SYSTEM_OWNER, viewKey } from './views'
import { revise } from './writes'

const hashOf = (statements: string[]): string =>
  new Bun.CryptoHasher('sha256').update(statements.join(';\n')).digest('hex')

function appliedHash(sqlite: Database, source: string): string | undefined {
  const row = sqlite.query(`SELECT hash FROM ${MIGRATIONS} WHERE source = ?`).get(source) as { hash: string } | null
  return row?.hash
}

function record(sqlite: Database, source: string, hash: string): void {
  sqlite
    .query(
      `INSERT INTO ${MIGRATIONS} (source, hash, applied_at) VALUES (?, ?, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
       ON CONFLICT(source) DO UPDATE SET hash = excluded.hash, applied_at = excluded.applied_at`,
    )
    .run(source, hash)
}

interface Step {
  dataset: DatasetDecl
  hash: string
  change: Change | 'create'
}

// Every refusal is raised here, before the backup and before any write.
function planSteps(sqlite: Database, datasets: DatasetDecl[]): Step[] {
  return datasets.flatMap((dataset): Step[] => {
    const hash = hashOf(datasetDdl(dataset))
    const previous = appliedHash(sqlite, dataset.name)
    if (previous === hash) return []
    return [{ dataset, hash, change: previous ? planChange(sqlite, dataset) : 'create' }]
  })
}

function backUp(sqlite: Database): void {
  const file = sqlite.filename
  if (!file || file === ':memory:') return
  const copy = `${file}.pre-migrate`
  rmSync(copy, { force: true })
  // It holds personal data and token hashes: made empty and owner-only first, so it is never readable by others.
  writeFileSync(copy, '', { mode: 0o600 })
  sqlite.query('VACUUM INTO ?').run(copy)
  chmodSync(copy, 0o600)
  console.log(`migrate: copied the database to ${copy} before rebuilding`)
}

const violations = (sqlite: Database): Set<string> =>
  new Set(
    sqlite
      .query('PRAGMA foreign_key_check')
      .all()
      .map((row) => JSON.stringify(row)),
  )

// Every view goes, declared or left over: a rename re-reads them all, and one on a missing table fails it.
function dropViews(sqlite: Database): void {
  const views = sqlite.query("SELECT name FROM sqlite_master WHERE type = 'view'").all() as { name: string }[]
  for (const { name } of views) sqlite.run(`DROP VIEW "${name}"`)
}

function applySteps(sqlite: Database, steps: Step[], queries: QueryDecl[]): void {
  const changed = steps.some((s) => s.change !== 'create')
  const before = changed ? violations(sqlite) : null
  if (changed) dropViews(sqlite)
  for (const { dataset, hash, change } of steps) {
    if (change === 'create') for (const statement of datasetDdl(dataset)) sqlite.run(statement)
    else applyChange(sqlite, dataset, change)
    record(sqlite, dataset.name, hash)
  }
  for (const q of queries) {
    const statements = viewDdl(q)
    const hash = hashOf(statements)
    if (!changed && appliedHash(sqlite, q.name) === hash) continue
    for (const statement of statements) sqlite.run(statement)
    record(sqlite, q.name, hash)
  }
  if (!before) return
  const broken = [...violations(sqlite)].filter((v) => !before.has(v))
  if (broken.length > 0)
    throw new MigrationError('foreign_key_check', `foreign keys broken by the migration: ${broken.join(', ')}`)
}

export function migrate(sqlite: Database, domain: Domain): void {
  validateDomain(domain)
  sqlite.run(`CREATE TABLE IF NOT EXISTS ${MIGRATIONS} (source TEXT PRIMARY KEY, hash TEXT, applied_at TEXT)`)
  const steps = planSteps(sqlite, [...engineTables, ...domain.datasets])
  if (steps.some((s) => s.change !== 'create' && s.change.kind === 'rebuild')) backUp(sqlite)
  // SQLite ignores this pragma inside a transaction, so it brackets the whole migration.
  sqlite.run('PRAGMA foreign_keys = OFF')
  try {
    sqlite.transaction(() => applySteps(sqlite, steps, domain.queries))()
  } finally {
    sqlite.run('PRAGMA foreign_keys = ON')
  }
  sqlite.transaction(() => adoptUnowned(sqlite, domain))()
}

function moveView(sqlite: Database, id: number, owner: number, now: string): void {
  sqlite.query('UPDATE saved_view SET owner_id = ?, updated_at = ? WHERE id = ?').run(owner, now, id)
  revise(sqlite, savedView, id, [['owner_id', 0, owner]], now, SYSTEM_OWNER)
}

// Views from before accounts were stored with owner 0: a seed goes to the system owner, any other to an administrator.
function adoptUnowned(sqlite: Database, domain: Domain): void {
  type Orphan = { id: number; name: string; source: string | null }
  const orphans = sqlite.query('SELECT id, name, source FROM saved_view WHERE owner_id = 0').all() as Orphan[]
  if (orphans.length === 0) return
  const sql = "SELECT MIN(id) AS id FROM account WHERE role = 'administrator'"
  const admin = (sqlite.query(sql).get() as { id: number | null }).id
  const isSeed = (v: Orphan) =>
    domain.views.some((seed) => viewKey(seed.name, seed.source) === viewKey(v.name, v.source))
  const now = new Date().toISOString()
  let left = 0
  for (const view of orphans) {
    const owner = isSeed(view) ? SYSTEM_OWNER : admin
    if (owner === null) left++
    else moveView(sqlite, view.id, owner, now)
  }
  if (left > 0) console.log(`migrate: ${left} views have no owner; the first administrator gets them once one exists`)
}

function insertRows(sqlite: Database, table: string, rows: Record<string, unknown>[]): void {
  for (const row of rows) {
    const columns = Object.keys(row)
    const values = Object.values(row).map((v) =>
      typeof v === 'boolean' ? Number(v) : v !== null && typeof v === 'object' ? JSON.stringify(v) : v,
    )
    sqlite
      .query(`INSERT INTO ${table} (${columns.join(', ')}) VALUES (${columns.map(() => '?').join(', ')})`)
      .run(...(values as (string | number | null)[]))
  }
}

export function seedDomain(sqlite: Database, domain: Domain): void {
  sqlite.transaction(() => {
    domain.seed((dataset, rows) => insertRows(sqlite, dataset, rows))
    const system = { owner_id: SYSTEM_OWNER, shared: true }
    // A dashboard's tiles name seeded views, so it goes in after them.
    insertRows(
      sqlite,
      'saved_view',
      domain.views.filter((v) => v.skin !== 'dashboard').map((v) => ({ ...v, ...system })),
    )
    for (const seed of domain.views.filter((v) => v.skin === 'dashboard')) {
      insertRows(sqlite, 'saved_view', [{ ...seed, layout: seededLayout(sqlite, domain, seed, SYSTEM), ...system }])
    }
  })()
}
