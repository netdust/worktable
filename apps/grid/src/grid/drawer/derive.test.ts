import { describe, expect, it } from 'vitest'
import type { Model, Row, Schema } from '../../types'
import type { Column } from '../columns'
import { defaults } from '../layout'
import { actorOf, dayLabel, inboundOf, kindOf, propsOf } from './derive'

const field = (type: string, extra: object = {}) => ({ type, label: type, required: false, fact: false, ...extra }) as unknown as Model['fields'][string]
const activiteit = {
  key: 'activiteit', label: 'Activiteiten',
  fields: {
    status: field('select', { options: { optie: 'Optie' } }),
    soort: field('select', { options: { voorstelling: 'Voorstelling' }, tones: { voorstelling: 'rose' } }),
    speelreeks_id: field('relation', { relation: { model: 'speelreeks', multiple: false } }),
    mensen: field('links', { link: { dataset: 'toewijzing', key: 'activiteit_id' } }),
  },
} as unknown as Model
const column = (id: string, kind: string, text = 'x'): Column => ({ id, kind, label: id, text: () => text }) as unknown as Column
const row = { id: 1, title: 'Voorstelling Gent', status: '', fields: {} } as Row

describe('the drawer derives from the model', () => {
  it('takes the first toned option field as the kind, none where none is toned', () => {
    expect(kindOf(activiteit)).toBe('soort')
    expect(kindOf({ ...activiteit, fields: { status: activiteit.fields.status } })).toBeNull()
    // A state's tones (ok, warn, bad) say how it stands, not what it is.
    expect(kindOf({ ...activiteit, fields: { status: field('select', { options: { optie: 'Optie' }, tones: { optie: 'warn' } }) } })).toBeNull()
  })

  it('writes a day as "wo 14 okt 2026" and an actor by the start of their address', () => {
    expect(dayLabel('2026-10-14', 'nl-BE')).toBe('wo 14 okt 2026')
    expect(actorOf('noor@lantaarn.test')).toBe('noor')
  })

  it('pairs the start and end into one Tijd, lists what the view shows, and folds the hidden and the empty', () => {
    const columns = [column('title', 'title'), column('plandag', 'date'), column('start_at', 'datetime'), column('eind_at', 'datetime'), column('legacy_post_id', 'number'), column('notities', 'text', ''), column('mensen', 'links')]
    const cal = { day: 'plandag', start: 'start_at', end: 'eind_at', lanes: [] }
    const layout = { ...defaults({ key: 'v', label: 'V', table: 't', model: 'm' }), hidden: ['legacy_post_id', 'plandag', 'start_at', 'eind_at'] }
    const { shown, folded } = propsOf(columns, row, cal, layout, 'plandag')
    expect(shown.map((p) => p.column.id)).toEqual(['plandag', 'start_at'])
    expect(shown[1].span?.end?.id).toBe('eind_at')
    expect(folded.map((p) => p.column.id)).toEqual(['legacy_post_id', 'notities'])
    // With no view, or a layout that hides every field, nothing is hidden: only the empty fold.
    expect(propsOf(columns, row, cal, null).folded.map((p) => p.column.id)).toEqual(['notities'])
    const none = { ...layout, hidden: ['plandag', 'start_at', 'eind_at', 'legacy_post_id', 'notities'] }
    expect(propsOf(columns, row, cal, none).folded.map((p) => p.column.id)).toEqual(['notities'])
  })

  it('finds the dated tables that point at a record, not those a link field lists, nor an undated one', () => {
    const schema = {
      models: {
        activiteit,
        speelreeks: { key: 'speelreeks', label: 'Tourstops', fields: {} },
        toewijzing: { key: 'toewijzing', label: 'Toewijzingen', fields: { activiteit_id: field('relation', { relation: { model: 'activiteit', multiple: false } }) } },
        persoon_rol: { key: 'persoon_rol', label: 'Rollen', fields: { speelreeks_id: field('relation', { relation: { model: 'speelreeks', multiple: false } }) } },
      },
      tables: [
        { key: 'activiteit', label: 'Activiteiten', model: 'activiteit', date_field: 'plandag' },
        { key: 'toewijzing', label: 'Toewijzingen', model: 'toewijzing', date_field: 'datum' },
        { key: 'persoon_rol', label: 'Rollen', model: 'persoon_rol' },
      ],
    } as unknown as Schema
    expect(inboundOf(schema, 'speelreeks')).toEqual([{ model: 'activiteit', table: 'activiteit', field: 'speelreeks_id', label: 'Activiteiten', date: 'plandag' }])
    expect(inboundOf(schema, 'activiteit')).toEqual([])
  })
})
