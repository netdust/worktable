import type { Database } from 'bun:sqlite'
import type { Context, Hono } from 'hono'
import { deleteCookie, getCookie, setCookie } from 'hono/cookie'
import { createMiddleware } from 'hono/factory'
import { ROLES } from './auth-tables'
import type { Actor, Domain } from './declare'
import type { Mailer } from './mailer'
import { ApiError, emailOf } from './params'
import { noStoreHeaders } from './public-headers'
import { checkLimits, failureLimiter } from './rate-limit'
import { badLink, confineLinkActor, verifyRecordLink } from './record-link'
import { bodyOf } from './writes'

const MINUTE = 60_000
const LINK_LIFE = 15 * MINUTE
const SESSION_LIFE = 30 * 24 * 60 * MINUTE
const MAX_TOKEN = 128

export interface AuthOptions {
  appUrl: string
  mailer?: Mailer
  cookieName: string
  clientIp: (c: Context) => string
  domain: Domain
  linkSecret?: Uint8Array
}

interface AccountRow {
  id: number
  email: string | null
  name: string | null
  kind: NonNullable<Actor['kind']>
  role: Actor['role']
  subject_dataset: string | null
  subject_id: number | null
}

export type AuthEnv = { Variables: { actor: Actor; account: AccountRow; session: string } }

const ACCOUNT = 'a.id, a.email, a.name, a.kind, a.role, a.subject_dataset, a.subject_id'

const iso = (ms: number): string => new Date(ms).toISOString()
export const sha256 = (value: string): string => new Bun.CryptoHasher('sha256').update(value).digest('hex')
export const secret = (): string => Buffer.from(crypto.getRandomValues(new Uint8Array(32))).toString('base64url')
const badToken = (): ApiError => new ApiError(400, 'bad_token', 'This link is not valid any more')

const actorOf = (row: AccountRow): Actor => ({
  id: row.id,
  role: row.role,
  subject: row.subject_dataset === null ? null : { dataset: row.subject_dataset, id: row.subject_id as number },
  kind: row.kind,
})

function accountOut(row: AccountRow) {
  const { role, subject } = actorOf(row)
  return { id: row.id, email: row.email, role, subject }
}

function checkSubject(sqlite: Database, domain: Domain, role: Actor['role'], subject: Actor['subject']): void {
  if (!Object.hasOwn(ROLES, role)) throw new Error(`unknown role "${role}"`)
  if (!subject) return
  if (role !== 'owner') throw new Error('only an owner account has a subject')
  if (!domain.datasets.some((d) => d.name === subject.dataset)) {
    throw new Error(`subject dataset "${subject.dataset}" is not declared`)
  }
  if (!Number.isSafeInteger(subject.id) || subject.id < 1) throw new Error('a subject id is a positive integer')
  // The dataset name was checked against the declared ones above, so it is safe to quote into the SQL.
  const sql = `SELECT 1 FROM "${subject.dataset}" WHERE id = ? AND deleted_at IS NULL`
  if (!sqlite.query(sql).get(subject.id)) throw new Error(`subject ${subject.dataset} ${subject.id} does not exist`)
}

export function createAccount(
  sqlite: Database,
  domain: Domain,
  email: string,
  role: Actor['role'],
  subject: Actor['subject'] = null,
): number {
  const address = emailOf(email)
  checkSubject(sqlite, domain, role, subject)
  const sql = 'INSERT INTO account (email, role, subject_dataset, subject_id) VALUES (?, ?, ?, ?) RETURNING id'
  const row = sqlite.query(sql).get(address, role, subject?.dataset ?? null, subject?.id ?? null) as { id: number }
  return row.id
}

export function findAccount(sqlite: Database, email: string): (AccountRow & { disabled_at: string | null }) | null {
  const sql = `SELECT ${ACCOUNT}, a.disabled_at FROM account a WHERE a.email = ? COLLATE NOCASE`
  return sqlite.query(sql).get(email) as (AccountRow & { disabled_at: string | null }) | null
}

export function disableAccount(sqlite: Database, email: string): boolean {
  const sql = 'UPDATE account SET disabled_at = ?, updated_at = ? WHERE email = ? COLLATE NOCASE'
  const now = iso(Date.now())
  return sqlite.query(sql).run(now, now, email).changes > 0
}

async function deliver(sqlite: Database, { mailer, appUrl }: AuthOptions, email: string): Promise<void> {
  if (!mailer) return
  try {
    const sql = `SELECT ${ACCOUNT} FROM account a WHERE a.email = ? COLLATE NOCASE AND a.disabled_at IS NULL`
    const account = sqlite.query(sql).get(email) as AccountRow | null
    if (!account) return
    const token = secret()
    sqlite
      .query('INSERT INTO magic_link (account_id, token_hash, expires_at) VALUES (?, ?, ?)')
      .run(account.id, sha256(token), iso(Date.now() + LINK_LIFE))
    const link = `${appUrl.replace(/\/+$/, '')}/#/auth/${token}`
    await mailer.send({ to: account.email as string, subject: 'Inloggen', text: link })
  } catch (err) {
    console.error(err)
  }
}

