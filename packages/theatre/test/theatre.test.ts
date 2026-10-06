import { Database } from 'bun:sqlite'
import { expect, test } from 'bun:test'
import { createEngine, migrate, seedDomain, validateDomain } from '@worktable/engine'
import theatre from '../src'

test('the theatre domain migrates, seeds and answers productie_dag', () => {
  const sqlite = new Database(':memory:')
  migrate(sqlite, theatre)
  seedDomain(sqlite, theatre)
  const dag = sqlite
    .query("SELECT activiteiten, voorstellingen FROM productie_dag WHERE productie_id = 1 AND plandag = '2026-10-12'")
    .get()
  expect(dag).toEqual({ activiteiten: 5, voorstellingen: 1 })
  const night = sqlite.query("SELECT plandag FROM activiteit WHERE start_at = '2026-10-14T00:30'").get()
  expect(night).toEqual({ plandag: '2026-10-13' })
})

test('the theatre domain validates', () => {
  expect(() => validateDomain(theatre)).not.toThrow()
})

test('the seeded views are shared, owned by the dev actor, and pass the saved-view rules', async () => {
  const sqlite = new Database(':memory:')
  migrate(sqlite, theatre)
  seedDomain(sqlite, theatre)
  const app = createEngine(sqlite, theatre, { port: 4310 })
  const headers = { host: '127.0.0.1:4310', 'content-type': 'application/json' }
  const { views } = (await (await app.request('/api/views', { headers })).json()) as {
    views: Record<string, unknown>[]
  }
  expect(views.length).toBe(theatre.views.length)
  expect(views.every((v) => v.shared === true && v.owner_id === 0 && v.mine === true)).toBe(true)
  for (const v of views) {
    const res = await app.request(`/api/views/${v.id}`, {
      method: 'PATCH',
      headers,
      body: JSON.stringify({ name: v.name }),
    })
    expect({ name: v.name, status: res.status }).toEqual({ name: v.name, status: 200 })
  }
})
