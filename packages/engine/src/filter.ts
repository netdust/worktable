import { and, eq, gt, gte, inArray, isNotNull, isNull, lt, lte, ne, notInArray, or, type SQL, sql } from 'drizzle-orm'
import type { SQLiteColumn, SQLiteTable } from 'drizzle-orm/sqlite-core'
import type { DatasetDecl, Domain } from './declare'
import {
  type FilterAST,
  FilterCompileError,
  type FilterInput,
  filterCompile,
  type JsonValue,
  type Period,
} from './filter-compile'
import { lookupColumn, lookupOf, lookupValue } from './lookups'
import { ApiError } from './params'
import type { Source } from './registry'

export const CUSTOM_KEY = /^[A-Za-z0-9_]+$/

// type is null on a custom key: its type is not declared.
type Lhs = { expr: SQL | SQLiteColumn; custom: string | null; numeric: boolean; type: string | null }

function resolveLookup(key: string, source: DatasetDecl, domain: Domain | undefined): Lhs {
  if (!domain) throw new ApiError(400, 'bad_filter', `unknown filter key "${key}"`)
  const { type } = lookupColumn(domain, source, key)
  return { expr: lookupValue(source, key), custom: null, numeric: type === 'integer' || type === 'real', type }
}

function resolveKey(key: string, source: Source, table: SQLiteTable, domain?: Domain): Lhs {
  if (key.startsWith('custom.')) {
    const name = key.slice('custom.'.length)
    if (source.kind !== 'dataset' || !source.custom)
      throw new ApiError(400, 'bad_filter', `"${source.name}" has no custom fields`)
    if (!CUSTOM_KEY.test(name)) throw new ApiError(400, 'bad_filter', `invalid custom key "${name}"`)
    const column = (table as unknown as Record<string, SQLiteColumn>).custom as SQLiteColumn
    return { expr: sql`json_extract(${column}, ${`$.${name}`})`, custom: `$.${name}`, numeric: false, type: null }
  }
  if (source.kind === 'dataset' && lookupOf(source, key)) return resolveLookup(key, source, domain)
  const declared = Object.hasOwn(source.columns, key) || (source.kind === 'dataset' && key === 'id')
  if (!declared) throw new ApiError(400, 'bad_filter', `unknown filter key "${key}"`)
  const type = key === 'id' ? 'integer' : source.columns[key]?.type
  const numeric = type === 'integer' || type === 'real'
  const expr = (table as unknown as Record<string, SQLiteColumn>)[key] as SQLiteColumn
  return { expr, custom: null, numeric, type: type ?? null }
}

const isScalar = (v: unknown): v is string | number | boolean | null =>
  v === null || ['string', 'number', 'boolean'].includes(typeof v)

// A view's computed column has no type affinity, so a numeric string is bound as the number it names.
const bound = (v: unknown, numeric: boolean): unknown => {
  if (typeof v === 'boolean') return Number(v)
  if (numeric && typeof v === 'string' && v.trim() !== '' && Number.isFinite(Number(v))) return Number(v)
  return v
}

function scalar(lhs: Lhs, key: string, op: string, value: JsonValue): unknown {
  if (!isScalar(value)) throw new ApiError(400, 'bad_filter', `${op} on "${key}" requires a single value`)
  return bound(value, lhs.numeric)
}

