import type { Database } from 'bun:sqlite'
import { eq, getTableColumns } from 'drizzle-orm'
import type { BunSQLiteDatabase } from 'drizzle-orm/bun-sqlite'
import type { SQLiteColumn } from 'drizzle-orm/sqlite-core'
import type { Context } from 'hono'
import { forbid, inScope, type Scope, scopeOf, visibleSource } from './access'
import { mintActionToken, ownerSubject, revokeMintedBy } from './action-token'
import { undoAttachments } from './attachments'
import { POSITION } from './ddl'
import type {
  Actor,
  ColumnDecl,
  DatasetDecl,
  Domain,
  HookResult,
  TransitionMode,
  WriteContext,
  Writer,
} from './declare'
import type { BatchKind } from './engine-tables'
import { lookupSelect, ownBody } from './lookups'
import type { Mail, Mailer } from './mailer'
import { ApiError, isRealDate } from './params'
import { linkUrl, recordLinkFor, retireDelivered } from './record-link'
import { writerOf } from './registry'
import { type EngineRow, withLookups } from './rows'
import { tableOf } from './tables'
import { SYSTEM_OWNER } from './views'

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
  mailer: Mailer
  appUrl: string
  /** Signs record links; a hook asking for its record's link gets null without it. */
  linkSecret?: Uint8Array
  /** Where attachment files sit; set whenever a dataset declares attachments. */
  filesDir?: string
  /** The cap on the attachment files' total size; DEFAULT_FILES_MAX_BYTES when unset. */
  filesMaxBytes?: number
}

export interface Writable {
  dataset: DatasetDecl
  writer: Writer
}

const badValue = (column: string, message: string) => new ApiError(400, 'bad_value', `"${column}" ${message}`)

const columnOf = (dataset: DatasetDecl, name: string): ColumnDecl | undefined =>
  Object.hasOwn(dataset.columns, name) ? dataset.columns[name] : undefined

