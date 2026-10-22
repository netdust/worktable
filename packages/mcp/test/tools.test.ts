import { Database } from 'bun:sqlite'
import { beforeEach, describe, expect, test } from 'bun:test'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { type Domain, migrate, seedDomain } from '../../engine/src'
import { createService } from '../../engine/src/auth'
import { domain, freshDb } from '../../engine/test/fixture'
import lineDomain from '../../engine/test/fixtures/lookup-domain'
import selectionDomain from '../../engine/test/fixtures/selection-domain'
import { testEngine } from '../../engine/test/sign-in'
import { assertIds, EngineClient, type FetchFn } from '../src/client'
import { registerTools } from '../src/tools'

const BASE = 'http://127.0.0.1:4310'

type App = ReturnType<typeof testEngine>
type Counted = FetchFn & { calls: number; urls: string[] }

// app.request builds its Request from the URL alone, so the Host a real fetch would send is set here.
function viaApp(app: App): Counted {
  const fetchFn = ((url, init) => {
    fetchFn.calls++
    fetchFn.urls.push(url)
    const headers = new Headers(init.headers)
    headers.set('host', '127.0.0.1:4310')
    return Promise.resolve(app.request(url, { ...init, headers }))
  }) as Counted
  fetchFn.calls = 0
  fetchFn.urls = []
  return fetchFn
}

async function connect(fetchFn: FetchFn, token: string, timeoutMs?: number): Promise<Client> {
  const server = new McpServer({ name: 'worktable', version: '0.0.0' })
  registerTools(server, new EngineClient(BASE, token, { fetchFn, timeoutMs }))
  const [clientSide, serverSide] = InMemoryTransport.createLinkedPair()
  const client = new Client({ name: 'test', version: '0.0.0' })
  await Promise.all([server.connect(serverSide), client.connect(clientSide)])
  return client
}

interface Called {
  isError: boolean
  text: string
  // biome-ignore lint/suspicious/noExplicitAny: tool results are asserted structurally
  body: any
}

async function call(client: Client, name: string, args: Record<string, unknown> = {}): Promise<Called> {
  const result = await client.callTool({ name, arguments: args })
  const text = (result.content as { type: string; text: string }[])[0]?.text ?? ''
  let body: unknown = null
  try {
    body = JSON.parse(text)
  } catch {}
  return { isError: result.isError === true, text, body }
}

function engineOn(sqlite: Database, decl: Domain) {
  const app = testEngine(sqlite, decl)
  const token = createService(sqlite, 'claude', 'editor')
  const direct = async (path: string) =>
    (await app.request(path, { headers: { host: '127.0.0.1:4310', authorization: `Bearer ${token}` } })).json()
  return { app, token, direct }
}

let engine: ReturnType<typeof engineOn>
let fetchFn: Counted
let client: Client

beforeEach(async () => {
  engine = engineOn(freshDb(), domain)
  fetchFn = viaApp(engine.app)
  client = await connect(fetchFn, engine.token)
})

describe('reading', () => {
  test('schema lists the sources', async () => {
    const { isError, body } = await call(client, 'schema')
    expect(isError).toBe(false)
    const direct = (await engine.direct('/api/schema')) as { sources: object }
    expect(Object.keys(body.sources)).toEqual(Object.keys(direct.sources))
    expect(Object.keys(body.sources)).toContain('note')
  })

  test('rows reads a source with a filter, sort and limit', async () => {
    const filter = { status: 'open' }
    const { isError, body } = await call(client, 'rows', { source: 'taak', filter, sort: ['-prio', 'id'], limit: 2 })
    expect(isError).toBe(false)
    const query = `filter=${encodeURIComponent(JSON.stringify(filter))}&sort=-prio,id&limit=2`
    const direct = (await engine.direct(`/api/rows/taak?${query}`)) as { rows: { id: number }[] }
    const ids = (body.rows as { id: number }[]).map((r) => r.id)
    expect(ids).toEqual(direct.rows.map((r) => r.id))
    expect(ids).toHaveLength(2)
  })

  test('rows asks 100 rows when no limit is given', async () => {
    await call(client, 'rows', { source: 'taak' })
    expect(new URL(fetchFn.urls.at(-1) ?? '').searchParams.get('limit')).toBe('100')
  })

  test('rows reports total and pages with offset', async () => {
    const all = await call(client, 'rows', { source: 'taak', sort: ['id'] })
    const page = await call(client, 'rows', { source: 'taak', sort: ['id'], limit: 1, offset: 1 })
    expect(page.body.total).toBe(4)
    expect(page.body.rows.map((r: { id: number }) => r.id)).toEqual([all.body.rows[1].id])
  })

  test('history lists a row revisions', async () => {
    await call(client, 'update', { dataset: 'note', id: 1, values: { tekst: 'herzien' } })
    const { isError, body } = await call(client, 'history', { dataset: 'note', id: 1 })
    expect(isError).toBe(false)
    expect(body.revisions.map((r: { field: string }) => r.field)).toContain('tekst')
  })
})

