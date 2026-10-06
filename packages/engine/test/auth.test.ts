import { Database } from 'bun:sqlite'
import { beforeEach, describe, expect, spyOn, test } from 'bun:test'
import { mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createAccount, createEngine, migrate, seedDomain } from '../src'
import { contents, domain, freshDb, send } from './fixture'
import { linkFor, signIn, signInAs, testEngine } from './sign-in'

let sqlite: Database
let app: ReturnType<typeof testEngine>
let outbox: string
let request: ReturnType<typeof send>

beforeEach(() => {
  sqlite = freshDb()
  outbox = mkdtempSync(join(tmpdir(), 'wt-auth-'))
  app = testEngine(sqlite, domain, { outbox })
  request = send(app)
})

const json = (value: unknown) => ({ body: JSON.stringify(value) })
const tables = () => Object.fromEntries(['account', 'magic_link', 'auth_session'].map((t) => [t, contents(sqlite, t)]))
const raw = (path: string, init: RequestInit = {}) =>
  app.request(path, {
    ...init,
    headers: { host: '127.0.0.1:4310', 'content-type': 'application/json', ...init.headers },
  })
const askLink = (email: string) => raw('/api/auth/request', { method: 'POST', body: JSON.stringify({ email }) })
const consume = (token: unknown, init: RequestInit = {}) =>
  raw('/api/auth/consume', { method: 'POST', body: JSON.stringify({ token }), ...init })
const settle = () => Bun.sleep(20)
const clearOutbox = () => {
  for (const f of readdirSync(outbox)) rmSync(join(outbox, f))
}

async function tokenFor(email: string): Promise<string> {
  expect((await askLink(email)).status).toBe(200)
  return linkFor(outbox, email)
}

describe('auth denials: account enumeration (attack 1)', () => {
  test('a known, an unknown and a disabled email get byte-identical answers, and nothing is written before them', async () => {
    createAccount(sqlite, domain, 'known@example.test', 'editor')
    createAccount(sqlite, domain, 'off@example.test', 'editor')
    sqlite.run("UPDATE account SET disabled_at = '2026-10-01T00:00:00Z' WHERE email = 'off@example.test'")
    const answers = []
    for (const email of ['known@example.test', 'nobody@example.test', 'off@example.test']) {
      const res = await askLink(email)
      answers.push({ status: res.status, body: await res.text(), links: contents(sqlite, 'magic_link').length })
    }
    expect(answers).toEqual(Array(3).fill({ status: 200, body: '{"ok":true}', links: 0 }))
    await settle()
    expect(readdirSync(outbox).length).toBe(1)
    expect(contents(sqlite, 'magic_link').length).toBe(1)
  })

  test.each([
    ['no @', 'nobody.example.test'],
    ['over 254 characters', `${'a'.repeat(250)}@x.test`],
    ['not a string', 5],
  ])('an email with %s is 400 bad_email', async (_, email) => {
    const res = await request('POST', '/api/auth/request', json({ email }))
    expect({ status: res.status, code: res.body.code }).toEqual({ status: 400, code: 'bad_email' })
  })

  test('the sixth link request for one email in 15 minutes is 429 rate_limited, known or not', async () => {
    createAccount(sqlite, domain, 'known@example.test', 'editor')
    for (const email of ['known@example.test', 'nobody@example.test']) {
      for (let i = 0; i < 5; i++) expect((await askLink(email)).status).toBe(200)
      const res = await askLink(email.toUpperCase())
      expect({ status: res.status, body: await res.json() }).toMatchObject({
        status: 429,
        body: { code: 'rate_limited' },
      })
    }
  })

  test('the 21st link request from one address in 15 minutes is 429 rate_limited', async () => {
    for (let i = 0; i < 20; i++) expect((await askLink(`n${i}@example.test`)).status).toBe(200)
    expect((await askLink('n20@example.test')).status).toBe(429)
  })
})

