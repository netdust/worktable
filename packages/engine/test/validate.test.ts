import { Database } from 'bun:sqlite'
import { describe, expect, test } from 'bun:test'
import { type ColumnDecl, type Domain, DomainError, defineDataset, defineQuery, migrate, validateDomain } from '../src'
import { domain } from './fixture'

const text: ColumnDecl = { type: 'text', label: 'T' }

const dataset = (over: Partial<Parameters<typeof defineDataset>[0]> = {}) =>
  defineDataset({ name: 'a', label: 'A', title: 'name', custom: false, columns: { name: text }, ...over })

const query = (over: Partial<Parameters<typeof defineQuery>[0]> = {}) =>
  defineQuery({
    name: 'q',
    label: 'Q',
    title: 'name',
    sql: 'SELECT 1 AS id',
    columns: { id: { type: 'integer', label: 'Id' }, name: text, a_id: { type: 'integer', label: 'A' } },
    ...over,
  })

const withDomain = (over: Partial<Domain>): Domain => ({ ...domain, actions: {}, ...over })

function failure(d: Domain): DomainError {
  try {
    validateDomain(d)
  } catch (e) {
    if (e instanceof DomainError) return e
    throw e
  }
  throw new Error('expected DomainError')
}

const writes = (over: Partial<NonNullable<ColumnDecl['writes']>> = {}): ColumnDecl => ({
  type: 'text',
  label: 'W',
  writes: { dataset: 'a', field: 'name', key: 'a_id', ...over },
})