describe('writing', () => {
  test('create then update a row', async () => {
    const created = await call(client, 'create', { dataset: 'note', values: { project_id: 1, tekst: 'nieuw' } })
    expect(created.isError).toBe(false)
    const updated = await call(client, 'update', { dataset: 'note', id: created.body.id, values: { tekst: 'anders' } })
    expect(updated.isError).toBe(false)
    const read = await call(client, 'rows', { source: 'note', filter: { id: created.body.id } })
    expect(read.body.rows[0]).toMatchObject({ tekst: 'anders', lengte: 6 })
  })

  test('action runs a declared action', async () => {
    const { isError, body } = await call(client, 'action', { name: 'copy_notes', id: 1, input: { source: 1 } })
    expect(isError).toBe(false)
    expect(body.created).toHaveLength(3)
    const read = await call(client, 'rows', { source: 'note', filter: { tekst: 'eerste 2' } })
    expect(read.body.total).toBe(1)
  })

  test('a transition needs expect', async () => {
    const sqlite = new Database(':memory:')
    migrate(sqlite, lineDomain)
    seedDomain(sqlite, lineDomain)
    const lines = engineOn(sqlite, lineDomain)
    const linesClient = await connect(viaApp(lines.app), lines.token)
    const line = await call(linesClient, 'create', {
      dataset: 'line',
      values: { name: 'L', item_id: 1, phase: 'open' },
    })
    expect(line.isError).toBe(false)
    const id = line.body.id

    const bare = await call(linesClient, 'update', { dataset: 'line', id, values: { phase: 'done' } })
    expect(bare.isError).toBe(true)
    expect(bare.body).toMatchObject({ status: 400, message: 'a service account writes "phase" with "expect"' })

    const done = await call(linesClient, 'update', {
      dataset: 'line',
      id,
      values: { phase: 'done' },
      expect: { phase: 'open' },
    })
    expect(done.isError).toBe(false)
    expect(done.body.phase).toBe('done')

    const stale = await call(linesClient, 'update', {
      dataset: 'line',
      id,
      values: { phase: 'done' },
      expect: { phase: 'open' },
    })
    expect(stale.isError).toBe(true)
    expect(stale.body).toMatchObject({ status: 409, code: 'transition_lost' })
  })

  test("a writer's refusal is isError with its message", async () => {
    const { isError, body } = await call(client, 'create', { dataset: 'note', values: { project_id: 2, tekst: 'x' } })
    expect(isError).toBe(true)
    expect(body).toMatchObject({ status: 422, code: 'refused', message: 'project Beta is gesloten' })
  })
})

