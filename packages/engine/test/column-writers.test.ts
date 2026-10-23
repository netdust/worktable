import { Database } from 'bun:sqlite'
import { beforeEach, describe, expect, test } from 'bun:test'
import { drizzle } from 'drizzle-orm/bun-sqlite'
import {
  type ActionDecl,
  type ColumnDecl,
  type Domain,
  DomainError,
  defineDataset,
  defineQuery,
  importExport,
  migrate,
  seedDomain,
  validateDomain,
} from '../src'
import { createAccount, createService } from '../src/auth'
import { silentMailer } from '../src/mailer'
import { seedMissing } from '../src/seed-missing'
import { SYSTEM } from '../src/views'
import { contextOf, runWrite, type Store, valuesOf, writableOf } from '../src/writes'
import { contents, send } from './fixture'
import { signIn, testEngine } from './sign-in'

type Request = ReturnType<typeof send>

const json = (value: unknown) => ({ body: JSON.stringify(value) })
const text: ColumnDecl = { type: 'text', label: 'T' }
const SERVICE_ONLY = { status: 403, code: 'service_only' }
const PDF = new TextEncoder().encode('%PDF-1.4\n1 0 obj\n<<>>\nendobj\ntrailer\n<<>>\n%%EOF\n')

const writerCalls: string[] = []
const links: (string | null)[] = []
const counted = (op: string) => (values: Record<string, unknown>) => {
  writerCalls.push(op)
  return values
}
const writer = { create: counted('create'), update: counted('update'), delete: () => void writerCalls.push('delete') }

const unit = defineDataset({
  name: 'unit',
  label: 'Units',
  title: 'name',
  custom: false,
  columns: {
    name: text,
    probe: { ...text, nullable: true, written_by: 'service' },
    hits: { type: 'integer', label: 'Hits', nullable: true, footer: 'none' },
    size: { type: 'integer', label: 'Size', nullable: true, footer: 'sum' },
    stage: { type: 'text', label: 'Stage', options: { open: 'Open', busy: 'Busy', done: 'Done' }, default: 'open' },
  },
  board: { column: 'stage', drag: false },
  lifecycle: {
    column: 'stage',
    transitions: [
      { from: ['open'], to: 'busy', roles: ['editor', 'administrator'], button: 'Start', primary: true },
      { from: ['busy'], to: 'done', roles: ['editor', 'administrator'], button: 'Stop' },
    ],
  },
  attachments: { kinds: { shot: 'Shot' }, deleted_by: 'person' },
  links: {
    parts: { label: 'Parts', item: 'Part', dataset: 'part', key: 'unit_id', target: 'other_id', meter: false },
    kept: { label: 'Kept', item: 'Part', dataset: 'part', key: 'unit_id', target: 'other_id' },
  },
})

const part = defineDataset({
  name: 'part',
  label: 'Parts',
  title: 'name',
  custom: false,
  columns: {
    name: text,
    unit_id: { type: 'integer', label: 'Unit', relation: 'unit' },
    other_id: { type: 'integer', label: 'Other', relation: 'unit', nullable: true },
  },
})

const feed = defineDataset({
  name: 'feed',
  label: 'Feeds',
  title: 'name',
  custom: false,
  config: true,
  created_by: 'service',
  columns: { name: text, note: { ...text, nullable: true, written_by: 'service' } },
})

const member = defineDataset({
  name: 'member',
  label: 'Members',
  title: 'name',
  custom: false,
  columns: { name: text },
})

const flow = defineDataset({
  name: 'flow',
  label: 'Flows',
  title: 'name',
  custom: false,
  owners: { owner: 'member_id' },
  columns: {
    name: text,
    member_id: { type: 'integer', label: 'Member', relation: 'member', nullable: true },
    state: { type: 'text', label: 'State', options: { a: 'A', b: 'B', c: 'C' }, default: 'a', written_by: 'service' },
  },
  lifecycle: {
    column: 'state',
    transitions: [
      { from: ['a'], to: 'b', roles: ['editor'] },
      { from: ['b'], to: 'c', roles: ['owner'] },
    ],
    hooks: {
      b: () => ({
        token: { to: ['c'], days: 7 },
        mail: (link) => {
          links.push(link)
          return { to: 'ann@example.test', subject: 'Uitnodiging', text: link ?? 'geen link' }
        },
      }),
    },
  },
})

