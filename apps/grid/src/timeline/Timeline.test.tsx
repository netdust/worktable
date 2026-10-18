import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { SchemaContext } from '../grid/drawer/context'
import { defaults } from '../grid/layout'
import type { CalendarDef, Model, Row, Schema, View } from '../types'

const api = vi.hoisted(() => ({ records: vi.fn(), rows: vi.fn(), recordCount: vi.fn(() => Promise.resolve(0)), recordHistory: vi.fn(() => Promise.resolve([])), rowsWhere: vi.fn(() => Promise.resolve({ rows: [], total: 0 })) }))
vi.mock('../api', () => api)
const { Timeline } = await import('./Timeline')

const CAL: CalendarDef = { day: 'start_datum', start: null, end: 'eind_datum', lanes: ['productie_id'], spans: true }
const productie = (tone?: string) => ({
  key: 'productie', label: 'Producties', title_label: 'Titel', title_readonly: false, ...(tone ? { tone } : {}),
  fields: { kleur: { type: 'select', label: 'Kleur', required: false, options: { violet: 'Paars', sky: 'Blauw' }, tones: { violet: 'violet', sky: 'sky' } } },
}) as unknown as Model
const speelreeks = {
  key: 'speelreeks', label: 'Tourstops', title_label: 'Naam', title_readonly: false,
  fields: {
    productie_id: { type: 'relation', label: 'Productie', required: true, relation: { model: 'productie', multiple: false } },
    start_datum: { type: 'date', label: 'Start', required: true },
    eind_datum: { type: 'date', label: 'Einde', required: true },
  },
} as unknown as Model
const view = { key: '9', label: 'Tijdlijn', table: 'speelreeks', model: 'speelreeks', type: 'timeline', calendar: CAL } as unknown as View
const stop = (id: number, title: string, of: [number, string]): Row => ({
  id, title, status: '',
  fields: { start_datum: '2026-10-13', eind_datum: '2026-10-15', productie_id: of[0] },
  lookups: { productie_id: { id: of[0], title: of[1], status: '', fields: {} } },
})
const stops = [stop(1, 'Brugge', [1, 'De Kersentuin']), stop(2, 'Lier', [2, 'Nachtwacht']), stop(3, 'Oostende', [3, 'Zomerstorm'])]
const kleuren: Row[] = [
  { id: 1, title: 'De Kersentuin', status: '', fields: { kleur: 'violet' } },
  { id: 2, title: 'Nachtwacht', status: '', fields: { kleur: 'sky' } },
  { id: 3, title: 'Zomerstorm', status: '', fields: { kleur: null } },
]

const shown = (models: Record<string, Model>) =>
  render(<Timeline view={view} model={speelreeks} models={models} rows={stops} cal={CAL} shown={{ from: '2026-10-12', to: '2026-10-18' }} lane="productie_id" layout={defaults(view)} />)
const laneOf = (name: string) => screen.getByRole('row', { name }).style.getPropertyValue('--lane')

afterEach(() => {
  cleanup()
  vi.resetAllMocks()
})

