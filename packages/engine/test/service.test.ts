import { Database } from 'bun:sqlite'
import { beforeEach, describe, expect, test } from 'bun:test'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createAccount, migrate, seedDomain } from '../src'
import { createService, disableService } from '../src/auth'
import { contents, domain } from './fixture'
import { signIn, signInAs, testEngine } from './sign-in'

const HOST = { host: '127.0.0.1:4310', 'content-type': 'application/json' }
const UNAUTHENTICATED = { code: 'unauthenticated', message: 'Sign in first' }

let sqlite: Database
let app: ReturnType<typeof testEngine>

beforeEach(() => {
  sqlite = new Database(':memory:')
  migrate(sqlite, domain)
  seedDomain(sqlite, domain)
  app = testEngine(sqlite, domain)
})

async function call(method: string, path: string, headers: Record<string, string> = {}, body?: unknown) {
  const res = await app.request(path, {
    method,
    headers: { ...HOST, ...headers },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  // biome-ignore lint/suspicious/noExplicitAny: response bodies are asserted structurally
  return { status: res.status, body: (await res.json()) as Record<string, any>, headers: res.headers }
}

const bearer = (token: string) => ({ authorization: `Bearer ${token}` })
const asService = (token: string, method = 'GET', path = '/api/auth/me', body?: unknown) =>
  call(method, path, bearer(token), body)

// Every table's rows but the skipped ones; sqlite_sequence moves with rate_limit's ids.
const tablesBut = (...skip: string[]) => {
  const sql = "SELECT name FROM sqlite_master WHERE type = 'table' AND name <> 'sqlite_sequence'"
  const names = sqlite.query(sql).all() as { name: string }[]
  return Object.fromEntries(
    names
      .filter(({ name }) => !skip.includes(name))
      .map(({ name }) => [name, sqlite.query(`SELECT * FROM "${name}" ORDER BY rowid`).all()]),
  )
}

describe('the service CLI', () => {
  const SERVE = join(import.meta.dir, '..', 'src', 'serve.ts')
  const DOMAIN = join(import.meta.dir, 'fixtures', 'serve-domain.ts')

  async function cli(db: string, ...args: string[]) {
    const proc = Bun.spawn(['bun', SERVE, '--domain', DOMAIN, '--db', db, ...args], { stdout: 'pipe', stderr: 'pipe' })
    const code = await proc.exited
    return { code, out: await new Response(proc.stdout).text(), err: await new Response(proc.stderr).text() }
  }

  test('--create-service prints the token once and stores only its hash; a duplicate and --role owner refuse', async () => {
    const db = join(mkdtempSync(join(tmpdir(), 'wt-service-')), 'db.sqlite')
    const made = await cli(db, '--create-service', 'bot')
    expect(made.code).toBe(0)
    const token = made.out.trim()
    expect(made.out).toBe(`${token}\n`)
    expect(token).toMatch(/^[\w-]{43}$/)

    const ops = await cli(db, '--create-service', 'ops', '--role', 'administrator')
    expect(ops.code).toBe(0)
    const twice = await cli(db, '--create-service', 'bot')
    expect(twice.code).toBe(1)
    expect(twice.out).toBe('')
    const owner = await cli(db, '--create-service', 'eigenaar', '--role', 'owner')
    expect(owner.code).toBe(1)

    const file = new Database(db)
    const rows = file.query("SELECT kind, name, role, email, token_hash FROM account WHERE kind = 'service'").all()
    expect(rows).toEqual([
      {
        kind: 'service',
        name: 'bot',
        role: 'editor',
        email: null,
        token_hash: new Bun.CryptoHasher('sha256').update(token).digest('hex'),
      },
      { kind: 'service', name: 'ops', role: 'administrator', email: null, token_hash: expect.any(String) },
    ])
    file.close()
  }, 30_000)

  test('--rotate-service prints a new token and the old one is 401; --disable-service makes the new one 401', async () => {
    const db = join(mkdtempSync(join(tmpdir(), 'wt-service-')), 'db.sqlite')
    const old = (await cli(db, '--create-service', 'bot')).out.trim()
    const rotated = await cli(db, '--rotate-service', 'bot')
    expect(rotated.code).toBe(0)
    const fresh = rotated.out.trim()
    expect(fresh).not.toBe(old)

    const file = new Database(db)
    app = testEngine(file, domain)
    expect((await asService(old)).status).toBe(401)
    expect((await asService(fresh)).status).toBe(200)
    expect((await cli(db, '--disable-service', 'bot')).code).toBe(0)
    expect((await asService(fresh)).status).toBe(401)
    expect((await cli(db, '--rotate-service', 'nobody')).code).toBe(1)
    file.close()
  }, 30_000)

  test('createService refuses a bad name or a role it does not grant', () => {
    expect(() => createService(sqlite, '', 'editor')).toThrow()
    expect(() => createService(sqlite, 'x'.repeat(61), 'editor')).toThrow()
    expect(() => createService(sqlite, 'bot\u0007', 'editor')).toThrow()
    expect(() => createService(sqlite, 'bot', 'owner')).toThrow()
    createService(sqlite, 'bot', 'editor')
    expect(() => createService(sqlite, 'bot', 'administrator')).toThrow()
    expect(sqlite.query("SELECT COUNT(*) AS n FROM account WHERE kind = 'service'").get()).toEqual({ n: 1 })
  })
})

describe('Bearer authentication (attacks 17, 18)', () => {
  test('a valid Bearer authenticates and /auth/me names the service', async () => {
    const token = createService(sqlite, 'bot', 'editor')
    const me = await asService(token)
    expect(me.status).toBe(200)
    expect(me.body).toEqual({ id: 1, email: null, role: 'editor', subject: null, kind: 'service', name: 'bot' })
    expect(me.headers.get('set-cookie')).toBeNull()
  })

  test('wrong, empty, overlong, disabled and session-id tokens get one 401 body, and write nothing but rate_limit', async () => {
    const token = createService(sqlite, 'bot', 'editor')
    const off = createService(sqlite, 'off', 'editor')
    disableService(sqlite, 'off')
    createAccount(sqlite, domain, 'mens@example.test', 'editor')
    const session = (await signInAs(app, 'mens@example.test')).split('=')[1] as string
    const before = tablesBut('rate_limit')
    for (const given of [`${token}x`, '', 'x'.repeat(129), off, session]) {
      const res = await asService(given)
      expect(res.status).toBe(401)
      expect(res.body).toEqual(UNAUTHENTICATED)
      expect(res.headers.get('cache-control')).toBe('no-store')
    }
    const bare = await call('GET', '/api/auth/me', { authorization: 'Bearer' })
    expect(bare.body).toEqual(UNAUTHENTICATED)
    expect(tablesBut('rate_limit')).toEqual(before)
  })

  test('a valid cookie with a bad Bearer is 401: the header wins', async () => {
    const cookie = await signIn(app, 'administrator')
    expect((await call('GET', '/api/auth/me', { cookie })).status).toBe(200)
    const mixed = await call('GET', '/api/auth/me', { cookie, ...bearer('not-a-token') })
    expect(mixed.status).toBe(401)
    expect(mixed.body).toEqual(UNAUTHENTICATED)
  })

  test('a valid cookie with any other Authorization scheme is 401: the header still wins', async () => {
    const cookie = await signIn(app, 'administrator')
    for (const authorization of ['Basic x', 'Bearer', 'Token abc', '']) {
      const mixed = await call('GET', '/api/auth/me', { cookie, authorization })
      expect({ authorization, status: mixed.status, body: mixed.body }).toEqual({
        authorization,
        status: authorization === '' ? 200 : 401,
        body: authorization === '' ? expect.anything() : UNAUTHENTICATED,
      })
    }
  })

  test('the 21st bad Bearer from one address in 15 minutes is 429, even with a good token', async () => {
    const token = createService(sqlite, 'bot', 'editor')
    for (let i = 0; i < 20; i++) expect((await asService(`wrong-${i}`)).status).toBe(401)
    expect((await asService('wrong-21')).status).toBe(429)
    expect((await asService(token)).status).toBe(429)
  })

  test('the 601st request of one service in a minute is 429, and another service is not held', async () => {
    const token = createService(sqlite, 'bot', 'editor')
    const other = createService(sqlite, 'robot', 'editor')
    for (let i = 0; i < 600; i++) {
      const res = await app.request('/api/auth/me', { headers: { ...HOST, ...bearer(token) } })
      if (res.status !== 200) throw new Error(`request ${i + 1} was ${res.status}`)
    }
    const over = await asService(token)
    expect(over.status).toBe(429)
    expect(over.body.code).toBe('rate_limited')
    expect((await asService(other)).status).toBe(200)
  }, 30_000)

  test('a broken limiter refuses a service request', async () => {
    const token = createService(sqlite, 'bot', 'editor')
    sqlite.run('DROP TABLE rate_limit')
    expect((await asService(token)).status).toBe(429)
  })
})

describe('a service account writes as itself', () => {
  test('its write is logged as the service and history names it; it undoes its own batch', async () => {
    const token = createService(sqlite, 'bot', 'editor')
    const id = (sqlite.query("SELECT id FROM account WHERE name = 'bot'").get() as { id: number }).id
    const made = await asService(token, 'POST', '/api/rows/note', { project_id: 1, tekst: 'door bot' })
    expect(made.status).toBe(201)
    const batch = made.body.revision.batch_id as string
    expect(sqlite.query('SELECT actor_id FROM batch WHERE key = ?').get(batch)).toEqual({ actor_id: id })
    const actors = sqlite.query('SELECT DISTINCT actor_id FROM revision WHERE batch_id = ?').all(batch)
    expect(actors).toEqual([{ actor_id: id }])

    const cookie = await signIn(app, 'administrator')
    const history = await call('GET', '/api/history/note', { cookie })
    const entry = history.body.entries.find((e: { batch: string }) => e.batch === batch)
    expect(entry).toMatchObject({ by: 'account', actor: 'bot', undoable: false })

    expect((await asService(token, 'POST', `/api/batches/${batch}/undo`, {})).status).toBe(200)
  })

  test('a human undo of its batch is 403, and after disable its next write is 401 and the batch stays', async () => {
    const token = createService(sqlite, 'bot', 'editor')
    const made = await asService(token, 'POST', '/api/rows/note', { project_id: 1, tekst: 'door bot' })
    const batch = made.body.revision.batch_id as string
    const cookie = await signIn(app, 'administrator')

    const before = tablesBut('rate_limit')
    const undo = await call('POST', `/api/batches/${batch}/undo`, { cookie }, {})
    expect(undo.status).toBe(403)
    expect(undo.body.code).toBe('forbidden')
    expect(tablesBut('rate_limit')).toEqual(before)

    disableService(sqlite, 'bot')
    const after = tablesBut('rate_limit', 'account')
    const write = await asService(token, 'POST', '/api/rows/note', { project_id: 1, tekst: 'na uitschakelen' })
    expect(write.status).toBe(401)
    expect((await asService(token, 'POST', `/api/batches/${batch}/undo`, {})).status).toBe(401)
    expect(tablesBut('rate_limit', 'account')).toEqual(after)
    expect(sqlite.query('SELECT undone_by FROM batch WHERE key = ?').get(batch)).toEqual({ undone_by: null })
  })
})

describe('an administrator service may not publish or mint links (attack 16)', () => {
  test('record links, share-token and for-owners are 403 with tables unchanged; display is allowed', async () => {
    const token = createService(sqlite, 'ops', 'administrator')
    const id = (sqlite.query("SELECT id FROM account WHERE name = 'ops'").get() as { id: number }).id
    sqlite.run(
      `INSERT INTO saved_view (name, source_type, source, owner_id, visible_fields, public, share_token, for_owners)
       VALUES ('Lijst', 'query', 'per_project', ${id}, '["name"]', 0, NULL, 0)`,
    )
    const view = (sqlite.query("SELECT id FROM saved_view WHERE name = 'Lijst'").get() as { id: number }).id
    const before = tablesBut('rate_limit')
    for (const [method, path] of [
      ['GET', '/api/record-links/project/1'],
      ['POST', '/api/record-links/project/1/rotate'],
      ['PUT', `/api/views/${view}/share-token`],
      ['DELETE', `/api/views/${view}/share-token`],
      ['PUT', `/api/views/${view}/for-owners`],
      ['DELETE', `/api/views/${view}/for-owners`],
    ] as const) {
      const res = await asService(token, method, path, method === 'DELETE' || method === 'GET' ? undefined : {})
      expect(res.status, `${method} ${path}`).toBe(403)
      expect(res.body.code).toBe('forbidden')
    }
    expect(tablesBut('rate_limit')).toEqual(before)
    expect((await asService(token, 'PUT', '/api/sources/taak/display', { label: 'Werk' })).status).toBe(200)
  })
})

describe('an administrator service may not change a published view it owns (attack 16)', () => {
  test.each([
    ['public', 'public = 1', 'public_view'],
    ['for owners', 'for_owners = 1', 'owner_view'],
  ])('a %s view: PATCH and DELETE are 403, tables unchanged', async (_, set, code) => {
    const token = createService(sqlite, 'ops', 'administrator')
    const id = (sqlite.query("SELECT id FROM account WHERE name = 'ops'").get() as { id: number }).id
    sqlite.run(
      `INSERT INTO saved_view (name, source_type, source, owner_id, visible_fields, shared)
       VALUES ('Lijst', 'query', 'per_project', ${id}, '["name"]', 1)`,
    )
    const view = (sqlite.query("SELECT id FROM saved_view WHERE name = 'Lijst'").get() as { id: number }).id
    sqlite.run(`UPDATE saved_view SET ${set} WHERE id = ${view}`)
    const before = tablesBut('rate_limit')
    const patched = await asService(token, 'PATCH', `/api/views/${view}`, { visible_fields: ['name', 'project_id'] })
    const deleted = await asService(token, 'DELETE', `/api/views/${view}`)
    expect([patched.status, patched.body.code, deleted.status, deleted.body.code]).toEqual([403, code, 403, code])
    expect(tablesBut('rate_limit')).toEqual(before)
  })
})

describe('the write guard holds for a Bearer request', () => {
  test('a write without JSON is 415, and a cross-site one is 403', async () => {
    const token = createService(sqlite, 'bot', 'editor')
    const body = JSON.stringify({ project_id: 1, tekst: 'x' })
    const plain = await app.request('/api/rows/note', {
      method: 'POST',
      headers: { host: HOST.host, ...bearer(token), 'content-type': 'text/plain' },
      body,
    })
    expect(plain.status).toBe(415)
    const cross = await app.request('/api/rows/note', {
      method: 'POST',
      headers: { ...HOST, ...bearer(token), origin: 'https://evil.example', 'sec-fetch-site': 'cross-site' },
      body,
    })
    expect(cross.status).toBe(403)
    expect(((await cross.json()) as { code: string }).code).toBe('forbidden_site')
    expect(contents(sqlite, 'note')).toHaveLength(1)
  })
})
