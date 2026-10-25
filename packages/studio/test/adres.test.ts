import { Database } from 'bun:sqlite'
import { beforeEach, describe, expect, test } from 'bun:test'
import { migrate, seedDomain } from '@worktable/engine'
import { createService } from '@worktable/engine/src/auth'
import { signIn, testEngine } from '@worktable/engine/test/sign-in'
import studio from '../src'

type Body = Record<string, unknown>
type Served = { sources: { site: { columns: { adres: unknown } } } }
type Send = (method: string, path: string, body?: Body) => Promise<{ status: number; body: Body }>

let app: ReturnType<typeof testEngine>
let sqlite: Database
let admin: Send
let editor: Send
let worker: Send

const sender =
  (auth: Record<string, string>): Send =>
  async (method, path, body) => {
    const res = await app.request(path, {
      method,
      headers: { host: '127.0.0.1:4310', 'content-type': 'application/json', ...auth },
      body: body === undefined ? undefined : JSON.stringify(body),
    })
    return { status: res.status, body: (await res.json()) as Body }
  }

beforeEach(async () => {
  sqlite = new Database(':memory:')
  migrate(sqlite, studio)
  seedDomain(sqlite, studio)
  app = testEngine(sqlite, studio)
  admin = sender({ cookie: await signIn(app, 'administrator') })
  editor = sender({ cookie: await signIn(app, 'editor') })
  worker = sender({ authorization: `Bearer ${createService(sqlite, 'worker', 'editor')}` })
})

const address = (id: number) =>
  (sqlite.query('SELECT adres FROM site WHERE id = ?').get(id) as { adres: string | null }).adres

describe('a site keeps its address', () => {
  test('the schema serves adres as an href column only the worker writes', async () => {
    const column = ((await admin('GET', '/api/schema')).body as Served).sources.site.columns.adres
    expect(column).toMatchObject({ type: 'text', label: 'Adres', nullable: true, href: true, readonly: true })
  })

  test.each([
    ['an administrator', () => admin],
    ['an editor', () => editor],
  ])('%s cannot write it: 403 service_only, the address stays', async (_, who) => {
    const before = address(1)
    const res = await who()('PATCH', '/api/rows/site/1', { adres: 'https://nep-site.test' })
    expect({ status: res.status, code: res.body.code }).toEqual({ status: 403, code: 'service_only' })
    expect(address(1)).toBe(before)
  })

  test('the worker writes a good address and is refused a bad one', async () => {
    expect((await worker('PATCH', '/api/rows/site/1', { adres: 'https://voorbeeld-site.test' })).status).toBe(200)
    expect(address(1)).toBe('https://voorbeeld-site.test')
    const bad = await worker('PATCH', '/api/rows/site/1', { adres: 'javascript:alert(1)' })
    expect({ status: bad.status, code: bad.body.code }).toEqual({ status: 400, code: 'bad_url' })
    expect(address(1)).toBe('https://voorbeeld-site.test')
  })

  test('every seeded site holds an invented address', () => {
    const rows = sqlite.query('SELECT adres FROM site').all() as { adres: string | null }[]
    expect(rows.length).toBeGreaterThan(0)
    for (const { adres } of rows) expect(adres).toMatch(/^https:\/\/[a-z-]+\.test$/)
  })
})