const unitList = defineQuery({
  name: 'unit_list',
  label: 'Unit list',
  title: 'name',
  sql: 'SELECT id, name FROM unit WHERE deleted_at IS NULL',
  of: 'unit',
  selectable: true,
  columns: { id: { type: 'integer', label: 'Id' }, name: text },
})

const actions: Record<string, ActionDecl> = {
  touch: {
    label: 'Touch',
    on: 'unit',
    input: {},
    run: (record) => ({ updates: [{ dataset: 'unit', id: record.id as number, values: { probe: 'by action' } }] }),
  },
  spawn: {
    label: 'Spawn',
    on: 'unit',
    input: {},
    run: () => [{ dataset: 'feed', values: { name: 'by action' } }],
  },
}

const domain: Domain = {
  datasets: [unit, part, feed, member, flow],
  queries: [unitList],
  writers: { unit: writer, part: writer, feed: writer, member: writer, flow: { create: (v) => v, update: (v) => v } },
  actions,
  seed: (insert) => {
    insert('unit', [{ name: 'een' }, { name: 'twee' }])
    insert('feed', [{ name: 'eerste', note: 'seed' }])
    insert('member', [{ name: 'Ann' }])
    insert('flow', [{ name: 'stroom', member_id: 1, state: 'a' }])
  },
  views: [],
}

let sqlite: Database
let app: ReturnType<typeof testEngine>
let editor: Request
let admin: Request
let service: Request

beforeEach(async () => {
  writerCalls.length = 0
  links.length = 0
  sqlite = new Database(':memory:')
  migrate(sqlite, domain)
  seedDomain(sqlite, domain)
  app = testEngine(sqlite, domain)
  editor = send(app, await signIn(app))
  admin = send(app, await signIn(app, 'administrator'))
  service = send(app)
  const token = createService(sqlite, 'bot', 'editor')
  const bearer = { authorization: `Bearer ${token}` }
  service = async (method, path, sent = {}) => {
    const res = await app.request(path, {
      method,
      headers: { host: '127.0.0.1:4310', 'content-type': 'application/json', ...bearer },
      body: sent.body,
    })
    // biome-ignore lint/suspicious/noExplicitAny: response bodies are asserted structurally
    return { status: res.status, body: (await res.json()) as Record<string, any> }
  }
})

const state = () => ({
  unit: contents(sqlite, 'unit'),
  feed: contents(sqlite, 'feed'),
  flow: contents(sqlite, 'flow'),
  revision: contents(sqlite, 'revision'),
  batch: contents(sqlite, 'batch'),
})

async function refused(go: Promise<{ status: number; body: Record<string, unknown> }>) {
  const before = state()
  const res = await go
  expect({ status: res.status, code: res.body.code }).toEqual(SERVICE_ONLY)
  expect(res.body.message).toBeString()
  expect(state()).toEqual(before)
  expect(writerCalls).toEqual([])
}

