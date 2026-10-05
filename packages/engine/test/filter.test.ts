import { describe, expect, test } from 'bun:test'
import { drizzle } from 'drizzle-orm/bun-sqlite'
import type { SQLiteColumn } from 'drizzle-orm/sqlite-core'
import type { DatasetDecl, FilterInput } from '../src'
import { filterCompile, tableOf } from '../src'
import { compileFilter } from '../src/filter'
import { domain, freshDb } from './fixture'

const taak = domain.datasets.find((d) => d.name === 'taak') as DatasetDecl
const table = tableOf(taak)
const db = drizzle(freshDb())

const ids = (filter: FilterInput): number[] =>
  db
    .select({ id: (table as unknown as { id: SQLiteColumn }).id })
    .from(table)
    .where(compileFilter(filterCompile(filter), taak, table))
    .all()
    .map((r: { id: number }) => r.id)
    .sort()

describe('compileFilter', () => {
  test('$eq on a column, bare value and operator form', () => {
    expect(ids({ status: 'klaar' })).toEqual([2])
    expect(ids({ status: { $eq: 'klaar' } })).toEqual([2])
  })
  test('$ne, $in, $nin', () => {
    expect(ids({ status: { $ne: 'klaar' } })).toEqual([1, 3, 4])
    expect(ids({ prio: { $in: [1, 2] } })).toEqual([1, 2])
    expect(ids({ prio: { $nin: [1, 2] } })).toEqual([4])
  })
  test('$gt, $gte, $lt, $lte', () => {
    expect(ids({ prio: { $gt: 2 } })).toEqual([4])
    expect(ids({ prio: { $gte: 2 } })).toEqual([1, 4])
    expect(ids({ prio: { $lt: 2 } })).toEqual([2])
    expect(ids({ prio: { $lte: 2 } })).toEqual([1, 2])
  })
  test('$exists and null equality', () => {
    expect(ids({ prio: { $exists: false } })).toEqual([3])
    expect(ids({ prio: { $exists: true } })).toEqual([1, 2, 4])
    expect(ids({ prio: null })).toEqual([3])
  })
  test('boolean values match the stored integer', () => {
    expect(ids({ afgerond: true })).toEqual([2])
  })
  test('custom.key compiles to json_extract', () => {
    expect(ids({ 'custom.kleur': 'rood' })).toEqual([1])
    expect(ids({ 'custom.kleur': { $exists: true } })).toEqual([1, 2])
  })
  test('$contains matches array membership and skips a scalar', () => {
    expect(ids({ 'custom.labels': { $contains: 'a' } })).toEqual([1])
    expect(ids({ 'custom.labels': { $contains: ['a', 'b'] } })).toEqual([1])
    expect(ids({ 'custom.labels': { $contains: ['a', 'z'] } })).toEqual([])
  })
  test('clauses combine with AND', () => {
    expect(ids({ status: 'open', prio: { $gt: 1 } })).toEqual([1, 4])
  })
  test('an empty filter matches everything', () => {
    expect(ids({})).toEqual([1, 2, 3, 4])
  })
})
