import { and, asc, desc, inArray, isNull, type SQL, sql } from 'drizzle-orm'
import type { BunSQLiteDatabase } from 'drizzle-orm/bun-sqlite'
import type { SQLiteColumn, SQLiteTable } from 'drizzle-orm/sqlite-core'
import type { Domain } from './declare'
import { filterWhere } from './filter'
import type { RowsParams } from './params'
import { type Source, sourceOf } from './registry'
import { tableOf } from './tables'

export interface EngineRow {
  id: number
  custom: Record<string, unknown>
  lookups: Record<string, { id: number; title: string } | null>
  [column: string]: unknown
}

type Raw = Record<string, unknown>

const columnOf = (table: SQLiteTable, name: string): SQLiteColumn =>
  (table as unknown as Record<string, SQLiteColumn>)[name] as SQLiteColumn

function whereOf(source: Source, table: SQLiteTable, params: RowsParams): SQL | undefined {
  const dateColumn = source.date ? columnOf(table, source.date) : null
  const window = (op: '>=' | '<=', day: string | null): SQL | undefined =>
    day && dateColumn ? sql`substr(${dateColumn}, 1, 10) ${sql.raw(op)} ${day}` : undefined
  const parts = [
    source.kind === 'dataset' ? isNull(columnOf(table, 'deleted_at')) : undefined,
    params.filter ? filterWhere(params.filter, source, table) : undefined,
    window('>=', params.from),
    window('<=', params.to),
  ].filter((p): p is SQL => p !== undefined)
  return parts.length ? and(...parts) : undefined
}

function orderOf(table: SQLiteTable, params: RowsParams): SQL[] {
  const keys = [...(params.group ? [{ column: params.group, desc: false }] : []), ...params.sort]
  return [...keys.map((k) => (k.desc ? desc : asc)(columnOf(table, k.column))), asc(columnOf(table, 'id'))]
}

function parseCustom(value: unknown): Record<string, unknown> {
  return typeof value === 'string' ? JSON.parse(value) : {}
}

function titlesOf(db: BunSQLiteDatabase, domain: Domain, relation: string, ids: number[]): Map<number, string> {
  const target = sourceOf(domain, relation)
  if (target?.kind !== 'dataset' || ids.length === 0) return new Map()
  const table = tableOf(target)
  const found = db
    .select({ id: columnOf(table, 'id'), title: columnOf(table, target.title) })
    .from(table)
    .where(inArray(columnOf(table, 'id'), ids))
    .all() as { id: number; title: unknown }[]
  return new Map(found.map((r) => [r.id, r.title === null ? '' : String(r.title)]))
}

function withLookups(db: BunSQLiteDatabase, domain: Domain, source: Source, raws: Raw[]): EngineRow[] {
  const relations = Object.entries(source.columns).filter(([, c]) => c.relation)
  const titles = new Map(
    relations.map(([name, c]) => {
      const ids = [...new Set(raws.map((r) => r[name]).filter((v): v is number => typeof v === 'number'))]
      return [name, titlesOf(db, domain, c.relation as string, ids)]
    }),
  )
  return raws.map((raw) => {
    const row: Raw = { id: raw.id }
    for (const name of Object.keys(source.columns)) row[name] = raw[name]
    const lookups: EngineRow['lookups'] = {}
    for (const [name] of relations) {
      const id = raw[name]
      const title = typeof id === 'number' ? titles.get(name)?.get(id) : undefined
      lookups[name] = title === undefined ? null : { id: id as number, title }
    }
    return { ...row, custom: parseCustom(raw.custom), lookups } as EngineRow
  })
}

export function readRows(
  db: BunSQLiteDatabase,
  domain: Domain,
  source: Source,
  params: RowsParams,
): { rows: EngineRow[]; total: number } {
  const table = tableOf(source)
  const where = whereOf(source, table, params)
  const raws = db
    .select()
    .from(table)
    .where(where)
    .orderBy(...orderOf(table, params))
    .all() as Raw[]
  // No pagination yet, so the total is the rows read; a second count would run the WHERE twice.
  return { rows: withLookups(db, domain, source, raws), total: raws.length }
}
