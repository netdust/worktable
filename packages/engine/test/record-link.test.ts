import { Database } from 'bun:sqlite'
import { beforeEach, describe, expect, test } from 'bun:test'
import { chmodSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Hono } from 'hono'
import {
  type Actor,
  createEngine,
  type DatasetDecl,
  type Domain,
  DomainError,
  migrate,
  seedDomain,
  validateDomain,
} from '../src'
import type { AuthEnv } from '../src/auth'
import { ApiError } from '../src/params'
import { recordLinkFor, recordLinkRoutes } from '../src/record-link'
import { contents, domain as fixture, send } from './fixture'
import { signIn, TEST_LINK_SECRET, testEngine } from './sign-in'

// The fixture's project, carrying a inbox its link is mailed to.
const withInbox = (d: DatasetDecl): DatasetDecl =>
  d.name === 'project'
    ? {
        ...d,
        record_link: { email: 'inbox' },
        columns: { ...d.columns, inbox: { type: 'text', label: 'Inbox', nullable: true } },
      }
    : d
const domain: Domain = {
  ...fixture,
  datasets: fixture.datasets.map(withInbox),
  writers: { ...fixture.writers, project: { ...fixture.writers?.project, update: (values) => values } },
}

const HOST = { host: '127.0.0.1:4310', 'content-type': 'application/json' }
const APP_URL = 'http://127.0.0.1:5173'

let sqlite: Database
let app: ReturnType<typeof testEngine>
let outbox: string

beforeEach(() => {
  sqlite = new Database(':memory:')
  migrate(sqlite, domain)
  seedDomain(sqlite, domain)
  sqlite.run("UPDATE project SET inbox = 'alfa@example.test' WHERE id = 1")
  sqlite.run("INSERT INTO project (name, inbox) VALUES ('Gamma', 'ALFA@example.test')")
  sqlite.run("INSERT INTO project (name, inbox, deleted_at) VALUES ('Delta', 'gone@example.test', '2026-01-01')")
  outbox = mkdtempSync(join(tmpdir(), 'wt-record-link-'))
  app = testEngine(sqlite, domain, { outbox })
})

