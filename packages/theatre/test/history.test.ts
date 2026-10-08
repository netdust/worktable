import { Database } from 'bun:sqlite'
import { expect, test } from 'bun:test'
import { migrate, seedDomain } from '@worktable/engine'
import { signIn, testEngine } from '@worktable/engine/test/sign-in'
import theatre from '../src'

type Entries = { entries: { record: { id: number }; changes: { field: string }[] }[] }

// A query without creates has no records of its own, so it has no history.
test('productie_dag and voorstellingen answer no entries; dagplanning answers its activiteit', async () => {
  const sqlite = new Database(':memory:')
  migrate(sqlite, theatre)
  seedDomain(sqlite, theatre)
  const app = testEngine(sqlite, theatre)
  const cookie = await signIn(app, 'editor')
  const { id } = sqlite.query('SELECT id FROM dagplanning ORDER BY id LIMIT 1').get() as { id: number }
  sqlite.run(`INSERT INTO batch (key, actor_id, kind, at) VALUES ('b', 1, 'write', '2026-10-08T10:00:00.000Z')`)
  sqlite.run(
    `INSERT INTO revision (entity, record_id, field, old, new, actor_id, at, batch_id)
     VALUES ('activiteit', ${id}, 'status', '"optie"', '"bevestigd"', 1, '2026-10-08T10:00:00.000Z', 'b')`,
  )
  const entries = async (source: string) => {
    const res = await app.request(`/api/history/${source}`, { headers: { host: '127.0.0.1:4310', cookie } })
    expect(res.status).toBe(200)
    return ((await res.json()) as Entries).entries
  }
  expect(await entries('productie_dag')).toEqual([])
  expect(await entries('voorstellingen')).toEqual([])
  const [entry] = await entries('dagplanning')
  expect(entry?.record.id).toBe(id)
  expect(entry?.changes.map((c) => c.field)).toEqual(['status'])
})