describe('a selection action', () => {
  let selection: ReturnType<typeof engineOn>
  let selectionFetch: Counted
  let selectionClient: Client

  beforeEach(async () => {
    const sqlite = new Database(':memory:')
    migrate(sqlite, selectionDomain)
    seedDomain(sqlite, selectionDomain)
    selection = engineOn(sqlite, selectionDomain)
    selectionFetch = viaApp(selection.app)
    selectionClient = await connect(selectionFetch, selection.token)
  })

  test('action with ids runs a selection action as one batch', async () => {
    const run = await call(selectionClient, 'action', { name: 'gather', ids: [1, 2], input: { name: 'Trio' } })
    expect(run.isError).toBe(false)
    expect(run.body.created).toHaveLength(3)
    expect(typeof run.body.batch_id).toBe('string')
    const ties = await call(selectionClient, 'rows', { source: 'tie', sort: ['id'] })
    expect(ties.body.rows.map((r: { member_id: number }) => r.member_id)).toEqual([1, 2])
    const bundles = await call(selectionClient, 'rows', { source: 'bundle', filter: { name: 'Trio' } })
    expect(bundles.body.total).toBe(1)
  })

  test('both id and ids, or neither, is refused before a request', async () => {
    const tries = [
      call(selectionClient, 'action', { name: 'gather', id: 1, ids: [1], input: { name: 'x' } }),
      call(selectionClient, 'action', { name: 'gather', input: { name: 'x' } }),
    ]
    for (const result of await Promise.all(tries)) {
      expect(result.isError).toBe(true)
      expect(result.text).toContain('exactly one of id or ids')
    }
    expect(selectionFetch.calls).toBe(0)
  })

  test('ids outside 1-500 positive integers are refused before a request', async () => {
    const wrong = [[], Array.from({ length: 501 }, (_, i) => i + 1), [0], [-1], [1.5], ['1'], [1, 2, 1]]
    for (const ids of wrong) {
      const result = await call(selectionClient, 'action', { name: 'touch', ids })
      expect(result.isError).toBe(true)
    }
    expect(selectionFetch.calls).toBe(0)
    const most = await call(selectionClient, 'action', { name: 'touch', ids: [1, 2, 3, 4] })
    expect(most.isError).toBe(false)
    expect(selectionFetch.calls).toBe(1)
  })

  test('500 ids pass the client check', () => {
    expect(() => assertIds(Array.from({ length: 500 }, (_, i) => i + 1))).not.toThrow()
    expect(() => assertIds(Array.from({ length: 501 }, (_, i) => i + 1))).toThrow('at most 500')
  })
})

describe('refusals before any request', () => {
  test('a path in a name is refused before any request', async () => {
    const tries = [
      call(client, 'rows', { source: '../views' }),
      call(client, 'create', { dataset: 'note/1', values: {} }),
      call(client, 'update', { dataset: 'note', id: 0, values: {} }),
      call(client, 'history', { dataset: 'note', id: '1/../../' }),
      call(client, 'action', { name: 'copy_notes/../x', id: 1 }),
    ]
    for (const result of await Promise.all(tries)) expect(result.isError).toBe(true)
    expect(fetchFn.calls).toBe(0)
  })

  test('an SQL wildcard in $like or $nlike is refused before any request', async () => {
    const tries = [
      call(client, 'rows', { source: 'note', filter: { tekst: { $like: '%eer%' } } }),
      call(client, 'rows', { source: 'note', filter: { $or: [{ id: 1 }, { tekst: { $nlike: 'eerste%' } }] } }),
    ]
    for (const result of await Promise.all(tries)) {
      expect(result.isError).toBe(true)
      expect(result.text).toContain('substring')
    }
    expect(fetchFn.calls).toBe(0)
  })

  test('there is no delete tool', async () => {
    const { tools } = await client.listTools()
    expect(tools.map((t) => t.name).sort()).toEqual(['action', 'create', 'history', 'rows', 'schema', 'update'])
  })
})

