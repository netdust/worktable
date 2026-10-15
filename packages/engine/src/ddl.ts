import type { DatasetDecl, QueryDecl } from './declare'
import { reservedNames } from './engine-tables'

/** The engine's rank column: on every domain dataset table, never on an engine table or a query. */
export const POSITION = 'position'

export const hasPosition = (d: DatasetDecl): boolean => !reservedNames.has(d.name)

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

export interface ColumnSpec {
  name: string
  type: string
  notnull: boolean
  dflt: string | null
  relation: string | null
}

const STAMP = "(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))"

// The stored shape of every column a dataset's table holds, in table order; compared with PRAGMA table_info.
export function columnSpecs(d: DatasetDecl): ColumnSpec[] {
  const spec = (name: string, type: string, notnull: boolean, dflt: string | null): ColumnSpec => ({
    name,
    type,
    notnull,
    dflt,
    relation: null,
  })
  return [
    spec('id', 'INTEGER', false, null),
    ...Object.entries(d.columns).map(([name, c]) => ({
      name,
      type: SQL_TYPE[c.type],
      notnull: !c.nullable,
      dflt: c.default === undefined ? null : literal(c.default),
      relation: c.relation ?? null,
    })),
    ...(d.custom ? [spec('custom', 'TEXT', true, "'{}'")] : []),
    spec('created_at', 'TEXT', true, STAMP),
    spec('updated_at', 'TEXT', true, STAMP),
    spec('deleted_at', 'TEXT', false, null),
    ...(hasPosition(d) ? [spec(POSITION, 'TEXT', false, null)] : []),
  ]
}

export function columnDefinition(c: ColumnSpec): string {
  if (c.name === 'id') return 'id INTEGER PRIMARY KEY AUTOINCREMENT'
  const parts = [c.name, c.type]
  if (c.notnull) parts.push('NOT NULL')
  if (c.dflt !== null) parts.push(`DEFAULT ${c.dflt}`)
  if (c.relation) parts.push(`REFERENCES ${c.relation}(id)`)
  return parts.join(' ')
}

export function indexDdl(d: DatasetDecl): string[] {
  return (d.indexes ?? []).map((cols) => `CREATE INDEX ${indexName(d.name, cols)} ON ${d.name} (${cols.join(', ')})`)
}

export const indexName = (table: string, cols: string[]): string => `${table}_${cols.join('_')}_idx`

export function tableDdl(d: DatasetDecl, table = d.name): string {
  const parts = [...columnSpecs(d).map(columnDefinition), ...(d.checks ?? [])]
  return `CREATE TABLE ${table} (\n  ${parts.join(',\n  ')}\n)`
}

export function datasetDdl(d: DatasetDecl): string[] {
  return [tableDdl(d), ...indexDdl(d)]
}

export function viewDdl(q: QueryDecl): string[] {
  return [`DROP VIEW IF EXISTS ${q.name}`, `CREATE VIEW ${q.name} AS ${q.sql}`]
}