export function writableOf(domain: Domain, name: string, op: WriteOp, actor: Actor): Writable {
  const source = visibleSource(domain, name, actor)
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
  return Object.fromEntries(
    Object.entries(body).filter(([key]) => key === POSITION || isEditable(columnOf(dataset, key))),
  )
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

// Base 62 and never ending in 0: no rank sorts between "V" and "V0" (threat 3).
const RANK = /^[0-9A-Za-z]{0,254}[1-9A-Za-z]$/

const isRank = (value: unknown): boolean => value === null || (typeof value === 'string' && RANK.test(value))

// Before the writer, nulls wait: a domain writer refuses a missing value first, in its own words.
export function checkValues(dataset: DatasetDecl, values: Values, nulls = true): void {
  for (const [key, value] of Object.entries(values)) {
    if (key === POSITION && isRank(value)) continue
    if (key === POSITION) throw badValue(key, 'must be 1 to 255 of 0-9A-Za-z, not ending in 0')
    const column = columnOf(dataset, key)
    if (!column) throw badValue(key, 'is not a declared column')
    if (nulls && value === null && !column.nullable) throw badValue(key, 'may not be null')
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

export function encodeAll(dataset: DatasetDecl, values: Values): Stored {
  const declared = Object.entries(dataset.columns).filter(([key]) => Object.hasOwn(values, key))
  const stored: Stored = Object.fromEntries(declared.map(([key, column]) => [key, encode(column, values[key])]))
  if (Object.hasOwn(values, POSITION)) stored[POSITION] = values[POSITION] as string | null
  return stored
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

function matchOf(dataset: DatasetDecl, match: Values, caller: string): [sql: string, value: string | number][] {
  const entries = Object.entries(match)
  if (entries.length === 0) throw new Error(`${caller}: a match names no column`)
  return entries.map(([key, value]) => {
    const column = columnOf(dataset, key)
    if (!column) throw new Error(`${caller}: "${key}" is not a declared column of ${dataset.name}`)
    if (value === null || value === undefined) throw new Error(`${caller}: "${key}" may not be matched against null`)
    if (!fits(column.type, value)) throw new Error(`${caller}: "${key}" must be ${column.type}`)
    return [`"${key}" = ?`, encode(column, value) as string | number]
  })
}

// The live rows matching `match`, by id, at most `limit` of them.
function matching(store: Store, name: string, match: Values, caller: string, limit: number): Values[] {
  const dataset = domainDataset(store, name, caller)
  const pairs = matchOf(dataset, match, caller)
  const where = ['deleted_at IS NULL', ...pairs.map(([sql]) => sql)].join(' AND ')
  const raws = store.sqlite
    .query(`SELECT * FROM "${name}" WHERE ${where} ORDER BY id LIMIT ${limit}`)
    .all(...pairs.map(([, value]) => value)) as Stored[]
  return raws.map((raw) => decodeAll(dataset, raw))
}

function matcher(store: Store): WriteContext['findBy'] {
  return (name, match) => matching(store, name, match, 'findBy', 1)[0] ?? null
}

export const MAX_FIND_ALL = 5000

function allMatcher(store: Store): WriteContext['findAll'] {
  return (name, match) => {
    const rows = matching(store, name, match, 'findAll', MAX_FIND_ALL + 1)
    if (rows.length > MAX_FIND_ALL) refuse(`More than ${MAX_FIND_ALL} rows match; narrow the match.`)
    return rows
  }
}

function existence(store: Store): WriteContext['exists'] {
  return (name, match, exceptId) => {
    const pairs = matchOf(domainDataset(store, name, 'exists'), match, 'exists')
    if (exceptId !== undefined) pairs.push(['id <> ?', exceptId])
    const where = ['deleted_at IS NULL', ...pairs.map(([sql]) => sql)].join(' AND ')
    const values = pairs.map(([, value]) => value)
    return store.sqlite.query(`SELECT 1 FROM "${name}" WHERE ${where} LIMIT 1`).get(...values) !== null
  }
}

export const contextOf = (
  store: Store,
  actor: Actor,
  current: Values | null,
  lifecycle?: TransitionMode,
): WriteContext => ({
  ...(lifecycle ? { lifecycle } : {}),
  actor,
  current,
  find: finder(store),
  findBy: matcher(store),
  findAll: allMatcher(store),
  exists: existence(store),
})

function allowed(dataset: DatasetDecl, from: unknown, to: unknown, actor: Actor): boolean {
  return (dataset.lifecycle?.transitions ?? []).some(
    (t) =>
      t.to === to &&
      (t.from === '*' || (typeof from === 'string' && t.from.includes(from))) &&
      t.roles.includes(actor.role),
  )
}

// A create is no transition. Undo may write only the exact inverse of its batch's own transition.
export function checkTransition(
  dataset: DatasetDecl,
  current: Values | null,
  next: Values,
  actor: Actor,
  mode: TransitionMode,
): void {
  const column = dataset.lifecycle?.column
  if (column === undefined || current === null) return
  const from = current[column]
  if (mode.kind === 'write' && mode.expect !== undefined && from !== mode.expect) {
    throw new ApiError(409, 'transition_lost', `"${column}" is no longer ${mode.expect}`)
  }
  if (!Object.hasOwn(next, column) || next[column] === from) return
  const to = next[column]
  const inverse = mode.kind === 'undo' && from === mode.to && to === mode.from
  if (mode.kind === 'undo' ? inverse : allowed(dataset, from, to, actor)) return
  throw new ApiError(422, 'transition_not_allowed', `"${column}" may not go from ${String(from)} to ${String(to)}`)
}

export function expectedOf(dataset: DatasetDecl, expect: unknown): string | undefined {
  if (expect === undefined) return undefined
  const column = dataset.lifecycle?.column
  const given = typeof expect === 'object' && expect !== null && !Array.isArray(expect) ? (expect as Values) : null
  const keys = given ? Object.keys(given) : []
  if (!given || column === undefined || keys.length !== 1 || keys[0] !== column || typeof given[column] !== 'string') {
    throw new ApiError(400, 'bad_body', '"expect" must name the lifecycle column and the value it holds')
  }
  return given[column] as string
}

// An agent cannot see a person's answer land between its read and its write, so it must say what it read (attack 3).
function expectFromService(dataset: DatasetDecl, body: Values, actor: Actor, expect: unknown): void {
  const column = dataset.lifecycle?.column
  if (actor.kind !== 'service' || column === undefined || !Object.hasOwn(body, column) || expect !== undefined) return
  throw new ApiError(400, 'bad_body', `a service account writes "${column}" with "expect"`)
}

type HookToken = NonNullable<HookResult['token']>

/** What hooks left to do after the commit. */
export interface Hooked {
  notices: string[]
  mails: Mail[]
}

export const noneHooked = (): Hooked => ({ notices: [], mails: [] })

// A link a hook may mail, and the part of it that opens something: a record link's MAC, an action token whole.
interface HookLink {
  url: string
  secret: string
}

// A record without an owner has no one for its link to open as, so it gets none.
function recordLinkOf(store: Store, dataset: DatasetDecl, row: Values): HookLink | null {
  if (!dataset.record_link || !store.linkSecret || !ownerSubject(dataset, row)) return null
  const token = recordLinkFor(store.sqlite, store.linkSecret, dataset.name, row.id as number)
  return { url: linkUrl(store.appUrl, token), secret: token.slice(token.lastIndexOf('.') + 1) }
}

const MAX_HOOK_MAILS = 10
const LINE_BREAK = /[\r\n]/
const ONE_ADDRESS = /^[^\s@,;<>"():]+@[^\s@,;<>"():]+$/

const sameAddress = (a: string, b: unknown): boolean =>
  typeof b === 'string' && a.trim().toLowerCase() === b.trim().toLowerCase()

// A domain bug must not spray a link: each link goes in one mail to one address, the record link to the record's own.
// A link is found by its secret, so an encoded or bare one counts too.
function checkHookMails(
  dataset: DatasetDecl,
  row: Values,
  state: string,
  mails: Mail[],
  token: HookLink | null,
  record: HookLink | null,
) {
  const fail = (why: string): never => {
    throw new ApiError(500, 'hook_mail_refused', `${dataset.name} hook on "${state}": ${why}`)
  }
  if (mails.length > MAX_HOOK_MAILS) fail(`${mails.length} mails, at most ${MAX_HOOK_MAILS}`)
  for (const mail of mails) {
    if (typeof mail?.to !== 'string' || mail.to.trim() === '') fail('a mail without an address')
    if (typeof mail.subject !== 'string' || typeof mail.text !== 'string')
      fail('a mail whose subject or text is not text')
    if (LINE_BREAK.test(mail.to) || LINE_BREAK.test(mail.subject)) fail('a line break in an address or subject')
  }
  const own = dataset.record_link?.email
  for (const link of [token, record]) {
    if (link === null) continue
    const carrying = mails.filter((mail) =>
      [mail.to, mail.subject, mail.text].some((part) => part.includes(link.secret)),
    )
    if (carrying.length > 1) fail('a link in more than one mail')
    if (carrying.some((mail) => !ONE_ADDRESS.test(mail.to.trim()))) fail('a link mailed to other than one address')
    if (link === record && own !== undefined && carrying.some((mail) => !sameAddress(mail.to, row[own])))
      fail('the record link mailed to another address than the record’s own')
  }
}

// A record whose owner column is empty has no one to act on the token, so none is minted and the link is null.
function linkOf(
  store: Store,
  dataset: DatasetDecl,
  row: Values,
  from: string,
  token: HookToken,
  batch: string,
): HookLink | null {
  const subject = ownerSubject(dataset, row)
  if (!subject) return null
  const minted = { dataset: dataset.name, record_id: row.id as number, subject, from, ...token, batch }
  const secret = mintActionToken(store.sqlite, minted)
  return { url: `${store.appUrl.replace(/\/+$/, '')}/#/act/${secret}`, secret }
}

// Only runWrite and runAction call this: import, seed-missing and undo never fire a hook.
export function enterState(
  store: Store,
  dataset: DatasetDecl,
  id: number,
  ctx: WriteContext,
  hooked: Hooked,
  batch: string,
): void {
  const lifecycle = dataset.lifecycle
  if (!lifecycle?.hooks) return
  const row = finder(store)(dataset.name, id)
  const state = row?.[lifecycle.column]
  if (!row || state === null || state === ctx.current?.[lifecycle.column]) return
  const hook = Object.hasOwn(lifecycle.hooks, String(state)) ? lifecycle.hooks[String(state)] : undefined
  const result = hook?.(row, ctx)
  if (!result) return
  if (result.notice) hooked.notices.push(result.notice)
  const token = result.token ? linkOf(store, dataset, row, String(state), result.token, batch) : null
  const record = result.record_link ? recordLinkOf(store, dataset, row) : null
  const link = token?.url ?? null
  const answered = result.mail?.(link, { token: link, record: record?.url ?? null }) ?? []
  const mails = Array.isArray(answered) ? answered : [answered]
  checkHookMails(dataset, row, String(state), mails, token, record)
  hooked.mails.push(...mails)
}

export function sendAfterCommit(store: Store, hooked: Hooked): void {
  for (const mail of hooked.mails) store.mailer.send(mail).catch((err) => console.error(err))
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

export interface Written {
  id: number
  batch_id: string | null
  changed: string[]
  notices: string[]
}

export function recordBatch(sqlite: Database, key: string, actorId: number, kind: BatchKind, now: string): void {
  sqlite.query('INSERT INTO batch (key, actor_id, kind, at) VALUES (?, ?, ?, ?)').run(key, actorId, kind, now)
}

// The marker row says the batch created the record, as the deleted_at row says a delete removed it.
export const CREATED = 'id'

// Read back so the defaults the database filled are revised too.
export function create(
  sqlite: Database,
  dataset: DatasetDecl,
  stored: Stored,
  now: string,
  actorId: number,
  batch: string,
): { id: number; changed: string[] } {
  const id = insert(sqlite, dataset.name, stored)
  const row = liveRow(sqlite, dataset.name, id) as Stored
  const changes = Object.keys(dataset.columns)
    .map((key): Change => [key, null, row[key] ?? null])
    .filter(([, , value]) => value !== null)
  revise(sqlite, dataset, id, [[CREATED, null, id], ...changes], now, actorId, batch)
  return { id, changed: changes.map(([field]) => field) }
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
  batch: string = crypto.randomUUID(),
): void {
  const row = sqlite.query(
    'INSERT INTO revision (entity, record_id, field, old, new, actor_id, at, batch_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
  )
  for (const [field, old, value] of changes) {
    const [before, after] = [asJson(dataset, field, old), asJson(dataset, field, value)]
    row.run(dataset.name, id, field, before, after, actorId, now, batch)
  }
}

const unknownRecord = (id: unknown) => new ApiError(404, 'unknown_record', `unknown record ${String(id)}`)

// An owner column may only ever hold the subject, so a row cannot be created or moved out of scope.
function checkOwner(scope: Scope, values: Values): void {
  if (scope === 'all' || scope === 'none' || !Object.hasOwn(values, scope.column)) return
  if (values[scope.column] !== scope.id) forbid(`"${scope.column}" must be ${scope.id}`)
}

function forcedOwner(scope: Scope, cut: Values): Values {
  if (scope === 'all') return cut
  if (scope === 'none') throw unknownRecord('new')
  if (scope.column === 'id') forbid('an owner may not create its own subject')
  return { ...cut, [scope.column]: scope.id }
}

// The address a record link is mailed to delivers credentials, so only a human administrator changes it (attack 16).
function checkLinkAddress(dataset: DatasetDecl, current: Values | null, values: Values, actor: Actor): void {
  const column = dataset.record_link?.email
  if (column === undefined || current === null || !Object.hasOwn(values, column)) return
  if (values[column] === current[column]) return
  if (actor.role === 'administrator' && (actor.kind ?? 'user') === 'user') return
  forbid(`Only an administrator changes "${column}"`)
}

function retireOnNewAddress(store: Store, dataset: DatasetDecl, id: number, changes: Change[], actor: Actor): void {
  const column = dataset.record_link?.email
  if (column === undefined || !changes.some(([field]) => field === column)) return
  retireDelivered(store.sqlite, dataset, liveRow(store.sqlite, dataset.name, id) as Stored, actor)
}

// The rank is the engine's: a create starts unranked, an owner never writes it (threat 1), and no writer sees it.
function rankOf(op: WriteOp, actor: Actor, given: Values): { rank: Values; rest: Values } {
  const { [POSITION]: value, ...rest } = given
  if (op === 'create' || !Object.hasOwn(given, POSITION)) return { rank: {}, rest }
  if (actor.role === 'owner') forbid(`An owner may not write "${POSITION}"`)
  return { rank: { [POSITION]: value }, rest }
}

export function valuesOf(
  store: Store,
  target: Writable,
  op: WriteOp,
  body: Values,
  ctx: WriteContext,
  scope: Scope,
): Values {
  const { dataset, writer } = target
  const { rank, rest: given } = rankOf(op, ctx.actor, cutBody(dataset, ownBody(dataset, body)))
  checkOwner(scope, given)
  const cut = op === 'create' ? forcedOwner(scope, given) : given
  checkValues(dataset, { ...cut, ...rank }, false)
  const mode = ctx.lifecycle ?? { kind: 'write' }
  checkTransition(dataset, ctx.current, cut, ctx.actor, mode)
  // A rank alone still reaches the writer, with an empty change, so a row it refuses is refused the move (threat 7).
  const returned = op === 'create' ? writer.create?.(cut, ctx) : writer.update?.(cut, ctx)
  checkOwner(scope, returned ?? {})
  // Forced again on what is stored: a writer may return a fresh object without the owner column.
  const written = op === 'create' ? forcedOwner(scope, returned ?? {}) : (returned ?? {})
  const values = { ...written, ...rank }
  checkTransition(dataset, ctx.current, values, ctx.actor, mode)
  checkLinkAddress(dataset, ctx.current, values, ctx.actor)
  checkValues(dataset, values)
  checkOptions(dataset, values)
  checkRelations(store.sqlite, dataset, values)
  if (op === 'create') checkRequired(dataset, values)
  return values
}

// On delete the writer runs before the in-use check, so an actor it refuses never learns the counts.
function storedOf(
  store: Store,
  target: Writable,
  op: WriteOp,
  body: Values,
  ctx: WriteContext,
  scope: Scope,
  now: string,
): Stored {
  if (op !== 'delete') return encodeAll(target.dataset, valuesOf(store, target, op, body, ctx, scope))
  target.writer.delete?.(ctx)
  inUse(store, target.dataset, ctx.current?.id as number)
  return { deleted_at: now }
}

function currentOf(sqlite: Database, target: Writable, id: number | null, scope: Scope): Stored | null {
  if (id === null) return null
  const current = liveRow(sqlite, target.dataset.name, id)
  if (!current || !inScope(scope, current)) throw unknownRecord(id)
  return current
}

/** One write; the caller holds the immediate transaction and sends the hooked mails after its commit. A given `batch` is recorded by the caller. */
export function applyWrite(
  store: Store,
  target: Writable,
  op: WriteOp,
  id: number | null,
  body: Values,
  actor: Actor,
  mode: TransitionMode,
  hooked: Hooked,
  batch?: string,
): Omit<Written, 'notices'> {
  const { sqlite } = store
  const scope = scopeOf(actor, target.dataset)
  const current = currentOf(sqlite, target, id, scope)
  const ctx = contextOf(store, actor, current && decodeAll(target.dataset, current), mode)
  const now = new Date().toISOString()
  const stored = storedOf(store, target, op, body, ctx, scope, now)
  const key = batch ?? crypto.randomUUID()
  if (id === null || current === null) {
    const made = create(sqlite, target.dataset, stored, now, actor.id, key)
    if (!batch) recordBatch(sqlite, key, actor.id, 'write', now)
    enterState(store, target.dataset, made.id, ctx, hooked, key)
    return { ...made, batch_id: key }
  }
  const changes = diff(stored, current)
  if (changes.length === 0) return { id, batch_id: null, changed: [] }
  update(sqlite, target.dataset.name, id, stored, now)
  revise(sqlite, target.dataset, id, changes, now, actor.id, key)
  retireOnNewAddress(store, target.dataset, id, changes, actor)
  if (!batch) recordBatch(sqlite, key, actor.id, 'write', now)
  if (op === 'update') enterState(store, target.dataset, id, ctx, hooked, key)
  return { id, batch_id: key, changed: changes.map(([field]) => field) }
}

// One transaction: a refusal or a failed Revision insert leaves the table and revision untouched.
export function runWrite(
  store: Store,
  target: Writable,
  op: WriteOp,
  id: number | null,
  body: Values,
  actor: Actor,
  opts: { expect?: Record<string, unknown> } = {},
): Written {
  const renamed = ownBody(target.dataset, body)
  if (op === 'update') expectFromService(target.dataset, renamed, actor, opts.expect)
  const mode: TransitionMode = { kind: 'write', expect: expectedOf(target.dataset, opts.expect) }
  const hooked = noneHooked()
  const written = store.sqlite
    .transaction(() => applyWrite(store, target, op, id, renamed, actor, mode, hooked))
    .immediate()
  sendAfterCommit(store, hooked)
  return { ...written, notices: hooked.notices }
}

export function rowOf(store: Store, dataset: DatasetDecl, id: number, scope: Scope): EngineRow {
  const table = tableOf(dataset)
  const idColumn = (table as unknown as Record<string, SQLiteColumn>).id as SQLiteColumn
  const raw = store.db
    .select({ ...getTableColumns(table), ...lookupSelect(dataset, scope) })
    .from(table)
    .where(eq(idColumn, id))
    .get() as Values
  return withLookups(store.db, store.domain, dataset, [raw])[0] as EngineRow
}

const MAX_REVISIONS = 5000

const parsed = (raw: string | null): unknown => (raw === null ? null : JSON.parse(raw))

export function readRevisions(store: Store, name: string, id: number, actor: Actor): Values[] {
  const source = visibleSource(store.domain, name, actor)
  if (source.kind !== 'dataset' || !writerOf(store.domain, name)) {
    throw new ApiError(404, 'unknown_source', `unknown source "${name}"`)
  }
  const scope = scopeOf(actor, source)
  if (scope !== 'all') {
    const row = store.sqlite.query(`SELECT * FROM "${name}" WHERE id = ?`).get(id) as Stored | null
    if (!row || !inScope(scope, row)) throw unknownRecord(id)
  }
  const rows = store.sqlite
    .query(
      'SELECT field, old, new, actor_id, at, batch_id FROM revision WHERE entity = ? AND record_id = ? ORDER BY id LIMIT ?',
    )
    .all(name, id, MAX_REVISIONS) as Stored[]
  return rows.map((r) => ({ ...r, old: parsed(r.old as string | null), new: parsed(r.new as string | null) }))
}

interface BatchRow {
  actor_id: number
  kind: BatchKind
  undone_by: string | null
}

interface Revised {
  entity: string
  record_id: number
  field: string
  old: string | null
  new: string | null
}

// One record's part of a batch: per field the first old and the last new.
interface Touched {
  dataset: DatasetDecl
  id: number
  created: boolean
  fields: Map<string, { old: string | null; new: string | null }>
}

interface Planned extends Touched {
  target: Writable
  scope: Scope
}

const UNDOABLE = new Set<BatchKind>(['write', 'action', 'undo'])

const notUndoable = (message: string) => new ApiError(422, 'not_undoable', message)

function undoableBatch(sqlite: Database, key: string, actor: Actor): void {
  const sql = 'SELECT actor_id, kind, undone_by FROM batch WHERE key = ?'
  const batch = sqlite.query(sql).get(key) as BatchRow | null
  if (!batch) throw notUndoable('this batch cannot be undone')
  // A system batch belongs to no account, so it falls through to the kind check.
  if (batch.actor_id !== actor.id && batch.actor_id !== SYSTEM_OWNER)
    forbid('only the account that made a batch may undo it')
  if (!UNDOABLE.has(batch.kind)) throw notUndoable(`a batch of kind ${batch.kind} cannot be undone`)
  if (batch.undone_by !== null) throw new ApiError(409, 'already_undone', 'this batch is already undone')
  if (batch.kind === 'undo' && undidMinting(sqlite, key)) throw notUndoable('a batch that minted tokens is not redone')
}

// Undo revoked the tokens and hooks never fire in undo, so a redo would land the state with a dead token.
function undidMinting(sqlite: Database, undo: string): boolean {
  const sql = 'SELECT 1 FROM action_token t JOIN batch b ON b.key = t.minted_batch WHERE b.undone_by = ? LIMIT 1'
  return sqlite.query(sql).get(undo) !== null
}

// In revision order; a delete in the batch makes it not undoable, since undoing a delete is out.
function touchedBy(store: Store, key: string): Touched[] {
  const sql = 'SELECT entity, record_id, field, old, new FROM revision WHERE batch_id = ? ORDER BY id'
  const records = new Map<string, Touched>()
  for (const r of store.sqlite.query(sql).all(key) as Revised[]) {
    if (r.field === 'deleted_at') throw notUndoable('a batch holding a delete cannot be undone')
    const dataset = store.domain.datasets.find((d) => d.name === r.entity)
    if (!dataset) throw notUndoable('this batch cannot be undone')
    const at = `${r.entity}:${r.record_id}`
    const record = records.get(at) ?? { dataset, id: r.record_id, created: false, fields: new Map() }
    records.set(at, record)
    const first = record.fields.get(r.field)
    if (r.field === CREATED) record.created = true
    else record.fields.set(r.field, { old: first ? first.old : r.old, new: r.new })
  }
  return [...records.values()]
}

function changedSince(dataset: DatasetDecl, id: number, column: string): ApiError {
  const label = columnOf(dataset, column)?.label ?? dataset.label
  return new ApiError(409, 'changed_since', `"${column}" changed since`, { dataset: dataset.name, id, column, label })
}

// The caller's own access first, so a refused source or record never learns what changed.
function planUndo(store: Store, record: Touched, actor: Actor): Planned {
  const { dataset, id, created } = record
  const target = writableOf(store.domain, dataset.name, created ? 'delete' : 'update', actor)
  const scope = scopeOf(actor, target.dataset)
  const row = store.sqlite.query(`SELECT * FROM "${dataset.name}" WHERE id = ?`).get(id) as Stored | null
  if (!row || !inScope(scope, row)) throw unknownRecord(id)
  if (row.deleted_at !== null) throw changedSince(dataset, id, 'deleted_at')
  for (const [field, { new: value }] of record.fields) {
    if (asJson(dataset, field, row[field] ?? null) !== value) throw changedSince(dataset, id, field)
  }
  // A create revises only the columns it filled, never a rank, so any other column or a rank filled since is a later change.
  if (created) {
    const columns = [...Object.keys(dataset.columns), POSITION]
    const filled = columns.find((key) => !record.fields.has(key) && (row[key] ?? null) !== null)
    if (filled) throw changedSince(dataset, id, filled)
  }
  return { ...record, target, scope }
}

function undoModeOf({ dataset, fields }: Planned): TransitionMode | undefined {
  const changed = dataset.lifecycle && fields.get(dataset.lifecycle.column)
  return changed ? { kind: 'undo', from: parsed(changed.old) as string, to: parsed(changed.new) as string } : undefined
}

function restore(store: Store, planned: Planned, actor: Actor, now: string, key: string): void {
  const { sqlite } = store
  const { dataset, id, target, scope } = planned
  const current = liveRow(sqlite, dataset.name, id) as Stored
  const ctx = contextOf(store, actor, decodeAll(dataset, current), undoModeOf(planned))
  let stored: Stored
  if (planned.created) {
    target.writer.delete?.(ctx)
    inUse(store, dataset, id)
    stored = { deleted_at: now }
  } else {
    const old = [...planned.fields].map(([field, values]) => [field, parsed(values.old)])
    stored = encodeAll(dataset, valuesOf(store, target, 'update', Object.fromEntries(old), ctx, scope))
  }
  const changes = diff(stored, current)
  if (changes.length === 0) return
  update(sqlite, dataset.name, id, stored, now)
  revise(sqlite, dataset, id, changes, now, actor.id, key)
  retireOnNewAddress(store, dataset, id, changes, actor)
}

// One transaction: every check runs before any write, and any refusal rolls the whole undo back.
export function undoBatch(
  store: Store,
  key: string,
  actor: Actor,
): { batch_id: string; affected: { dataset: string; id: number }[] } {
  const { sqlite } = store
  return sqlite
    .transaction(() => {
      undoableBatch(sqlite, key, actor)
      const files = undoAttachments(store, key, actor)
      if (files) return files
      const planned = touchedBy(store, key)
        .reverse()
        .map((record) => planUndo(store, record, actor))
      const now = new Date().toISOString()
      const undone = crypto.randomUUID()
      for (const record of planned) restore(store, record, actor, now, undone)
      revokeMintedBy(sqlite, key, now)
      recordBatch(sqlite, undone, actor.id, 'undo', now)
      sqlite.query('UPDATE batch SET undone_by = ? WHERE key = ?').run(undone, key)
      return { batch_id: undone, affected: planned.map(({ dataset, id }) => ({ dataset: dataset.name, id })) }
    })
    .immediate()
}