async function requestLink(c: Context, sqlite: Database, options: AuthOptions): Promise<Response> {
  const email = emailOf((await bodyOf(c)).email)
  const limits = () => [
    { key: `link:ip:${options.clientIp(c)}`, max: 20, windowMs: LINK_LIFE },
    { key: `link:email:${email.toLowerCase()}`, max: 5, windowMs: LINK_LIFE },
  ]
  checkLimits(sqlite, limits, true)
  // A timer, not a microtask: the lookup and every write happen after the response is out, for every email alike.
  setTimeout(() => deliver(sqlite, options, email), 0)
  return c.json({ ok: true })
}

function sweep(sqlite: Database, now: string): void {
  sqlite.query('DELETE FROM magic_link WHERE expires_at <= ?').run(now)
  sqlite.query('DELETE FROM auth_session WHERE expires_at <= ?').run(now)
}

function claim(
  sqlite: Database,
  token: string,
  previous: string | undefined,
  now: number,
): { session: string; account: AccountRow } {
  const link = sqlite
    .query(
      'UPDATE magic_link SET used_at = ?1 WHERE token_hash = ?2 AND used_at IS NULL AND expires_at > ?1 RETURNING account_id',
    )
    .get(iso(now), sha256(token)) as { account_id: number } | null
  const sql = `SELECT ${ACCOUNT} FROM account a WHERE a.id = ? AND a.disabled_at IS NULL`
  const account = link && (sqlite.query(sql).get(link.account_id) as AccountRow | null)
  if (!account) throw badToken()
  if (previous) sqlite.query('DELETE FROM auth_session WHERE id_hash = ?').run(sha256(previous))
  const session = secret()
  sqlite
    .query('INSERT INTO auth_session (account_id, id_hash, expires_at) VALUES (?, ?, ?)')
    .run(account.id, sha256(session), iso(now + SESSION_LIFE))
  return { session, account }
}

async function consumeLink(c: Context, sqlite: Database, options: AuthOptions): Promise<Response> {
  const { token } = await bodyOf(c)
  checkLimits(sqlite, () => [{ key: `consume:ip:${options.clientIp(c)}`, max: 20, windowMs: LINK_LIFE }], false)
  if (typeof token !== 'string' || token.length > MAX_TOKEN) throw badToken()
  const now = Date.now()
  sweep(sqlite, iso(now))
  const previous = getCookie(c, options.cookieName)
  const { session, account } = sqlite.transaction(() => claim(sqlite, token, previous, now)).immediate()
  setCookie(c, options.cookieName, session, {
    httpOnly: true,
    sameSite: 'Lax',
    path: '/',
    maxAge: SESSION_LIFE / 1000,
  })
  return c.json({ account: accountOut(account) })
}

// A scheme is case-insensitive (RFC 9110); the value loses its trailing space, so a bare scheme is an empty token.
const RECORD_LINK = /^RecordLink(?: (.*))?$/i

// A header sibling is checked before the cookie, and when it is present the cookie is ignored.
function recordLinkOf(c: Context): string | null {
  const match = RECORD_LINK.exec(c.req.header('authorization') ?? '')
  return match ? (match[1] ?? '') : null
}

async function linkedAccount(c: Context, sqlite: Database, options: AuthOptions, token: string): Promise<AccountRow> {
  for (const [name, value] of Object.entries(noStoreHeaders())) c.header(name, value)
  const limited = failureLimiter(`record-link:ip:${options.clientIp(c)}`, 20, 15)
  return limited(sqlite, () => {
    const { linkSecret, domain } = options
    if (!linkSecret) throw badLink()
    const { id } = verifyRecordLink(sqlite, domain, linkSecret, token)
    return sqlite.query(`SELECT ${ACCOUNT} FROM account a WHERE a.id = ?`).get(id) as AccountRow
  })
}

function sessionAccount(c: Context, sqlite: Database, cookieName: string): { account: AccountRow; session: string } {
  const sql = `SELECT ${ACCOUNT} FROM auth_session s JOIN account a ON a.id = s.account_id
               WHERE s.id_hash = ? AND s.expires_at > ? AND a.disabled_at IS NULL AND a.kind = 'user'`
  const value = getCookie(c, cookieName)
  const session = value ? sha256(value) : ''
  const account = value ? (sqlite.query(sql).get(session, iso(Date.now())) as AccountRow | null) : null
  if (!account) throw new ApiError(401, 'unauthenticated', 'Sign in first')
  return { account, session }
}

// Re-reads the account on every request, so a changed role, a disabled account or a rotated link takes effect at once.
function authenticate(sqlite: Database, options: AuthOptions) {
  return createMiddleware<AuthEnv>(async (c, next) => {
    const token = recordLinkOf(c)
    const { account, session } =
      token === null
        ? sessionAccount(c, sqlite, options.cookieName)
        : { account: await linkedAccount(c, sqlite, options, token), session: '' }
    c.set('account', account)
    c.set('actor', actorOf(account))
    c.set('session', session)
    await next()
  })
}

export function authRoutes(app: Hono<AuthEnv>, sqlite: Database, options: AuthOptions): void {
  // Registered before the session middleware, so these two answer without a session.
  app.post('/auth/request', (c) => requestLink(c, sqlite, options))
  app.post('/auth/consume', (c) => consumeLink(c, sqlite, options))
  app.use('/*', authenticate(sqlite, options), confineLinkActor)

  app.get('/auth/me', (c) => c.json(accountOut(c.get('account'))))
  app.post('/auth/signout', (c) => {
    sqlite.query('DELETE FROM auth_session WHERE id_hash = ?').run(c.get('session'))
    deleteCookie(c, options.cookieName, { path: '/' })
    return c.json({ ok: true })
  })
}