describe('validateDomain', () => {
  test('an owner column is id or a relation column', () => {
    const rel = { type: 'integer', label: 'P', relation: 'project' } as ColumnDecl
    const ok = (owner: string) =>
      validateDomain(
        withDomain({
          datasets: [...domain.datasets, dataset({ columns: { name: text, p_id: rel }, owners: { owner } })],
        }),
      )
    expect(() => ok('id')).not.toThrow()
    expect(() => ok('p_id')).not.toThrow()
    const e = failure(withDomain({ datasets: [...domain.datasets, dataset({ owners: { owner: 'name' } })] }))
    expect([e.declaration, e.bad]).toEqual(['a', 'name'])
  })

  test('a domain dataset declaring checks is refused: they are for engine tables', () => {
    const e = failure(withDomain({ datasets: [dataset({ checks: ['CHECK (id > 0)'] })], queries: [] }))
    expect([e.declaration, e.bad]).toEqual(['a', 'checks'])
  })

  const viaOf = (over: Partial<Parameters<typeof defineDataset>[0]>) =>
    withDomain({
      datasets: [...domain.datasets, dataset(), defineDataset({ name: 'b', label: 'B', custom: false, ...over })],
    })
  const rel = { type: 'integer', label: 'P', relation: 'a' } as ColumnDecl
  const viaA = { a_id: rel, name: text }

  test('a via title through a relation validates', () =>
    expect(() => validateDomain(viaOf({ title: { via: 'a_id', else: 'name' }, columns: viaA }))).not.toThrow())

  test('via on a non-relation column is refused', () =>
    expect(failure(viaOf({ title: { via: 'name', else: 'name' }, columns: viaA })).bad).toBe('name'))

  test('else on an undeclared column is refused', () =>
    expect(failure(viaOf({ title: { via: 'a_id', else: 'nope' }, columns: viaA })).bad).toBe('nope'))

  test('a plain relation to a dataset with a via title is refused', () => {
    const b = defineDataset({
      name: 'b',
      label: 'B',
      custom: false,
      title: { via: 'a_id', else: 'name' },
      columns: viaA,
    })
    const c = defineDataset({
      name: 'c',
      label: 'C',
      custom: false,
      title: 'name',
      columns: { b_id: { type: 'integer', label: 'B', relation: 'b' }, name: text },
    })
    expect(failure(withDomain({ datasets: [...domain.datasets, dataset(), b, c] })).bad).toBe('b_id')
  })

  test('a column named title is refused', () =>
    expect(
      failure(withDomain({ datasets: [...domain.datasets, dataset({ columns: { name: text, title: text } })] })).bad,
    ).toBe('title'))

  test('a relation to a dataset with a via title is refused', () => {
    const b = defineDataset({
      name: 'b',
      label: 'B',
      custom: false,
      title: { via: 'a_id', else: 'name' },
      columns: viaA,
    })
    const c = defineDataset({
      name: 'c',
      label: 'C',
      custom: false,
      title: { via: 'b_id', else: 'name' },
      columns: { b_id: { type: 'integer', label: 'B', relation: 'b' }, name: text },
    })
    expect(failure(withDomain({ datasets: [...domain.datasets, dataset(), b, c] })).bad).toBe('b_id')
  })
  test('the fixture domain validates', () => expect(() => validateDomain(domain)).not.toThrow())

  const ENGINE_TABLES = [
    'saved_view',
    'revision',
    'batch',
    '_migrations',
    'account',
    'magic_link',
    'auth_session',
    'rate_limit',
  ]

  test.each(ENGINE_TABLES)('a domain dataset or query named %s is refused at migrate, nothing created', (name) => {
    // Spread past define*, whose name pattern would already stop _migrations.
    for (const over of [{ datasets: [{ ...dataset(), name }], queries: [] }, { queries: [{ ...query(), name }] }]) {
      const sqlite = new Database(':memory:')
      let error: unknown
      try {
        migrate(sqlite, withDomain(over))
      } catch (e) {
        error = e
      }
      expect(error).toBeInstanceOf(DomainError)
      expect([(error as DomainError).declaration, (error as DomainError).bad]).toEqual([name, name])
      expect(sqlite.query("SELECT name FROM sqlite_master WHERE type = 'table'").all()).toEqual([])
    }
  })

  test('the error keeps its own name', () => {
    expect(failure(withDomain({ datasets: [dataset({ title: 'nope' })], queries: [] })).name).toBe('DomainError')
  })

  test('a dataset date and index may name the implicit id', () => {
    const d = dataset({ date: 'id', indexes: [['id']] })
    expect(() => validateDomain(withDomain({ datasets: [d], queries: [] }))).not.toThrow()
  })

  test('title naming an undeclared column throws naming it', () => {
    const e = failure(withDomain({ datasets: [dataset({ title: 'nope' })], queries: [] }))
    expect({ declaration: e.declaration, bad: e.bad }).toEqual({ declaration: 'a', bad: 'nope' })
    expect(e.message).toContain('nope')
  })

  test('date naming an undeclared column throws', () => {
    const e = failure(withDomain({ datasets: [dataset({ date: 'day' })], queries: [] }))
    expect({ declaration: e.declaration, bad: e.bad }).toEqual({ declaration: 'a', bad: 'day' })
  })

  test('a query title naming an undeclared column throws', () => {
    const e = failure(withDomain({ datasets: [dataset()], queries: [query({ title: 'nope' })] }))
    expect({ declaration: e.declaration, bad: e.bad }).toEqual({ declaration: 'q', bad: 'nope' })
  })

  test('index column undeclared throws', () => {
    const e = failure(withDomain({ datasets: [dataset({ indexes: [['name', 'weg']] })], queries: [] }))
    expect({ declaration: e.declaration, bad: e.bad }).toEqual({ declaration: 'a', bad: 'weg' })
  })

  test('relation to an undeclared dataset throws', () => {
    const columns = { name: text, b_id: { type: 'integer', label: 'B', relation: 'b' } } as const
    const e = failure(withDomain({ datasets: [dataset({ columns })], queries: [] }))
    expect({ declaration: e.declaration, bad: e.bad }).toEqual({ declaration: 'a', bad: 'b' })
  })

  const bad = (label: string, columns: Record<string, ColumnDecl>, datasets = [dataset()], name?: string) =>
    test(`writes ${label} throws`, () => {
      const q = query({ columns: { id: { type: 'integer', label: 'Id' }, name: text, a_id: text, ...columns } })
      const e = failure(withDomain({ datasets, queries: [q] }))
      expect(e.declaration).toBe('q')
      if (name) expect(e.bad).toBe(name)
    })

  bad('to an undeclared dataset', { w: writes({ dataset: 'zzz' }) }, undefined, 'zzz')
  bad('to an undeclared field', { w: writes({ field: 'zzz' }) }, undefined, 'zzz')
  bad('to a readonly field', { w: writes() }, [dataset({ columns: { name: { ...text, readonly: true } } })], 'name')
  bad('with a key that is not a query column', { w: writes({ key: 'zzz' }) }, undefined, 'zzz')

  const mapped = () => query({ columns: { id: { type: 'integer', label: 'Id' }, name: text, a_id: text, w: writes() } })

  test('a valid writes target validates', () => {
    const writers = { a: { update: (values: Record<string, unknown>) => values } }
    expect(() => validateDomain(withDomain({ datasets: [dataset()], queries: [mapped()], writers }))).not.toThrow()
  })

  test.each([
    ['no writer', {}],
    ['a writer without update', { a: { create: (values: Record<string, unknown>) => values } }],
  ])('validateDomain refuses a writes target whose dataset has %s', (_, writers) => {
    const e = failure(withDomain({ datasets: [dataset()], queries: [mapped()], writers }))
    expect({ declaration: e.declaration, bad: e.bad }).toEqual({ declaration: 'q', bad: 'a' })
  })
})
