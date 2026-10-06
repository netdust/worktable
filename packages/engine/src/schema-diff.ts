import type { Database } from 'bun:sqlite'
import { type ColumnSpec, columnDefinition, columnSpecs, indexDdl, indexName, tableDdl } from './ddl'
import type { DatasetDecl } from './declare'
import { MigrationError } from './migration-error'

export type Change =
  | { kind: 'alter'; add: string[]; dropIndexes: string[]; createIndexes: string[] }
  | { kind: 'rebuild' }

interface Stored {
  name: string
  type: string
  notnull: number
  dflt_value: string | null
}

const refuse = (d: DatasetDecl, column: string, reason: string): never => {
  throw new MigrationError(d.name, `dataset "${d.name}" column "${column}": ${reason}`)
}

function storedColumns(sqlite: Database, table: string): Map<string, ColumnSpec> {
  const relations = new Map(
    (sqlite.query(`PRAGMA foreign_key_list(${table})`).all() as { from: string; table: string }[]).map((k) => [
      k.from,
      k.table,
    ]),
  )
  const rows = sqlite.query(`PRAGMA table_info(${table})`).all() as Stored[]
  return new Map(
    rows.map((r) => [
      r.name,
      {
        name: r.name,
        type: r.type,
        notnull: r.notnull === 1,
        dflt: r.dflt_value,
        relation: relations.get(r.name) ?? null,
      },
    ]),
  )
}

// PRAGMA table_info reports an expression default without the parentheses the DDL wrote.
const bare = (dflt: string | null): string | null => dflt?.replace(/^\((.*)\)$/s, '$1') ?? null

const same = (a: ColumnSpec, b: ColumnSpec): boolean =>
  a.type === b.type && a.notnull === b.notnull && bare(a.dflt) === bare(b.dflt) && a.relation === b.relation

const lossless = (from: string, to: string): boolean =>
  from === to || to === 'TEXT' || (from === 'INTEGER' && to === 'REAL')

const hasRows = (sqlite: Database, table: string): boolean =>
  sqlite.query(`SELECT 1 FROM ${table} LIMIT 1`).get() !== null

function checkRefusals(sqlite: Database, d: DatasetDecl, stored: Map<string, ColumnSpec>, filled: boolean): void {
  for (const next of columnSpecs(d)) {
    const was = stored.get(next.name)
    if (!was) {
      if (filled && next.notnull && next.dflt === null)
        refuse(d, next.name, 'a new NOT NULL column needs a default on a table with rows')
      continue
    }
    if (filled && !lossless(was.type, next.type)) refuse(d, next.name, `${was.type} to ${next.type} would lose data`)
    // A default never replaces a NULL the rebuild copies explicitly, so it is no way out.
    if (next.notnull && !was.notnull) {
      const hasNull = sqlite.query(`SELECT 1 FROM ${d.name} WHERE ${next.name} IS NULL LIMIT 1`).get()
      if (hasNull) refuse(d, next.name, 'NOT NULL while a stored row holds NULL')
    }
  }
}

function storedIndexes(sqlite: Database, table: string): string[] {
  const rows = sqlite.query(`PRAGMA index_list(${table})`).all() as { name: string; origin: string }[]
  return rows.filter((r) => r.origin === 'c').map((r) => r.name)
}

// An added column ALTER can take: nullable or defaulted, and no foreign key unless its default is NULL.
const addable = (c: ColumnSpec): boolean => (!c.notnull || c.dflt !== null) && (!c.relation || c.dflt === null)

// Decides before anything is written: a refusal throws here and leaves the file untouched.
export function planChange(sqlite: Database, d: DatasetDecl): Change {
  const stored = storedColumns(sqlite, d.name)
  const next = columnSpecs(d)
  checkRefusals(sqlite, d, stored, hasRows(sqlite, d.name))
  const declared = new Set(next.map((c) => c.name))
  const kept = next.filter((c) => stored.has(c.name))
  const added = next.filter((c) => !stored.has(c.name))
  const dropped = [...stored.keys()].some((name) => !declared.has(name))
  const changed = kept.some((c) => !same(c, stored.get(c.name) as ColumnSpec))
  if (dropped || changed || !added.every(addable)) return { kind: 'rebuild' }
  const wanted = new Map((d.indexes ?? []).map((cols) => [indexName(d.name, cols), cols]))
  const existing = storedIndexes(sqlite, d.name)
  return {
    kind: 'alter',
    add: added.map((c) => `ALTER TABLE ${d.name} ADD COLUMN ${columnDefinition(c)}`),
    dropIndexes: existing.filter((name) => !wanted.has(name)).map((name) => `DROP INDEX ${name}`),
    createIndexes: [...wanted]
      .filter(([name]) => !existing.includes(name))
      .map(([name, cols]) => `CREATE INDEX ${name} ON ${d.name} (${cols.join(', ')})`),
  }
}

// SQLite's documented rebuild order; the caller holds foreign keys off and the transaction.
function rebuild(sqlite: Database, d: DatasetDecl): void {
  const stored = storedColumns(sqlite, d.name)
  const kept = columnSpecs(d)
    .map((c) => c.name)
    .filter((name) => stored.has(name))
    .join(', ')
  const sequence = sqlite.query('SELECT seq FROM sqlite_sequence WHERE name = ?').get(d.name) as { seq: number } | null
  sqlite.run(tableDdl(d, `new_${d.name}`))
  sqlite.run(`INSERT INTO new_${d.name} (${kept}) SELECT ${kept} FROM ${d.name}`)
  sqlite.run(`DROP TABLE ${d.name}`)
  sqlite.run(`ALTER TABLE new_${d.name} RENAME TO ${d.name}`)
  for (const statement of indexDdl(d)) sqlite.run(statement)
  if (sequence) {
    sqlite.query('DELETE FROM sqlite_sequence WHERE name = ?').run(d.name)
    sqlite.query('INSERT INTO sqlite_sequence (name, seq) VALUES (?, ?)').run(d.name, sequence.seq)
  }
}

export function applyChange(sqlite: Database, d: DatasetDecl, change: Change): void {
  if (change.kind === 'rebuild') {
    rebuild(sqlite, d)
    return
  }
  for (const statement of [...change.dropIndexes, ...change.add, ...change.createIndexes]) sqlite.run(statement)
}
