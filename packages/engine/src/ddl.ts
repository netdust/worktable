import type { ColumnDecl, DatasetDecl, QueryDecl } from './declare'

const SQL_TYPE = {
  text: 'TEXT',
  date: 'TEXT',
  datetime: 'TEXT',
  json: 'TEXT',
  integer: 'INTEGER',
  boolean: 'INTEGER',
  real: 'REAL',
} as const

function literal(value: string | number | boolean | null): string {
  if (value === null) return 'NULL'
  if (typeof value === 'boolean') return value ? '1' : '0'
  return typeof value === 'number' ? String(value) : `'${value.replaceAll("'", "''")}'`
}

function columnDdl(name: string, c: ColumnDecl): string {
  const parts = [name, SQL_TYPE[c.type]]
  if (!c.nullable) parts.push('NOT NULL')
  if (c.default !== undefined) parts.push(`DEFAULT ${literal(c.default)}`)
  if (c.relation) parts.push(`REFERENCES ${c.relation}(id)`)
  return parts.join(' ')
}

export function datasetDdl(d: DatasetDecl): string[] {
  const columns = [
    'id INTEGER PRIMARY KEY AUTOINCREMENT',
    ...Object.entries(d.columns).map(([name, c]) => columnDdl(name, c)),
    ...(d.custom ? ["custom TEXT NOT NULL DEFAULT '{}'"] : []),
    "created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))",
    "updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))",
    'deleted_at TEXT',
  ]
  const indexes = (d.indexes ?? []).map(
    (cols) => `CREATE INDEX ${d.name}_${cols.join('_')}_idx ON ${d.name} (${cols.join(', ')})`,
  )
  return [`CREATE TABLE ${d.name} (\n  ${columns.join(',\n  ')}\n)`, ...indexes]
}

export function viewDdl(q: QueryDecl): string[] {
  return [`DROP VIEW IF EXISTS ${q.name}`, `CREATE VIEW ${q.name} AS ${q.sql}`]
}
