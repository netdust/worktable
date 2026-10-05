import {
  integer,
  real,
  type SQLiteColumnBuilderBase,
  type SQLiteTable,
  sqliteTable,
  text,
} from 'drizzle-orm/sqlite-core'
import type { ColumnDecl, DatasetDecl, QueryDecl } from './declare'

function columnOf(name: string, c: ColumnDecl): SQLiteColumnBuilderBase {
  if (c.type === 'integer') return integer(name)
  if (c.type === 'boolean') return integer(name, { mode: 'boolean' })
  if (c.type === 'real') return real(name)
  return text(name)
}

function declared(decl: DatasetDecl | QueryDecl): Record<string, SQLiteColumnBuilderBase> {
  const columns: Record<string, SQLiteColumnBuilderBase> = {}
  for (const [name, c] of Object.entries(decl.columns)) columns[name] = columnOf(name, c)
  return columns
}

export function tableOf(decl: DatasetDecl | QueryDecl): SQLiteTable {
  if (decl.kind === 'query') return sqliteTable(decl.name, declared(decl))
  return sqliteTable(decl.name, {
    id: integer('id').primaryKey({ autoIncrement: true }),
    ...declared(decl),
    ...(decl.custom ? { custom: text('custom').notNull() } : {}),
    created_at: text('created_at').notNull(),
    updated_at: text('updated_at').notNull(),
    deleted_at: text('deleted_at'),
  })
}