const linkOf = (id: number, dataset = 'project') => recordLinkFor(sqlite, TEST_LINK_SECRET, dataset, id)
const raw = (method: string, path: string, headers: Record<string, string> = {}, body?: unknown) =>
  app.request(path, {
    method,
    headers: { ...HOST, ...headers },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
const asLink = (token: string, method = 'GET', path = '/api/auth/me', body?: unknown) =>
  raw(method, path, { authorization: `RecordLink ${token}` }, body)
const settle = () => Bun.sleep(20)

// Everything but rate_limit, which a failure or a request is meant to change.
const tables = () =>
  Object.fromEntries(
    ['account', 'record_link', 'batch', 'revision', 'note', 'project', 'taak', 'saved_view', 'auth_session'].map(
      (t) => [t, contents(sqlite, t)],
    ),
  )

async function denied(call: () => Promise<Response>, status: number, code: string) {
  const before = tables()
  const res = await call()
  expect(res.status).toBe(status)
  expect(((await res.json()) as { code: string }).code).toBe(code)
  expect(tables()).toEqual(before)
}

describe('the record link', () => {
  test('is stable, has the dataset.id.mac shape, and stays within 128 characters', () => {
    expect(linkOf(1)).toBe(linkOf(1))
    expect(linkOf(1)).toMatch(/^project\.1\.[\w-]{43}$/)
    expect(linkOf(1).length).toBeLessThanOrEqual(128)
    expect(linkOf(3)).not.toBe(linkOf(1))
  })

  test('authenticates as the link account of its record, made once', async () => {
    const me = await asLink(linkOf(1))
    expect(me.status).toBe(200)
    const body = (await me.json()) as { id: number }
    expect(body).toMatchObject({ email: null, role: 'owner', subject: { dataset: 'project', id: 1 } })
    expect((await asLink(linkOf(1))).status).toBe(200)
    const links = sqlite.query("SELECT id, role, subject_dataset, subject_id FROM account WHERE kind = 'link'").all()
    expect(links).toEqual([{ id: body.id, role: 'owner', subject_dataset: 'project', subject_id: 1 }])
  })

  test('an administrator re-copies the current link, and nothing changes', async () => {
    const admin = send(app, await signIn(app, 'administrator'))
    const before = tables()
    const res = await admin('GET', '/api/record-links/project/1')
    expect(res).toEqual({ status: 200, body: { link: `${APP_URL}/#/link/${linkOf(1)}` } })
    expect(tables()).toEqual(before)
  })

  test('rotate kills the old link and answers a working new one, and a rotation is never undone', async () => {
    const admin = send(app, await signIn(app, 'administrator'))
    const old = linkOf(1)
    expect((await asLink(old)).status).toBe(200)
    const batches = contents(sqlite, 'batch')

    const rotated = await admin('POST', '/api/record-links/project/1/rotate', { body: '{}' })
    expect(rotated.status).toBe(200)
    const fresh = (rotated.body.link as string).split('/#/link/')[1] as string
    expect(fresh).not.toBe(old)
    expect((await asLink(old)).status).toBe(401)
    expect((await asLink(fresh)).status).toBe(200)
    const adminId = (sqlite.query("SELECT id FROM account WHERE role = 'administrator'").get() as { id: number }).id
    expect(sqlite.query('SELECT dataset, record_id, version, rotated_by FROM record_link').all()).toEqual([
      { dataset: 'project', record_id: 1, version: 1, rotated_by: adminId },
    ])
    expect((await admin('POST', '/api/record-links/project/1/rotate', { body: '{}' })).status).toBe(200)
    expect((sqlite.query('SELECT version FROM record_link').get() as { version: number }).version).toBe(2)
    // A rotation writes no batch, so undo has nothing to reach.
    expect(contents(sqlite, 'batch')).toEqual(batches)

    const written = await admin('POST', '/api/rows/note', { body: JSON.stringify({ project_id: 1, tekst: 'nieuw' }) })
    expect(written.status).toBe(201)
    const undone = await admin('POST', `/api/batches/${written.body.revision.batch_id}/undo`, { body: '{}' })
    expect(undone.status).toBe(200)
    expect((sqlite.query('SELECT version FROM record_link').get() as { version: number }).version).toBe(2)
    expect((await asLink(old)).status).toBe(401)
    expect((await asLink(fresh)).status).toBe(401)
    expect((await asLink(linkOf(1))).status).toBe(200)
  })

  test('revoke is the version bump: rotate without handing out the new link, and the old link is 401', async () => {
    const admin = send(app, await signIn(app, 'administrator'))
    const old = linkOf(1)
    expect((await admin('POST', '/api/record-links/project/1/rotate', { body: '{}' })).status).toBe(200)
    expect((await asLink(old)).status).toBe(401)
    expect(await admin('GET', '/api/record-links/project/1')).toEqual({
      status: 200,
      body: { link: `${APP_URL}/#/link/${linkOf(1)}` },
    })
  })

  test.each([
    ['an unknown record', '/api/record-links/project/99'],
    ['a deleted record', '/api/record-links/project/4'],
    ['a dataset without record_link', '/api/record-links/taak/1'],
    ['an undeclared dataset', '/api/record-links/account/1'],
    ['a malformed id', '/api/record-links/project/x'],
  ])('re-copy and rotate of %s are 404, tables unchanged', async (_, path) => {
    const cookie = await signIn(app, 'administrator')
    await denied(() => raw('GET', path, { cookie }), 404, 'unknown_record')
    await denied(() => raw('POST', `${path}/rotate`, { cookie }, {}), 404, 'unknown_record')
  })

  test.each([
    ['an editor', 'editor'],
    ['an owner', 'owner'],
  ] as const)('%s may not re-copy or rotate: 403, tables unchanged', async (_, role) => {
    const cookie = await signIn(app, role, role === 'owner' ? { dataset: 'project', id: 1 } : null)
    await denied(() => raw('GET', '/api/record-links/project/1', { cookie }), 403, 'forbidden')
    await denied(() => raw('POST', '/api/record-links/project/1/rotate', { cookie }, {}), 403, 'forbidden')
  })

  test('a service account with the administrator role is refused in the handler: 403, tables unchanged', async () => {
    const service: Actor = { id: 77, role: 'administrator', subject: null, kind: 'service' }
    const store = { sqlite, domain, appUrl: APP_URL } as Parameters<typeof recordLinkRoutes>[1]
    const bare = new Hono<AuthEnv>()
    bare.use(async (c, next) => {
      c.set('actor', service)
      await next()
    })
    recordLinkRoutes(bare, store, TEST_LINK_SECRET)
    bare.onError((err, c) =>
      err instanceof ApiError ? c.json({ code: err.code }, err.status) : c.json({ code: 'internal' }, 500),
    )
    await denied(() => Promise.resolve(bare.request('/record-links/project/1')), 403, 'forbidden')
    await denied(
      () => Promise.resolve(bare.request('/record-links/project/1/rotate', { method: 'POST' })),
      403,
      'forbidden',
    )
  })
})

describe('a bad link (attack 9)', () => {
  test('malformed, wrong MAC, wrong dataset, bumped version, overlong and deleted-record tokens get one identical 401', async () => {
    const mac = linkOf(1).split('.')[2] as string
    const bumped = linkOf(1)
    const tokens = [
      'garbage',
      '',
      'project.1',
      `project.1.${'A'.repeat(43)}`,
      `taak.1.${mac}`,
      linkOf(1, 'taak'),
      `account.1.${mac}`,
      `project.3.${mac}`,
      `project.1.${mac}${'A'.repeat(90)}`,
      `project.01.${mac}`,
      linkOf(4),
      linkOf(99),
      recordLinkFor(sqlite, new TextEncoder().encode('another secret of at least 32 bytes!'), 'project', 1),
      bumped,
    ]
    sqlite.run(
      "INSERT INTO record_link (dataset, record_id, version, rotated_at, rotated_by) VALUES ('project', 1, 1, 'x', 1)",
    )
    const before = tables()
    const answers = []
    for (const token of tokens) {
      const res = await asLink(token)
      answers.push({ status: res.status, body: await res.text(), store: res.headers.get('cache-control') })
    }
    const one = {
      status: 401,
      body: '{"code":"bad_link","message":"This link is not valid any more"}',
      store: 'no-store',
    }
    expect(answers).toEqual(Array(tokens.length).fill(one))
    expect(tables()).toEqual(before)
  })

  test('the 21st failure from one address in 15 minutes is 429, and then a good link is refused too', async () => {
    for (let i = 0; i < 20; i++) expect((await asLink(`bad-${i}`)).status).toBe(401)
    await denied(() => asLink('bad-21'), 429, 'rate_limited')
    await denied(() => asLink(linkOf(1)), 429, 'rate_limited')
  })

  test('a success counts nothing', async () => {
    for (let i = 0; i < 25; i++) expect((await asLink(linkOf(1))).status).toBe(200)
  })

  test('the scheme matches in any case', async () => {
    const res = await raw('GET', '/api/auth/me', { authorization: `recordlink ${linkOf(1)}` })
    expect(res.status).toBe(200)
  })

  test('20 bad links from one address leave the link request open', async () => {
    for (let i = 0; i < 20; i++) expect((await asLink(`bad-${i}`)).status).toBe(401)
    const res = await raw('POST', '/api/record-links/request', {}, { email: 'alfa@example.test' })
    expect({ status: res.status, body: await res.text() }).toEqual({ status: 200, body: '{"ok":true}' })
  })

  test('a disabled link account is refused with the same 401', async () => {
    expect((await asLink(linkOf(1))).status).toBe(200)
    sqlite.run("UPDATE account SET disabled_at = '2026-10-01T00:00:00Z' WHERE kind = 'link'")
    const res = await asLink(linkOf(1))
    expect({ status: res.status, body: await res.text() }).toEqual({
      status: 401,
      body: '{"code":"bad_link","message":"This link is not valid any more"}',
    })
  })

  test('a RecordLink header wins over a valid cookie', async () => {
    const cookie = await signIn(app, 'administrator')
    await denied(() => raw('GET', '/api/schema', { cookie, authorization: 'RecordLink bad' }), 401, 'bad_link')
  })
})

describe('a link actor is confined (attack 11)', () => {
  test('403 on /schema, /rows, /views, /history, /revisions, writes, /actions, undo and signout, tables unchanged', async () => {
    const token = linkOf(1)
    const me = (await (await asLink(token)).json()) as { id: number }
    sqlite.run(`INSERT INTO batch (key, actor_id, kind, at) VALUES ('own', ${me.id}, 'write', 'x')`)
    sqlite.run(
      `INSERT INTO revision (entity, record_id, field, old, new, actor_id, at, batch_id)
       VALUES ('note', 1, 'tekst', '"oud"', '"eerste"', ${me.id}, 'x', 'own')`,
    )
    const calls: [string, string, unknown?][] = [
      ['GET', '/api/schema'],
      ['GET', '/api/rows/taak'],
      ['GET', '/api/rows/per_project'],
      ['GET', '/api/views'],
      ['POST', '/api/views', { name: 'Mine', source: 'taak' }],
      ['GET', '/api/history/taak'],
      ['GET', '/api/revisions/note/1'],
      ['POST', '/api/rows/note', { project_id: 1, tekst: 'x' }],
      ['PATCH', '/api/rows/note/1', { tekst: 'x' }],
      ['DELETE', '/api/rows/note/1'],
      ['POST', '/api/actions/copy_notes', { id: 1, input: { source: 1 } }],
      ['POST', '/api/batches/own/undo', {}],
      ['POST', '/api/auth/signout', {}],
      ['GET', '/api/record-links/project/1'],
      ['POST', '/api/record-links/project/1/rotate', {}],
      ['PUT', '/api/sources/taak/display', { label: 'x' }],
    ]
    for (const [method, path, body] of calls) await denied(() => asLink(token, method, path, body), 403, 'forbidden')
  })
})

describe('the link secret', () => {
  const bare: Domain = { ...domain, datasets: domain.datasets.map(({ record_link: _, ...d }) => d) }
  const fresh = (d: Domain) => {
    const db = new Database(':memory:')
    migrate(db, d)
    return db
  }

  test('createEngine throws without a secret, or with a short one, when a domain declares record_link', () => {
    expect(() => createEngine(fresh(domain), domain, { port: 4310 })).toThrow(/link secret/)
    const short = new Uint8Array(31)
    expect(() => createEngine(fresh(domain), domain, { port: 4310, linkSecret: short })).toThrow(/link secret/)
    expect(() => createEngine(fresh(bare), bare, { port: 4310, filesDir: tmpdir() })).not.toThrow()
  })
  test('/schema says which datasets carry a record link, so the grid offers its controls there only', async () => {
    const sources = (await send(app, await signIn(app, 'administrator'))('GET', '/api/schema')).body.sources
    expect(sources.project.record_link).toBe(true)
    expect(sources.taak.record_link).toBeUndefined()
  })
})

const SERVE = join(import.meta.dir, '..', 'src', 'serve.ts')
const DOMAIN = join(import.meta.dir, 'fixtures', 'serve-domain.ts')

describe('serve.ts --link-secret-file', () => {
  let dir: string
  let db: string
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'wt-secret-'))
    db = join(dir, 'db.sqlite')
  })
  const cli = async (...args: string[]) => {
    const run = Bun.spawn(['bun', SERVE, '--domain', DOMAIN, '--db', db, '--port', '1', ...args], {
      stdout: 'pipe',
      stderr: 'pipe',
    })
    const code = await run.exited
    return { code, err: await new Response(run.stderr).text() }
  }
  const secretFile = (bytes: number, mode: number) => {
    const file = join(dir, `secret-${bytes}-${mode.toString(8)}`)
    writeFileSync(file, 'x'.repeat(bytes), { mode })
    chmodSync(file, mode)
    return file
  }
  // stat succeeds and the read fails, as for a file the server user may not read.
  const unreadable = () => {
    const path = join(dir, 'secret-dir')
    mkdirSync(path, { mode: 0o700 })
    return path
  }

  test.each([
    ['missing', () => []],
    ['naming no file', () => ['--link-secret-file', join(dir, 'nope')]],
    ['short', () => ['--link-secret-file', secretFile(31, 0o600)]],
    ['group-readable', () => ['--link-secret-file', secretFile(32, 0o640)]],
    ['world-readable', () => ['--link-secret-file', secretFile(32, 0o604)]],
    ['unreadable (a directory)', () => ['--link-secret-file', unreadable()]],
    ['unreadable (mode 000)', () => ['--link-secret-file', secretFile(32, 0o000)]],
  ])(
    'refuses to serve with a %s secret file, naming the flag',
    async (_, args) => {
      const run = await cli('--fresh', ...args())
      expect(run.code).toBe(1)
      // One line naming the flag, never a stack trace.
      expect(run.err.trim().split('\n')).toEqual([expect.stringContaining('--link-secret-file')])
    },
    20_000,
  )

  test('a one-shot command runs without one', async () => {
    expect((await cli('--fresh', '--create-account', 'a@example.test', '--role', 'editor')).code).toBe(0)
  }, 20_000)
})

