import { describe, expect, it } from 'vitest'
import type { Row } from '../types'
import { activity, calais } from './calais.test.data'
import { filterFields, filterRows } from './filter'

const bijloke: Row = {
  ...calais[1], id: 110, title: 'Montage Gent',
  fields: { ...calais[1].fields, location: 9, paid: true },
  lookups: { location: { id: 9, title: 'Bijloke, Gent', status: 'publish', fields: {} } },
}
const rows = [...calais, bijloke]

describe('filterFields', () => {
  it('offers the select, relation and toggle fields with their options; relations from the rows held', () => {
    const fields = Object.fromEntries(filterFields(activity, rows).map((f) => [f.field, f]))

    expect(Object.keys(fields)).toEqual(['kind', 'status', 'location', 'settled_by', 'paid'])
    expect(fields.status.options).toEqual([['confirmed', 'Bevestigd'], ['option', 'Optie'], ['cancelled', 'Geannuleerd']])
    expect(fields.location).toMatchObject({ label: 'Locatie', options: [['9', 'Bijloke, Gent'], ['12', 'Le Grenier, Calais']] })
    expect(fields.paid.options).toEqual([['1', 'Ja'], ['', 'Nee']])
  })
})

describe("the view's filters", () => {
  it('come first in the menu, in their declared order; the other filterable fields follow', () => {
    const order = filterFields(activity, rows, ['location', 'status']).map((f) => f.field)

    expect(order).toEqual(['location', 'status', 'kind', 'settled_by', 'paid'])
  })

  it('skip a declared name that is not filterable', () => {
    expect(filterFields(activity, rows, ['title', 'paid']).map((f) => f.field)).toEqual(['paid', 'kind', 'status', 'location', 'settled_by'])
  })
})

describe('filterRows', () => {
  it('keeps the rows that match every filter', () => {
    const kept = filterRows(rows, [{ field: 'kind', value: 'build' }, { field: 'location', value: '9' }], '')
    expect(kept.map((r) => r.id)).toEqual([110])
    expect(filterRows(rows, [{ field: 'paid', value: '' }], '')).toHaveLength(6)
  })

  it('finds rows by title, ignoring case and accents', () => {
    expect(filterRows(rows, [], 'presentation').map((r) => r.title)).toEqual(['Présentation interne'])
    expect(filterRows(rows, [], 'MONTAGE').map((r) => r.id)).toEqual([102, 110])
    expect(filterRows(rows, [], '  ')).toHaveLength(7)
  })
})
