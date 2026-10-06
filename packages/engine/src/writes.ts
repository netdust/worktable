import type { Database } from 'bun:sqlite'
import { eq } from 'drizzle-orm'
import type { BunSQLiteDatabase } from 'drizzle-orm/bun-sqlite'
import type { SQLiteColumn } from 'drizzle-orm/sqlite-core'
import type { Context } from 'hono'
import type { Actor, ColumnDecl, DatasetDecl, Domain, WriteContext, Writer } from './declare'
import { ApiError, isRealDate } from './params'
import { sourceOf, writerOf } from './registry'
import { type EngineRow, withLookups } from './rows'
import { tableOf } from './tables'

export class WriteRefused extends ApiError {
  constructor(message: string) {
    super(422, 'refused', message)
    this.name = 'WriteRefused'
  }
}

export function refuse(message: string): never {
  throw new WriteRefused(message)
}

export type WriteOp = 'create' | 'update' | 'delete'
type Values = Record<string, unknown>
type Stored = Record<string, string | number | null>

export interface Store {
  sqlite: Database
  db: BunSQLiteDatabase
  domain: Domain
}

export interface Writable {
  dataset: DatasetDecl
  writer: Writer
}

const badValue = (column: string, message: string) => new ApiError(400, 'bad_value', `"${column}" ${message}`)

const columnOf = (dataset: DatasetDecl, name: string): ColumnDecl | undefined =>
  Object.hasOwn(dataset.columns, name) ? dataset.columns[name] : undefined

export function writableOf(domain: Domain, name: string, op: WriteOp): Writable {
  const source = sourceOf(domain, name)
  if (!source) throw new ApiError(404, 'unknown_source', `unknown source "${name}"`)
  const writer = source.kind === 'dataset' ? writerOf(domain, name) : undefined
  if (!writer?.[op]) throw new ApiError(405, 'read_only', `"${name}" does not accept ${op}`)
  return { dataset: source as DatasetDecl, writer }
}

export function parseId(raw: string): number {
  const id = /^[1-9]\d*$/.test(raw) ? Number(raw) : Number.NaN
  if (!Number.isSafeInteger(id)) throw new ApiError(404, 'unknown_record', `unknown record "${raw}"`)
  return id
}

export function parseBody(body: unknown): Values {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    throw new ApiError(400, 'bad_body', 'body must be a JSON object')
  }
  return body as Values
}

export async function bodyOf(c: Context): Promise<Values> {
  try {
    return parseBody(await c.req.json())
  } catch (err) {
    if (err instanceof ApiError) throw err
    throw new ApiError(400, 'bad_body', 'body is not valid JSON')
  }
}

export function cutBody(dataset: DatasetDecl, body: Values): Values {
  return Object.fromEntries(Object.entries(body).filter(([key]) => isEditable(columnOf(dataset, key))))
}

const isEditable = (column: ColumnDecl | undefined): boolean => column !== undefined && !column.readonly

const DATE = /^\d{4}-\d{2}-\d{2}$/
const DATETIME = /^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/

function isDateTime(value: string): boolean {
  const [, day = '', hour, minute, second = '0'] = DATETIME.exec(value) ?? []
  return isRealDate(day) && Number(hour) < 24 && Number(minute) < 60 && Number(second) < 60
}

function fits(type: ColumnDecl['type'], value: unknown): boolean {
  if (type === 'date') return typeof value === 'string' && DATE.test(value) && isRealDate(value)
  if (type === 'datetime') return typeof value === 'string' && DATETIME.test(value) && isDateTime(value)
  if (type === 'integer') return Number.isSafeInteger(value)
  if (type === 'real') return Number.isFinite(value)
  if (type === 'boolean') return typeof value === 'boolean'
  if (type === 'json') return value !== undefined
  return typeof value === 'string'
}

export function checkValues(dataset: DatasetDecl, values: Values): void {
  for (const [key, value] of Object.entries(values)) {
    const column = columnOf(dataset, key)
    if (!column) throw badValue(key, 'is not a declared column')
    if (value === null && !column.nullable) throw badValue(key, 'may not be null')
    if (value !== null && !fits(column.type, value)) throw badValue(key, `must be ${column.type}`)
  }
}

// A backstop after the writer: a domain writer refuses a bad option first, in its own words.
function checkOptions(dataset: DatasetDecl, values: Values): void {
  for (const [key, value] of Object.entries(values)) {
    const options = columnOf(dataset, key)?.options
    if (options && value !== null && !Object.hasOwn(options, String(value))) throw badValue(key, 'is not an option')
  }
}

function checkRequired(dataset: DatasetDecl, values: Values): void {
  for (const [key, column] of Object.entries(dataset.columns)) {
    if (!column.nullable && column.default === undefined && !Object.hasOwn(values, key)) {
      throw badValue(key, 'is required')
    }
  }
}