describe('auth denials: burnt and replayed links (attack 2)', () => {
  beforeEach(() => void createAccount(sqlite, domain, 'known@example.test', 'editor'))

  test('the link carries the token in the fragment of the app URL', async () => {
    await askLink('known@example.test')
    await settle()
    const [file] = readdirSync(outbox)
    expect(readFileSync(join(outbox, file as string), 'utf8')).toMatch(/http:\/\/127\.0\.0\.1:5173\/#\/auth\/[\w-]{43}/)
  })

  test('a second consume of one token is 400 bad_token', async () => {
    const token = await tokenFor('known@example.test')
    expect((await consume(token)).status).toBe(200)
    const again = await consume(token)
    expect({ status: again.status, body: await again.json() }).toMatchObject({
      status: 400,
      body: { code: 'bad_token' },
    })
    expect(contents(sqlite, 'auth_session').length).toBe(1)
  })

  test('an expired token is 400 bad_token', async () => {
    const token = await tokenFor('known@example.test')
    sqlite.run("UPDATE magic_link SET expires_at = '2000-01-01T00:00:00.000Z'")
    expect((await consume(token)).status).toBe(400)
    expect(contents(sqlite, 'auth_session')).toEqual([])
  })

  test.each([
    ['an unknown token', 'x'.repeat(43)],
    ['no token', undefined],
    ['a number', 5],
  ])('%s is 400 bad_token', async (_, token) => {
    const res = await consume(token)
    expect({ status: res.status, body: await res.json() }).toMatchObject({ status: 400, body: { code: 'bad_token' } })
  })

  test('a link whose account was disabled after it was sent is 400 bad_token', async () => {
    const token = await tokenFor('known@example.test')
    sqlite.run("UPDATE account SET disabled_at = '2026-10-01T00:00:00Z'")
    expect((await consume(token)).status).toBe(400)
    expect(contents(sqlite, 'auth_session')).toEqual([])
  })

  test('two concurrent consumes on two connections give one session', async () => {
    const file = join(mkdtempSync(join(tmpdir(), 'wt-auth-db-')), 'db.sqlite')
    const first = new Database(file, { create: true })
    migrate(first, domain)
    seedDomain(first, domain)
    createAccount(first, domain, 'known@example.test', 'editor')
    const a = testEngine(first, domain, { outbox })
    const b = testEngine(new Database(file), domain, { outbox })
    const headers = { host: '127.0.0.1:4310', 'content-type': 'application/json' }
    const post = (engine: typeof a, path: string, body: unknown) =>
      engine.request(path, { method: 'POST', headers, body: JSON.stringify(body) })
    await post(a, '/api/auth/request', { email: 'known@example.test' })
    const token = await linkFor(outbox, 'known@example.test')
    const statuses = await Promise.all([a, b].map((e) => post(e, '/api/auth/consume', { token }).then((r) => r.status)))
    expect(statuses.sort()).toEqual([200, 400])
    expect(contents(first, 'auth_session').length).toBe(1)
  })
})

describe('auth denials: a stolen database (attack 3)', () => {
  test('neither the cookie value nor the token is stored', async () => {
    createAccount(sqlite, domain, 'known@example.test', 'editor')
    const token = await tokenFor('known@example.test')
    const res = await consume(token)
    const value = res.headers.get('set-cookie')?.match(/^wt_session=([^;]+)/)?.[1] as string
    expect(value).toMatch(/^[\w-]{43}$/)
    const dump = JSON.stringify(tables())
    expect(dump).not.toContain(value)
    expect(dump).not.toContain(token)
  })
})

describe('auth denials: session fixation (attack 4)', () => {
  test('each sign-in mints a new session id', async () => {
    createAccount(sqlite, domain, 'known@example.test', 'editor')
    const cookies = []
    for (let i = 0; i < 2; i++) {
      const res = await consume(await tokenFor('known@example.test'))
      cookies.push(res.headers.get('set-cookie')?.split(';')[0])
      clearOutbox()
      await settle()
    }
    expect(cookies[0]).not.toEqual(cookies[1])
  })

  test('a session id given as a parameter or a header other than Cookie is not accepted', async () => {
    const cookie = await signIn(app)
    const value = cookie.split('=')[1] as string
    for (const [path, headers] of [
      [`/api/auth/me?wt_session=${value}`, {}],
      ['/api/auth/me', { authorization: `Bearer ${value}` }],
      ['/api/auth/me', { 'x-session': value }],
    ] as const) {
      expect((await raw(path, { headers })).status).toBe(401)
    }
  })
})

describe('auth denials: login CSRF (attack 5)', () => {
  test('a cross-site or same-site consume is 403 forbidden_site and burns nothing', async () => {
    createAccount(sqlite, domain, 'known@example.test', 'editor')
    const token = await tokenFor('known@example.test')
    const before = tables()
    for (const site of ['cross-site', 'same-site']) {
      const res = await consume(token, { headers: { 'sec-fetch-site': site } })
      expect({ status: res.status, body: await res.json() }).toMatchObject({
        status: 403,
        body: { code: 'forbidden_site' },
      })
    }
    expect((await consume(token, { headers: { origin: 'http://evil.example' } })).status).toBe(403)
    expect(tables()).toEqual(before)
  })

  test('the cookie is HttpOnly, SameSite=Lax, Path=/ and not Secure on loopback', async () => {
    createAccount(sqlite, domain, 'known@example.test', 'editor')
    const res = await consume(await tokenFor('known@example.test'))
    const cookie = res.headers.get('set-cookie') as string
    expect(cookie).toMatch(/^wt_session=/)
    expect(cookie).toContain('HttpOnly')
    expect(cookie).toContain('SameSite=Lax')
    expect(cookie).toContain('Path=/')
    expect(cookie).not.toContain('Secure')
  })
})

describe('auth denials: the rate-limit table as a lever (attack 11)', () => {
  test('every write to the limiter sweeps expired windows', async () => {
    sqlite.run("INSERT INTO rate_limit (key, window_start, count) VALUES ('link:old', 0, 3)")
    await askLink('nobody@example.test')
    expect(sqlite.query("SELECT key FROM rate_limit WHERE key = 'link:old'").all()).toEqual([])
  })

  test('a broken limiter fails open for a link request and closed for a consume', async () => {
    createAccount(sqlite, domain, 'known@example.test', 'editor')
    const token = await tokenFor('known@example.test')
    sqlite.run('DROP TABLE rate_limit')
    const error = spyOn(console, 'error').mockImplementation(() => {})
    try {
      expect((await askLink('known@example.test')).status).toBe(200)
      const res = await consume(token)
      expect({ status: res.status, body: await res.json() }).toMatchObject({
        status: 429,
        body: { code: 'rate_limited' },
      })
      expect(contents(sqlite, 'auth_session')).toEqual([])
    } finally {
      error.mockRestore()
    }
  })

  test('requests refused by the address limit write no further per-email rows', async () => {
    for (let i = 0; i < 20; i++) expect((await askLink(`n${i}@example.test`)).status).toBe(200)
    const emailRows = () => sqlite.query("SELECT key FROM rate_limit WHERE key LIKE 'link:email:%'").all().length
    expect(emailRows()).toBe(20)
    for (let i = 20; i < 30; i++) expect((await askLink(`n${i}@example.test`)).status).toBe(429)
    expect(emailRows()).toBe(20)
  })

  test('rate_limit carries an index on window_start, added to an existing database by migrate', () => {
    const indexes = () => (sqlite.query('PRAGMA index_list(rate_limit)').all() as { name: string }[]).map((i) => i.name)
    expect(indexes()).toContain('rate_limit_window_start_idx')
    sqlite.run('DROP INDEX rate_limit_window_start_idx')
    sqlite.run("UPDATE _migrations SET hash = 'before' WHERE source = 'rate_limit'")
    migrate(sqlite, domain)
    expect(indexes()).toContain('rate_limit_window_start_idx')
  })

  test('the 21st consume from one address in 15 minutes is 429 rate_limited', async () => {
    for (let i = 0; i < 20; i++) expect((await consume('x'.repeat(43))).status).toBe(400)
    expect((await consume('x'.repeat(43))).status).toBe(429)
  })
})

describe('auth denials: no session', () => {
  const routes: [string, string, unknown][] = [
    ['GET', '/api/schema', undefined],
    ['GET', '/api/rows/taak', undefined],
    ['GET', '/api/revisions/note/1', undefined],
    ['GET', '/api/views', undefined],
    ['GET', '/api/auth/me', undefined],
    ['POST', '/api/auth/signout', {}],
    ['POST', '/api/rows/note', { project_id: 1, tekst: 'nieuw' }],
    ['PATCH', '/api/rows/note/1', { tekst: 'ander' }],
    ['DELETE', '/api/rows/note/1', undefined],
    ['POST', '/api/views', { name: 'x', source: 'taak' }],
    ['GET', '/api/nope', undefined],
  ]
  const everything = () => ['note', 'saved_view', 'revision', 'auth_session'].map((t) => contents(sqlite, t))

  async function unauthenticated(cookie: string | undefined) {
    const before = everything()
    for (const [method, path, body] of routes) {
      const res = await request(method, path, {
        cookie,
        type: body === undefined ? null : 'application/json',
        body: body === undefined ? undefined : JSON.stringify(body),
      })
      expect({ method, path, status: res.status, code: res.body.code }).toEqual({
        method,
        path,
        status: 401,
        code: 'unauthenticated',
      })
    }
    expect(everything()).toEqual(before)
  }

  test('a request without a cookie is 401 unauthenticated', () => unauthenticated(undefined))
  test('a garbage cookie is 401', () => unauthenticated('wt_session=garbage'))
  test('an expired session is 401', async () => {
    const cookie = await signIn(app)
    sqlite.run("UPDATE auth_session SET expires_at = '2000-01-01T00:00:00.000Z'")
    await unauthenticated(cookie)
  })
  test('a disabled account is 401 on its next request', async () => {
    const cookie = await signIn(app)
    expect((await request('GET', '/api/auth/me', { cookie })).status).toBe(200)
    sqlite.run("UPDATE account SET disabled_at = '2026-10-01T00:00:00Z'")
    await unauthenticated(cookie)
  })
})

describe('account rules', () => {
  test('an account with id 0 or -1 fails the CHECK', () => {
    for (const id of [0, -1]) {
      expect(() =>
        sqlite.run(`INSERT INTO account (id, email, role) VALUES (${id}, 'x${id}@example.test', 'editor')`),
      ).toThrow(/CHECK/)
    }
  })

  test('a subject naming an undeclared dataset is refused', () => {
    expect(() => createAccount(sqlite, domain, 'o@example.test', 'owner', { dataset: 'nope', id: 1 })).toThrow(/nope/)
    expect(contents(sqlite, 'account')).toEqual([])
  })

  test('a subject on a role other than owner is refused', () => {
    expect(() => createAccount(sqlite, domain, 'e@example.test', 'editor', { dataset: 'project', id: 1 })).toThrow()
    expect(contents(sqlite, 'account')).toEqual([])
  })

  test('an email is unique whatever its case', () => {
    createAccount(sqlite, domain, 'known@example.test', 'editor')
    expect(() => createAccount(sqlite, domain, 'KNOWN@example.test', 'editor')).toThrow()
  })
})

describe('the cookie name and the outbox', () => {
  test('the cookie is wt_session by default and cookieName changes it', async () => {
    const named = testEngine(sqlite, domain, { cookieName: 'wt_other' })
    const cookie = await signIn(named)
    expect(cookie).toMatch(/^wt_other=/)
    const me = send(named)
    expect((await me('GET', '/api/auth/me', { cookie })).status).toBe(200)
    expect((await me('GET', '/api/auth/me', { cookie: cookie.replace('wt_other', 'wt_session') })).status).toBe(401)
  })

  test('without an outbox a link request prints nothing, writes nothing, and answers the same 200', async () => {
    createAccount(sqlite, domain, 'known@example.test', 'editor')
    const quiet = createEngine(sqlite, domain, { port: 4310, clientIp: () => '127.0.0.1' })
    const spies = (['log', 'info', 'warn', 'error'] as const).map((m) => spyOn(console, m))
    try {
      const res = await quiet.request('/api/auth/request', {
        method: 'POST',
        headers: { host: '127.0.0.1:4310', 'content-type': 'application/json' },
        body: JSON.stringify({ email: 'known@example.test' }),
      })
      expect({ status: res.status, body: await res.text() }).toEqual({ status: 200, body: '{"ok":true}' })
      await settle()
      expect(spies.map((s) => s.mock.calls.length)).toEqual([0, 0, 0, 0])
      expect(contents(sqlite, 'magic_link')).toEqual([])
    } finally {
      for (const s of spies) s.mockRestore()
    }
  })
})

describe('auth', () => {
  test('a link lands in the outbox, and consuming it answers the account and sets the cookie', async () => {
    const id = createAccount(sqlite, domain, 'known@example.test', 'editor')
    const res = await consume(await tokenFor('known@example.test'))
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ account: { id, email: 'known@example.test', role: 'editor', subject: null } })
    expect(res.headers.get('set-cookie')).toMatch(/^wt_session=[\w-]{43};/)
  })

  test('me answers with the account, and signout ends the session', async () => {
    createAccount(sqlite, domain, 'known@example.test', 'owner', { dataset: 'project', id: 2 })
    const cookie = await signInAs(app, 'known@example.test')
    const me = await request('GET', '/api/auth/me', { cookie })
    expect(me).toEqual({
      status: 200,
      body: { id: 1, email: 'known@example.test', role: 'owner', subject: { dataset: 'project', id: 2 } },
    })
    const out = await request('POST', '/api/auth/signout', { cookie, body: '{}' })
    expect(out.status).toBe(200)
    expect(contents(sqlite, 'auth_session')).toEqual([])
    expect((await request('GET', '/api/auth/me', { cookie })).status).toBe(401)
  })

  test('a signed-in request reaches the routes as before', async () => {
    const cookie = await signIn(app)
    const rows = await request('GET', '/api/rows/taak', { cookie })
    expect({ status: rows.status, count: rows.body.rows.length }).toEqual({ status: 200, count: 4 })
  })

  test('a consume sweeps expired links and sessions', async () => {
    createAccount(sqlite, domain, 'known@example.test', 'editor')
    await signInAs(app, 'known@example.test')
    const past = '2000-01-01T00:00:00.000Z'
    sqlite.run(`UPDATE magic_link SET expires_at = '${past}'`)
    sqlite.run(`UPDATE auth_session SET expires_at = '${past}'`)
    clearOutbox()
    await settle()
    await consume(await tokenFor('known@example.test'))
    const expired = (t: string) => sqlite.query(`SELECT COUNT(*) AS n FROM ${t} WHERE expires_at = ?`).get(past)
    expect([expired('magic_link'), expired('auth_session')]).toEqual([{ n: 0 }, { n: 0 }])
    expect(contents(sqlite, 'auth_session').length).toBe(1)
  })
})

