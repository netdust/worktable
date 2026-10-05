import type { Database } from 'bun:sqlite'
import { eq } from 'drizzle-orm'
import type { BunSQLiteDatabase } from 'drizzle-orm/bun-sqlite'
import type { SQLiteColumn } from 'drizzle-orm/sqlite-core'
import type { ColumnDecl, DatasetDecl, Domain, WriteContext, Writer } from './declare'
import { DEV_ACTOR } from './dev-actor'
import { ApiError } from './params'
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

export function cutBody(dataset: DatasetDecl, body: Values): Values {
  return Object.fromEntries(Object.entries(body).filter(([key]) => isEditable(columnOf(dataset, key))))
}

const isEditable = (column: ColumnDecl | undefined): boolean => column !== undefined && !column.readonly

function fits(type: ColumnDecl['type'], value: unknown): boolean {
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

function finder(store: Store): WriteContext['find'] {
  return (name, id) => {
    const dataset = store.domain.datasets.find((d) => d.name === name)
    if (!dataset) throw new Error(`find: "${name}" is not a dataset`)
    const raw = liveRow(store.sqlite, name, id)
    return raw && decodeAll(dataset, raw)
  }
}

type Change = [field: string, old: string | number | null, value: string | number | null]

function diff(stored: Stored, current: Stored | null): Change[] {
  return Object.entries(stored)
    .map(([key, value]): Change => [key, current ? (current[key] ?? null) : null, value])
    .filter(([, old, value]) => (current ? old !== value : value !== null))
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

function persist(sqlite: Database, table: string, id: number | null, stored: Stored, now: string): number {
  if (id === null) return insert(sqlite, table, stored)
  update(sqlite, table, id, stored, now)
  return id
}

const asJson = (value: string | number | null): string | null => (value === null ? null : JSON.stringify(value))

function revise(sqlite: Database, entity: string, id: number, changes: Change[], now: string): void {
  const batch = crypto.randomUUID()
  const row = sqlite.query(
    'INSERT INTO revision (entity, record_id, field, old, new, actor_id, at, batch_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
  )
  for (const [field, old, value] of changes) {
    row.run(entity, id, field, asJson(old), asJson(value), DEV_ACTOR.id, now, batch)
  }
}

function valuesOf(store: Store, { dataset, writer }: Writable, op: WriteOp, body: Values, ctx: WriteContext): Values {
  const cut = cutBody(dataset, body)
  checkValues(dataset, cut)
  const returned = op === 'create' ? writer.create?.(cut, ctx) : writer.update?.(cut, ctx)
  const values = returned ?? {}
  checkValues(dataset, values)
  checkRelations(store.sqlite, dataset, values)
  if (op === 'create') checkRequired(dataset, values)
  return values
}

function storedOf(store: Store, target: Writable, op: WriteOp, body: Values, ctx: WriteContext, now: string): Stored {
  if (op !== 'delete') return encodeAll(target.dataset, valuesOf(store, target, op, body, ctx))
  target.writer.delete?.(ctx)
  return { deleted_at: now }
}

// One transaction: a refusal or a failed Revision insert leaves the table and revision untouched.
export function runWrite(store: Store, target: Writable, op: WriteOp, id: number | null, body: Values): number {
  const { sqlite } = store
  const table = target.dataset.name
  return sqlite.transaction(() => {
    const current = id === null ? null : liveRow(sqlite, table, id)
    if (id !== null && !current) throw new ApiError(404, 'unknown_record', `unknown record ${id}`)
    const ctx = { actor: DEV_ACTOR, current: current && decodeAll(target.dataset, current), find: finder(store) }
    const now = new Date().toISOString()
    const stored = storedOf(store, target, op, body, ctx, now)
    const changes = diff(stored, current)
    if (id !== null && changes.length === 0) return id
    const written = persist(sqlite, table, id, stored, now)
    revise(sqlite, table, written, changes, now)
    return written
  })()
}

export function rowOf(store: Store, dataset: DatasetDecl, id: number): EngineRow {
  const table = tableOf(dataset)
  const idColumn = (table as unknown as Record<string, SQLiteColumn>).id as SQLiteColumn
  const raw = store.db.select().from(table).where(eq(idColumn, id)).get() as Values
  return withLookups(store.db, store.domain, dataset, [raw])[0] as EngineRow
}

export function readRevisions(store: Store, name: string, id: number): Values[] {
  if (!store.domain.datasets.some((d) => d.name === name)) {
    throw new ApiError(404, 'unknown_source', `unknown source "${name}"`)
  }
  return store.sqlite
    .query(
      'SELECT field, old, new, actor_id, at, batch_id FROM revision WHERE entity = ? AND record_id = ? ORDER BY id',
    )
    .all(name, id) as Values[]
}