describe("the timeline's lanes", () => {
  it("take their record's tone where its dataset has one: a production with kleur violet is violet; one without, the palette by its place", async () => {
    api.records.mockResolvedValue({ rows: kleuren, total: 3 })
    shown({ speelreeks, productie: productie('kleur') })

    await waitFor(() => expect(laneOf('De Kersentuin')).toBe('var(--tone-violet)'))
    expect(laneOf('Nachtwacht')).toBe('var(--tone-sky)')
    expect(laneOf('Zomerstorm')).toBe('var(--tone-amber)')
    expect(api.records).toHaveBeenCalledWith('productie', '')
  })

  it('wait for their records\' tones on a first open: no lane is drawn in the palette and repainted', async () => {
    let answer: (found: { rows: Row[]; total: number }) => void = () => undefined
    api.records.mockReturnValue(new Promise((done) => { answer = done }))
    const fresh = { ...productie('kleur'), key: 'reeks_productie' } as Model
    const model = { ...speelreeks, fields: { ...speelreeks.fields, productie_id: { ...speelreeks.fields.productie_id, relation: { model: 'reeks_productie', multiple: false } } } } as Model
    render(<Timeline view={view} model={model} models={{ speelreeks: model, reeks_productie: fresh }} rows={stops} cal={CAL} shown={{ from: '2026-10-12', to: '2026-10-18' }} lane="productie_id" layout={defaults(view)} />)

    expect(document.querySelectorAll('.nv-tl__lane')).toHaveLength(0)
    expect(screen.getByRole('table', { name: 'Tijdlijn' })).toBeTruthy()
    answer({ rows: kleuren, total: 3 })
    await waitFor(() => expect(laneOf('De Kersentuin')).toBe('var(--tone-violet)'))
    expect(laneOf('Nachtwacht')).toBe('var(--tone-sky)')
  })

  it('take the palette by order where the related dataset has no tone, and read nothing for it', () => {
    shown({ speelreeks, productie: productie() })

    expect(['De Kersentuin', 'Nachtwacht', 'Zomerstorm'].map(laneOf)).toEqual(['var(--tone-sky)', 'var(--tone-violet)', 'var(--tone-amber)'])
    expect(api.records).not.toHaveBeenCalled()
  })
})

describe('the timeline overlap', () => {
  const clash = (cancelled = false): Row[] => [
    { ...stop(1, 'Brugge', [1, 'De Kersentuin']), status: '' },
    { ...stop(2, 'Gent', [1, 'De Kersentuin']), fields: { start_datum: '2026-10-14', eind_datum: '2026-10-16', productie_id: 1, stand: cancelled ? 'afgelast' : 'vast' } },
  ]
  const withStand = { ...speelreeks, fields: { ...speelreeks.fields, stand: { type: 'select', label: 'Stand', required: false, options: { vast: 'Vast', afgelast: 'Afgelast' }, tones: { afgelast: 'bad' } } } } as unknown as Model
  const draw = (rows: Row[], onTitle = vi.fn()) => {
    render(<Timeline view={view} model={withStand} models={{ speelreeks: withStand, productie: productie() }} rows={rows} cal={CAL} shown={{ from: '2026-10-12', to: '2026-10-18' }} lane="productie_id" layout={defaults(view)} onTitle={onTitle} />)
    return onTitle
  }

  it('marks both bars of a lane that share a day, names the other, and says one overlap', () => {
    const onTitle = draw(clash())

    expect(screen.getAllByTitle(/^Overlapt met /)).toHaveLength(2)
    expect(screen.getByTitle('Overlapt met Gent')).toBeTruthy()
    expect(onTitle).toHaveBeenLastCalledWith(expect.objectContaining({ overlaps: 1 }))
  })

  it('leaves a cancelled bar out: no marks, no count', () => {
    const onTitle = draw(clash(true))

    expect(document.querySelectorAll('.nv-tl__bar--cancelled')).toHaveLength(1)
    expect(screen.queryAllByTitle(/^Overlapt met /)).toHaveLength(0)
    expect(onTitle).toHaveBeenLastCalledWith(expect.objectContaining({ overlaps: 0 }))
  })
})

