import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { Row } from '../types'
import { activity, calais, planning } from './calais.test.data'
import { columnsFor } from './columns'
import { groupRows, sums, total } from './group'

const columns = Object.fromEntries(columnsFor(activity, planning).map((c) => [c.id, c]))
const titles = (rows: Row[]) => rows.map((r) => r.title)
const withField = (r: Row, key: string, value: unknown): Row => ({ ...r, fields: { ...r.fields, [key]: value } })

beforeEach(() => {
  document.documentElement.lang = 'nl-BE'
})
afterEach(() => {
  document.documentElement.lang = ''
})

describe('groupRows', () => {
  it('makes one section per day, ordered, named by weekday and date, rows in their given order', () => {
    const shuffled = [calais[5], calais[3], calais[0], calais[4], calais[1], calais[2]]
    const groups = groupRows(shuffled, columns.date)

    expect(groups.map((g) => g.label)).toEqual(['Maandag 18 mei', 'Dinsdag 19 mei', 'Woensdag 20 mei'])
    expect(titles(groups[0].rows)).toEqual(['Auto Pavel + Sien', 'Montage', 'Lunch bistrot'])
    expect(titles(groups[1].rows)).toEqual(['Repetitie', 'Présentation interne'])
  })

  it('counts each group and the whole sheet', () => {
    const groups = groupRows(calais, columns.date)

    expect(groups.map((g) => g.count)).toEqual([3, 2, 1])
    expect(total(groups)).toBe(6)
  })

  it('puts rows without a day last, under a named section', () => {
    const groups = groupRows([withField(calais[0], 'date', ''), calais[1]], columns.date)

    expect(groups.map((g) => g.label)).toEqual(['Maandag 18 mei', 'No value'])
  })

  it("groups a select by its option label, in the options' declared order", () => {
    const groups = groupRows(calais, columns.kind)

    expect(groups.map((g) => [g.label, g.count])).toEqual([
      ['Reis', 1], ['Opbouw', 1], ['Repetitie', 1], ['Voorstelling', 1], ['Maaltijd', 2],
    ])
  })

  it('groups a relation by the looked-up title', () => {
    const elsewhere: Row = { ...calais[1], lookups: { location: { id: 9, title: 'Bijloke, Gent', status: 'publish', fields: {} } } }
    const groups = groupRows([calais[0], elsewhere, calais[2]], columns.location)

    expect(groups.map((g) => [g.label, g.count])).toEqual([['Bijloke, Gent', 1], ['Le Grenier, Calais', 2]])
  })

  it('is one unnamed section when the view groups by nothing', () => {
    const groups = groupRows(calais, undefined)

    expect(groups).toHaveLength(1)
    expect(groups[0]).toMatchObject({ label: '', count: 6 })
  })
})

describe('sums', () => {
  it('adds the numeric and rollup columns for the foot, nothing else', () => {
    expect(sums(calais, Object.values(columns))).toEqual({ 'rollups.confirmed': 47 })
  })
})
