import { describe, expect, it } from 'vitest'
import type { Model, Row } from '../types'
import { insightOf } from './insight'

const field = (tones: Record<string, string>, options: Record<string, string>) => ({ type: 'select', label: 'x', required: false, fact: false, options, tones })
const row = (fields: Record<string, unknown>): Row => ({ id: 1, title: '', status: '', fields })

describe('the title line\'s insight', () => {
  const activiteit = {
    key: 'activiteit', label: 'Activiteiten',
    fields: { soort: field({ voorstelling: 'rose' }, { voorstelling: 'Voorstelling' }), status: field({ optie: 'warn', bevestigd: 'ok' }, { optie: 'Optie', bevestigd: 'Bevestigd' }) },
  } as unknown as Model

  it('counts the rows on the warn-toned option of the first option field that has one', () => {
    expect(insightOf(activiteit, [row({ status: 'optie' }), row({ status: 'optie' }), row({ status: 'bevestigd' })])).toEqual({ label: 'Optie', count: 2 })
  })

  it('takes the lifecycle column first, and says nothing where no row holds the option', () => {
    const toewijzing = { ...activiteit, lifecycle: 'state', fields: { ...activiteit.fields, state: field({ uitgenodigd: 'warn' }, { uitgenodigd: 'Uitgenodigd' }) } } as unknown as Model
    expect(insightOf(toewijzing, [row({ state: 'uitgenodigd', status: 'optie' })])).toEqual({ label: 'Uitgenodigd', count: 1 })
    expect(insightOf(activiteit, [row({ status: 'bevestigd' })])).toBeNull()
  })
})