describe('a column only a service writes', () => {
  test('a person PATCHing it is 403 service_only and the writer never runs', async () => {
    await refused(editor('PATCH', '/api/rows/unit/1', json({ probe: 'x' })))
    await refused(admin('PATCH', '/api/rows/unit/1', json({ name: 'nieuw', probe: 'x' })))
  })

  test('a person POSTing a row that sends it is 403 service_only', async () => {
    await refused(editor('POST', '/api/rows/unit', json({ name: 'drie', probe: 'x' })))
  })

  test('a person running an action that updates it is 403 service_only, and no batch is kept', async () => {
    await refused(editor('POST', '/api/actions/touch', json({ id: 1 })))
  })

  test('a write that leaves it out still works', async () => {
    const res = await editor('PATCH', '/api/rows/unit/1', json({ name: 'nieuw' }))
    expect(res.status).toBe(200)
    expect(writerCalls).toEqual(['update'])
  })

  test('a service PATCHing and POSTing it is 200 and 201', async () => {
    expect((await service('PATCH', '/api/rows/unit/1', json({ probe: 'x' }))).status).toBe(200)
    expect((await service('POST', '/api/rows/unit', json({ name: 'drie', probe: 'y' }))).status).toBe(201)
    expect((await service('POST', '/api/actions/touch', json({ id: 2 }))).status).toBe(201)
    const probes = (sqlite.query('SELECT probe FROM unit ORDER BY id').all() as { probe: string }[]).map((r) => r.probe)
    expect(probes).toEqual(['x', 'by action', 'y'])
  })

  test('a kind-less actor is a person: only the trusted option lets it past', () => {
    const store: Store = { sqlite, db: drizzle(sqlite), domain, mailer: silentMailer, appUrl: '' }
    const target = writableOf(domain, 'unit', 'update', SYSTEM)
    const ctx = () => contextOf(store, SYSTEM, null)
    expect(() => runWrite(store, target, 'update', 1, { probe: 'x' }, SYSTEM)).toThrow(
      expect.objectContaining(SERVICE_ONLY),
    )
    expect(() => valuesOf(store, target, 'update', { probe: 'x' }, ctx(), 'all')).toThrow(
      expect.objectContaining(SERVICE_ONLY),
    )
    expect(valuesOf(store, target, 'update', { probe: 'x' }, ctx(), 'all', { trusted: true })).toMatchObject({
      probe: 'x',
    })
  })

  test('a link account acting through an action token is a person: its write is 403 service_only', async () => {
    expect((await service('PATCH', '/api/rows/flow/1', json({ state: 'b', expect: { state: 'a' } }))).status).toBe(200)
    const token = (links.at(-1) as string).split('/#/act/')[1]
    const before = state()
    const res = await send(app)('POST', '/api/act', json({ token, to: 'c' }))
    expect({ status: res.status, code: res.body.code }).toEqual({ status: 403, code: 'service_only' })
    expect(state()).toEqual(before)
    expect(sqlite.query('SELECT used_at FROM action_token').all()).toEqual([{ used_at: null }])
  })
})

describe('a dataset only a service creates', () => {
  test('a person POSTing a row is 403 service_only, the writer never runs', async () => {
    await refused(editor('POST', '/api/rows/feed', json({ name: 'nieuw' })))
    await refused(admin('POST', '/api/rows/feed', json({ name: 'nieuw' })))
  })

  test('a person creating one through an action is 403 service_only', async () => {
    await refused(editor('POST', '/api/actions/spawn', json({ id: 1 })))
  })

  test('a person still updates its other columns', async () => {
    expect((await editor('PATCH', '/api/rows/feed/1', json({ name: 'anders' }))).status).toBe(200)
  })

  test('a service POSTs and creates it through an action', async () => {
    expect((await service('POST', '/api/rows/feed', json({ name: 'nieuw' }))).status).toBe(201)
    expect((await service('POST', '/api/actions/spawn', json({ id: 1 }))).status).toBe(201)
  })
})

describe('the import and --seed-missing are trusted', () => {
  const emptyDb = () => {
    const db = new Database(':memory:')
    migrate(db, domain)
    return db
  }

  test('the import creates a created_by row with a written_by column', () => {
    const db = emptyDb()
    const admin = { id: createAccount(db, domain, 'a@example.test', 'administrator'), role: 'administrator' as const }
    const data = { worktable_export: 1, source: 'x', datasets: { feed: [{ legacy_id: 1, name: 'oud', note: 'n' }] } }
    const result = importExport(db, domain, data, { ...admin, subject: null }, { acceptReport: false })
    expect(result.refused).toEqual([])
    expect(db.query('SELECT name, note FROM feed').all()).toEqual([{ name: 'oud', note: 'n' }])
  })

  test('--seed-missing creates a created_by row with a written_by column', () => {
    const db = emptyDb()
    seedMissing(db, domain)
    expect(db.query('SELECT name, note FROM feed').all()).toEqual([{ name: 'eerste', note: 'seed' }])
  })
})

