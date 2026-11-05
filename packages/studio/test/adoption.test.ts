import { Database } from 'bun:sqlite'
import { expect, test } from 'bun:test'
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
