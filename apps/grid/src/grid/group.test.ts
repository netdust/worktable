import { renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { GroupFact, Model, Row } from '../types'
import { activity, calais, planning } from './calais.test.data'
import { columnsFor } from './columns'
import { cutAt, groupRows, sums, total } from './group'
import { defaults } from './layout'
import { useGridTable } from './useTable'

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

    expect(groups.map((g) => g.label)).toEqual(['Maandag 18 mei', 'Geen waarde'])
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

describe('an activity without a time', () => {
  const timed: Model = {
    ...activity,
    fields: {
      plandag: { type: 'date', label: 'Plandag', required: true, fact: true },
      start_at: { type: 'datetime', label: 'Start', required: false, fact: true },
    },
  }
  const view = { ...planning, columns: ['title', 'plandag', 'start_at'], lookups: {}, rollups: {}, sort: ['plandag', 'start_at'], group: 'plandag', date_field: 'plandag' }
  const at = (id: number, title: string, plandag: string, start_at: string | null): Row =>
    ({ id, title, status: 'publish', fields: { plandag, start_at } })

  it('sorts first in its own plandag section, never under the day before', () => {
    const rows = [
      at(1, 'Ophalen', '2026-10-14', '2026-10-14T05:00'),
      at(2, 'Nachtvoorstelling', '2026-10-13', '2026-10-14T00:30'),
      at(3, 'Hotel', '2026-10-14', null),
      at(4, 'Voorstelling', '2026-10-13', '2026-10-13T20:00'),
    ]
    const cols = columnsFor(timed, view)
    const { result } = renderHook(() => useGridTable(cols, rows, defaults(view), () => {}))
    const sorted = result.current.getRowModel().rows.map((r) => r.original)
    const groups = groupRows(sorted, cols.find((c) => c.id === 'plandag'))

    expect(groups.map((g) => [g.key, titles(g.rows)])).toEqual([
      ['2026-10-13', ['Voorstelling', 'Nachtvoorstelling']],
      ['2026-10-14', ['Hotel', 'Ophalen']],
    ])
  })
})

describe('sums', () => {
  it('adds the numeric and rollup columns for the foot, nothing else', () => {
    expect(sums(calais, Object.values(columns))).toEqual({ 'rollups.confirmed': 47 })
  })
})

describe('the facts a band declares', () => {
  const timed: Model = {
    ...activity,
    fields: {
      plandag: { type: 'date', label: 'Plandag', required: true, fact: true },
      start_at: { type: 'datetime', label: 'Start', required: false, fact: true },
      kind: activity.fields.kind,
    },
  }
  const view = { ...planning, columns: ['title', 'plandag', 'start_at', 'kind'], lookups: {}, rollups: {}, sort: ['plandag'], group: 'plandag', date_field: 'plandag' }
  const cols = columnsFor(timed, view)
  const plandag = cols.find((c) => c.id === 'plandag')
  const at = (id: number, kind: string, start_at: string | null, plandag = '2026-10-13'): Row =>
    ({ id, title: `R${id}`, status: 'publish', fields: { plandag, start_at, kind } })
  const facts: GroupFact[] = [
    { kind: 'first', column: 'start_at', where: { kind: 'show' }, label: 'show' },
    { kind: 'count', where: { kind: 'meal' }, label: 'maaltijden' },
    { kind: 'empty', column: 'start_at', label: 'open' },
  ]
  const factsOf = (rows: Row[], cut: Row | null = null) => groupRows(rows, plandag, { facts, columns: cols, cut }).map((g) => g.facts)

  it('gives the earliest matching value, as its time in a day group, and counts', () => {
    const rows = [at(1, 'show', '2026-10-13T22:00'), at(2, 'show', '2026-10-13T20:00'), at(3, 'meal', null), at(4, 'meal', '2026-10-13T18:00'), at(5, 'build', '2026-10-13T08:00')]

    expect(factsOf(rows)).toEqual([[
      { kind: 'first', label: 'show', value: '20:00' },
      { kind: 'count', label: 'maaltijden', value: '2' },
      { kind: 'empty', label: 'open', value: '1' },
    ]])
  })

  it('skips a first nothing matches and a count or empty of zero', () => {
    expect(factsOf([at(1, 'build', '2026-10-13T08:00')])).toEqual([[]])
  })

  it('counts every row when the count has no where', () => {
    const all: GroupFact[] = [{ kind: 'count', label: 'rijen' }]
    expect(groupRows([at(1, 'build', null), at(2, 'meal', null)], plandag, { facts: all, columns: cols, cut: null })[0].facts)
      .toEqual([{ kind: 'count', label: 'rijen', value: '2' }])
  })

  it("shows the column's text outside a day group", () => {
    const kind = cols.find((c) => c.id === 'kind')
    const [show] = groupRows([at(1, 'show', '2026-10-13T20:00')], kind, { facts: [facts[0]], columns: cols, cut: null })
    expect(show.facts[0].value).toMatch(/20:00/)
    expect(show.facts[0].value).not.toBe('20:00')
  })

  it('shows … for each fact of the group the read limit may have cut short', () => {
    const loaded = [at(1, 'show', '2026-10-13T20:00'), at(2, 'build', '2026-10-14T08:00', '2026-10-14')]
    const cut = cutAt(loaded, 9)

    expect(cut).toBe(loaded[1])
    expect(factsOf(loaded, cut)).toEqual([
      [{ kind: 'first', label: 'show', value: '20:00' }],
      [
        { kind: 'first', label: 'show', value: '…' },
        { kind: 'count', label: 'maaltijden', value: '…' },
        { kind: 'empty', label: 'open', value: '…' },
      ],
    ])
  })

  it('marks the group the last row was loaded in, though a search hides it or a write moved it', () => {
    const loaded = [at(1, 'show', '2026-10-13T20:00'), at(2, 'build', '2026-10-14T08:00', '2026-10-14')]
    const cut = cutAt(loaded, 9)
    const shown = [loaded[0], at(3, 'meal', null, '2026-10-14')]

    expect(factsOf(shown, cut).map((f) => f.map((fact) => fact.value))).toEqual([['20:00'], ['…', '…', '…']])
    const moved = [{ ...loaded[1], fields: { ...loaded[1].fields, plandag: '2026-10-13' } }, at(3, 'meal', null, '2026-10-14')]
    expect(factsOf(moved, cut).map((f) => f.map((fact) => fact.value))).toEqual([[], ['…', '…', '…']])
  })

  it('shows a first whose earliest value is 0', () => {
    const counted: Model = { ...timed, fields: { ...timed.fields, seats: { type: 'int', label: 'Plaatsen', required: false, fact: true } } }
    const seated = columnsFor(counted, { ...view, columns: [...view.columns, 'seats'] })
    const rows = [{ ...at(1, 'show', null), fields: { ...at(1, 'show', null).fields, seats: 0 } }, { ...at(2, 'show', null), fields: { ...at(2, 'show', null).fields, seats: 5 } }]
    const [group] = groupRows(rows, plandag, { facts: [{ kind: 'first', column: 'seats', where: { kind: 'show' }, label: 'plaatsen' }], columns: seated, cut: null })

    expect(group.facts).toEqual([{ kind: 'first', label: 'plaatsen', value: '0' }])
  })

  it('cuts nothing when every row was loaded', () => {
    expect(cutAt([at(1, 'show', null)], 1)).toBeNull()
  })
})
