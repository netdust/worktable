import { Database } from 'bun:sqlite'
import { beforeEach, describe, expect, test } from 'bun:test'
import { type Domain, defineDataset, migrate } from '../src'
import { send } from './fixture'
import { signIn, testEngine } from './sign-in'

const accept = (values: Record<string, unknown>) => values
const status = {
  type: 'text',
  label: 'Status',
  options: { open: 'Open', fin: 'Fin', off: 'Off', busy: 'Busy' },
  categories: { open: 'open', fin: 'done', off: 'cancelled', busy: 'active' },
} as const

const item = defineDataset({
  name: 'item',
  label: 'Items',
  title: 'name',
  custom: false,
  parent: 'parent_id',
  archive_after: 30,
  owners: { owner: 'werk_id' },
  columns: {
    name: { type: 'text', label: 'Name', owner_visible: true, owner_writable: true },
    werk_id: { type: 'integer', label: 'Werk', relation: 'werk', nullable: true },
    parent_id: { type: 'integer', label: 'Parent', relation: 'item', nullable: true },
    status: { ...status, default: 'open', nullable: true },
  },
})

// plain declares the same column with no archive_after: it never archives.
const plain = defineDataset({
  name: 'plain',
  label: 'Plains',
  title: 'name',
  custom: false,
  columns: { name: { type: 'text', label: 'Name' }, status: { ...status, default: 'open' } },
})

const werk = defineDataset({
  name: 'werk',
  label: 'Werken',
  title: 'name',
  custom: false,
  owners: { owner: 'id' },
  progress: { dataset: 'item', key: 'werk_id', column: 'status' },
  links: {
    items: { label: 'Items', item: 'Item', dataset: 'item', key: 'werk_id', target: 'werk_id', state: 'status' },
  },
  columns: { name: { type: 'text', label: 'Name' } },
})

const domain: Domain = {
  datasets: [werk, item, plain],
  queries: [],
  seed: () => {},
  views: [],
  writers: Object.fromEntries(
    ['werk', 'item', 'plain'].map((n) => [n, { create: accept, update: accept, delete: () => {} }]),
  ),
}

type Request = ReturnType<typeof send>
type Row = { id: number; progress?: { done: number; total: number }; links?: Record<string, { id: number }[]> }

let sqlite: Database
let editor: Request
let owner: Request

const DAY = 86_400_000
const ago = (days: number) => new Date(Date.now() - days * DAY).toISOString()
const list = async (as: Request, query = '', source = 'item') => (await as('GET', `/api/rows/${source}${query}`)).body
const ids = async (as: Request, query = '', source = 'item') =>
  ((await list(as, query, source)).rows as Row[]).map((r) => r.id)

// A row that has been in `state` since `days` ago: created then and its last status revision then.
function row(state: string | null, days: number, werkId = 1, source = 'item'): number {
  const columns = source === 'item' ? '(name, werk_id, status, created_at)' : '(name, status, created_at)'
  const marks = source === 'item' ? '(?, ?, ?, ?)' : '(?, ?, ?)'
  const values = source === 'item' ? ['r', werkId, state, ago(days)] : ['r', state, ago(days)]
  const id = Number(sqlite.query(`INSERT INTO ${source} ${columns} VALUES ${marks}`).run(...values).lastInsertRowid)
  return id
}

function revised(id: number, days: number, source = 'item'): void {
  const sql = `INSERT INTO revision (entity, record_id, field, old, new, actor_id, at, batch_id)
    VALUES (?, ?, 'status', NULL, '"x"', -1, ?, 'b')`
  sqlite.query(sql).run(source, id, ago(days))
}

beforeEach(async () => {
  sqlite = new Database(':memory:')
  migrate(sqlite, domain)
  sqlite.query("INSERT INTO werk (name) VALUES ('w1'), ('w2')").run()
  const app = testEngine(sqlite, domain)
  editor = send(app, await signIn(app, 'editor'))
  owner = send(app, await signIn(app, 'owner', { dataset: 'werk', id: 1 }))
})