describe('attachments deleted_by person', () => {
  const headers = {
    host: '127.0.0.1:4310',
    'content-type': 'application/octet-stream',
    'content-length': String(PDF.length),
  }

  async function uploaded(by: 'editor' | 'service'): Promise<{ id: number; batch: string }> {
    const token = by === 'service' ? createService(sqlite, `up-${Math.random()}`, 'editor') : null
    const cookie = by === 'editor' ? await signIn(app) : undefined
    const res = await app.request('/api/attachments/unit/1?kind=shot&name=a.pdf', {
      method: 'POST',
      headers: { ...headers, ...(token ? { authorization: `Bearer ${token}` } : { cookie: cookie as string }) },
      body: PDF,
    })
    expect(res.status).toBe(201)
    const body = (await res.json()) as { id: number; revision: { batch_id: string } }
    return { id: body.id, batch: body.revision.batch_id }
  }

  const live = () => (sqlite.query('SELECT deleted_at FROM attachment').all() as { deleted_at: string | null }[])[0]

  test("a service's DELETE of a person's file is 403 service_only and the file stays", async () => {
    const { id } = await uploaded('editor')
    const res = await service('DELETE', `/api/attachments/file/${id}`)
    expect({ status: res.status, code: res.body.code }).toEqual(SERVICE_ONLY)
    expect(live()?.deleted_at).toBeNull()
  })

  test("a service's undo of its own upload is 403 service_only and the file stays", async () => {
    const token = createService(sqlite, 'uploader', 'editor')
    const res = await app.request('/api/attachments/unit/1?kind=shot&name=a.pdf', {
      method: 'POST',
      headers: { ...headers, authorization: `Bearer ${token}` },
      body: PDF,
    })
    const { revision } = (await res.json()) as { revision: { batch_id: string } }
    const undo = await app.request(`/api/batches/${revision.batch_id}/undo`, {
      method: 'POST',
      headers: { host: '127.0.0.1:4310', 'content-type': 'application/json', authorization: `Bearer ${token}` },
    })
    expect({ status: undo.status, code: ((await undo.json()) as { code: string }).code }).toEqual(SERVICE_ONLY)
    expect(live()?.deleted_at).toBeNull()
    expect(sqlite.query('SELECT undone_by FROM batch WHERE key = ?').get(revision.batch_id)).toEqual({
      undone_by: null,
    })
  })

  test('a person deletes the file, and undoes that', async () => {
    const { id } = await uploaded('editor')
    expect((await admin('DELETE', `/api/attachments/file/${id}`)).status).toBe(200)
    expect(live()?.deleted_at).toBeString()
  })
})

describe('/schema serves the shapes per viewer', () => {
  const schema = async (as: Request) => (await as('GET', '/api/schema')).body.sources

  test('a written_by column is readonly to a person and not to a service', async () => {
    for (const as of [editor, admin]) {
      const columns = (await schema(as)).unit.columns
      expect(columns.probe.readonly).toBe(true)
      expect(columns.name.readonly).toBeUndefined()
      expect((await schema(as)).feed.columns.note.readonly).toBe(true)
    }
    const columns = (await schema(service)).unit.columns
    expect(columns.probe.readonly).toBeUndefined()
    expect((await schema(service)).feed.columns.note.readonly).toBeUndefined()
  })

  test('footer, created_by, board.drag, lifecycle.buttons, link.meter and query selectable are served', async () => {
    const sources = await schema(editor)
    expect([sources.unit.columns.hits.footer, sources.unit.columns.size.footer]).toEqual(['none', 'sum'])
    expect(sources.feed.created_by).toBe('service')
    expect(sources.unit.created_by).toBeUndefined()
    expect(sources.unit.board).toEqual({ column: 'stage', drag: false })
    expect(sources.unit.lifecycle).toEqual({ column: 'stage', buttons: true })
    expect(sources.flow.lifecycle).toEqual({ column: 'state' })
    expect(sources.unit.links.parts.meter).toBe(false)
    expect(sources.unit.links.kept.meter).toBeUndefined()
    expect(sources.unit_list.selectable).toBe(true)
    expect(sources.unit.selectable).toBeUndefined()
  })

  test("a row's available.buttons carry primary only where declared", async () => {
    const rows = (as: Request) => as('GET', '/api/rows/unit?sort=id')
    const first = (await rows(editor)).body.rows[0]
    expect(first.available.buttons).toEqual([{ to: 'busy', label: 'Start', primary: true }])
    expect((await editor('PATCH', '/api/rows/unit/1', json({ stage: 'busy' }))).status).toBe(200)
    const moved = (await rows(editor)).body.rows[0]
    expect(moved.available.buttons).toEqual([{ to: 'done', label: 'Stop' }])
  })
})

