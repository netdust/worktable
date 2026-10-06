import type { Database } from 'bun:sqlite'
import { rmSync } from 'node:fs'
import { authTables } from './auth-tables'
import { datasetDdl, viewDdl } from './ddl'
import type { DatasetDecl, Domain, QueryDecl } from './declare'
import { MigrationError } from './migration-error'
import { revision } from './revision'
import { savedView } from './saved-view'
import { applyChange, type Change, planChange } from './schema-diff'
import { validateDomain } from './validate'

const hashOf = (statements: string[]): string =>
  new Bun.CryptoHasher('sha256').update(statements.join(';\n')).digest('hex')

function appliedHash(sqlite: Database, source: string): string | undefined {
  const row = sqlite.query('SELECT hash FROM _migrations WHERE source = ?').get(source) as { hash: string } | null
  return row?.hash
}

function record(sqlite: Database, source: string, hash: string): void {
  sqlite
    .query(
      `INSERT INTO _migrations (source, hash, applied_at) VALUES (?, ?, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
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
  sqlite.query('VACUUM INTO ?').run(copy)
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
  sqlite.run('CREATE TABLE IF NOT EXISTS _migrations (source TEXT PRIMARY KEY, hash TEXT, applied_at TEXT)')
  const steps = planSteps(sqlite, [savedView, revision, ...authTables, ...domain.datasets])
  if (steps.some((s) => s.change !== 'create' && s.change.kind === 'rebuild')) backUp(sqlite)
  // SQLite ignores this pragma inside a transaction, so it brackets the whole migration.
  sqlite.run('PRAGMA foreign_keys = OFF')
  try {
    sqlite.transaction(() => applySteps(sqlite, steps, domain.queries))()
  } finally {
    sqlite.run('PRAGMA foreign_keys = ON')
  }
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

// No account has this id (account ids start at 1), so a seeded view belongs to no one.
const SEED_OWNER = 0

export function seedDomain(sqlite: Database, domain: Domain): void {
  sqlite.transaction(() => {
    domain.seed((dataset, rows) => insertRows(sqlite, dataset, rows))
    insertRows(
      sqlite,
      'saved_view',
      domain.views.map((v) => ({ ...v, owner_id: SEED_OWNER, shared: true })),
    )
  })()
}
