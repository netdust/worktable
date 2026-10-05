import { and, eq, gt, gte, inArray, isNotNull, isNull, lt, lte, ne, notInArray, type SQL, sql } from 'drizzle-orm'
import type { SQLiteColumn, SQLiteTable } from 'drizzle-orm/sqlite-core'
import { type FilterAST, FilterCompileError, type FilterInput, filterCompile, type JsonValue } from './filter-compile'
import { ApiError } from './params'
import type { Source } from './registry'

const CUSTOM_KEY = /^[A-Za-z0-9_]+$/

type Lhs = { expr: SQL | SQLiteColumn; custom: string | null }

function resolveKey(key: string, source: Source, table: SQLiteTable): Lhs {
  if (key.startsWith('custom.')) {
    const name = key.slice('custom.'.length)
    if (source.kind !== 'dataset' || !source.custom)
      throw new ApiError(400, 'bad_filter', `"${source.name}" has no custom fields`)
    if (!CUSTOM_KEY.test(name)) throw new ApiError(400, 'bad_filter', `invalid custom key "${name}"`)
    const column = (table as unknown as Record<string, SQLiteColumn>).custom as SQLiteColumn
    return { expr: sql`json_extract(${column}, ${`$.${name}`})`, custom: `$.${name}` }
  }
  const declared = Object.hasOwn(source.columns, key) || (source.kind === 'dataset' && key === 'id')
  if (!declared) throw new ApiError(400, 'bad_filter', `unknown filter key "${key}"`)
  return { expr: (table as unknown as Record<string, SQLiteColumn>)[key] as SQLiteColumn, custom: null }
}

const isScalar = (v: unknown): v is string | number | boolean | null =>
  v === null || ['string', 'number', 'boolean'].includes(typeof v)

const bound = (v: unknown): unknown => (typeof v === 'boolean' ? Number(v) : v)

function scalar(key: string, op: string, value: JsonValue): unknown {
  if (!isScalar(value)) throw new ApiError(400, 'bad_filter', `${op} on "${key}" requires a single value`)
  return bound(value)
}

function list(key: string, op: string, value: JsonValue): unknown[] {
  const values = value as JsonValue[]
  if (!values.every(isScalar)) throw new ApiError(400, 'bad_filter', `${op} on "${key}" requires scalar values`)
  return values.map(bound)
}

function contains(lhs: Lhs, key: string, column: SQLiteColumn, value: JsonValue): SQL {
  if (!lhs.custom) throw new ApiError(400, 'bad_filter', `$contains is only supported on custom keys, not "${key}"`)
  const path = lhs.custom
  const values = [...new Set(Array.isArray(value) ? value : [value])]
  // Two-arg json_each/json_type: a scalar at the path yields no match instead of a malformed-JSON 500.
  // One subquery per key, not an EXISTS per value: 100 values over 20k rows took seconds that way.
  const wanted = sql.join(
    values.map((v) => sql`${v}`),
    sql`, `,
  )
  return sql`(SELECT count(DISTINCT value) FROM json_each(${column}, ${path}) WHERE json_type(${column}, ${path}) = 'array' AND value IN (${wanted})) = ${values.length}`
}

function comparison(lhs: Lhs, key: string, op: string, value: JsonValue, table: SQLiteTable): SQL {
  const expr = lhs.expr as SQLiteColumn
  switch (op) {
    case '$eq': {
      const v = scalar(key, op, value)
      return v === null ? isNull(expr) : eq(expr, v)
    }
    case '$ne': {
      const v = scalar(key, op, value)
      return v === null ? isNotNull(expr) : ne(expr, v)
    }
    case '$gt':
      return gt(expr, scalar(key, op, value))
    case '$gte':
      return gte(expr, scalar(key, op, value))
    case '$lt':
      return lt(expr, scalar(key, op, value))
    case '$lte':
      return lte(expr, scalar(key, op, value))
    case '$in':
      return inArray(expr, list(key, op, value))
    case '$nin':
      return notInArray(expr, list(key, op, value))
    case '$exists':
      return value ? isNotNull(expr) : isNull(expr)
    case '$contains':
      return contains(lhs, key, (table as unknown as Record<string, SQLiteColumn>).custom as SQLiteColumn, value)
    default:
      throw new ApiError(400, 'bad_filter', `unknown operator ${op}`)
  }
}

function clauseOf(ast: FilterAST, source: Source, table: SQLiteTable): SQL | undefined {
  if (ast.kind === 'cmp') {
    return comparison(resolveKey(ast.key, source, table), ast.key, ast.op, ast.value, table)
  }
  const parts = ast.clauses.map((c) => clauseOf(c, source, table)).filter((p): p is SQL => p !== undefined)
  return parts.length ? and(...parts) : undefined
}

export function compileFilter(ast: FilterAST, source: Source, table: SQLiteTable): SQL | undefined {
  return clauseOf(ast, source, table)
}

export function filterWhere(input: FilterInput, source: Source, table: SQLiteTable): SQL | undefined {
  try {
    return compileFilter(filterCompile(input), source, table)
  } catch (e) {
    if (e instanceof FilterCompileError) throw new ApiError(400, 'bad_filter', e.message)
    throw e
  }
}