describe('the timeline overlap of bars with times', () => {
  const TIMED: CalendarDef = { day: 'plandag', start: 'start_at', end: 'eind_at', lanes: ['productie_id'] }
  const activity = {
    key: 'activity', label: 'Activiteiten', title_label: 'Omschrijving', title_readonly: false,
    fields: {
      productie_id: { type: 'relation', label: 'Productie', required: true, relation: { model: 'productie', multiple: false } },
      plandag: { type: 'date', label: 'Plandag', required: true },
      start_at: { type: 'datetime', label: 'Start', required: false },
      eind_at: { type: 'datetime', label: 'Einde', required: false },
    },
  } as unknown as Model
  const timed = { ...view, table: 'activity', model: 'activity', calendar: TIMED } as View
  const at = (id: number, title: string, from: string, to: string): Row => ({
    id, title, status: '',
    fields: { plandag: '2026-10-14', start_at: `2026-10-14T${from}`, eind_at: `2026-10-14T${to}`, productie_id: 1 },
    lookups: { productie_id: { id: 1, title: 'De Kersentuin', status: '', fields: {} } },
  })
  const draw = (rows: Row[]) => {
    const onTitle = vi.fn()
    render(<Timeline view={timed} model={activity} models={{ activity, productie: productie() }} rows={rows} cal={TIMED} shown={{ from: '2026-10-12', to: '2026-10-18' }} lane="productie_id" layout={defaults(timed)} onTitle={onTitle} />)
    return onTitle
  }

  it('leaves two bars of one day apart when their times are: one at 10:00, one at 20:00', () => {
    const onTitle = draw([at(1, 'Repetitie', '10:00', '12:00'), at(2, 'Voorstelling', '20:00', '21:15')])

    expect(screen.queryAllByTitle(/^Overlapt met /)).toHaveLength(0)
    expect(onTitle).toHaveBeenLastCalledWith(expect.objectContaining({ overlaps: 0 }))
  })

  it('marks two bars of one day whose times overlap', () => {
    const onTitle = draw([at(1, 'Repetitie', '10:00', '12:00'), at(2, 'Opbouw', '11:00', '13:00')])

    expect(screen.getByTitle('Overlapt met Opbouw')).toBeTruthy()
    expect(onTitle).toHaveBeenLastCalledWith(expect.objectContaining({ overlaps: 1 }))
  })
})

describe("a flagged place in the timeline's drawer", () => {
  const cal: CalendarDef = { day: 'start', start: null, end: 'einde', lanes: [], spans: true }
  const link = { item: 'Plaats', dataset: 'assignment', key: 'activity_id', target: 'person_id', target_dataset: 'person' }
  const activity = {
    key: 'activity', label: 'Activiteiten', title_label: 'Omschrijving', title_readonly: false,
    fields: { people: { type: 'links', label: 'Mensen', required: false, fact: false, link } },
  } as unknown as Model
  const int = { type: 'int', label: 'Id', required: false, fact: true }
  const from = { source: 'candidates', match: { assignment_id: 'id' }, value: 'person_id' }
  const served = {
    models: {
      activity,
      assignment: { key: 'assignment', label: 'Plaatsen', fields: { person_id: { type: 'relation', label: 'Persoon', required: false, fact: true, relation: { model: 'person', multiple: false }, options_from: from } } },
      clashes: { key: 'clashes', label: 'Botsingen', fields: { activity_id: int, assignment_id: int, weight: { type: 'select', label: 'Ernst', required: true, fact: true, options: { clash: 'Botsing' }, tones: { clash: 'bad' } } } },
    },
    tables: [{ key: 'clashes', label: 'Botsingen', model: 'clashes', flags: { marks: { activity: 'activity_id', assignment: 'assignment_id' }, tone: 'weight' } }],
    views: [], writable: { activity: true, assignment: true },
  } as unknown as Schema
  const timeline = { key: 't', label: 'Tijdlijn', table: 'activity', model: 'activity', type: 'timeline', calendar: cal } as unknown as View
  const repetitie: Row = { id: 1, title: 'Repetitie', status: '', fields: { start: '2030-01-08', einde: '2030-01-09', people: [{ id: 11, target: 5, title: 'Sien Peeters', state: null }] } }

  it('offers "Iemand anders kiezen" beside Negeren on the place the flag marks, with the page\'s place writer', async () => {
    api.rows.mockResolvedValue({ rows: [{ id: 1, title: 'Sien staat dubbel ingepland.', status: '', fields: { activity_id: 1, assignment_id: 11, weight: 'clash' } }], total: 1 })
    render(
      <SchemaContext.Provider value={served}>
        <Timeline view={timeline} model={activity} models={served.models} rows={[repetitie]} cal={cal} shown={{ from: '2030-01-07', to: '2030-01-13' }} lane={null}
          layout={defaults(timeline)} places={() => vi.fn()} />
      </SchemaContext.Provider>,
    )

    fireEvent.click(screen.getByRole('button', { name: /Repetitie/ }))
    const band = await within(screen.getByRole('complementary', { name: 'Repetitie' })).findByRole('alert')
    expect([...band.querySelectorAll('.nv-dw-alert__acts button')].map((b) => b.textContent)).toEqual(['Iemand anders kiezen', 'Negeren'])
  })
})
