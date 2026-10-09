import { Database } from 'bun:sqlite'
import { describe, expect, test } from 'bun:test'
import { migrate } from '../src'
import { silentMailer } from '../src/mailer'
import { contextOf, type Store } from '../src/writes'
import { domain } from './fixture'

const SYSTEM = { id: -1, role: 'administrator' as const, subject: null }

function findBy() {
  const sqlite = new Database(':memory:')
  migrate(sqlite, domain)
  sqlite.run("INSERT INTO project (name, deleted_at) VALUES ('gone', '2026-01-01T00:00:00Z')")
  sqlite.run("INSERT INTO project (name) VALUES ('twin'), ('twin'), ('solo')")
  const store = { sqlite, domain, mailer: silentMailer, appUrl: '' } as unknown as Store
  return contextOf(store, SYSTEM, null).findBy
}

describe('ctx.findBy', () => {
  test('returns the first live row by id when several match', () => {
    const row = findBy()('project', { name: 'twin' })
    expect(row).toMatchObject({ name: 'twin' })
    expect(row?.id).toBe(2)
  })

  test('ignores a deleted row, and answers null when nothing matches', () => {
    const find = findBy()
    expect(find('project', { name: 'gone' })).toBeNull()
    expect(find('project', { name: 'nobody' })).toBeNull()
  })

  test.each([
    [{ onbekend: 'x' }, 'findBy: "onbekend" is not a declared column of project'],
    [{ name: null }, 'findBy: "name" may not be matched against null'],
    [{}, 'findBy: a match names no column'],
  ])('refuses %o', (match, message) => {
    expect(() => findBy()('project', match)).toThrow(message)
  })
})
