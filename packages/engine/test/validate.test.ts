import { describe, expect, test } from 'bun:test'
import { type ColumnDecl, type Domain, DomainError, defineDataset, defineQuery, validateDomain } from '../src'
import { domain } from './fixture'

const text: ColumnDecl = { type: 'text', label: 'T' }

const dataset = (over: Partial<Parameters<typeof defineDataset>[0]> = {}) =>
  defineDataset({ name: 'a', label: 'A', title: 'naam', custom: false, columns: { naam: text }, ...over })

const query = (over: Partial<Parameters<typeof defineQuery>[0]> = {}) =>
  defineQuery({
    name: 'q',
    label: 'Q',
    title: 'naam',
    sql: 'SELECT 1 AS id',
    columns: { id: { type: 'integer', label: 'Id' }, naam: text, a_id: { type: 'integer', label: 'A' } },
    ...over,
  })

const withDomain = (over: Partial<Domain>): Domain => ({ ...domain, ...over })

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
  writes: { dataset: 'a', field: 'naam', key: 'a_id', ...over },
})

describe('validateDomain', () => {
  const viaOf = (over: Partial<Parameters<typeof defineDataset>[0]>) =>
    withDomain({
      datasets: [...domain.datasets, dataset(), defineDataset({ name: 'b', label: 'B', custom: false, ...over })],
    })
  const rel = { type: 'integer', label: 'P', relation: 'a' } as ColumnDecl
  const viaA = { a_id: rel, naam: text }

  test('a via title through a relation validates', () =>
    expect(() => validateDomain(viaOf({ title: { via: 'a_id', else: 'naam' }, columns: viaA }))).not.toThrow())

  test('via on a non-relation column is refused', () =>
    expect(failure(viaOf({ title: { via: 'naam', else: 'naam' }, columns: viaA })).bad).toBe('naam'))

  test('else on an undeclared column is refused', () =>
    expect(failure(viaOf({ title: { via: 'a_id', else: 'nope' }, columns: viaA })).bad).toBe('nope'))

  test('a plain relation to a dataset with a via title is refused', () => {
    const b = defineDataset({
      name: 'b',
      label: 'B',
      custom: false,
      title: { via: 'a_id', else: 'naam' },
      columns: viaA,
    })
    const c = defineDataset({
      name: 'c',
      label: 'C',
      custom: false,
      title: 'naam',
      columns: { b_id: { type: 'integer', label: 'B', relation: 'b' }, naam: text },
    })
    expect(failure(withDomain({ datasets: [...domain.datasets, dataset(), b, c] })).bad).toBe('b_id')
  })

  test('a column named title is refused', () =>
    expect(
      failure(withDomain({ datasets: [...domain.datasets, dataset({ columns: { naam: text, title: text } })] })).bad,
    ).toBe('title'))

  test('a relation to a dataset with a via title is refused', () => {
    const b = defineDataset({
      name: 'b',
      label: 'B',
      custom: false,
      title: { via: 'a_id', else: 'naam' },
      columns: viaA,
    })
    const c = defineDataset({
      name: 'c',
      label: 'C',
      custom: false,
      title: { via: 'b_id', else: 'naam' },
      columns: { b_id: { type: 'integer', label: 'B', relation: 'b' }, naam: text },
    })
    expect(failure(withDomain({ datasets: [...domain.datasets, dataset(), b, c] })).bad).toBe('b_id')
  })
  test('the fixture domain validates', () => expect(() => validateDomain(domain)).not.toThrow())

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
    const e = failure(withDomain({ datasets: [dataset({ date: 'dag' })], queries: [] }))
    expect({ declaration: e.declaration, bad: e.bad }).toEqual({ declaration: 'a', bad: 'dag' })
  })

  test('a query title naming an undeclared column throws', () => {
    const e = failure(withDomain({ datasets: [dataset()], queries: [query({ title: 'nope' })] }))
    expect({ declaration: e.declaration, bad: e.bad }).toEqual({ declaration: 'q', bad: 'nope' })
  })

  test('index column undeclared throws', () => {
    const e = failure(withDomain({ datasets: [dataset({ indexes: [['naam', 'weg']] })], queries: [] }))
    expect({ declaration: e.declaration, bad: e.bad }).toEqual({ declaration: 'a', bad: 'weg' })
  })

  test('relation to an undeclared dataset throws', () => {
    const columns = { naam: text, b_id: { type: 'integer', label: 'B', relation: 'b' } } as const
    const e = failure(withDomain({ datasets: [dataset({ columns })], queries: [] }))
    expect({ declaration: e.declaration, bad: e.bad }).toEqual({ declaration: 'a', bad: 'b' })
  })

  const bad = (label: string, columns: Record<string, ColumnDecl>, datasets = [dataset()], name?: string) =>
    test(`writes ${label} throws`, () => {
      const q = query({ columns: { id: { type: 'integer', label: 'Id' }, naam: text, a_id: text, ...columns } })
      const e = failure(withDomain({ datasets, queries: [q] }))
      expect(e.declaration).toBe('q')
      if (name) expect(e.bad).toBe(name)
    })

  bad('to an undeclared dataset', { w: writes({ dataset: 'zzz' }) }, undefined, 'zzz')
  bad('to an undeclared field', { w: writes({ field: 'zzz' }) }, undefined, 'zzz')
  bad('to a readonly field', { w: writes() }, [dataset({ columns: { naam: { ...text, readonly: true } } })], 'naam')
  bad('with a key that is not a query column', { w: writes({ key: 'zzz' }) }, undefined, 'zzz')

  const mapped = () => query({ columns: { id: { type: 'integer', label: 'Id' }, naam: text, a_id: text, w: writes() } })

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