describe('an instance that does not answer', () => {
  test('a write that times out says it may have landed; a read does not', async () => {
    const hanging = await connect(() => new Promise<Response>(() => {}), engine.token, 50)
    const created = await call(hanging, 'create', { dataset: 'note', values: { project_id: 1, tekst: 'x' } })
    const updated = await call(hanging, 'update', { dataset: 'note', id: 1, values: { tekst: 'y' } })
    const read = await call(hanging, 'schema')
    for (const write of [created, updated]) {
      expect(write.isError).toBe(true)
      expect(write.text).toContain('may have landed: read before retrying')
    }
    expect(read.text).toContain(`worktable at ${BASE} does not answer`)
    expect(read.text).not.toContain('landed')
  })

  test('a write to a real instance that hangs says it may have landed', async () => {
    const hung = Bun.serve({ hostname: '127.0.0.1', port: 0, fetch: () => new Promise<Response>(() => {}) })
    try {
      const server = new McpServer({ name: 'worktable', version: '0.0.0' })
      registerTools(server, new EngineClient(`http://127.0.0.1:${hung.port}`, engine.token, { timeoutMs: 50 }))
      const [clientSide, serverSide] = InMemoryTransport.createLinkedPair()
      const waiting = new Client({ name: 'test', version: '0.0.0' })
      await Promise.all([server.connect(serverSide), waiting.connect(clientSide)])
      const created = await call(waiting, 'create', { dataset: 'note', values: { tekst: 'x' } })
      expect(created.text).toContain('may have landed')
    } finally {
      hung.stop(true)
    }
  })

  test('a refused token reads as a refused service token', async () => {
    const refused = await connect(viaApp(engine.app), 'not-the-token')
    const { isError, body } = await call(refused, 'schema')
    expect(isError).toBe(true)
    expect(body).toMatchObject({
      status: 401,
      message: 'the instance refused the service token (rotated or disabled?)',
    })
  })

  test('an unreachable instance fails fast', async () => {
    const refused = await connect(() => Promise.reject(new TypeError('connection refused')), engine.token)
    const started = Date.now()
    const down = await call(refused, 'schema')
    expect(down.isError).toBe(true)
    expect(down.text).toContain(`worktable at ${BASE} does not answer`)

    const hanging = await connect(() => new Promise<Response>(() => {}), engine.token, 50)
    const silent = await call(hanging, 'schema')
    expect(silent.isError).toBe(true)
    expect(silent.text).toContain(`worktable at ${BASE} does not answer`)
    expect(Date.now() - started).toBeLessThan(2000)
  })

  test('a redirect is not followed, and its error holds no token', async () => {
    let followed = 0
    const target = Bun.serve({ hostname: '127.0.0.1', port: 0, fetch: () => new Response(String(++followed)) })
    const hop = Bun.serve({
      hostname: '127.0.0.1',
      port: 0,
      fetch: () => Response.redirect(`http://localhost:${target.port}/`, 302),
    })
    try {
      const server = new McpServer({ name: 'worktable', version: '0.0.0' })
      registerTools(server, new EngineClient(`http://127.0.0.1:${hop.port}`, engine.token))
      const [clientSide, serverSide] = InMemoryTransport.createLinkedPair()
      const redirected = new Client({ name: 'test', version: '0.0.0' })
      await Promise.all([server.connect(serverSide), redirected.connect(clientSide)])
      const result = await call(redirected, 'schema')
      expect(result.isError).toBe(true)
      expect(result.text).not.toContain(engine.token)
      expect(followed).toBe(0)
    } finally {
      hop.stop(true)
      target.stop(true)
    }
  })
})

test('the token never appears in a result', async () => {
  const leaky = await connect(
    (url, init) => Promise.reject(new Error(`${url} ${JSON.stringify(Object.fromEntries(new Headers(init.headers)))}`)),
    engine.token,
  )
  const results = await Promise.all([
    call(client, 'rows', { source: '../views' }),
    call(client, 'update', { dataset: 'note', id: 0, values: {} }),
    call(client, 'create', { dataset: 'note', values: { project_id: 2, tekst: 'x' } }),
    call(client, 'rows', { source: 'onbekend' }),
    call(client, 'update', { dataset: 'note', id: 1, values: {}, expect: 'kapot' }),
    call(leaky, 'schema'),
    call(leaky, 'create', { dataset: 'note', values: {} }),
  ])
  for (const result of results) {
    expect(result.isError).toBe(true)
    expect(result.text).not.toContain(engine.token)
  }
})
