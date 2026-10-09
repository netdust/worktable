import { Database } from 'bun:sqlite'
import { beforeEach, describe, expect, test } from 'bun:test'
import { existsSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { type DatasetDecl, type Domain, defineDataset, type HookResult, type Mail, migrate, seedDomain } from '../src'
import { linkAccount } from '../src/action-token'
import { account } from '../src/auth-tables'
import { tableDdl } from '../src/ddl'
import { contents, send } from './fixture'
import { signIn, testEngine } from './sign-in'

type Request = ReturnType<typeof send>

const links: (string | null)[] = []

const member = defineDataset({
  name: 'member',
  label: 'Members',
  title: 'name',
  custom: false,
  columns: { name: { type: 'text', label: 'Name' } },
})

const ticket: DatasetDecl = defineDataset({
  name: 'ticket',
  label: 'Tickets',
  title: 'note',
  custom: false,
  owners: { owner: 'member_id' },
  columns: {
    member_id: { type: 'integer', label: 'Member', relation: 'member', nullable: true },
    state: { type: 'text', label: 'State', default: 'a', options: { a: 'A', b: 'B', c: 'C', d: 'D' } },
    note: { type: 'text', label: 'Note', nullable: true },
  },
  lifecycle: {
    column: 'state',
    transitions: [
      { from: ['a'], to: 'b', roles: ['editor'] },
      { from: ['b'], to: 'c', roles: ['owner', 'editor'] },
      { from: ['b'], to: 'd', roles: ['owner'] },
      { from: '*', to: 'a', roles: ['editor'] },
    ],
    hooks: {
      b: (): HookResult => ({
        token: { to: ['c', 'd'], days: 7 },
        mail: (link) => {
          links.push(link)
          return { to: 'ann@example.test', subject: 'Uitnodiging', text: link ?? 'geen link' }
        },
      }),
    },
    token_projection: ['member_id', 'state'],
  },
})

const domain: Domain = {
  datasets: [member, ticket],
  queries: [],
  seed: (insert) => {
    insert('member', [{ name: 'Ann' }, { name: 'Bob' }])
    insert('ticket', [
      { member_id: 1, state: 'a', note: 'eerste' },
      { member_id: null, state: 'a', note: 'leeg' },
    ])
  },
  views: [],
  writers: { member: { create: (v) => v }, ticket: { create: (v) => v, update: (v) => v } },
}

let sqlite: Database
let app: ReturnType<typeof testEngine>
let editor: Request
let anyone: Request

function recordingMailer(outbox: string) {
  return {
    send: async (mail: Mail) => {
      if (mail.subject === 'Inloggen')
        writeFileSync(join(outbox, `${crypto.randomUUID()}.txt`), `To: ${mail.to}\n\n${mail.text}\n`)
    },
  }
}

beforeEach(async () => {
  links.length = 0
  sqlite = new Database(':memory:')
  migrate(sqlite, domain)
  seedDomain(sqlite, domain)
  const outbox = mkdtempSync(join(tmpdir(), 'wt-act-'))
  app = testEngine(sqlite, domain, { outbox, mailer: recordingMailer(outbox) })
  editor = send(app, await signIn(app, 'editor'))
  anyone = send(app)
})

const json = (value: unknown) => ({ body: JSON.stringify(value) })
const patch = (id: number, body: unknown) => editor('PATCH', `/api/rows/ticket/${id}`, json(body))
const view = (token: unknown) => anyone('POST', '/api/act/view', json({ token }))
const act = (token: unknown, to: unknown) => anyone('POST', '/api/act', json({ token, to }))
const stateOf = (id: number) =>
  (sqlite.query('SELECT state FROM ticket WHERE id = ?').get(id) as { state: string }).state
const tokens = () => sqlite.query('SELECT * FROM action_token ORDER BY id').all() as Record<string, unknown>[]

// Everything but rate_limit, which a failure is meant to change.
const tables = () =>
  Object.fromEntries(['ticket', 'revision', 'batch', 'action_token', 'account'].map((t) => [t, contents(sqlite, t)]))

async function denied(call: Promise<{ status: number; body: Record<string, unknown> }>, status: number, code: string) {
  const before = tables()
  const res = await call
  expect(res.status).toBe(status)
  expect(res.body.code).toBe(code)
  expect(tables()).toEqual(before)
  return res
}

// Moves ticket 1 into b and answers the raw token from the invite's link.
async function invite(id = 1): Promise<{ token: string; batch: string }> {
  const res = await patch(id, { state: 'b' })
  expect(res.status).toBe(200)
  const link = links.at(-1) as string
  expect(link).toStartWith('http://127.0.0.1:5173/#/act/')
  return { token: link.split('/#/act/')[1] as string, batch: res.body.revision.batch_id }
}

describe('the account table', () => {
  test('an existing database migrates: kind user, a rebuild with .pre-migrate, references intact', () => {
    const file = join(mkdtempSync(join(tmpdir(), 'wt-acct-')), 'db.sqlite')
    const db = new Database(file)
    migrate(db, domain)
    const old = defineDataset({
      name: 'account',
      label: 'Account',
      title: 'email',
      custom: false,
      columns: {
        email: { type: 'text', label: 'Email' },
        role: { type: 'text', label: 'Role' },
        subject_dataset: { type: 'text', label: 'Subject dataset', nullable: true },
        subject_id: { type: 'integer', label: 'Subject id', nullable: true },
        disabled_at: { type: 'datetime', label: 'Disabled at', nullable: true },
      },
      checks: ['CHECK (id > 0)', 'UNIQUE (email COLLATE NOCASE)'],
    })
    db.run('PRAGMA foreign_keys = OFF')
    db.run('DROP TABLE account')
    db.run(tableDdl(old))
    db.run("UPDATE _migrations SET hash = 'before' WHERE source = 'account'")
    db.run('PRAGMA foreign_keys = ON')
    db.run("INSERT INTO account (email, role) VALUES ('ed@example.test', 'editor')")
    db.run("INSERT INTO magic_link (account_id, token_hash, expires_at) VALUES (1, 'h', '2999-01-01')")
    db.run("INSERT INTO auth_session (account_id, id_hash, expires_at) VALUES (1, 's', '2999-01-01')")

    migrate(db, domain)

    expect(db.query('SELECT id, email, kind, name FROM account').all()).toEqual([
      { id: 1, email: 'ed@example.test', kind: 'user', name: null },
    ])
    expect(db.query('PRAGMA foreign_key_check').all()).toEqual([])
    expect(db.query('SELECT account_id FROM magic_link').all()).toEqual([{ account_id: 1 }])
    expect(db.query('SELECT account_id FROM auth_session').all()).toEqual([{ account_id: 1 }])
    expect(() => db.run("INSERT INTO account (kind, role, email) VALUES ('link', 'owner', 'x@example.test')")).toThrow()
    expect(() => db.run("INSERT INTO account (kind, role) VALUES ('user', 'editor')")).toThrow()
    expect(existsSync(`${file}.pre-migrate`)).toBe(true)
    const copy = new Database(`${file}.pre-migrate`, { readonly: true })
    const columns = (copy.query('PRAGMA table_info(account)').all() as { name: string }[]).map((c) => c.name)
    expect(columns).not.toContain('kind')
    copy.close()
    db.close()
    expect(tableDdl(account)).toContain("CHECK ((kind = 'user') = (email IS NOT NULL))")
  })

  test('a link account is created once per subject', () => {
    const first = linkAccount(sqlite, { dataset: 'member', id: 1 })
    expect(linkAccount(sqlite, { dataset: 'member', id: 1 })).toEqual(first)
    expect(linkAccount(sqlite, { dataset: 'member', id: 2 }).id).not.toBe(first.id)
    expect(first).toMatchObject({ role: 'owner', kind: 'link', subject: { dataset: 'member', id: 1 } })
    const rows = sqlite.query("SELECT email, role, subject_id FROM account WHERE kind = 'link' ORDER BY id").all()
    expect(rows).toEqual([
      { email: null, role: 'owner', subject_id: 1 },
      { email: null, role: 'owner', subject_id: 2 },
    ])
  })
})

describe('the action token', () => {
  test('the view answers the projection, its column labels and each allowed state with its option label', async () => {
    const { token } = await invite()
    expect(await view(token)).toEqual({
      status: 200,
      body: {
        dataset: 'ticket',
        projection: { member_id: 'Ann', state: 'b' },
        labels: { member_id: 'Member', state: 'State' },
        to: [
          { value: 'c', label: 'C' },
          { value: 'd', label: 'D' },
        ],
      },
    })
  })

  test('mint, view, act: the row moves and the batch actor is the link account', async () => {
    const { token } = await invite()
    expect(tokens()).toHaveLength(1)
    expect(tokens()[0]?.hash).not.toBe(token)

    const shown = await view(token)
    expect(shown.body).toMatchObject({ dataset: 'ticket', projection: { member_id: 'Ann', state: 'b' } })

    const res = await act(token, 'c')
    expect(res.status).toBe(200)
    expect(stateOf(1)).toBe('c')
    const link = linkAccount(sqlite, { dataset: 'member', id: 1 })
    const last = sqlite.query('SELECT actor_id, kind FROM batch ORDER BY rowid DESC LIMIT 1').get()
    expect(last).toEqual({ actor_id: link.id, kind: 'write' })
    expect(tokens()[0]?.used_at).not.toBeNull()

    const history = await editor('GET', '/api/history/ticket')
    expect(history.body.entries[0]).toMatchObject({ by: 'link', actor: 'Ann' })
  })

  test('garbage, used, expired and reassigned tokens get one identical 401, the row unchanged', async () => {
    const { token } = await invite()
    const bodies: unknown[] = []
    bodies.push((await denied(act('garbage', 'c'), 401, 'bad_token')).body)
    bodies.push((await denied(act('x'.repeat(200), 'c'), 401, 'bad_token')).body)
    bodies.push((await denied(act(42, 'c'), 401, 'bad_token')).body)

    sqlite.run("UPDATE action_token SET expires_at = '2000-01-01T00:00:00.000Z'")
    bodies.push((await denied(act(token, 'c'), 401, 'bad_token')).body)
    bodies.push((await denied(view(token), 401, 'bad_token')).body)
    sqlite.run("UPDATE action_token SET expires_at = '2999-01-01T00:00:00.000Z'")

    sqlite.run('UPDATE ticket SET member_id = 2 WHERE id = 1')
    bodies.push((await denied(act(token, 'c'), 401, 'bad_token')).body)
    bodies.push((await denied(view(token), 401, 'bad_token')).body)
    sqlite.run('UPDATE ticket SET member_id = 1 WHERE id = 1')

    expect((await act(token, 'c')).status).toBe(200)
    bodies.push((await denied(act(token, 'c'), 401, 'bad_token')).body)
    bodies.push((await denied(view(token), 401, 'bad_token')).body)
    expect(stateOf(1)).toBe('c')
    expect(new Set(bodies.map((b) => JSON.stringify(b))).size).toBe(1)
  })

  test('a to outside the token is 422 transition_not_allowed and leaves the token unused', async () => {
    const { token } = await invite()
    await denied(act(token, 'a'), 422, 'transition_not_allowed')
    expect((await act(token, 'd')).status).toBe(200)
    expect(stateOf(1)).toBe('d')
  })

  test('an editor confirms first: /act is 409 and the token stays unused', async () => {
    const { token } = await invite()
    expect((await patch(1, { state: 'c', expect: { state: 'b' } })).status).toBe(200)
    await denied(act(token, 'd'), 409, 'transition_lost')
    expect(tokens()[0]?.used_at).toBeNull()
  })

  test("an editor's undo of the token's batch is 403", async () => {
    const { token } = await invite()
    await act(token, 'c')
    const { key } = sqlite.query('SELECT key FROM batch ORDER BY rowid DESC LIMIT 1').get() as { key: string }
    await denied(editor('POST', `/api/batches/${key}/undo`, json({})), 403, 'forbidden')
  })

  test('an undo of the minting batch marks the token used; /act is then 401', async () => {
    const { token, batch } = await invite()
    expect((await editor('POST', `/api/batches/${batch}/undo`, json({}))).status).toBe(200)
    expect(stateOf(1)).toBe('a')
    expect(tokens()[0]?.used_at).not.toBeNull()
    await denied(act(token, 'c'), 401, 'bad_token')
  })

  test('a re-mint revokes the earlier token', async () => {
    const first = await invite()
    expect((await patch(1, { state: 'a' })).status).toBe(200)
    const second = await invite()
    await denied(act(first.token, 'c'), 401, 'bad_token')
    expect((await act(second.token, 'c')).status).toBe(200)
  })

  test('a record with an empty owner column mints no token, and the mail gets a null link', async () => {
    expect((await patch(2, { state: 'b' })).status).toBe(200)
    expect(tokens()).toEqual([])
    expect(links).toEqual([null])
  })
})

describe('the public routes', () => {
  test('the 21st failure from one address is 429', async () => {
    for (let i = 0; i < 10; i++) expect((await act(`bad-${i}`, 'c')).status).toBe(401)
    for (let i = 0; i < 10; i++) expect((await view(`bad-${i}`)).status).toBe(401)
    const { token } = await invite()
    await denied(view(token), 429, 'rate_limited')
    await denied(act(token, 'c'), 429, 'rate_limited')
  })

  test('a success counts nothing', async () => {
    const { token } = await invite()
    for (let i = 0; i < 25; i++) expect((await view(token)).status).toBe(200)
  })

  test('no Access-Control-* header, and the three no-store headers on every response, 401 and 429 included', async () => {
    const { token } = await invite()
    const post = (path: string, body: unknown) =>
      app.request(path, {
        method: 'POST',
        headers: { host: '127.0.0.1:4310', 'content-type': 'application/json' },
        body: JSON.stringify(body),
      })
    const responses = [await post('/api/act/view', { token }), await post('/api/act', { token: 'bad', to: 'c' })]
    for (let i = 0; i < 20; i++) await post('/api/act', { token: 'bad', to: 'c' })
    responses.push(await post('/api/act/view', { token }))
    expect(responses.map((r) => r.status)).toEqual([200, 401, 429])
    for (const res of responses) {
      expect(res.headers.get('cache-control')).toBe('no-store')
      expect(res.headers.get('referrer-policy')).toBe('no-referrer')
      expect(res.headers.get('x-robots-tag')).toBe('noindex')
      expect([...res.headers.keys()].filter((k) => k.startsWith('access-control-'))).toEqual([])
    }
  })
})