describe('the cutoff', () => {
  test('done 31 days ago is hidden at 30 days, done 29 days ago is shown', async () => {
    const old = row('fin', 31)
    revised(old, 31)
    const fresh = row('fin', 29)
    revised(fresh, 29)
    expect(await ids(editor)).toEqual([fresh])
  })

  test('cancelled archives like done; open and active never do', async () => {
    const off = row('off', 90)
    const open = row('open', 90)
    const busy = row('busy', 90)
    expect(await ids(editor)).toEqual([open, busy])
    expect(await ids(editor, '?archived=1')).toEqual([off, open, busy])
  })

  test('archived=1 returns the archived row, and total agrees on both', async () => {
    const old = row('fin', 40)
    const open = row('open', 40)
    const shown = await list(editor)
    expect((shown.rows as Row[]).map((r) => r.id)).toEqual([open])
    expect(shown.total).toBe(1)
    const all = await list(editor, '?archived=1')
    expect((all.rows as Row[]).map((r) => r.id)).toEqual([old, open])
    expect(all.total).toBe(2)
  })

  test('a row created already done archives from its creation, with no revision', async () => {
    const id = row('fin', 31)
    const kept = row('fin', 5)
    expect(await ids(editor)).toEqual([kept])
    expect(await ids(editor, '?archived=1')).toEqual([id, kept])
  })

  test('a row created through the API as done archives 30 days on', async () => {
    const res = await editor('POST', '/api/rows/item', {
      body: JSON.stringify({ name: 'new', werk_id: 1, status: 'fin' }),
    })
    expect(res.status).toBe(201)
    const id = (res.body as Row).id
    expect(await ids(editor)).toContain(id)
    sqlite.query('UPDATE revision SET at = ? WHERE entity = ? AND record_id = ?').run(ago(31), 'item', id)
    sqlite.query('UPDATE item SET created_at = ? WHERE id = ?').run(ago(31), id)
    expect(await ids(editor)).not.toContain(id)
  })

  test('the newest status revision counts, not an older one nor the creation', async () => {
    const id = row('fin', 100)
    revised(id, 100)
    revised(id, 2)
    expect(await ids(editor)).toEqual([id])
  })

  test('moving the status out of done shows the row again at once', async () => {
    const id = row('fin', 60)
    expect(await ids(editor)).toEqual([])
    const res = await editor('PATCH', `/api/rows/item/${id}`, { body: JSON.stringify({ status: 'open' }) })
    expect(res.status).toBe(200)
    expect(await ids(editor)).toEqual([id])
  })

  test('a stale value and a NULL are never archived', async () => {
    const stale = row('gone', 90)
    const none = row(null, 90)
    expect(await ids(editor)).toEqual([stale, none])
  })

  test('a dataset without archive_after is untouched', async () => {
    const id = row('fin', 400, 1, 'plain')
    expect(await ids(editor, '', 'plain')).toEqual([id])
  })
})

describe('archived is a display switch, never a permission (threat 5)', () => {
  test('an owner with archived=1 still sees only its own scope', async () => {
    const mine = row('fin', 60, 1)
    const theirs = row('fin', 60, 2)
    expect(await ids(owner)).toEqual([])
    expect(await ids(owner, '?archived=1')).toEqual([mine])
    expect(await ids(editor, '?archived=1')).toEqual([mine, theirs])
    expect((await list(owner, '?archived=1')).total).toBe(1)
  })

  test('an archived row stays out of the owner read without archived=1', async () => {
    row('fin', 60, 1)
    expect((await list(owner)).total).toBe(0)
  })
})

describe('what stays unfiltered', () => {
  test('a link reads an archived row', async () => {
    const id = row('fin', 60, 1)
    const werkRow = ((await list(editor, '', 'werk')).rows as Row[]).find((r) => r.id === 1)
    expect(werkRow?.links?.items?.map((l) => l.id)).toEqual([id])
  })

  test('progress counts the archived children too', async () => {
    row('fin', 60, 1)
    row('open', 60, 1)
    const werkRow = ((await list(editor, '', 'werk')).rows as Row[]).find((r) => r.id === 1)
    expect(werkRow?.progress).toEqual({ done: 1, total: 2 })
  })

  test('the history of an archived row is still readable', async () => {
    const created = await editor('POST', '/api/rows/item', {
      body: JSON.stringify({ name: 'h', werk_id: 1, status: 'fin' }),
    })
    const id = (created.body as Row).id
    sqlite.query('UPDATE revision SET at = ? WHERE entity = ? AND record_id = ?').run(ago(60), 'item', id)
    sqlite.query('UPDATE item SET created_at = ? WHERE id = ?').run(ago(60), id)
    expect(await ids(editor)).not.toContain(id)
    const res = await editor('GET', '/api/history/item')
    expect(res.status).toBe(200)
    expect((res.body.entries as { record: { id: number } }[]).map((e) => e.record.id)).toContain(id)
  })
})