function liveRow(sqlite: Database, table: string, id: unknown): Stored | null {
  return sqlite.query(`SELECT * FROM "${table}" WHERE id = ? AND deleted_at IS NULL`).get(id as number) as Stored | null
}

// The FK alone does not see soft deletes, and a FK failure would surface as a 500.
export function checkRelations(sqlite: Database, dataset: DatasetDecl, values: Values): void {
  for (const [key, value] of Object.entries(values)) {
    const relation = columnOf(dataset, key)?.relation
    if (relation && value !== null && !liveRow(sqlite, relation, value)) {
      throw new ApiError(400, 'bad_relation', `"${key}" names no live ${relation} ${String(value)}`)
    }
  }
}

function encode(column: ColumnDecl, value: unknown): string | number | null {
  if (value === null) return null
  if (column.type === 'boolean') return value ? 1 : 0
  if (column.type === 'json') return JSON.stringify(value)
  return value as string | number
}

function decode(column: ColumnDecl, raw: string | number | null): unknown {
  if (raw === null) return null
  if (column.type === 'boolean') return raw === 1
  if (column.type === 'json') return JSON.parse(String(raw))
  return raw
}

function encodeAll(dataset: DatasetDecl, values: Values): Stored {
  const declared = Object.entries(dataset.columns).filter(([key]) => Object.hasOwn(values, key))
  return Object.fromEntries(declared.map(([key, column]) => [key, encode(column, values[key])]))
}

function decodeAll(dataset: DatasetDecl, raw: Stored): Values {
  const declared = Object.entries(dataset.columns).map(([key, column]) => [key, decode(column, raw[key] ?? null)])
  return { id: raw.id, ...Object.fromEntries(declared) }
}

function domainDataset(store: Store, name: string, caller: string): DatasetDecl {
  const dataset = store.domain.datasets.find((d) => d.name === name)
  if (!dataset) throw new Error(`${caller}: "${name}" is not a dataset`)
  return dataset
}

function finder(store: Store): WriteContext['find'] {
  return (name, id) => {
    const dataset = domainDataset(store, name, 'find')
    const raw = liveRow(store.sqlite, name, id)
    return raw && decodeAll(dataset, raw)
  }
}

function matchOf(dataset: DatasetDecl, match: Values): [sql: string, value: string | number][] {
  const entries = Object.entries(match)
  if (entries.length === 0) throw new Error('exists: a match names no column')
  return entries.map(([key, value]) => {
    const column = columnOf(dataset, key)
    if (!column) throw new Error(`exists: "${key}" is not a declared column of ${dataset.name}`)
    if (value === null || value === undefined) throw new Error(`exists: "${key}" may not be matched against null`)
    if (!fits(column.type, value)) throw new Error(`exists: "${key}" must be ${column.type}`)
    return [`"${key}" = ?`, encode(column, value) as string | number]
  })
}

function existence(store: Store): WriteContext['exists'] {
  return (name, match, exceptId) => {
    const pairs = matchOf(domainDataset(store, name, 'exists'), match)
    if (exceptId !== undefined) pairs.push(['id <> ?', exceptId])
    const where = ['deleted_at IS NULL', ...pairs.map(([sql]) => sql)].join(' AND ')
    const values = pairs.map(([, value]) => value)
    return store.sqlite.query(`SELECT 1 FROM "${name}" WHERE ${where} LIMIT 1`).get(...values) !== null
  }
}

type Referrer = { label: string; count: number }

function referrers(store: Store, target: DatasetDecl, id: number): Referrer[] {
  return store.domain.datasets.flatMap((dataset) => {
    const keys = Object.keys(dataset.columns).filter((key) => dataset.columns[key]?.relation === target.name)
    if (keys.length === 0) return []
    const any = keys.map((key) => `"${key}" = ?`).join(' OR ')
    const sql = `SELECT COUNT(*) AS count FROM "${dataset.name}" WHERE deleted_at IS NULL AND (${any})`
    const { count } = store.sqlite.query(sql).get(...keys.map(() => id)) as { count: number }
    return count > 0 ? [{ label: dataset.label, count }] : []
  })
}

// Names datasets and counts only, never the referencing rows.
function inUse(store: Store, target: DatasetDecl, id: number): void {
  const by = referrers(store, target, id)
  if (by.length === 0) return
  const named = by.map(({ label, count }) => `${label} (${count})`).join(', ')
  throw new ApiError(409, 'in_use', `Still referenced by ${named}`, { by })
}

type Change = [field: string, old: string | number | null, value: string | number | null]

function diff(stored: Stored, current: Stored): Change[] {
  return Object.entries(stored)
    .map(([key, value]): Change => [key, current[key] ?? null, value])
    .filter(([, old, value]) => old !== value)
}

function insert(sqlite: Database, table: string, stored: Stored): number {
  const keys = Object.keys(stored)
  const sql = keys.length
    ? `INSERT INTO "${table}" (${keys.map((k) => `"${k}"`).join(', ')}) VALUES (${keys.map(() => '?').join(', ')})`
    : `INSERT INTO "${table}" DEFAULT VALUES`
  return Number(sqlite.query(sql).run(...Object.values(stored)).lastInsertRowid)
}

