import { and, asc, count, desc, eq, getTableColumns, inArray, isNull, type SQL, sql } from 'drizzle-orm'
import type { BunSQLiteDatabase } from 'drizzle-orm/bun-sqlite'
import type { SQLiteColumn, SQLiteTable } from 'drizzle-orm/sqlite-core'
import { readable, type Scope, scopeOf } from './access'
import { POSITION } from './ddl'
import type { Actor, DatasetDecl, Domain, LinkDecl, MatrixDecl } from './declare'
import { filterKeys, filterWhere } from './filter'
import { INHERITED, lookupColumn, lookupOf, lookupSelect, lookupsFor, lookupValue } from './lookups'
import { ApiError, type RowsParams } from './params'
import { type Source, sourceOf } from './registry'
import { tableOf } from './tables'

export interface EngineRow {
  id: number
  title: string
  custom: Record<string, unknown>
  lookups: Record<string, { id: number; title: string } | null>
  /** The inherited lookups whose value came through the relation; on a source that declares any. */
  inherited?: string[]
  [column: string]: unknown
}

type Raw = Record<string, unknown>

const columnOf = (table: SQLiteTable, name: string): SQLiteColumn =>
  (table as unknown as Record<string, SQLiteColumn>)[name] as SQLiteColumn

function scopeWhere(table: SQLiteTable, scope: Scope): SQL | undefined {
  if (scope === 'all') return undefined
  return scope === 'none' ? sql`0` : eq(columnOf(table, scope.column), scope.id)
}

// A lookup the scope may not read is refused as an unknown key would be, so no filter or sort can probe its value (threat 1).
function hiddenLookup(source: Source, scope: Scope): (key: string) => boolean {
  const served = new Set(lookupsFor(source, scope))
  return (key) => lookupOf(source, key) !== undefined && !served.has(key)
}

function whereOf(
  domain: Domain,
  source: Source,
  table: SQLiteTable,
  params: RowsParams,
  scope: Scope,
): SQL | undefined {
  const hidden = [params.stored, params.filter]
    .flatMap((f) => (f ? filterKeys(f) : []))
    .find(hiddenLookup(source, scope))
  if (hidden !== undefined) throw new ApiError(400, 'bad_filter', `unknown filter key "${hidden}"`)
  const dateColumn = source.date ? columnOf(table, source.date) : null
  const window = (op: '>=' | '<=', day: string | null): SQL | undefined =>
    day && dateColumn ? sql`substr(${dateColumn}, 1, 10) ${sql.raw(op)} ${day}` : undefined
  const parts = [
    source.kind === 'dataset' ? isNull(columnOf(table, 'deleted_at')) : undefined,
    scopeWhere(table, scope),
    params.stored ? filterWhere(params.stored, source, table, undefined, domain) : undefined,
    params.filter ? filterWhere(params.filter, source, table, undefined, domain) : undefined,
    window('>=', params.from),
    window('<=', params.to),
  ].filter((p): p is SQL => p !== undefined)
  return parts.length ? and(...parts) : undefined
}

function orderOf(source: Source, table: SQLiteTable, params: RowsParams, scope: Scope): SQL[] {
  const hidden = hiddenLookup(source, scope)
  if (params.group !== null && hidden(params.group)) {
    throw new ApiError(400, 'bad_group', `cannot group on "${params.group}"`)
  }
  const sorted = params.sort.find((k) => hidden(k.column))
  if (sorted) throw new ApiError(400, 'bad_sort', `cannot sort on "${sorted.column}"`)
  const keys = [...(params.group ? [{ column: params.group, desc: false }] : []), ...params.sort]
  const sortValue = (key: string) =>
    source.kind === 'dataset' && lookupOf(source, key) ? lookupValue(source, key) : columnOf(table, key)
  const order = ({ column, desc: down }: RowsParams['sort'][number]): SQL[] => {
    const value = sortValue(column)
    // Unranked rows last in either direction, so the request's other keys order them.
    const unranked = column === POSITION ? [asc(isNull(value))] : []
    return [...unranked, (down ? desc : asc)(value)]
  }
  return [...keys.flatMap(order), asc(columnOf(table, 'id'))]
}

