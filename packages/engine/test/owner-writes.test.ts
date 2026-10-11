import { Database } from 'bun:sqlite'
import { beforeEach, describe, expect, test } from 'bun:test'
import {
  type DatasetDecl,
  type Domain,
  DomainError,
  defineDataset,
  type HookResult,
  migrate,
  seedDomain,
  validateDomain,
} from '../src'
import { recordLinkFor } from '../src/record-link'
import { contents } from './fixture'
import { signIn, TEST_LINK_SECRET, testEngine } from './sign-in'

const links: (string | null)[] = []

const member = defineDataset({
  name: 'member',
  label: 'Members',
  title: 'name',
  custom: false,
  columns: { name: { type: 'text', label: 'Name' } },
})

// One column a person link may write (note), one it may read only (name), the lifecycle column and an address.
const ticket: DatasetDecl = defineDataset({
  name: 'ticket',
  label: 'Tickets',
  title: 'name',
  custom: false,
  owners: { owner: 'member_id' },
  record_link: { email: 'inbox' },
  attachments: { kinds: { doc: 'Doc' }, owner_visible: true, owner_writable: true },
  columns: {
    member_id: { type: 'integer', label: 'Member', relation: 'member', nullable: true },
    name: { type: 'text', label: 'Name', owner_visible: true },
    note: { type: 'text', label: 'Note', nullable: true, owner_visible: true, owner_writable: true },
    state: { type: 'text', label: 'State', default: 'a', options: { a: 'A', b: 'B', c: 'C', d: 'D' } },
    inbox: { type: 'text', label: 'Inbox', nullable: true },
  },
  lifecycle: {
    column: 'state',
    transitions: [
      { from: ['a'], to: 'b', roles: ['editor'] },
      { from: ['b'], to: 'c', roles: ['owner', 'editor'] },
      { from: ['b'], to: 'd', roles: ['owner'] },
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
  },
})

// Owned, with files an owner may not see.
const folder = defineDataset({
  name: 'folder',
  label: 'Folders',
  title: 'name',
  custom: false,
  owners: { owner: 'member_id' },
  attachments: { kinds: { doc: 'Doc' } },
  columns: {
    member_id: { type: 'integer', label: 'Member', relation: 'member' },
    name: { type: 'text', label: 'Name' },
  },
})

const domain: Domain = {
  datasets: [member, ticket, folder],
  queries: [],
  seed: (insert) => {
    insert('member', [{ name: 'Ann' }, { name: 'Bob' }])
    insert('ticket', [
      { member_id: 1, name: 'Eerste', state: 'a' },
      { member_id: 2, name: 'Tweede', state: 'a' },
    ])
    insert('folder', [{ member_id: 1, name: 'Map' }])
  },
  views: [],
  writers: {
    member: { create: (v) => v },
    ticket: { create: (v) => v, update: (v) => v, delete: () => {} },
    folder: { create: (v) => v, update: (v) => v },
  },
}

const HOST = '127.0.0.1:4310'
const PDF = new TextEncoder().encode('%PDF-1.4\n1 0 obj\n<<>>\nendobj\ntrailer\n<<>>\n%%EOF\n')

let sqlite: Database
let app: ReturnType<typeof testEngine>
let editor: string
let owner: string

beforeEach(async () => {
  links.length = 0
  sqlite = new Database(':memory:')
  migrate(sqlite, domain)
  seedDomain(sqlite, domain)
  app = testEngine(sqlite, domain)
  editor = await signIn(app, 'editor')
  owner = await signIn(app, 'owner', { dataset: 'member', id: 1 })
})

type As = { cookie: string } | { link: number }
const link = (id = 1): As => ({ link: id })
const asCookie = (cookie: string): As => ({ cookie })

// biome-ignore lint/suspicious/noExplicitAny: response bodies are asserted structurally
type Reply = { status: number; headers: Headers; body: Record<string, any> }

async function call(as: As, method: string, path: string, body?: unknown): Promise<Reply> {
  const credential =
    'link' in as
      ? { authorization: `RecordLink ${recordLinkFor(sqlite, TEST_LINK_SECRET, 'ticket', as.link)}` }
      : { cookie: as.cookie }
  const bytes = body instanceof Uint8Array
  const headers: Record<string, string> = { host: HOST, ...credential }
  if (body !== undefined) headers['content-type'] = bytes ? 'application/octet-stream' : 'application/json'
  const res = await app.request(path, {
    method,
    headers,
    body: body === undefined ? undefined : bytes ? body : JSON.stringify(body),
  })
  const text = await res.text()
  const parsed = text && res.headers.get('content-type')?.includes('json') ? JSON.parse(text) : { text }
  return { status: res.status, headers: res.headers, body: parsed }
}

const act = (body: unknown) =>
  app.request('/api/act', {
    method: 'POST',
    headers: { host: HOST, 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })

const ticketOf = (id: number) =>
  sqlite.query('SELECT name, note, state FROM ticket WHERE id = ?').get(id) as Record<string, unknown>
const linkAccountId = () =>
  (sqlite.query("SELECT id FROM account WHERE kind = 'link' AND subject_id = 1").get() as { id: number }).id

// Everything but rate_limit and account (the link account is made on first use).
const tables = () =>
  Object.fromEntries(['ticket', 'revision', 'batch', 'action_token', 'attachment'].map((t) => [t, contents(sqlite, t)]))

async function denied(run: () => Promise<Reply>, status: number, code: string): Promise<Reply> {
  const before = tables()
  const res = await run()
  expect(res.status).toBe(status)
  expect(res.body.code).toBe(code)
  expect(tables()).toEqual(before)
  return res
}

const upload = (as: As, path = '/api/attachments/ticket/1') => call(as, 'POST', `${path}?kind=doc&name=a.pdf`, PDF)

describe('declaring owner_writable', () => {
  const withColumn = (column: string, decl: Record<string, unknown>): Domain => ({
    ...domain,
    datasets: domain.datasets.map((d) =>
      d.name === 'ticket'
        ? { ...d, columns: { ...d.columns, [column]: { ...d.columns[column], ...decl } } as DatasetDecl['columns'] }
        : d,
    ),
  })

  test('the fixture is valid', () => {
    expect(() => validateDomain(domain)).not.toThrow()
  })

  test.each([
    ['without owner_visible', 'name', { owner_visible: false, owner_writable: true }],
    ['on the owner column', 'member_id', { owner_writable: true }],
    ['on the lifecycle column', 'state', { owner_visible: true, owner_writable: true }],
    ['on the record link address', 'inbox', { owner_visible: true, owner_writable: true }],
    ['on a json column', 'extra', { type: 'json', label: 'Extra', owner_visible: true, owner_writable: true }],
    ['on a readonly column', 'name', { readonly: true, owner_writable: true }],
  ])('is refused %s', (_, column, decl) => {
    expect(() => validateDomain(withColumn(column, decl))).toThrow(DomainError)
  })
})

describe('a person link patching a row', () => {
  test('writes the owner_writable column, replies id and revision only, revised as the link account', async () => {
    const res = await call(link(), 'PATCH', '/api/rows/ticket/1', { note: 'kapot' })
    expect(res.status).toBe(200)
    expect(Object.keys(res.body).sort()).toEqual(['id', 'revision'])
    expect(res.body.revision.changed).toEqual(['note'])
    expect(ticketOf(1).note).toBe('kapot')
    const revision = sqlite.query("SELECT actor_id FROM revision WHERE field = 'note'").get() as { actor_id: number }
    expect(revision.actor_id).toBe(linkAccountId())
  })

  // The state is not owner_visible: a wrong expect must not answer differently from the right one.
  test.each([[{}], [{ note: 'x' }]])('expect tells a link nothing about the state (%p)', async (body) => {
    const right = await call(link(), 'PATCH', '/api/rows/ticket/1', { ...body, expect: { state: 'a' } })
    const wrong = await call(link(), 'PATCH', '/api/rows/ticket/1', { ...body, expect: { state: 'b' } })
    const bad = await call(link(), 'PATCH', '/api/rows/ticket/1', { ...body, expect: 'b' })
    for (const res of [right, wrong, bad]) expect(res.status).toBe(200)
    expect(Object.keys(wrong.body).sort()).toEqual(['id', 'revision'])
    expect(ticketOf(1).state).toBe('a')
  })

  test('a soft-deleted row of its own is 404', async () => {
    sqlite.run("INSERT INTO ticket (member_id, name, state, deleted_at) VALUES (1, 'Weg', 'a', '2026-01-01')")
    await denied(() => call(link(), 'PATCH', '/api/rows/ticket/3', { note: 'x' }), 404, 'unknown_record')
  })

  test('a dataset without an owner column is 404', async () => {
    await denied(() => call(link(), 'PATCH', '/api/rows/member/1', { name: 'x' }), 404, 'unknown_source')
  })

  test.each(['name', 'state', 'member_id', 'inbox', 'custom', 'unknown'])(
    'another column (%s) is 403, naming it',
    async (column) => {
      const res = await denied(
        () => call(link(), 'PATCH', '/api/rows/ticket/1', { note: 'x', [column]: 'b' }),
        403,
        'column_not_owner_writable',
      )
      expect(res.body.column).toBe(column)
    },
  )

  test("another subject's row is 404", async () => {
    await denied(() => call(link(), 'PATCH', '/api/rows/ticket/2', { note: 'x' }), 404, 'unknown_record')
  })

  test.each([
    ['POST', '/api/rows/ticket', { member_id: 1, name: 'x' }],
    ['DELETE', '/api/rows/ticket/1', undefined],
    ['POST', '/api/actions/any', { id: 1, input: {} }],
    ['POST', '/api/batches/any/undo', {}],
    ['PATCH', '/api/attachments/ticket/1', {}],
    ['DELETE', '/api/attachments/ticket/1', undefined],
    ['GET', '/api/rows/ticket', undefined],
    ['PATCH', '/api/rows/ticket/1/extra', { note: 'x' }],
    ['PATCH', '/api/rows/ticket/1/', { note: 'x' }],
    ['GET', '/api/attachments/ticket/1/x', undefined],
    ['POST', '/api/attachments/file/1', {}],
  ])('the fence refuses %s %s', async (method, path, body) => {
    await denied(() => call(link(), method, path, body), 403, 'forbidden')
  })

  test.each(['/api/attachments/ticket/1', '/api/owner/views'])('the fence refuses HEAD %s', async (path) => {
    const before = tables()
    expect((await call(link(), 'HEAD', path)).status).toBe(403)
    expect(tables()).toEqual(before)
  })
})

describe('the action token with values', () => {
  async function invite(): Promise<string> {
    const res = await call(asCookie(editor), 'PATCH', '/api/rows/ticket/1', { state: 'b' })
    expect(res.status).toBe(200)
    return (links.at(-1) as string).split('/#/act/')[1] as string
  }

  test('writes the transition and the values in one batch', async () => {
    const token = await invite()
    const res = await act({ token, to: 'c', values: { note: 'gedaan' } })
    expect(res.status).toBe(200)
    expect(ticketOf(1)).toMatchObject({ state: 'c', note: 'gedaan' })
    const rows = sqlite
      .query(
        "SELECT field, batch_id FROM revision WHERE entity = 'ticket' AND field IN ('state', 'note') AND new != '\"b\"'",
      )
      .all() as { field: string; batch_id: string }[]
    expect(rows.map((r) => r.field).sort()).toEqual(['note', 'state'])
    expect(new Set(rows.map((r) => r.batch_id)).size).toBe(1)
  })

  test('a refused transition writes neither', async () => {
    const token = await invite()
    const before = tables()
    const res = await act({ token, to: 'a', values: { note: 'x' } })
    expect(res.status).toBe(422)
    expect(tables()).toEqual(before)
  })

  test('values naming another column are 403, naming it, and leave the token unused', async () => {
    const token = await invite()
    const before = tables()
    const res = await act({ token, to: 'c', values: { note: 'x', name: 'y' } })
    expect(res.status).toBe(403)
    expect(await res.json()).toMatchObject({ code: 'column_not_owner_writable', column: 'name' })
    expect(tables()).toEqual(before)
    expect((await act({ token, to: 'c' })).status).toBe(200)
  })

  test.each([['x'], [null], [['note']]])('values %p is 400', async (values) => {
    const token = await invite()
    const before = tables()
    const res = await act({ token, to: 'c', values })
    expect(res.status).toBe(400)
    expect(((await res.json()) as { code: string }).code).toBe('bad_body')
    expect(tables()).toEqual(before)
  })
})

describe('owner and link files', () => {
  const insertFile = (record: number, by: number, entity = 'ticket') =>
    (
      sqlite
        .query(
          `INSERT INTO attachment (entity, record_id, kind, name, mime, size, sha256, uploaded_by)
           VALUES (?, ?, 'doc', 'b.pdf', 'application/pdf', 1, 'x', ?) RETURNING id`,
        )
        .get(entity, record, by) as { id: number }
    ).id

  for (const [who, as] of [
    ['a link', () => link()],
    ['an owner session', () => asCookie(owner)],
  ] as const) {
    test(`${who} uploads, lists and downloads its record's files, no-store`, async () => {
      const made = await upload(as())
      expect(made.status).toBe(201)
      const listed = await call(as(), 'GET', '/api/attachments/ticket/1')
      expect(listed.status).toBe(200)
      expect(listed.body.attachments).toMatchObject([{ id: made.body.id, own: true }])
      const file = await call(as(), 'GET', `/api/attachments/file/${made.body.id}`)
      expect(file.status).toBe(200)
      expect(file.headers.get('cache-control')).toBe('no-store')
    })

    test(`${who} deletes its own upload, not an editor's`, async () => {
      const made = await upload(as())
      const theirs = (await upload(asCookie(editor))).body.id
      await denied(() => call(as(), 'DELETE', `/api/attachments/file/${theirs}`), 403, 'forbidden')
      expect((await call(as(), 'DELETE', `/api/attachments/file/${made.body.id}`)).status).toBe(200)
    })

    test(`${who} meets another record's file as an unknown id`, async () => {
      const other = insertFile(2, 1)
      await denied(() => call(as(), 'GET', `/api/attachments/file/${other}`), 404, 'unknown_attachment')
      await denied(() => call(as(), 'DELETE', `/api/attachments/file/${other}`), 404, 'unknown_attachment')
      await denied(() => call(as(), 'GET', '/api/attachments/file/9999'), 404, 'unknown_attachment')
      await denied(() => call(as(), 'GET', '/api/attachments/ticket/2'), 404, 'unknown_record')
      await denied(() => upload(as(), '/api/attachments/ticket/2'), 404, 'unknown_record')
    })

    test(`${who} does not see files a dataset keeps from owners`, async () => {
      const hidden = insertFile(1, 1, 'folder')
      await denied(() => call(as(), 'GET', '/api/attachments/folder/1'), 404, 'unknown_source')
      await denied(() => call(as(), 'GET', `/api/attachments/file/${hidden}`), 404, 'unknown_attachment')
    })
  }
})

describe('what stays as it was', () => {
  test('a signed-in owner writes the lifecycle column and undoes its own transition', async () => {
    await call(asCookie(editor), 'PATCH', '/api/rows/ticket/1', { state: 'b' })
    const res = await call(asCookie(owner), 'PATCH', '/api/rows/ticket/1', { state: 'd', name: 'Mine' })
    expect(res.status).toBe(200)
    expect(res.body.name).toBe('Mine')
    const undone = await call(asCookie(owner), 'POST', `/api/batches/${res.body.revision.batch_id}/undo`, {})
    expect(undone.status).toBe(200)
    expect(ticketOf(1)).toMatchObject({ state: 'b', name: 'Eerste' })
  })

  test('an editor writes any column and reads the row back', async () => {
    const res = await call(asCookie(editor), 'PATCH', '/api/rows/ticket/1', { name: 'Nieuw', note: 'n' })
    expect(res.status).toBe(200)
    expect(res.body).toMatchObject({ id: 1, name: 'Nieuw', note: 'n', state: 'a' })
  })
})
