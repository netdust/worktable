import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { randomBytes } from 'node:crypto'
import { chmodSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { removeTokenFiles, type Stdio, scratchDir, spawnMcp, type ToolResult, tokenFile } from './stdio'

const ENGINE = join(import.meta.dir, '..', '..', 'engine')
const SERVE = join(ENGINE, 'src', 'serve.ts')
const DOMAIN = join(ENGINE, 'test', 'fixtures', 'serve-domain.ts')
const HARNESS_PORTS = [4311, 4312, 4313, 5174, 5175, 5176]
const REFUSED_TOKEN = 'the instance refused the service token (rotated or disabled?)'

type Page = { rows: Record<string, unknown>[]; total: number }

function freePort(): number {
  for (;;) {
    const probe = Bun.serve({ hostname: '127.0.0.1', port: 0, fetch: () => new Response() })
    const { port } = probe
    probe.stop(true)
    if (port !== undefined && !HARNESS_PORTS.includes(port)) return port
  }
}

function cli(db: string, ...flags: string[]): string {
  const run = Bun.spawnSync(['bun', SERVE, '--domain', DOMAIN, '--db', db, ...flags], {
    stdout: 'pipe',
    stderr: 'pipe',
  })
  if (run.exitCode !== 0) throw new Error(`serve.ts ${flags.join(' ')}: ${run.stderr.toString()}`)
  return run.stdout.toString().trim()
}

async function serve(dir: string, port: number, fresh: boolean) {
  const secret = join(dir, 'link-secret')
  writeFileSync(secret, randomBytes(32), { mode: 0o600 })
  chmodSync(secret, 0o600)
  const flags = ['--port', String(port), '--link-secret-file', secret, '--files-dir', join(dir, 'files')]
  const db = join(dir, 'engine.db')
  const proc = Bun.spawn(['bun', SERVE, '--domain', DOMAIN, '--db', db, ...flags, ...(fresh ? ['--fresh'] : [])], {
    stdout: 'pipe',
    stderr: 'inherit',
  })
  const reader = proc.stdout.getReader()
  let out = ''
  while (!out.includes('engine listening')) {
    const { value, done } = await reader.read()
    if (done) throw new Error(`serve.ts exited before listening: ${out}`)
    out += new TextDecoder().decode(value)
  }
  return { proc, db }
}

let dir: string
let port: number
let engine: Awaited<ReturnType<typeof serve>>
let token: string
const tokens: string[] = []
let mcp: Stdio
const seen: string[] = []

function issue(command: '--create-service' | '--rotate-service'): string {
  const issued = cli(engine.db, command, 'claude')
  tokens.push(issued)
  return issued
}

async function call(name: string, args: Record<string, unknown> = {}): Promise<ToolResult> {
  const result = await mcp.call(name, args)
  seen.push(result.text)
  return result
}

async function rows(args: Record<string, unknown>): Promise<Page> {
  const result = await call('rows', args)
  expect(result.isError).toBe(false)
  return JSON.parse(result.text)
}

beforeAll(async () => {
  dir = scratchDir()
  port = freePort()
  engine = await serve(dir, port, true)
  token = issue('--create-service')
  mcp = await spawnMcp(['--url', `http://127.0.0.1:${port}`, '--token-file', tokenFile(token)])
}, 30_000)

afterAll(async () => {
  mcp?.close()
  engine?.proc.kill()
  await engine?.proc.exited
  removeTokenFiles()
})

describe('mcp-lists-rows @e2e', () => {
  test('schema names the sources rows reads', async () => {
    const schema = await call('schema')
    expect(schema.isError).toBe(false)
    expect(Object.keys(JSON.parse(schema.text).sources)).toEqual(
      expect.arrayContaining(['taak', 'note', 'per_project']),
    )
  })

  test("the binary over stdio lists a dataset's rows and a query's rows from a real instance", async () => {
    const taken = await rows({ source: 'taak', sort: ['id'] })
    expect(taken.total).toBe(4)
    expect(taken.rows.map((r) => r.description)).toEqual(['een', 'twee', 'drie', 'vier'])
    const grouped = await rows({ source: 'per_project', sort: ['day'] })
    expect(grouped.rows.map((r) => [r.name, r.day, r.aantal])).toEqual([
      ['Alfa', '2026-10-12', 2],
      ['Beta', '2026-10-14', 1],
      ['Beta', '2026-10-15', 1],
    ])
  })

  test('filter and sort narrow the rows, and limit and offset page them against total', async () => {
    const query = { source: 'taak', filter: { status: 'open' }, sort: ['-prio', 'id'] }
    const whole = await rows(query)
    expect(whole.total).toBe(3)
    expect(whole.rows.map((r) => r.description)).toEqual(['vier', 'een', 'drie'])
    const paged: unknown[] = []
    for (let offset = 0; offset < whole.total; offset += 2) {
      const page = await rows({ ...query, limit: 2, offset })
      expect(page.total).toBe(3)
      paged.push(...page.rows.map((r) => r.description))
    }
    expect(paged).toEqual(['vier', 'een', 'drie'])
    expect(await rows({ ...query, limit: 2, offset: 3 })).toEqual({ rows: [], total: 3 })
  })

  test('calls in flight together each get their own page', async () => {
    const pages = await Promise.all(
      [0, 1, 2, 3].map((offset) => rows({ source: 'taak', sort: ['id'], limit: 1, offset })),
    )
    expect(pages.map((page) => page.rows[0]?.description)).toEqual(['een', 'twee', 'drie', 'vier'])
  })

  test('a filter that matches nothing is an empty page, not an error', async () => {
    expect(await rows({ source: 'taak', filter: { description: 'geen' } })).toEqual({ rows: [], total: 0 })
  })

  // A shake-out finding: the engine's $like matches a substring with % and _ literal. The fix pass drops .failing.
  test.failing('a $like with SQL wildcards finds the rows or is refused, never an empty page', async () => {
    const result = await call('rows', { source: 'taak', filter: { description: { $like: '%ee%' } }, sort: ['id'] })
    if (result.isError) expect(result.text).toContain('$like')
    else expect((JSON.parse(result.text) as Page).rows.map((r) => r.description)).toEqual(['een', 'twee'])
  })

  test('with no limit it answers 100 rows, and total says there are more', async () => {
    for (let n = 1; n <= 100; n++) {
      const made = await call('create', { dataset: 'note', values: { project_id: 1, tekst: `regel ${n}` } })
      expect(made.isError).toBe(false)
    }
    const first = await rows({ source: 'note', sort: ['id'] })
    expect(first.total).toBe(101)
    expect(first.rows).toHaveLength(100)
    const rest = await rows({ source: 'note', sort: ['id'], offset: 100 })
    expect(rest.rows.map((r) => r.tekst)).toEqual(['regel 100'])
    const over = await call('rows', { source: 'note', limit: 5001 })
    expect(over.isError).toBe(true)
    expect(JSON.parse(over.text)).toMatchObject({ status: 400, code: 'bad_limit' })
  }, 30_000)

  test('a created row, updated, reads back changed, history lists both, and a refusal says why', async () => {
    const { id } = JSON.parse(
      (await call('create', { dataset: 'note', values: { project_id: 1, tekst: 'kort' } })).text,
    )
    expect((await call('update', { dataset: 'note', id, values: { tekst: 'langer' } })).isError).toBe(false)
    expect((await rows({ source: 'note', filter: { id } })).rows[0]).toMatchObject({ tekst: 'langer', lengte: 6 })
    const { revisions } = JSON.parse((await call('history', { dataset: 'note', id })).text)
    const tekst = revisions.filter((r: { field: string }) => r.field === 'tekst').map((r: { new: unknown }) => r.new)
    expect(tekst).toEqual(['kort', 'langer'])
    const refused = await call('create', { dataset: 'note', values: { project_id: 2, tekst: 'dicht' } })
    expect(refused.isError).toBe(true)
    expect(JSON.parse(refused.text)).toMatchObject({ status: 422, message: 'project Beta is gesloten' })
  })

  test('a source the instance does not know, or a path for a name, is a refusal Claude can read', async () => {
    const unknown = await call('rows', { source: 'onbekend' })
    expect(unknown.isError).toBe(true)
    expect(JSON.parse(unknown.text)).toMatchObject({ status: 404 })
    const path = await call('rows', { source: '../views' })
    expect(path.isError).toBe(true)
    expect(path.text).toContain('is not an identifier')
  })

  test('a rotated token reads as refused, and a session on the new one reads', async () => {
    token = issue('--rotate-service')
    const refused = await call('rows', { source: 'taak' })
    expect(refused.isError).toBe(true)
    expect(JSON.parse(refused.text)).toMatchObject({ status: 401, message: REFUSED_TOKEN })
    mcp.close()
    mcp = await spawnMcp(['--url', `http://127.0.0.1:${port}`, '--token-file', tokenFile(token)])
    expect((await rows({ source: 'taak' })).total).toBe(4)
  }, 30_000)

  test('a stopped instance fails fast, and the same session reads again once it is back', async () => {
    engine.proc.kill()
    await engine.proc.exited
    const started = performance.now()
    const down = await call('rows', { source: 'taak' })
    expect(performance.now() - started).toBeLessThan(2_000)
    expect(down.isError).toBe(true)
    expect(down.text).toContain(`worktable at http://127.0.0.1:${port} does not answer`)
    engine = await serve(dir, port, false)
    expect((await rows({ source: 'taak' })).total).toBe(4)
  }, 30_000)

  test('a disabled service reads as refused', async () => {
    cli(engine.db, '--disable-service', 'claude')
    const refused = await call('rows', { source: 'taak' })
    expect(refused.isError).toBe(true)
    expect(JSON.parse(refused.text)).toMatchObject({ status: 401, message: REFUSED_TOKEN })
  }, 30_000)

  test('no answer of the session held a token', () => {
    expect(seen.length).toBeGreaterThan(100)
    for (const issued of tokens) for (const text of seen) expect(text).not.toContain(issued)
  })
})