function parseCustom(value: unknown): Record<string, unknown> {
  return typeof value === 'string' ? JSON.parse(value) : {}
}

export function titlesOf(db: BunSQLiteDatabase, domain: Domain, relation: string, ids: number[]): Map<number, string> {
  const target = sourceOf(domain, relation)
  if (target?.kind !== 'dataset' || typeof target.title !== 'string' || ids.length === 0) return new Map()
  const table = tableOf(target)
  const found = db
    .select({ id: columnOf(table, 'id'), title: columnOf(table, target.title) })
    .from(table)
    .where(inArray(columnOf(table, 'id'), ids))
    .all() as { id: number; title: unknown }[]
  return new Map(found.map((r) => [r.id, r.title === null ? '' : String(r.title)]))
}

function titleOf(source: Source, raw: Raw, titles: Map<string, Map<number, string>>): string {
  const text = (column: string): string => (raw[column] == null ? '' : String(raw[column]))
  if (typeof source.title === 'string') return text(source.title)
  const id = raw[source.title.via]
  return (typeof id === 'number' ? titles.get(source.title.via)?.get(id) : undefined) || text(source.title.else)
}

// The lookups a raw carries: a raw read with SELECT * (link rows, history) carries none.
function lookupsIn(source: Source, raws: Raw[]): string[] {
  if (source.kind !== 'dataset') return []
  return Object.keys(source.lookups ?? {}).filter((name) => raws.some((r) => Object.hasOwn(r, name)))
}

function relationsOf(domain: Domain, source: Source, looked: string[]): [string, string][] {
  const columns = Object.entries(source.columns).flatMap(([name, c]) => (c.relation ? [[name, c.relation]] : []))
  const lookups = looked.flatMap((name) => {
    const relation = lookupColumn(domain, source as DatasetDecl, name).relation
    return relation ? [[name, relation]] : []
  })
  return [...columns, ...lookups] as [string, string][]
}

function inheritedOf(source: Source, raw: Raw): { inherited?: string[] } {
  if (source.kind !== 'dataset') return {}
  const flagged = Object.keys(source.lookups ?? {}).filter((name) => Object.hasOwn(raw, INHERITED + name))
  return flagged.length ? { inherited: flagged.filter((name) => Boolean(raw[INHERITED + name])) } : {}
}

export function withLookups(db: BunSQLiteDatabase, domain: Domain, source: Source, raws: Raw[]): EngineRow[] {
  const looked = lookupsIn(source, raws)
  const relations = relationsOf(domain, source, looked)
  const titles = new Map(
    relations.map(([name, relation]) => {
      const ids = [...new Set(raws.map((r) => r[name]).filter((v): v is number => typeof v === 'number'))]
      return [name, titlesOf(db, domain, relation, ids)]
    }),
  )
  const served = [...Object.keys(source.columns), ...(source.kind === 'dataset' ? [POSITION] : []), ...looked]
  return raws.map((raw) => {
    const row: Raw = { id: raw.id }
    for (const name of served) row[name] = raw[name]
    const lookups: EngineRow['lookups'] = {}
    for (const [name] of relations) {
      const id = raw[name]
      const title = typeof id === 'number' ? titles.get(name)?.get(id) : undefined
      lookups[name] = title === undefined ? null : { id: id as number, title }
    }
    const title = titleOf(source, raw, titles)
    return { ...row, title, custom: parseCustom(raw.custom), lookups, ...inheritedOf(source, raw) } as EngineRow
  })
}

export function readRows(
  db: BunSQLiteDatabase,
  domain: Domain,
  source: Source,
  params: RowsParams,
  scope: Scope,
): { rows: EngineRow[]; total: number } {
  const table = tableOf(source)
  const where = whereOf(domain, source, table, params, scope)
  const raws = db
    .select({ ...getTableColumns(table), ...lookupSelect(source, scope) })
    .from(table)
    .where(where)
    .orderBy(...orderOf(source, table, params, scope))
    .limit(params.limit)
    .offset(params.offset)
    .all() as Raw[]
  const counted = db.select({ total: count() }).from(table).where(where).get()
  return { rows: withLookups(db, domain, source, raws), total: counted?.total ?? 0 }
}

