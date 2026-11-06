import { Database } from 'bun:sqlite'
import { expect, test } from 'bun:test'
import { existsSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { migrate, seedDomain } from '@worktable/engine'
import { signIn, testEngine } from '@worktable/engine/test/sign-in'
import studio from '../src'

type Served = { sources: Record<string, { columns: Record<string, { categories?: Record<string, string> }> }> }

const grouped = (open: string[], active: string[], done: string[], cancelled: string[]) =>
  Object.fromEntries([
    ...open.map((k) => [k, 'open']),
    ...active.map((k) => [k, 'active']),
    ...done.map((k) => [k, 'done']),
    ...cancelled.map((k) => [k, 'cancelled']),
  ])

test('studio declares categories on every status column', async () => {
  const sqlite = new Database(':memory:')
  migrate(sqlite, studio)
  seedDomain(sqlite, studio)
  const app = testEngine(sqlite, studio)
  const res = await app.request('/api/schema', {
    headers: { host: '127.0.0.1:4310', cookie: await signIn(app, 'administrator') },
  })
  const { sources } = (await res.json()) as Served
  expect(sources.taak.columns.status.categories).toEqual(
    grouped(['open'], ['bezig', 'geblokkeerd'], ['gedaan'], ['overgeslagen']),
  )
  expect(sources.werkpakket.columns.fase.categories).toEqual(
    grouped(['ontwerp', 'plan'], ['bouwen', 'review', 'geblokkeerd'], ['klaar'], ['geparkeerd']),
  )
  expect(sources.actie.columns.status.categories).toEqual(
    grouped(
      ['aangevraagd'],
      ['voorbereiden', 'voorbereid', 'bevestigd', 'bezig'],
      ['klaar', 'deels'],
      ['mislukt', 'geannuleerd'],
    ),
  )
  expect(sources.actie_site.columns.state.categories).toEqual(
    grouped(['wacht'], ['te_bevestigen', 'bezig'], ['klaar'], ['mislukt', 'overgeslagen']),
  )
})

const asAdmin = async (app: ReturnType<typeof testEngine>) => ({
  host: '127.0.0.1:4310',
  'content-type': 'application/json',
  cookie: await signIn(app, 'administrator'),
})

async function served(sqlite: Database) {
  const app = testEngine(sqlite, studio)
  const res = await app.request('/api/schema', { headers: await asAdmin(app) })
  return { app, sources: ((await res.json()) as { sources: Record<string, Record<string, unknown>> }).sources }
}

test('studio declares parent, progress and archive', async () => {
  const sqlite = new Database(':memory:')
  migrate(sqlite, studio)
  seedDomain(sqlite, studio)
  const { sources } = await served(sqlite)
  expect(sources.taak).toMatchObject({ parent: 'parent_id', archive_after: 30 })
  expect(sources.taak.progress).toEqual({ dataset: 'taak', key: 'parent_id', column: 'status' })
  expect(sources.actie.archive_after).toBe(14)
  expect(sources.werkpakket.progress).toEqual({ dataset: 'taak', key: 'werkpakket_id', column: 'status' })
  expect(Object.keys(sources.werkpakket.columns as object)).not.toContain('voortgang')
})

test('the seed holds one taak with two children', () => {
  const sqlite = new Database(':memory:')
  migrate(sqlite, studio)
  seedDomain(sqlite, studio)
  const parents = sqlite
    .query('SELECT parent_id AS p, COUNT(*) AS n FROM taak WHERE parent_id IS NOT NULL GROUP BY parent_id')
    .all() as { p: number; n: number }[]
  expect(parents.map((r) => r.n)).toEqual([2])
})

test('a child created with only its parent takes the parent organisatie', async () => {
  const sqlite = new Database(':memory:')
  migrate(sqlite, studio)
  seedDomain(sqlite, studio)
  const app = testEngine(sqlite, studio)
  const headers = await asAdmin(app)
  const parent = await app.request('/api/rows/taak', {
    method: 'POST',
    headers,
    body: JSON.stringify({ titel: 'Ouder', organisatie_id: 2 }),
  })
  const parent_id = ((await parent.json()) as { id: number }).id
  const child = await app.request('/api/rows/taak', {
    method: 'POST',
    headers,
    body: JSON.stringify({ titel: 'Kind', parent_id }),
  })
  expect(child.status).toBe(201)
  const { id } = (await child.json()) as { id: number }
  expect((sqlite.query('SELECT organisatie_id AS o FROM taak WHERE id = ?').get(id) as { o: number }).o).toBe(2)
})

test('migrating the old werkpakket keeps every row, drops voortgang and leaves a backup', () => {
  const dir = mkdtempSync(join(tmpdir(), 'adoption-'))
  const file = join(dir, 'studio.db')
  try {
    const old = {
      ...studio,
      datasets: studio.datasets.map((d) =>
        d.name === 'werkpakket'
          ? {
              ...d,
              progress: undefined,
              columns: { ...d.columns, voortgang: { type: 'text' as const, label: 'Voortgang', nullable: true } },
            }
          : d,
      ),
    }
    const first = new Database(file)
    migrate(first, old)
    seedDomain(first, old)
    first.run("UPDATE werkpakket SET voortgang = '1/2'")
    const before = (first.query('SELECT COUNT(*) AS n FROM werkpakket').get() as { n: number }).n
    expect(before).toBeGreaterThan(0)
    first.close()

    const next = new Database(file)
    migrate(next, studio)
    const columns = (next.query('PRAGMA table_info(werkpakket)').all() as { name: string }[]).map((c) => c.name)
    expect(columns).not.toContain('voortgang')
    expect((next.query('SELECT COUNT(*) AS n FROM werkpakket').get() as { n: number }).n).toBe(before)
    expect(existsSync(`${file}.pre-migrate`)).toBe(true)
    next.close()
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})
