import { Database } from 'bun:sqlite'
import { beforeEach, describe, expect, test } from 'bun:test'
import { migrate, seedDomain } from '@worktable/engine'
import { createService } from '@worktable/engine/src/auth'
import { signIn, testEngine } from '@worktable/engine/test/sign-in'
import studio from '../src'

type Body = Record<string, unknown>

let app: ReturnType<typeof testEngine>
let sqlite: Database
let claude: (method: string, path: string, body?: Body) => Promise<{ status: number; body: Body }>
let admin: typeof claude

const sender =
  (auth: Record<string, string>): typeof claude =>
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
  claude = sender({ authorization: `Bearer ${createService(sqlite, 'claude', 'editor')}` })
})

const counts = ['updates_plugins', 'updates_themas', 'updates_core'] as const

describe('a site’s update counts', () => {
  test('may be empty: the worker writes null for a read that failed, and the row keeps no stale count', async () => {
    for (const column of counts) {
      const res = await claude('PATCH', '/api/rows/site/2', { [column]: null })
      expect(res.status, `${column}: ${JSON.stringify(res.body)}`).toBe(200)
    }
    const row = sqlite.query('SELECT updates_plugins, updates_themas, updates_core FROM site WHERE id = 2').get()
    expect(row).toEqual({ updates_plugins: null, updates_themas: null, updates_core: null })
  })

  test('a person still cannot write them', async () => {
    for (const column of counts) {
      const res = await admin('PATCH', '/api/rows/site/2', { [column]: null })
      expect([403, 422], column).toContain(res.status)
    }
  })

  test('are served as nullable columns', async () => {
    const served = (await admin('GET', '/api/schema')).body as {
      sources: Record<string, { columns: Record<string, { nullable?: boolean }> }>
    }
    for (const column of counts) expect(served.sources.site.columns[column].nullable, column).toBe(true)
  })
})
