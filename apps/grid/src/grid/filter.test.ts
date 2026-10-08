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
  it('offers every field with its kind: choices, relations from the rows held, toggles, dates and texts', () => {
    const fields = Object.fromEntries(filterFields(activity, rows).map((f) => [f.field, f]))

    expect(Object.keys(fields)).toEqual(['date', 'start', 'end', 'kind', 'status', 'location', 'place', 'settled_by', 'notes', 'paid'])
    expect([fields.date.kind, fields.place.kind, fields.status.kind, fields.paid.kind]).toEqual(['date', 'text', 'choice', 'bool'])
    expect(fields.status.options).toEqual([['confirmed', 'Bevestigd'], ['option', 'Optie'], ['cancelled', 'Geannuleerd']])
    expect(fields.location).toMatchObject({ label: 'Locatie', options: [['9', 'Bijloke, Gent'], ['12', 'Le Grenier, Calais']] })
    expect(fields.paid.options).toEqual([['1', 'Ja'], ['0', 'Nee']])
  })
  it("drops a text column that repeats a relation's label: a query's title column beside the relation it names", () => {
    const model = {
      key: 'dag', label: 'Dag', title_label: 'Omschrijving', title_readonly: true,
      fields: {
        productie_id: { type: 'relation' as const, label: 'Productie', required: false, fact: false, relation: { model: 'productie', multiple: false } },
        productie: { type: 'text' as const, label: 'Productie', required: false, fact: false },
      },
    }
    expect(filterFields(model, []).map((f) => f.field)).toEqual(['productie_id'])
  })
})

describe("the view's filters", () => {
  it('come first in the menu, in their declared order; the other filterable fields follow', () => {
    const order = filterFields(activity, rows, ['location', 'status']).map((f) => f.field)

    expect(order).toEqual(['location', 'status', 'date', 'start', 'end', 'kind', 'place', 'settled_by', 'notes', 'paid'])
  })

  it('skip a declared name that is not filterable', () => {
    expect(filterFields(activity, rows, ['title', 'paid']).map((f) => f.field)).toEqual(['paid', 'date', 'start', 'end', 'kind', 'status', 'location', 'place', 'settled_by', 'notes'])
  })
})

describe('filterRows', () => {
  it('finds rows by title, ignoring case and accents', () => {
    expect(filterRows(rows, 'presentation').map((r) => r.title)).toEqual(['Présentation interne'])
    expect(filterRows(rows, 'MONTAGE').map((r) => r.id)).toEqual([102, 110])
    expect(filterRows(rows, '  ')).toHaveLength(7)
  })
})