describe('the address a link is mailed to (attack 16)', () => {
  test('only a human administrator changes it, and the change rotates the link', async () => {
    const editor = send(app, await signIn(app, 'editor'))
    const old = linkOf(1)
    const before = tables()
    const refused = await editor('PATCH', '/api/rows/project/1', { body: JSON.stringify({ inbox: 'x@evil.test' }) })
    expect({ status: refused.status, code: refused.body.code }).toEqual({ status: 403, code: 'forbidden' })
    expect(tables()).toEqual(before)

    const admin = send(app, await signIn(app, 'administrator'))
    const moved = await admin('PATCH', '/api/rows/project/1', { body: JSON.stringify({ inbox: 'new@example.test' }) })
    expect(moved.status).toBe(200)
    expect((await asLink(old)).status).toBe(401)
    expect((await asLink(linkOf(1))).status).toBe(200)
  })
})

describe('POST /record-links/request (attack 14)', () => {
  const ask = (email: string) => raw('POST', '/api/record-links/request', {}, { email })
  const mails = () => readdirSync(outbox).map((f) => readFileSync(join(outbox, f), 'utf8'))

  test('known, unknown and deleted addresses get byte-identical answers, nothing written before them, one mail per live match', async () => {
    const before = tables()
    const answers = []
    for (const email of ['alfa@example.test', 'nobody@example.test', 'gone@example.test']) {
      const res = await ask(email)
      answers.push({ status: res.status, body: await res.text(), unchanged: Bun.deepEquals(tables(), before) })
    }
    expect(answers).toEqual(Array(3).fill({ status: 200, body: '{"ok":true}', unchanged: true }))
    await settle()
    const sent = mails()
    expect(sent).toHaveLength(2)
    const linked = sent.map((m) => m.match(/#\/link\/(\S+)/)?.[1]).sort()
    expect(linked).toEqual([linkOf(1), linkOf(3)].sort())
    expect(sent.map((m) => m.split('\n')[0]).sort()).toEqual(['To: ALFA@example.test', 'To: alfa@example.test'])
    expect(tables()).toEqual(before)
  })

  test('the 6th request for one email in 15 minutes is 429', async () => {
    for (let i = 0; i < 5; i++) expect((await ask('alfa@example.test')).status).toBe(200)
    await denied(() => ask('ALFA@example.test'), 429, 'rate_limited')
  })

  test('20 link requests from one address leave a valid link working', async () => {
    for (let i = 0; i < 20; i++) expect((await ask(`n${i}@example.test`)).status).toBe(200)
    expect((await asLink(linkOf(1))).status).toBe(200)
  })

  test('the 21st request from one address in 15 minutes is 429', async () => {
    for (let i = 0; i < 20; i++) expect((await ask(`n${i}@example.test`)).status).toBe(200)
    await denied(() => ask('alfa@example.test'), 429, 'rate_limited')
  })
})

describe('headers (attack 15)', () => {
  test('no-store, no-referrer and noindex on every /record-links/* response, the request route and every 401', async () => {
    const admin = await signIn(app, 'administrator')
    const editor = await signIn(app, 'editor')
    const responses = [
      await raw('GET', '/api/record-links/project/1', { cookie: admin }),
      await raw('POST', '/api/record-links/project/1/rotate', { cookie: admin }, {}),
      await raw('GET', '/api/record-links/project/1', { cookie: editor }),
      await raw('GET', '/api/record-links/project/99', { cookie: admin }),
      await raw('GET', '/api/record-links/project/1'),
      await raw('POST', '/api/record-links/request', {}, { email: 'alfa@example.test' }),
      await asLink('bad'),
      await raw('GET', '/api/schema'),
    ]
    expect(responses.map((r) => r.status)).toEqual([200, 200, 403, 404, 401, 200, 401, 401])
    for (const res of responses) {
      expect(res.headers.get('cache-control')).toBe('no-store')
      expect(res.headers.get('referrer-policy')).toBe('no-referrer')
      expect(res.headers.get('x-robots-tag')).toBe('noindex')
      expect([...res.headers.keys()].filter((k) => k.startsWith('access-control-'))).toEqual([])
    }
  })
})

describe('validation', () => {
  const project = domain.datasets.find((d) => d.name === 'project') as DatasetDecl
  const withProject = (p: DatasetDecl): Domain => ({
    ...domain,
    datasets: domain.datasets.map((d) => (d.name === 'project' ? p : d)),
  })

  test('refuses record_link on a dataset without owners', () => {
    const { owners: _, ...unowned } = project
    expect(() => validateDomain(withProject(unowned))).toThrow(DomainError)
  })

  test.each([
    ['an integer column', { ...project.columns, inbox: { type: 'integer', label: 'Inbox' } }],
    ['an undeclared column', { name: project.columns.name }],
  ] as const)('refuses a record_link email naming %s', (_, columns) => {
    expect(() => validateDomain(withProject({ ...project, columns } as DatasetDecl))).toThrow(DomainError)
  })

  test('accepts the declaration on an owned dataset with a text email', () => {
    expect(() => validateDomain(domain)).not.toThrow()
  })
})
