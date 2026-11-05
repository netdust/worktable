import { Database } from 'bun:sqlite'
import { beforeEach, describe, expect, test } from 'bun:test'
import { type Domain, defineDataset, migrate } from '../src'
import { send } from './fixture'
import { signIn, testEngine } from './sign-in'

const accept = (values: Record<string, unknown>) => values
const status = {
  type: 'text',
  label: 'Status',
  options: { open: 'Open', busy: 'Busy', fin: 'Fin', off: 'Off' },
  categories: { open: 'open', busy: 'active', fin: 'done', off: 'cancelled' },
} as const

// item: its own children (parent) and the ones its werk counts; owned through werk_id.
const item = defineDataset({
  name: 'item',
  label: 'Items',
  title: 'name',
  custom: false,
  parent: 'parent_id',
  owners: { owner: 'werk_id' },
  columns: {
    name: { type: 'text', label: 'Name', owner_visible: true, owner_writable: true },
    werk_id: { type: 'integer', label: 'Werk', relation: 'werk', nullable: true },
    parent_id: { type: 'integer', label: 'Parent', relation: 'item', nullable: true },
    status: { ...status, default: 'open', nullable: true },
  },
})

const werk = defineDataset({
  name: 'werk',
  label: 'Werken',
  title: 'name',
  custom: false,
  owners: { owner: 'id' },
  progress: { dataset: 'item', key: 'werk_id', column: 'status' },
  columns: { name: { type: 'text', label: 'Name' } },
})

// log has no owner column, so an owner cannot read it and its plan carries no progress.
const log = defineDataset({
  name: 'log',
  label: 'Logs',
  title: 'name',
  custom: false,
  columns: {
    name: { type: 'text', label: 'Name' },
    plan_id: { type: 'integer', label: 'Plan', relation: 'plan' },
    status: { ...status, default: 'open' },
  },
})

const plan = defineDataset({
  name: 'plan',
  label: 'Plans',
  title: 'name',
  custom: false,
  owners: { owner: 'werk_id' },
  progress: { dataset: 'log', key: 'plan_id', column: 'status' },
  columns: {
    name: { type: 'text', label: 'Name' },
    werk_id: { type: 'integer', label: 'Werk', relation: 'werk' },
  },
})

const domain: Domain = {
  datasets: [werk, item, plan, log],
  queries: [],
  seed: () => {},
  views: [],
  writers: Object.fromEntries(
    ['werk', 'item', 'plan', 'log'].map((n) => [n, { create: accept, update: accept, delete: () => {} }]),
  ),
}

type Request = ReturnType<typeof send>
type Row = { id: number; progress?: { done: number; total: number } }

let sqlite: Database
let editor: Request
let owner: Request

const rows = async (as: Request, source: string) => ((await as('GET', `/api/rows/${source}`)).body.rows as Row[]) ?? []
const progressOf = async (as: Request, source: string, id: number) =>
  (await rows(as, source)).find((r) => r.id === id)?.progress

function child(parent: number | null, state: string | null, werkId: number | null = 1): number {
  const sql = 'INSERT INTO item (name, parent_id, werk_id, status) VALUES (?, ?, ?, ?)'
  return Number(sqlite.query(sql).run('c', parent, werkId, state).lastInsertRowid)
}
const head = (werkId = 1) => child(null, 'open', werkId)

beforeEach(async () => {
  sqlite = new Database(':memory:')
  migrate(sqlite, domain)
  sqlite.query("INSERT INTO werk (name) VALUES ('w1'), ('w2')").run()
  sqlite.query("INSERT INTO plan (name, werk_id) VALUES ('p1', 1)").run()
  const app = testEngine(sqlite, domain)
  editor = send(app, await signIn(app, 'editor'))
  owner = send(app, await signIn(app, 'owner', { dataset: 'werk', id: 1 }))
})

