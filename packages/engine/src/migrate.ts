import type { Database } from 'bun:sqlite'
import { datasetDdl, viewDdl } from './ddl'
import type { Domain } from './declare'
import { savedView } from './saved-view'
import { validateDomain } from './validate'

export class MigrationError extends Error {
  constructor(
    readonly source: string,
    message: string,
  ) {
    super(message)
    this.name = 'MigrationError'
  }
}

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

function apply(sqlite: Database, source: string, statements: string[], changeable: boolean): void {
  const hash = hashOf(statements)
  const previous = appliedHash(sqlite, source)
  if (previous === hash) return
  if (previous && !changeable) {
    throw new MigrationError(
      source,
      `dataset "${source}" changed since it was created; ALTER and rebuild are not built yet`,
    )
  }
  for (const statement of statements) sqlite.run(statement)
  record(sqlite, source, hash)
}

export function migrate(sqlite: Database, domain: Domain): void {
  validateDomain(domain)
  sqlite.run('PRAGMA foreign_keys = ON')
  sqlite.transaction(() => {
    sqlite.run('CREATE TABLE IF NOT EXISTS _migrations (source TEXT PRIMARY KEY, hash TEXT, applied_at TEXT)')
    for (const dataset of [savedView, ...domain.datasets]) apply(sqlite, dataset.name, datasetDdl(dataset), false)
    for (const query of domain.queries) apply(sqlite, query.name, viewDdl(query), true)
  })()
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
    insertRows(
      sqlite,
      'saved_view',
      domain.views.map((v) => ({ ...v })),
    )
  })()
}
