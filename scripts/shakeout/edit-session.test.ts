import { describe, expect, it, test } from 'bun:test'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { addDays, addMinutes, expectedPlandag, type Revision, revisionProblems, scalarEdit } from './edit-session.lib'

describe('the shakeout clock', () => {
  it('crosses a month and a year', () => {
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01')
    expect(addMinutes('2026-03-31T23:30', 120)).toBe('2026-04-01T01:30')
    expect(addMinutes('2026-04-01T00:30', -60)).toBe('2026-03-31T23:30')
  })

  it('puts a start before the day line on the previous plandag', () => {
    expect(expectedPlandag('2026-05-02T01:30', 5)).toBe('2026-05-01')
    expect(expectedPlandag('2026-05-02T05:00', 5)).toBe('2026-05-02')
  })
})

describe('an edit value', () => {
  it('differs from the current one', () => {
    expect(scalarEdit({ type: 'text', label: '', options: { a: 'A', b: 'B' } }, 'a')).toBe('b')
    expect(scalarEdit({ type: 'boolean', label: '' }, true)).toBe(false)
    expect(scalarEdit({ type: 'date', label: '' }, '2026-02-28')).toBe('2026-03-01')
  })
})

describe('revision problems', () => {
  const columns = { naam: { type: 'text' as const, label: '' }, actief: { type: 'boolean' as const, label: '' } }
  const rev = (field: string, old: unknown, value: unknown): Revision => ({
    id: 1,
    entity: 'x',
    record_id: 7,
    field,
    old: JSON.stringify(old),
    new: JSON.stringify(value),
    actor_id: 3,
    batch_id: 'b',
  })
  const expectFor = (fields: string[]) => ({
    entity: 'x',
    id: 7,
    actor: 3,
    columns,
    before: { naam: 'a', actief: 1 },
    after: { naam: 'b', actief: 0 },
    fields,
  })

  it('accepts decoded before and after values of exactly the changed fields', () => {
    expect(
      revisionProblems([rev('naam', 'a', 'b'), rev('actief', true, false)], expectFor(['naam', 'actief'])),
    ).toEqual([])
  })

  it('expects the id marker on a create, with the new id', () => {
    const created = { ...expectFor(['naam']), before: undefined, after: { id: 7, naam: 'b' } }
    expect(revisionProblems([rev('id', null, 7), rev('naam', null, 'b')], created)).toEqual([])
    expect(revisionProblems([rev('naam', null, 'b')], created)).toEqual([
      'revised fields differ from the changed fields',
    ])
  })

  it('names a missing field and a wrong old value', () => {
    expect(revisionProblems([rev('naam', 'z', 'b')], expectFor(['naam', 'actief']))).toEqual([
      'revised fields differ from the changed fields',
      'revision old of naam is not the value before',
    ])
  })
})

test('refuses to write its detail inside the repository', async () => {
  const repo = join(import.meta.dir, '..', '..')
  const proc = Bun.spawn(
    [
      'bun',
      join(import.meta.dir, 'edit-session.ts'),
      '--db',
      join(tmpdir(), 'copy.db'),
      '--outbox',
      join(tmpdir(), 'outbox'),
      '--out',
      join(repo, 'scratch'),
    ],
    { stdout: 'pipe', stderr: 'pipe' },
  )
  expect(await proc.exited).toBe(2)
  expect(await new Response(proc.stderr).text()).toContain('refusing to write inside the repository')
})