describe('own children', () => {
  test('one done, one open, one active child is 1 of 3', async () => {
    const p = head()
    for (const s of ['fin', 'open', 'busy']) child(p, s)
    expect(await progressOf(editor, 'item', p)).toEqual({ done: 1, total: 3 })
  })

  test('a cancelled child is not counted', async () => {
    const p = head()
    for (const s of ['fin', 'off', 'off']) child(p, s)
    expect(await progressOf(editor, 'item', p)).toEqual({ done: 1, total: 1 })
  })

  test('a stale or NULL status counts in the total, never as done', async () => {
    const p = head()
    for (const s of ['gone', null, 'fin']) child(p, s)
    expect(await progressOf(editor, 'item', p)).toEqual({ done: 1, total: 3 })
  })

  test('a deleted child is not counted', async () => {
    const p = head()
    const gone = child(p, 'fin')
    child(p, 'open')
    sqlite.query("UPDATE item SET deleted_at = '2026-01-01' WHERE id = ?").run(gone)
    expect(await progressOf(editor, 'item', p)).toEqual({ done: 0, total: 1 })
  })

  test('a row with no children is 0 of 0', async () => {
    expect(await progressOf(editor, 'item', head())).toEqual({ done: 0, total: 0 })
  })

  test('more children than one chunk are all counted', async () => {
    const p = head()
    for (let i = 0; i < 600; i++) child(p, i % 2 ? 'fin' : 'open')
    expect(await progressOf(editor, 'item', p)).toEqual({ done: 300, total: 600 })
  })
})

describe('declared progress', () => {
  test('a werk counts the items that point at it, not its own kind of child', async () => {
    child(null, 'fin', 1)
    child(null, 'open', 1)
    child(null, 'fin', 2)
    expect(await progressOf(editor, 'werk', 1)).toEqual({ done: 1, total: 2 })
    expect(await progressOf(editor, 'werk', 2)).toEqual({ done: 1, total: 1 })
  })
})

describe('the write reply', () => {
  test('carries the row progress, and a child write carries the child only', async () => {
    const p = head()
    child(p, 'fin')
    const patched = await editor('PATCH', `/api/rows/item/${p}`, { body: JSON.stringify({ name: 'renamed' }) })
    expect(patched.body.progress).toEqual({ done: 1, total: 1 })
    const made = await editor('POST', '/api/rows/item', {
      body: JSON.stringify({ name: 'kid', parent_id: p, werk_id: 1 }),
    })
    expect(made.status).toBe(201)
    expect(made.body.progress).toEqual({ done: 0, total: 0 })
    expect(await progressOf(editor, 'item', p)).toEqual({ done: 1, total: 2 })
  })
})

describe('through a viewer scope (threat 3, 4)', () => {
  test('an owner counts only the children inside its own scope', async () => {
    const p = head(1)
    child(p, 'fin', 1)
    child(p, 'open', 2)
    child(p, 'fin', 2)
    expect(await progressOf(editor, 'item', p)).toEqual({ done: 2, total: 3 })
    expect(await progressOf(owner, 'item', p)).toEqual({ done: 1, total: 1 })
  })

  test('an owner write reply counts only its own children too', async () => {
    const p = head(1)
    child(p, 'open', 2)
    child(p, 'fin', 1)
    const res = await owner('PATCH', `/api/rows/item/${p}`, { body: JSON.stringify({ name: 'x' }) })
    expect(res.body.progress).toEqual({ done: 1, total: 1 })
  })

  test('a viewer whose role cannot read the counted dataset gets no progress key', async () => {
    sqlite.query("INSERT INTO log (name, plan_id, status) VALUES ('l', 1, 'fin')").run()
    const seen = (await rows(owner, 'plan'))[0]
    expect(seen).toBeDefined()
    expect('progress' in (seen as Row)).toBe(false)
    expect(await progressOf(editor, 'plan', 1)).toEqual({ done: 1, total: 1 })
  })
})