function update(sqlite: Database, table: string, id: number, stored: Stored, now: string): void {
  const sets = [...Object.keys(stored).map((k) => `"${k}" = ?`), 'updated_at = ?']
  sqlite.query(`UPDATE "${table}" SET ${sets.join(', ')} WHERE id = ?`).run(...Object.values(stored), now, id)
}

// Read back so the defaults the database filled are revised too.
function create(sqlite: Database, dataset: DatasetDecl, stored: Stored, now: string, actorId: number): number {
  const id = insert(sqlite, dataset.name, stored)
  const row = liveRow(sqlite, dataset.name, id) as Stored
  const changes = Object.keys(dataset.columns).map((key): Change => [key, null, row[key] ?? null])
  revise(
    sqlite,
    dataset,
    id,
    changes.filter(([, , value]) => value !== null),
    now,
    actorId,
  )
  return id
}

function asJson(dataset: DatasetDecl, field: string, value: string | number | null): string | null {
  const column = columnOf(dataset, field)
  return value === null ? null : JSON.stringify(column ? decode(column, value) : value)
}

export function revise(
  sqlite: Database,
  dataset: DatasetDecl,
  id: number,
  changes: Change[],
  now: string,
  actorId: number,
): void {
  const batch = crypto.randomUUID()
  const row = sqlite.query(
    'INSERT INTO revision (entity, record_id, field, old, new, actor_id, at, batch_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
  )
  for (const [field, old, value] of changes) {
    const [before, after] = [asJson(dataset, field, old), asJson(dataset, field, value)]
    row.run(dataset.name, id, field, before, after, actorId, now, batch)
  }
}

function valuesOf(store: Store, { dataset, writer }: Writable, op: WriteOp, body: Values, ctx: WriteContext): Values {
  const cut = cutBody(dataset, body)
  checkValues(dataset, cut)
  const returned = op === 'create' ? writer.create?.(cut, ctx) : writer.update?.(cut, ctx)
  const values = returned ?? {}
  checkValues(dataset, values)
  checkOptions(dataset, values)
  checkRelations(store.sqlite, dataset, values)
  if (op === 'create') checkRequired(dataset, values)
  return values
}

function storedOf(store: Store, target: Writable, op: WriteOp, body: Values, ctx: WriteContext, now: string): Stored {
  if (op !== 'delete') return encodeAll(target.dataset, valuesOf(store, target, op, body, ctx))
  inUse(store, target.dataset, ctx.current?.id as number)
  target.writer.delete?.(ctx)
  return { deleted_at: now }
}

// One transaction: a refusal or a failed Revision insert leaves the table and revision untouched.
export function runWrite(
  store: Store,
  target: Writable,
  op: WriteOp,
  id: number | null,
  body: Values,
  actor: Actor,
): number {
  const { sqlite } = store
  const table = target.dataset.name
  return sqlite
    .transaction(() => {
      const current = id === null ? null : liveRow(sqlite, table, id)
      if (id !== null && !current) throw new ApiError(404, 'unknown_record', `unknown record ${id}`)
      const ctx = {
        actor,
        current: current && decodeAll(target.dataset, current),
        find: finder(store),
        exists: existence(store),
      }
      const now = new Date().toISOString()
      const stored = storedOf(store, target, op, body, ctx, now)
      if (id === null || current === null) return create(sqlite, target.dataset, stored, now, ctx.actor.id)
      const changes = diff(stored, current)
      if (changes.length === 0) return id
      update(sqlite, table, id, stored, now)
      revise(sqlite, target.dataset, id, changes, now, ctx.actor.id)
      return id
    })
    .immediate()
}

export function rowOf(store: Store, dataset: DatasetDecl, id: number): EngineRow {
  const table = tableOf(dataset)
  const idColumn = (table as unknown as Record<string, SQLiteColumn>).id as SQLiteColumn
  const raw = store.db.select().from(table).where(eq(idColumn, id)).get() as Values
  return withLookups(store.db, store.domain, dataset, [raw])[0] as EngineRow
}

const MAX_REVISIONS = 5000

const parsed = (raw: string | null): unknown => (raw === null ? null : JSON.parse(raw))

export function readRevisions(store: Store, name: string, id: number): Values[] {
  if (!store.domain.datasets.some((d) => d.name === name) || !writerOf(store.domain, name)) {
    throw new ApiError(404, 'unknown_source', `unknown source "${name}"`)
  }
  const rows = store.sqlite
    .query(
      'SELECT field, old, new, actor_id, at, batch_id FROM revision WHERE entity = ? AND record_id = ? ORDER BY id LIMIT ?',
    )
    .all(name, id, MAX_REVISIONS) as Stored[]
  return rows.map((r) => ({ ...r, old: parsed(r.old as string | null), new: parsed(r.new as string | null) }))
}