describe('the validation refusals', () => {
  const dataset = (over: Partial<Parameters<typeof defineDataset>[0]> = {}) =>
    defineDataset({ name: 'a', label: 'A', title: 'name', custom: false, columns: { name: text }, ...over })
  const withWriter = (over: Partial<Domain>): Domain => ({
    datasets: [dataset()],
    queries: [],
    writers: { a: { create: (v) => v, update: (v) => v } },
    seed: () => {},
    views: [],
    ...over,
  })

  function failure(d: Domain): DomainError {
    try {
      validateDomain(d)
    } catch (e) {
      if (e instanceof DomainError) return e
      throw e
    }
    throw new Error('expected DomainError')
  }

  const refusal = (d: Domain, declaration: string, bad: string) => {
    const e = failure(d)
    expect([e.declaration, e.bad]).toEqual([declaration, bad])
  }

  test('the test domain itself is valid', () => {
    expect(() => validateDomain(domain)).not.toThrow()
  })

  test('selectable only with of', () => {
    const q = defineQuery({
      name: 'q',
      label: 'Q',
      title: 'name',
      sql: 'SELECT 1 AS id',
      selectable: true,
      columns: { id: { type: 'integer', label: 'Id' }, name: text },
    })
    refusal(withWriter({ queries: [q] }), 'q', 'selectable')
  })

  test('footer only on number columns', () => {
    const d = dataset({ columns: { name: { ...text, footer: 'sum' } } })
    refusal(withWriter({ datasets: [d] }), 'a', 'name')
  })

  test('primary only with a button', () => {
    const d = dataset({
      columns: { name: text, st: { ...text, options: { x: 'X', y: 'Y' }, default: 'x' } },
      lifecycle: { column: 'st', transitions: [{ from: ['x'], to: 'y', roles: ['editor'], primary: true }] },
    })
    refusal(withWriter({ datasets: [d] }), 'a', 'y')
  })

  test('no written_by with owner_writable', () => {
    const d = dataset({
      columns: { name: { ...text, owner_visible: true, owner_writable: true, written_by: 'service' } },
      owners: { owner: 'id' },
    })
    refusal(withWriter({ datasets: [d] }), 'a', 'name')
  })

  test('no written_by on a lifecycle column with button transitions', () => {
    const d = dataset({
      columns: { name: text, st: { ...text, options: { x: 'X', y: 'Y' }, default: 'x', written_by: 'service' } },
      lifecycle: { column: 'st', transitions: [{ from: ['x'], to: 'y', roles: ['editor'], button: 'Go' }] },
    })
    refusal(withWriter({ datasets: [d] }), 'a', 'st')
    const quiet = dataset({
      columns: { name: text, st: { ...text, options: { x: 'X', y: 'Y' }, default: 'x', written_by: 'service' } },
      lifecycle: { column: 'st', transitions: [{ from: ['x'], to: 'y', roles: ['editor'] }] },
    })
    expect(() => validateDomain(withWriter({ datasets: [quiet] }))).not.toThrow()
  })

  test('no query writes mapping onto a written_by column', () => {
    const d = dataset({ columns: { name: { ...text, written_by: 'service' } } })
    const q = defineQuery({
      name: 'q',
      label: 'Q',
      title: 'name',
      sql: 'SELECT 1 AS id',
      columns: {
        id: { type: 'integer', label: 'Id' },
        name: { ...text, writes: { dataset: 'a', field: 'name', key: 'id' } },
      },
    })
    refusal(withWriter({ datasets: [d], queries: [q] }), 'q', 'name')
  })

  test('no query creates naming a created_by dataset', () => {
    const d = dataset({ created_by: 'service' })
    const q = defineQuery({
      name: 'q',
      label: 'Q',
      title: 'name',
      sql: 'SELECT 1 AS id',
      creates: 'a',
      columns: { id: { type: 'integer', label: 'Id' }, name: text },
    })
    refusal(withWriter({ datasets: [d], queries: [q] }), 'q', 'a')
  })
})