export const CHUNK = 500

// The ids `readRows` would answer for the same params and scope, in its order.
export function readIds(
  db: BunSQLiteDatabase,
  domain: Domain,
  source: Source,
  params: RowsParams,
  scope: Scope,
): number[] {
  const table = tableOf(source)
  const found = db
    .select({ id: columnOf(table, 'id') })
    .from(table)
    .where(whereOf(domain, source, table, params, scope))
    .orderBy(...orderOf(source, table, params, scope))
    .limit(params.limit)
    .offset(params.offset)
    .all() as { id: number }[]
  return found.map((r) => r.id)
}

export function matrixOf(domain: Domain, source: Source): { join: DatasetDecl; matrix: MatrixDecl } | null {
  const join = domain.datasets.find((d) => d.matrix?.down && d.columns[d.matrix.down]?.relation === source.name)
  return join?.matrix ? { join, matrix: join.matrix } : null
}

// The live rows of `dataset` whose `key` is one of `ids`, in the caller's scope, read in chunks.
function pointingAt(db: BunSQLiteDatabase, dataset: DatasetDecl, key: string, ids: number[], scope: Scope): Raw[] {
  const table = tableOf(dataset)
  const raws: Raw[] = []
  for (let i = 0; i < ids.length; i += CHUNK) {
    const chunk = db
      .select()
      .from(table)
      .where(
        and(
          isNull(columnOf(table, 'deleted_at')),
          scopeWhere(table, scope),
          inArray(columnOf(table, key), ids.slice(i, i + CHUNK)),
        ),
      )
      .orderBy(asc(columnOf(table, 'id')))
      .all() as Raw[]
    raws.push(...chunk)
  }
  return raws
}

export function cellsOf(
  db: BunSQLiteDatabase,
  domain: Domain,
  { join, matrix }: NonNullable<ReturnType<typeof matrixOf>>,
  downIds: number[],
  scope: Scope,
): Map<number, EngineRow[]> {
  const raws = pointingAt(db, join, matrix.down, downIds, scope)
  const cells = new Map<number, EngineRow[]>(downIds.map((id) => [id, []]))
  withLookups(db, domain, join, raws).forEach((row, i) => {
    cells.get((raws[i] as Raw)[matrix.down] as number)?.push(row)
  })
  return cells
}

export interface LinkRow {
  id: number
  target: number | null
  title: string
  state: string | null
}

// Only these four leave: no other column of the link row or of its target.
function linkOf(row: EngineRow, link: LinkDecl): LinkRow {
  const target = row[link.target]
  const state = link.state === undefined ? null : row[link.state]
  return {
    id: row.id,
    target: typeof target === 'number' ? target : null,
    title: row.lookups[link.target]?.title ?? row.title,
    state: typeof state === 'string' ? state : null,
  }
}

// Read through the caller's scope on the link dataset; a link dataset the caller cannot read is left out.
export function linksOf(
  db: BunSQLiteDatabase,
  domain: Domain,
  source: Source,
  ids: number[],
  actor: Actor,
): Map<number, Record<string, LinkRow[]>> {
  const links = new Map<number, Record<string, LinkRow[]>>(ids.map((id) => [id, {}]))
  for (const [name, link] of Object.entries(source.links ?? {})) {
    const linked = domain.datasets.find((d) => d.name === link.dataset)
    if (!linked || !readable(actor, linked)) continue
    for (const id of ids) (links.get(id) as Record<string, LinkRow[]>)[name] = []
    const raws = pointingAt(db, linked, link.key, ids, scopeOf(actor, linked))
    withLookups(db, domain, linked, raws).forEach((row, i) => {
      links.get((raws[i] as Raw)[link.key] as number)?.[name]?.push(linkOf(row, link))
    })
  }
  return links
}
