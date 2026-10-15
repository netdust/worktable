import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { activity, calais, planning } from './calais.test.data'
import type { GroupFact, Model } from '../types'
import { type Column, columnsFor, inDays } from './columns'
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

  it('shows a datetime as the short weekday, day/month and time, edited as datetime-local, sent as typed', () => {
    const when = { ...activity, fields: { ...activity.fields, at: { type: 'datetime' as const, label: 'Start', required: true, fact: false } } }
    const column = columnsFor(when, { ...planning, columns: ['at'] }).find((c) => c.id === 'at')!
    const row = { ...lunch, fields: { ...lunch.fields, at: '2026-10-13T20:30' } }

    expect(column.kind).toBe('datetime')
    expect(column.editable).toBe(true)
    expect(column.text(row)).toBe('di 13/10 20:30')
    expect(column.text({ ...row, fields: { at: '2026-10-13T20:30:00' } })).toBe('di 13/10 20:30')
    expect(column.edit(row)).toBe('2026-10-13T20:30')
    expect(column.parse('2026-10-13T21:00')).toBe('2026-10-13T21:00')
    expect(column.text({ ...row, fields: { at: null } })).toBe('')
  })

  it('shows an empty datetime as nothing and clears it to null on the wire, while 05:00 is still a time', () => {
    const when = { ...activity, fields: { ...activity.fields, at: { type: 'datetime' as const, label: 'Start', required: false, fact: false } } }
    const column = columnsFor(when, { ...planning, columns: ['at'] }).find((c) => c.id === 'at')!
    const at = (value: unknown) => ({ ...lunch, fields: { ...lunch.fields, at: value } })

    expect(column.text(at(null))).toBe('')
    expect(column.text(at(''))).toBe('')
    expect(column.edit(at(null))).toBe('')
    expect(column.parse('')).toBe('')
    expect(column.text(at('2026-10-13T05:00'))).toBe('di 13/10 05:00')
    expect(column.edit(at('2026-10-13T05:00'))).toBe('2026-10-13T05:00')
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
    expect(['Nee', 'nee', '0', 'false', ''].map(paid.fromText)).toEqual([false, false, false, false, false])
    expect(['Ja', 'JA', '1', 'true'].map(paid.fromText)).toEqual([true, true, true, true])
  })
})

describe('inDays', () => {
  const field = (type: 'date' | 'datetime' | 'text', label: string) => ({ type, label, required: false, fact: false })
  const plan: Model = {
    key: 'plan', label: 'Plan', title_label: 'Naam', title_readonly: false,
    fields: { day: field('date', 'Dag'), from: field('datetime', 'Start'), until: field('datetime', 'Einde'), note: field('text', 'Notitie') },
  }
  const row = (fields: Record<string, unknown>) => ({ id: 1, title: 'x', status: '', fields })
  const facts: GroupFact[] = [{ kind: 'empty', column: 'from', label: 'leeg' }]
  const laid = (shown: string[]) => inDays(columnsFor(plan, { key: 'p', label: 'p', table: 'plan', model: 'plan', columns: shown }), plan, 'day', facts)
  const from = (shown: string[]) => laid(shown).find((c) => c.id === 'from') as Column

  it("reads a moment on its row's day as its time, with the hidden end after it, under the word Tijd", () => {
    const column = from(['day', 'from', 'note'])
    expect(column.label).toBe('Tijd')
    expect(column.range?.(row({ day: '2026-11-02', from: '2026-11-02T13:00', until: '2026-11-02T14:00' }))).toEqual({ start: '13:00', end: '–14:00' })
    expect(column.text(row({ day: '2026-11-02', from: '2026-11-02T13:00', until: '2026-11-02T14:00' }))).toBe('13:00–14:00')
    expect(column.text(row({ day: '2026-11-02', from: '2026-11-02T13:00', until: null }))).toBe('13:00')
  })

  it('gives the Tijd column room for a date, a start and an end: 184px of text plus 24px padding', () => {
    expect(from(['day', 'from']).width).toBeGreaterThanOrEqual(184 + 24)
    expect(from(['from', 'until']).width).toBe(columnsFor(plan, { key: 'p', label: 'p', table: 'plan', model: 'plan', columns: ['from'] }).find((c) => c.id === 'from')?.width)
  })

  it('keeps the date of a moment on another day than its row, and leaves the end alone where the view shows it', () => {
    expect(from(['from']).text(row({ day: '2026-10-13', from: '2026-10-14T00:30' }))).toBe('wo 14/10 00:30')
    const shown = from(['from', 'until'])
    expect(shown.label).toBe('Start')
    expect(shown.text(row({ day: '2026-11-02', from: '2026-11-02T13:00', until: '2026-11-02T14:00' }))).toBe('13:00')
  })

  it("names an empty moment as the view's facts do, and edits the stored moment", () => {
    const column = from(['from'])
    expect(column.blank).toBe('leeg')
    expect(column.range?.(row({ day: '2026-11-02', from: null }))).toBeNull()
    expect(column.edit(row({ day: '2026-11-02', from: '2026-11-02T13:00' }))).toBe('2026-11-02T13:00')
  })
})
