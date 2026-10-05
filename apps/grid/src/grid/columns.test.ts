import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { activity, calais, planning } from './calais.test.data'
import { columnsFor } from './columns'
import { columnsFixture, fixtureModel } from '../fixture.test-support'

const lunch = calais[2]
const byId = (view = planning, model = activity, writable = true) =>
  Object.fromEntries(columnsFor(model, view, writable).map((c) => [c.id, c]))

beforeEach(() => {
  document.documentElement.lang = 'nl-BE'
})
afterEach(() => {
  document.documentElement.lang = ''
})

describe('columnsFor', () => {
  it('gives the column ids the shared fixture names, the ones Arrangement::ids() mirrors', () => {
    expect(columnsFor(fixtureModel(columnsFixture), columnsFixture.table).map((c) => c.id)).toEqual(columnsFixture.ids)
  })

  it("puts the title first, then the view's columns in their declared order, then the rollups", () => {
    expect(columnsFor(activity, planning).map((c) => c.id)).toEqual([
      'title', 'date', 'start', 'end', 'kind', 'status', 'location', 'place', 'settled_by', 'rollups.confirmed',
    ])
  })

  it('shows a select as a chip with the option label, edited by its key', () => {
    const kind = byId().kind
    expect(kind.kind).toBe('select')
    expect(kind.text(lunch)).toBe('Maaltijd')
    expect(kind.edit(lunch)).toBe('meal')
  })

  it('shows a date as a tabular day in the admin locale, edited as ISO', () => {
    const date = byId().date
    expect(date.kind).toBe('date')
    expect(date.text(lunch)).toBe('18/05/2026')
    expect(date.edit(lunch)).toBe('2026-05-18')
  })

  it('makes a text field described HH:MM a time cell that reads what a hand types', () => {
    const start = byId().start
    expect(start.kind).toBe('time')
    expect(start.text(lunch)).toBe('13:00')
    expect(start.parse('730')).toBe('07:30')
    expect(start.parse('7')).toBe('07:00')
    expect(start.parse('9.15')).toBe('09:15')
    expect(start.parse('')).toBe('')
    expect(start.parse('25:99')).toBe('25:99')
    expect(byId().place.kind).toBe('text')
  })

  it('shows a relation as the looked-up title and writes a picked one as a list of one id', () => {
    const location = byId().location
    expect(location.kind).toBe('relation')
    expect(location.text(lunch)).toBe('Le Grenier, Calais')
    expect(location.editable).toBe(true)
    expect(location.edit({ ...lunch, fields: { ...lunch.fields, location: [12] } })).toBe('12')
    expect(location.parse('15')).toEqual([15])
    expect(location.parse('')).toEqual([])
  })

  it('leaves a relation to many read-only', () => {
    const many = { ...activity, fields: { ...activity.fields, location: { ...activity.fields.location, relation: { model: 'organisation', multiple: true } } } }
    expect(columnsFor(many, planning).find((c) => c.id === 'location')?.editable).toBe(false)
  })

  it('marks required fields and the title as required', () => {
    const c = byId()
    expect([c.title, c.date, c.kind, c.status].map((x) => x.required)).toEqual([true, true, true, true])
    expect([c.start, c.place, c.settled_by].map((x) => x.required)).toEqual([false, false, false])
  })

  it('keeps the title read-only on a model that composes its own', () => {
    expect(byId(planning, { ...activity, title_readonly: true }).title.editable).toBe(false)
    expect(byId().title.editable).toBe(true)
  })

  it('edits nothing on a model without a writer', () => {
    expect(columnsFor(activity, planning, false).some((c) => c.editable)).toBe(false)
  })

  it('renders a rollup count read-only and right-aligned', () => {
    const confirmed = byId()['rollups.confirmed']
    expect(confirmed).toMatchObject({ kind: 'rollup', editable: false, align: 'end', label: 'Confirmed' })
    expect(confirmed.text(lunch)).toBe('6')
  })

  it("names a rollup by its declared label, its humanised key without one", () => {
    const labelled = { ...planning, rollups: { confirmed: { ...planning.rollups!.confirmed, label: 'Bevestigd' } } }
    expect(byId(labelled)['rollups.confirmed'].label).toBe('Bevestigd')
  })

  it('names a lookup of the related record by the field and the related model\'s own words', () => {
    const organisation = {
      key: 'organisation', label: 'Organisatie', title_label: 'Naam', title_readonly: false,
      fields: { city: { type: 'text' as const, label: 'Gemeente', required: false, fact: false } },
    }
    const view = { ...planning, lookups: { location: ['title', 'city', 'zip_code'] } }
    const labels = columnsFor(activity, view, true, { activity, organisation }).filter((c) => c.kind === 'lookup').map((c) => c.label)

    expect(labels).toEqual(['Locatie · Gemeente', 'Locatie · Zip code'])
  })

  it('shows a looked-up date the way a date cell does', () => {
    const production = {
      key: 'production', label: 'Productie', title_label: 'Titel', title_readonly: false,
      fields: { premiere: { type: 'date' as const, label: 'Première', required: false, fact: true } },
    }
    const spaced = { ...activity, fields: { ...activity.fields, production: { type: 'relation' as const, label: 'Productie', required: false, fact: true, relation: { model: 'production', multiple: false } } } }
    const view = { ...planning, lookups: { production: ['premiere'] } }
    const column = columnsFor(spaced, view, true, { activity: spaced, production }).find((c) => c.id === 'lookups.production.premiere')!
    const row = { ...lunch, lookups: { ...lunch.lookups, production: { id: 9, title: 'Calais', status: 'publish', fields: { premiere: '2031-03-10' } } } }

    expect(column.text(row)).toBe('10/03/2031')
  })

  it("adds a read-only lookup column when the relation itself is not shown", () => {
    const view = { ...planning, columns: ['title', 'date'] }
    const lookup = byId(view)['lookups.location.title']
    expect(lookup).toMatchObject({ kind: 'lookup', editable: false, label: 'Locatie' })
    expect(lookup.text(lunch)).toBe('Le Grenier, Calais')
    expect(byId()['lookups.location.title']).toBeUndefined()
  })

  it('shows every field when the view lists no columns, numbers right-aligned', () => {
    const c = byId({ ...planning, columns: undefined })
    expect(Object.keys(c)).toContain('notes')
    expect(c.notes.kind).toBe('longtext')
    expect(c.seats).toMatchObject({ kind: 'number', align: 'end' })
    expect(c.seats.parse('12')).toBe(12)
    expect(c.seats.parse('')).toBe('')
    expect(c.paid.kind).toBe('bool')
  })

  it('reads a pasted text back into the value a write sends', () => {
    const c = byId()
    expect(c.kind.fromText('Maaltijd')).toBe('meal')
    expect(c.kind.fromText('rehearsal')).toBe('rehearsal')
    expect(c.kind.fromText('Unknown')).toBe('Unknown')
    expect(c.date.fromText('19/05/2026')).toBe('2026-05-19')
    expect(c.date.fromText('2026-05-19')).toBe('2026-05-19')
    expect(c.start.fromText('7.30')).toBe('07:30')
    expect(c.place.fromText('Zaal 2')).toBe('Zaal 2')
  })

  it('reads a pasted toggle text back as a boolean', () => {
    const paid = byId({ ...planning, columns: undefined }).paid
    expect(['No', 'no', '0', 'false', ''].map(paid.fromText)).toEqual([false, false, false, false, false])
    expect(['Yes', 'YES', '1', 'true'].map(paid.fromText)).toEqual([true, true, true, true])
  })
})
