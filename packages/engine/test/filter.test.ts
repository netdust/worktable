import { describe, expect, test } from 'bun:test'
import { drizzle } from 'drizzle-orm/bun-sqlite'
import type { SQLiteColumn } from 'drizzle-orm/sqlite-core'
import type { DatasetDecl, FilterInput } from '../src'
import { filterCompile, tableOf } from '../src'
import { compileFilter, filterWhere } from '../src/filter'
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
    expect(ids({ 'custom.colour': 'rood' })).toEqual([1])
    expect(ids({ 'custom.colour': { $exists: true } })).toEqual([1, 2])
  })
  test('$contains matches array membership and skips a scalar', () => {
    expect(ids({ 'custom.labels': { $contains: 'a' } })).toEqual([1])
    expect(ids({ 'custom.labels': { $contains: ['a', 'b'] } })).toEqual([1])
    expect(ids({ 'custom.labels': { $contains: ['a', 'z'] } })).toEqual([])
    expect(ids({ 'custom.labels': { $contains: ['a', 'a', 'b'] } })).toEqual([1])
  })
  test('clauses combine with AND', () => {
    expect(ids({ status: 'open', prio: { $gt: 1 } })).toEqual([1, 4])
  })
  test('an empty filter matches everything', () => {
    expect(ids({})).toEqual([1, 2, 3, 4])
  })
  test('$or holds when any of its filters holds', () => {
    expect(ids({ $or: [{ status: 'klaar' }, { prio: { $gt: 2 } }] })).toEqual([2, 4])
  })
  test('$or sits beside plain keys, which all still hold', () => {
    expect(ids({ status: 'open', $or: [{ prio: 1 }, { prio: { $exists: false } }] })).toEqual([3])
  })
  test('a filter inside $or with two keys needs both', () => {
    expect(ids({ $or: [{ status: 'open', prio: 2 }, { afgerond: true }] })).toEqual([1, 2])
  })
})

describe('$period resolves against the injected now', () => {
  const sqlite = freshDb()
  const dated = drizzle(sqlite)
  const days = [
    '2026-11-30',
    '2026-12-01',
    '2026-12-27',
    '2026-12-28',
    '2026-12-31',
    '2027-01-03',
    '2027-01-04',
    '2027-01-10',
    '2027-01-11',
    '2028-01-31',
    '2028-02-01',
    '2028-02-29',
    '2028-03-01',
  ]
  sqlite.run('DELETE FROM taak')
  for (const day of days)
    sqlite.run("INSERT INTO taak (project_id, description, status, start_at, day) VALUES (1, 'x', 'open', ?, ?)", [
      `${day}T23:30`,
      day,
    ])

  const within = (key: 'day' | 'start_at', period: string, now: Date): string[] =>
    dated
      .select({ day: (table as unknown as { day: SQLiteColumn }).day })
      .from(table)
      .where(filterWhere({ [key]: { $period: period } }, taak, table, now))
      .all()
      .map((r: { day: string }) => r.day)
      .sort()

  const newYearsEve = new Date(2026, 11, 31, 12)

  test('week is Monday to Sunday around now', () => {
    expect(within('day', 'week', newYearsEve)).toEqual(['2026-12-28', '2026-12-31', '2027-01-03'])
  })
  test('today is the one day around now', () => {
    expect(within('day', 'today', newYearsEve)).toEqual(['2026-12-31'])
    expect(within('start_at', 'today', newYearsEve)).toEqual(['2026-12-31'])
  })
  test('next_week is the following Monday to Sunday', () => {
    expect(within('day', 'next_week', newYearsEve)).toEqual(['2027-01-04', '2027-01-10'])
  })
  test('month is the calendar month', () => {
    expect(within('day', 'month', newYearsEve)).toEqual(['2026-12-01', '2026-12-27', '2026-12-28', '2026-12-31'])
  })
  test('February 2028 ends on the 29th', () => {
    expect(within('day', 'month', new Date(2028, 1, 10, 12))).toEqual(['2028-02-01', '2028-02-29'])
  })
  test('a datetime column compares on its date part', () => {
    expect(within('start_at', 'week', newYearsEve)).toEqual(['2026-12-28', '2026-12-31', '2027-01-03'])
  })
  test('a Sunday belongs to the week that ends on it', () => {
    expect(within('day', 'week', new Date(2027, 0, 3, 23, 59))).toEqual(['2026-12-28', '2026-12-31', '2027-01-03'])
  })
})
