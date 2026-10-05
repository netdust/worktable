import { describe, expect, it } from 'vitest'
import type { Model } from '../types'
import { activity, planning } from './calais.test.data'
import { newRow } from './newRow'

const week = { from: '2026-05-18', to: '2026-05-24' }

describe('newRow', () => {
  it("defaults the driving date to today inside the window and every required select to its first option", () => {
    expect(newRow(activity, planning, week, new Date(2026, 4, 20))).toEqual({
      fields: { date: '2026-05-20', kind: 'travel', status: 'confirmed' },
      needs: ['title'],
      offers: ['location'],
    })
  })

  it("takes the window's first day when today is outside it", () => {
    expect(newRow(activity, planning, week, new Date(2026, 6, 1))).toMatchObject({ fields: { date: '2026-05-18' } })
  })

  it('leaves required relations and text to the draft, after its title, in field order', () => {
    const strict: Model = {
      ...activity,
      fields: { ...activity.fields, place: { ...activity.fields.place, required: true }, location: { ...activity.fields.location, required: true } },
    }
    expect(newRow(strict, planning, week, new Date(2026, 4, 20))).toMatchObject({ needs: ['title', 'location', 'place'] })
    expect(newRow({ ...strict, title_readonly: true }, planning, week, new Date(2026, 4, 20))).toMatchObject({ needs: ['location', 'place'] })
  })

  it('offers every single relation it did not fill, for when the writer refuses the row', () => {
    const many = { ...activity.fields.location, label: 'Locaties', relation: { model: 'organisation', multiple: true } }
    const spaced: Model = {
      ...activity,
      fields: { ...activity.fields, venues: many, production: { type: 'relation', label: 'Productie', required: true, fact: true, relation: { model: 'production', multiple: false } } },
    }
    expect(newRow(spaced, planning, week, new Date(2026, 4, 20), { field: 'production', id: 9 })).toMatchObject({ offers: ['location'] })
  })

  it('offers only the relations the view shows, required ones first', () => {
    const fields = {
      ...activity.fields,
      performance: { type: 'relation' as const, label: 'Speeldatum', required: false, fact: true, relation: { model: 'performance', multiple: false } },
      crew: { type: 'relation' as const, label: 'Ploeg', required: true, fact: true, relation: { model: 'team', multiple: false } },
    }
    const view = { ...planning, columns: ['title', 'location'], lookups: { crew: ['title'] } }

    expect(newRow({ ...activity, fields }, view, week, new Date(2026, 4, 20))).toMatchObject({ offers: ['crew', 'location'] })
  })

  it('fills the space relation with the selected record on a scoped view', () => {
    const spaced: Model = {
      ...activity,
      fields: { ...activity.fields, production: { type: 'relation', label: 'Productie', required: true, fact: true, relation: { model: 'production', multiple: false } } },
    }
    expect(newRow(spaced, planning, week, new Date(2026, 4, 20), { field: 'production', id: 9 })).toMatchObject({
      fields: { production: [9] },
      needs: ['title'],
    })
  })

  it('names the required fields the grid cannot fill, so + New says why it is off', () => {
    const strict: Model = {
      ...activity,
      fields: { ...activity.fields, poster: { type: 'image', label: 'Affiche', required: true, fact: false } },
    }
    expect(newRow(strict, planning, week, new Date(2026, 4, 20))).toEqual({ missing: ['Affiche'] })
  })
})
