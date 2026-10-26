import { Database } from 'bun:sqlite'
import { afterEach, expect, setSystemTime, test } from 'bun:test'
import { migrate, seedDomain } from '@worktable/engine'

const zone = process.env.TZ

afterEach(() => {
  setSystemTime()
  process.env.TZ = zone
})

// The seed's moments are computed when the module loads, so it is imported after the clock is set.
test('a check seeded as yesterday lands on yesterday, even on the day the clocks go back', async () => {
  process.env.TZ = 'Europe/Brussels'
  setSystemTime(new Date('2026-10-25T23:30:00+01:00'))
  const { default: studio } = await import('../src')
  const sqlite = new Database(':memory:')
  migrate(sqlite, studio)
  seedDomain(sqlite, studio)
  const days = (sqlite.query('SELECT laatste_check FROM site WHERE laatste_check IS NOT NULL').all() as {
    laatste_check: string
  }[]).map((r) => r.laatste_check.slice(0, 10))
  expect(days).toContain('2026-10-24')
  expect(days).toContain('2026-10-23')
})
