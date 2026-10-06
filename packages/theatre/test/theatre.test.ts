import { Database } from 'bun:sqlite'
import { describe, expect, test } from 'bun:test'
import { migrate, seedDomain, validateDomain } from '@worktable/engine'
import { signIn, testEngine } from '@worktable/engine/test/sign-in'
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

// A seeded view belongs to no account; saving each as a new view runs it through the saved-view rules.
test('the seeded views are shared, owned by no account, and pass the saved-view rules', async () => {
  const sqlite = new Database(':memory:')
  migrate(sqlite, theatre)
  seedDomain(sqlite, theatre)
  const app = testEngine(sqlite, theatre)
  const headers = { host: '127.0.0.1:4310', 'content-type': 'application/json', cookie: await signIn(app) }
  const { views } = (await (await app.request('/api/views', { headers })).json()) as {
    views: Record<string, unknown>[]
  }
  expect(views.length).toBe(theatre.views.length)
  expect(views.every((v) => v.shared === true && v.owner_id === -1 && v.mine === false)).toBe(true)
  for (const v of views) {
    const res = await app.request('/api/views', { method: 'POST', headers, body: JSON.stringify(v) })
    expect({ name: v.name, status: res.status }).toEqual({ name: v.name, status: 201 })
  }
})

describe('voorstellingen', () => {
  type Show = { id: number; datum: string; start: string | null }

  async function shows(sqlite: Database) {
    const app = testEngine(sqlite, theatre)
    const headers = { host: '127.0.0.1:4310', 'content-type': 'application/json', cookie: await signIn(app) }
    const write = (body: unknown) =>
      app.request('/api/rows/activiteit', { method: 'POST', headers, body: JSON.stringify(body) })
    const read = async () =>
      ((await (await app.request('/api/rows/voorstellingen?limit=500', { headers })).json()) as { rows: Show[] }).rows
    return { write, read }
  }

  const seeded = () => {
    const sqlite = new Database(':memory:')
    migrate(sqlite, theatre)
    seedDomain(sqlite, theatre)
    return sqlite
  }

  test('an untimed show has its datum and an empty start', async () => {
    const { write, read } = await shows(seeded())
    const res = await write({ productie_id: 1, soort: 'voorstelling', status: 'bevestigd', datum: '2026-10-30' })
    const { id } = (await res.json()) as { id: number }
    expect((await read()).find((s) => s.id === id)).toMatchObject({ datum: '2026-10-30', start: null })
  })

  // id 9 starts 2026-10-14T00:30, so its plandag is the 13th; the website shows the calendar day.
  test('a 00:30 show keeps its calendar datum', async () => {
    const sqlite = seeded()
    const { read } = await shows(sqlite)
    expect(sqlite.query('SELECT plandag FROM activiteit WHERE id = 9').get()).toEqual({ plandag: '2026-10-13' })
    expect((await read()).find((s) => s.id === 9)).toMatchObject({ datum: '2026-10-14', start: '00:30' })
  })
})
