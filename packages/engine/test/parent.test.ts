import { Database } from 'bun:sqlite'
import { beforeEach, describe, expect, test } from 'bun:test'
import { createAccount, type Domain, defineDataset, importExport, migrate } from '../src'
import { createService } from '../src/auth'
import { contents } from './fixture'
import { signIn, testEngine } from './sign-in'

type Body = Record<string, unknown>

const accept = (values: Record<string, unknown>) => values

const node = defineDataset({
  name: 'node',
  label: 'Nodes',
  title: 'name',
  custom: false,
  parent: 'parent_id',
  columns: {
    name: { type: 'text', label: 'Name' },
    parent_id: { type: 'integer', label: 'Parent', relation: 'node', nullable: true },
  },
})

const domain: Domain = {
  datasets: [node],
  queries: [],
  seed: () => {},
  views: [],
  writers: { node: { create: accept, update: accept, delete: () => {} } },
}

let sqlite: Database
let app: ReturnType<typeof testEngine>

const json = (value: unknown) => JSON.stringify(value)
const HOST = { host: '127.0.0.1:4310', 'content-type': 'application/json' }

type As = (method: string, path: string, body?: unknown) => Promise<{ status: number; body: Body }>

function asCookie(cookie: string): As {
  return async (method, path, body) => {
    const res = await app.request(path, {
      method,
      headers: { ...HOST, cookie },
      body: body === undefined ? undefined : json(body),
    })
    return { status: res.status, body: (await res.json()) as Body }
  }
}

function asToken(token: string): As {
  return async (method, path, body) => {
    const res = await app.request(path, {
      method,
      headers: { ...HOST, authorization: `Bearer ${token}` },
      body: body === undefined ? undefined : json(body),
    })
    return { status: res.status, body: (await res.json()) as Body }
  }
}

let editor: As
let admin: As

beforeEach(async () => {
  sqlite = new Database(':memory:')
  migrate(sqlite, domain)
  app = testEngine(sqlite, domain)
  editor = asCookie(await signIn(app))
  admin = asCookie(await signIn(app, 'administrator'))
})

const make = async (name: string, parent_id: number | null = null, as: As = editor) => {
  const res = await as('POST', '/api/rows/node', { name, parent_id })
  expect(res.status).toBe(201)
  return res.body.id as number
}
const move = (id: number, parent_id: number | null, as: As = editor) =>
  as('PATCH', `/api/rows/node/${id}`, { parent_id })
const parentOf = (id: number) =>
  (sqlite.query('SELECT parent_id FROM node WHERE id = ?').get(id) as { parent_id: number | null }).parent_id
const state = () => [contents(sqlite, 'node'), contents(sqlite, 'revision'), contents(sqlite, 'batch')]

async function refused(write: () => Promise<{ status: number; body: Body }>, status: number, code: string) {
  const before = state()
  const res = await write()
  expect({ status: res.status, code: res.body.code }).toEqual({ status, code })
  expect(state()).toEqual(before)
}

describe('the parent rule on write', () => {
  test('a row cannot be its own parent', async () => {
    const a = await make('a')
    await refused(() => move(a, a), 422, 'parent_cycle')
  })

  test('A under B, then B under A is refused and both rows are unchanged', async () => {
    const a = await make('a')
    const b = await make('b')
    expect((await move(a, b)).status).toBe(200)
    await refused(() => move(b, a), 422, 'parent_cycle')
    expect([parentOf(a), parentOf(b)]).toEqual([b, null])
  })

  test('a loop through a longer chain is refused alike', async () => {
    const a = await make('a')
    const b = await make('b', a)
    const c = await make('c', b)
    await refused(() => move(a, c), 422, 'parent_cycle')
  })

  test('a loop closed by an undo is refused and nothing is undone', async () => {
    const a = await make('a')
    const b = await make('b', a)
    const cleared = await move(b, null)
    expect(cleared.status).toBe(200)
    expect((await move(a, b)).status).toBe(200)
    await refused(() => editor('POST', `/api/batches/${cleared.body.revision.batch_id}/undo`, {}), 422, 'parent_cycle')
    expect([parentOf(a), parentOf(b)]).toEqual([b, null])
  })

  test('an import cannot hold a parent loop: a self-relation is refused before any write', () => {
    const actor = {
      id: createAccount(sqlite, domain, 'import@example.test', 'administrator'),
      role: 'administrator' as const,
      subject: null,
    }
    const data = {
      worktable_export: 1,
      datasets: {
        node: [
          { legacy_id: 1, name: 'a', parent_id: 2 },
          { legacy_id: 2, name: 'b', parent_id: 1 },
        ],
      },
    }
    expect(() => importExport(sqlite, domain, data, actor, { acceptReport: true })).toThrow(
      expect.objectContaining({ status: 400, code: 'bad_import' }),
    )
    expect(contents(sqlite, 'node')).toEqual([])
  })

  test('a chain of 70 is refused on the 65th link as parent_too_deep', async () => {
    let last = await make('n1')
    for (let n = 2; n <= 65; n++) last = await make(`n${n}`, last)
    for (let n = 66; n <= 70; n++) {
      await refused(() => editor('POST', '/api/rows/node', { name: `n${n}`, parent_id: last }), 422, 'parent_too_deep')
    }
    expect(contents(sqlite, 'node')).toHaveLength(65)
  })

  test('a legacy loop cannot spin the walk: a write into it is parent_too_deep', async () => {
    const a = await make('a')
    const b = await make('b', a)
    sqlite.query('UPDATE node SET parent_id = ? WHERE id = ?').run(b, a)
    const c = await make('c')
    await refused(() => move(c, a), 422, 'parent_too_deep')
  })

  test('a parent that is deleted is 400 bad_relation', async () => {
    const a = await make('a')
    const b = await make('b')
    expect((await editor('DELETE', `/api/rows/node/${a}`)).status).toBe(200)
    await refused(() => move(b, a), 400, 'bad_relation')
  })

  test('a parent with live children cannot be deleted: 409 in_use', async () => {
    const a = await make('a')
    const b = await make('b', a)
    await refused(() => editor('DELETE', `/api/rows/node/${a}`), 409, 'in_use')
    expect((await move(b, null)).status).toBe(200)
    expect((await editor('DELETE', `/api/rows/node/${a}`)).status).toBe(200)
  })

  test('clearing the parent works', async () => {
    const a = await make('a')
    const b = await make('b', a)
    expect((await move(b, null)).status).toBe(200)
    expect(parentOf(b)).toBeNull()
  })

  test('a service and an administrator are refused alike', async () => {
    const a = await make('a')
    const b = await make('b', a)
    const service = asToken(createService(sqlite, 'bot', 'administrator'))
    for (const as of [admin, service]) {
      await refused(() => move(a, b, as), 422, 'parent_cycle')
      await refused(() => move(a, a, as), 422, 'parent_cycle')
    }
  })
})