function list(lhs: Lhs, key: string, op: string, value: JsonValue): unknown[] {
  const values = value as JsonValue[]
  if (!values.every(isScalar)) throw new ApiError(400, 'bad_filter', `${op} on "${key}" requires scalar values`)
  return values.map((v) => bound(v, lhs.numeric))
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

function onType(lhs: Lhs, key: string, op: string, types: string[]): void {
  if (lhs.type === null || !types.includes(lhs.type))
    throw new ApiError(400, 'bad_filter', `${op} is only supported on ${types.join(' or ')} columns, not "${key}"`)
}

function like(lhs: Lhs, key: string, op: string, value: JsonValue): SQL {
  onType(lhs, key, op, ['text'])
  const literal = String(value).replace(/[\\%_]/g, '\\$&')
  const match = sql`${lhs.expr} LIKE '%' || ${literal} || '%' ESCAPE '\\'`
  return op === '$like' ? match : sql`NOT (${match})`
}

const ymd = (d: Date): string =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

// In the server's local date: weeks run Monday to Sunday, a month is the calendar month.
function periodDays(period: Period, now: Date): [string, string] {
  const y = now.getFullYear()
  const m = now.getMonth()
  if (period === 'month') return [ymd(new Date(y, m, 1)), ymd(new Date(y, m + 1, 0))]
  const monday = now.getDate() - ((now.getDay() + 6) % 7) + (period === 'next_week' ? 7 : 0)
  return [ymd(new Date(y, m, monday)), ymd(new Date(y, m, monday + 6))]
}

function period(lhs: Lhs, key: string, value: JsonValue, now: Date): SQL {
  onType(lhs, key, '$period', ['date', 'datetime'])
  const [from, to] = periodDays(value as Period, now)
  return sql`substr(${lhs.expr}, 1, 10) BETWEEN ${from} AND ${to}`
}

function comparison(lhs: Lhs, key: string, op: string, value: JsonValue, table: SQLiteTable, now: Date): SQL {
  const expr = lhs.expr as SQLiteColumn
  switch (op) {
    case '$eq': {
      const v = scalar(lhs, key, op, value)
      return v === null ? isNull(expr) : eq(expr, v)
    }
    case '$ne': {
      const v = scalar(lhs, key, op, value)
      return v === null ? isNotNull(expr) : ne(expr, v)
    }
    case '$gt':
      return gt(expr, scalar(lhs, key, op, value))
    case '$gte':
      return gte(expr, scalar(lhs, key, op, value))
    case '$lt':
      return lt(expr, scalar(lhs, key, op, value))
    case '$lte':
      return lte(expr, scalar(lhs, key, op, value))
    case '$in':
      return inArray(expr, list(lhs, key, op, value))
    case '$nin':
      return notInArray(expr, list(lhs, key, op, value))
    case '$exists':
      return value ? isNotNull(expr) : isNull(expr)
    case '$like':
    case '$nlike':
      return like(lhs, key, op, value)
    case '$period':
      return period(lhs, key, value, now)
    case '$contains':
      return contains(lhs, key, (table as unknown as Record<string, SQLiteColumn>).custom as SQLiteColumn, value)
    default:
      throw new ApiError(400, 'bad_filter', `unknown operator ${op}`)
  }
}

function clauseOf(ast: FilterAST, source: Source, table: SQLiteTable, now: Date, domain?: Domain): SQL | undefined {
  if (ast.kind === 'cmp') {
    return comparison(resolveKey(ast.key, source, table, domain), ast.key, ast.op, ast.value, table, now)
  }
  const parts = ast.clauses.map((c) => clauseOf(c, source, table, now, domain)).filter((p): p is SQL => p !== undefined)
  if (!parts.length) return undefined
  return ast.kind === 'or' ? or(...parts) : and(...parts)
}

export function compileFilter(
  ast: FilterAST,
  source: Source,
  table: SQLiteTable,
  now = new Date(),
  domain?: Domain,
): SQL | undefined {
  return clauseOf(ast, source, table, now, domain)
}

/** Every key a filter names, those inside $or included. */
export function filterKeys(input: FilterInput): string[] {
  const walk = (ast: FilterAST): string[] => (ast.kind === 'cmp' ? [ast.key] : ast.clauses.flatMap(walk))
  try {
    return [...new Set(walk(filterCompile(input)))]
  } catch (e) {
    if (e instanceof FilterCompileError) throw new ApiError(400, 'bad_filter', e.message)
    throw e
  }
}

export function filterWhere(
  input: FilterInput,
  source: Source,
  table: SQLiteTable,
  now = new Date(),
  domain?: Domain,
): SQL | undefined {
  try {
    return compileFilter(filterCompile(input), source, table, now, domain)
  } catch (e) {
    if (e instanceof FilterCompileError) throw new ApiError(400, 'bad_filter', e.message)
    throw e
  }
}
