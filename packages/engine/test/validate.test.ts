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
  test('the fixture domain validates', () => expect(() => validateDomain(domain)).not.toThrow())

  test('title naming an undeclared column throws naming it', () => {
    const e = failure(withDomain({ datasets: [dataset({ title: 'nope' })], queries: [] }))
    expect({ declaration: e.declaration, name: e.name }).toEqual({ declaration: 'a', name: 'nope' })
    expect(e.message).toContain('nope')
  })

  test('date naming an undeclared column throws', () => {
    const e = failure(withDomain({ datasets: [dataset({ date: 'dag' })], queries: [] }))
    expect({ declaration: e.declaration, name: e.name }).toEqual({ declaration: 'a', name: 'dag' })
  })

  test('a query title naming an undeclared column throws', () => {
    const e = failure(withDomain({ datasets: [dataset()], queries: [query({ title: 'nope' })] }))
    expect({ declaration: e.declaration, name: e.name }).toEqual({ declaration: 'q', name: 'nope' })
  })

  test('index column undeclared throws', () => {
    const e = failure(withDomain({ datasets: [dataset({ indexes: [['naam', 'weg']] })], queries: [] }))
    expect({ declaration: e.declaration, name: e.name }).toEqual({ declaration: 'a', name: 'weg' })
  })

  test('relation to an undeclared dataset throws', () => {
    const columns = { naam: text, b_id: { type: 'integer', label: 'B', relation: 'b' } } as const
    const e = failure(withDomain({ datasets: [dataset({ columns })], queries: [] }))
    expect({ declaration: e.declaration, name: e.name }).toEqual({ declaration: 'a', name: 'b' })
  })

  const bad = (label: string, columns: Record<string, ColumnDecl>, datasets = [dataset()], name?: string) =>
    test(`writes ${label} throws`, () => {
      const q = query({ columns: { id: { type: 'integer', label: 'Id' }, naam: text, a_id: text, ...columns } })
      const e = failure(withDomain({ datasets, queries: [q] }))
      expect(e.declaration).toBe('q')
      if (name) expect(e.name).toBe(name)
    })

  bad('to an undeclared dataset', { w: writes({ dataset: 'zzz' }) }, undefined, 'zzz')
  bad('to an undeclared field', { w: writes({ field: 'zzz' }) }, undefined, 'zzz')
  bad('to a readonly field', { w: writes() }, [dataset({ columns: { naam: { ...text, readonly: true } } })], 'naam')
  bad('with a key that is not a query column', { w: writes({ key: 'zzz' }) }, undefined, 'zzz')

  test('a valid writes target validates', () => {
    const q = query({ columns: { id: { type: 'integer', label: 'Id' }, naam: text, a_id: text, w: writes() } })
    expect(() => validateDomain(withDomain({ datasets: [dataset()], queries: [q] }))).not.toThrow()
  })
})
