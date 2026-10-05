import { Database } from 'bun:sqlite'
import { expect, test } from 'bun:test'
import { migrate, seedDomain } from '@worktable/engine'
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