const SERVE = join(import.meta.dir, '..', 'src', 'serve.ts')
const DOMAIN = join(import.meta.dir, 'fixtures', 'serve-domain.ts')

describe('serve.ts', () => {
  let db: string
  beforeEach(() => {
    db = join(mkdtempSync(join(tmpdir(), 'wt-serve-')), 'db.sqlite')
  })

  const cli = async (...args: string[]) => {
    const run = Bun.spawn(['bun', SERVE, '--domain', DOMAIN, '--db', db, ...args], { stdout: 'pipe', stderr: 'pipe' })
    const code = await run.exited
    return { code, out: await new Response(run.stdout).text(), err: await new Response(run.stderr).text() }
  }
  const accounts = () => {
    const file = new Database(db)
    const rows = file.query('SELECT email, role, subject_dataset, subject_id, disabled_at FROM account').all()
    file.close()
    return rows
  }

  test('--create-admin is idempotent on the same email', async () => {
    expect((await cli('--fresh', '--create-admin', 'boss@example.test')).code).toBe(0)
    expect((await cli('--create-admin', 'BOSS@example.test')).code).toBe(0)
    expect(accounts()).toEqual([
      { email: 'boss@example.test', role: 'administrator', subject_dataset: null, subject_id: null, disabled_at: null },
    ])
  }, 20_000)

  test('--create-account makes an owner of a declared subject', async () => {
    expect(
      (await cli('--fresh', '--create-account', 'o@example.test', '--role', 'owner', '--subject', 'project:2')).code,
    ).toBe(0)
    expect(accounts()).toEqual([
      { email: 'o@example.test', role: 'owner', subject_dataset: 'project', subject_id: 2, disabled_at: null },
    ])
  }, 20_000)

  test('a non-loopback --hostname exits 1 naming the missing mailer', async () => {
    const run = await cli('--hostname', '0.0.0.0')
    expect(run.code).toBe(1)
    expect(run.err).toMatch(/mailer/)
  }, 20_000)

  test.each([
    ['a subject on an editor', ['--role', 'editor', '--subject', 'project:1']],
    ['an owner without a subject', ['--role', 'owner']],
    ['an unknown role', ['--role', 'planner']],
    ['no role', []],
    ['a subject naming an undeclared dataset', ['--role', 'owner', '--subject', 'nope:1']],
    ['a malformed subject', ['--role', 'owner', '--subject', 'project']],
  ])(
    '--create-account refuses %s',
    async (_, args) => {
      const run = await cli('--fresh', '--create-account', 'a@example.test', ...args)
      expect(run.code).toBe(1)
      expect(run.err).not.toBe('')
      expect(accounts()).toEqual([])
    },
    20_000,
  )

  test('--disable-account sets disabled_at, and that account is 401 on its next request', async () => {
    expect((await cli('--fresh', '--create-account', 'a@example.test', '--role', 'editor')).code).toBe(0)
    const file = new Database(db)
    const engine = testEngine(file, domain)
    const cookie = await signInAs(engine, 'a@example.test')
    const me = () => send(engine, cookie)('GET', '/api/auth/me')
    expect((await me()).status).toBe(200)
    expect((await cli('--disable-account', 'a@example.test')).code).toBe(0)
    expect((accounts()[0] as { disabled_at: string | null }).disabled_at).toMatch(/^\d{4}-/)
    expect((await me()).status).toBe(401)
    file.close()
  }, 20_000)

  test('--hostname 127.0.0.1 starts, and --cookie-name names the cookie over real HTTP', async () => {
    const port = 20_000 + Math.floor(Math.random() * 20_000)
    expect((await cli('--fresh', '--create-account', 'a@example.test', '--role', 'editor')).code).toBe(0)
    const server = Bun.spawn(
      [
        'bun',
        SERVE,
        '--domain',
        DOMAIN,
        '--db',
        db,
        '--port',
        String(port),
        '--hostname',
        '127.0.0.1',
        '--cookie-name',
        'wt_cli',
        '--outbox',
        outbox,
      ],
      { stdout: 'pipe', stderr: 'pipe' },
    )
    try {
      const reader = server.stdout.getReader()
      let out = ''
      while (!out.includes('engine listening')) {
        const { done, value } = await reader.read()
        if (done) throw new Error(`the engine did not start: ${out}`)
        out += new TextDecoder().decode(value)
      }
      reader.releaseLock()
      const post = (path: string, body: unknown) =>
        fetch(`http://127.0.0.1:${port}${path}`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(body),
        })
      expect((await post('/api/auth/request', { email: 'a@example.test' })).status).toBe(200)
      const res = await post('/api/auth/consume', { token: await linkFor(outbox, 'a@example.test') })
      expect(res.status).toBe(200)
      expect(res.headers.get('set-cookie')).toMatch(/^wt_cli=/)
    } finally {
      server.kill()
    }
  }, 20_000)
})
