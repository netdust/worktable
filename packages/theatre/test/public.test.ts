import { Database } from 'bun:sqlite'
import { expect, test } from 'bun:test'
import { migrate, seedDomain } from '@worktable/engine'
import { signIn, testEngine } from '@worktable/engine/test/sign-in'
import theatre from '../src'

const KEYS = ['productie', 'datum', 'start', 'venue', 'adres']

test("the website's calendar reads the seeded Voorstellingen view by its token: exactly productie, datum, start, venue and adres", async () => {
  const sqlite = new Database(':memory:')
  migrate(sqlite, theatre)
  seedDomain(sqlite, theatre)
  const app = testEngine(sqlite, theatre)
  const headers = { host: '127.0.0.1:4310', cookie: await signIn(app, 'administrator') }
  const listed = (await (await app.request('/api/views', { headers })).json()) as {
    views: { id: number; name: string }[]
  }
  const view = listed.views.find((v) => v.name === 'Voorstellingen')
  const shared = await app.request(`/api/views/${view?.id}/share-token`, {
    method: 'PUT',
    headers: { ...headers, 'content-type': 'application/json' },
    body: '{}',
  })
  expect(shared.status).toBe(200)
  const { token } = (await shared.json()) as { token: string }

  const served = await app.request(`/api/public/views/${token}`, { headers: { host: headers.host } })

  expect(served.status).toBe(200)
  const body = (await served.json()) as { columns: { key: string }[]; rows: Record<string, unknown>[]; total: number }
  expect(body.columns.map((c) => c.key)).toEqual(KEYS)
  expect(body.rows.length).toBeGreaterThan(0)
  expect(body.total).toBe(body.rows.length)
  for (const row of body.rows) expect(Object.keys(row).sort()).toEqual([...KEYS].sort())
})
