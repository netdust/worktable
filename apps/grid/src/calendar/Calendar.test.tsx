import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { CalendarDef, Model, Row, Schema, View } from '../types'
import { SchemaContext } from '../grid/drawer/context'
import { defaults } from '../grid/layout'

vi.mock('../api', () => ({ recordCount: vi.fn(() => Promise.resolve(0)), recordHistory: vi.fn(() => Promise.resolve([])), rowsWhere: vi.fn(() => Promise.resolve({ rows: [], total: 0 })),  records: vi.fn(), rows: vi.fn(), recordLink: vi.fn(), rotateRecordLink: vi.fn(), attachmentsOf: vi.fn() }))
const { Calendar, HOUR_PX } = await import('./Calendar')
const api = await import('../api')

const CAL: CalendarDef = { day: 'plandag', start: 'start_at', end: 'eind_at', lanes: ['persoon_id'] }
const model: Model = {
  key: 'persoon_dag', label: 'Per persoon per dag', title_label: 'Omschrijving', title_readonly: true,
  fields: {
    plandag: { label: 'Plandag', type: 'date' },
    start_at: { label: 'Start', type: 'datetime' },
    persoon_id: { label: 'Persoon', type: 'relation', relation: { model: 'persoon' } },
  },
} as unknown as Model
const view = { key: '7', label: 'Persoonskalender', table: 'persoon_dag', model: 'persoon_dag', type: 'calendar', calendar: CAL } as unknown as View

const row = (id: number, title: string, day: string, start: string | null, person: [number, string], end: string | null = null): Row => ({
  id, title, status: '',
  fields: { plandag: day, start_at: start, eind_at: end, persoon_id: person[0] },
  lookups: { persoon_id: { id: person[0], title: person[1], status: '', fields: {} } },
})
const rows = [
  row(1, 'repetitie Gent', '2026-10-12', '2026-10-12T14:00', [1, 'Lotte Verhaegen'], '2026-10-12T17:00'),
  row(2, 'overnachting Antwerpen', '2026-10-15', null, [1, 'Lotte Verhaegen']),
  row(3, 'vergadering Antwerpen', '2026-10-14', '2026-10-14T17:30', [3, 'Noor Claes']),
]

afterEach(cleanup)

const shown = (over: Partial<Parameters<typeof Calendar>[0]> = {}) => {
  render(<Calendar view={view} model={model} models={{ persoon_dag: model }} rows={rows} cal={CAL} shown={{ from: '2026-10-12', to: '2026-10-18' }}
    lane="persoon_id" layout={defaults(view)} {...over} />)
}

describe('the calendar', () => {
  it('a timed event sits on the hour axis, at its start and for its length', () => {
    shown()
    const monday = screen.getByRole('region', { name: 'ma 12' })
    const block = within(monday).getByRole('button', { name: /14:00–17:00.*repetitie Gent/ })
    expect([block.style.top, block.style.height]).toEqual([`${(14 - 8) * HOUR_PX}px`, `${3 * HOUR_PX}px`])
    expect(screen.getByTestId('hours').textContent).toContain('08:00')
  })

  it('a block too short for two lines puts its time and name on one line, and names the activity on hover', () => {
    shown({ rows: [row(4, 'voorstelling zonder einde', '2026-10-12', '2026-10-12T20:00', [1, 'Lotte Verhaegen'])] })
    const block = screen.getByRole('button', { name: /20:00.*voorstelling zonder einde/ })
    expect(block.classList.contains('nv-cal__event--short')).toBe(true)
    expect(block.title).toBe('Lotte Verhaegen · voorstelling zonder einde')
  })

  it('an untimed event sits in the all-day band above the hours', () => {
    shown()
    const band = screen.getByRole('group', { name: 'Hele dag do 15' })
    expect(within(band).getByRole('button', { name: /overnachting Antwerpen/ })).toBeTruthy()
  })

  it('lanes colour and group the events, with a legend', () => {
    shown()
    const legend = screen.getByRole('list', { name: 'Rijen' })
    expect(within(legend).getAllByRole('listitem').map((item) => item.textContent)).toEqual(['Lotte Verhaegen', 'Noor Claes'])
    const tone = (name: RegExp) => screen.getByRole('button', { name }).style.getPropertyValue('--tone')
    expect(tone(/repetitie Gent/)).toBe(tone(/overnachting Antwerpen/))
    expect(tone(/repetitie Gent/)).not.toBe(tone(/vergadering Antwerpen/))
    const lotte = within(legend).getByText('Lotte Verhaegen').closest('li') as HTMLElement
    expect(lotte.style.getPropertyValue('--tone')).toBe(tone(/repetitie Gent/))
  })

  it("lanes by a relation to a toned dataset take each record's tone, in the events and the legend; a record without one, the palette", async () => {
    const persoon = {
      key: 'persoon', label: 'Personen', title_label: 'Naam', title_readonly: false, tone: 'kleur',
      fields: { kleur: { label: 'Kleur', type: 'select', options: { teal: 'Groenblauw' }, tones: { teal: 'teal' } } },
    } as unknown as Model
    vi.mocked(api.records).mockResolvedValue({ rows: [{ id: 1, title: 'Lotte', status: '', fields: { kleur: 'teal' } }, { id: 3, title: 'Noor', status: '', fields: { kleur: null } }], total: 2 })
    shown({ models: { persoon_dag: model, persoon } })
    const tone = (name: RegExp) => screen.getByRole('button', { name }).style.getPropertyValue('--tone')
    await waitFor(() => expect(tone(/repetitie Gent/)).toBe('var(--tone-teal)'))
    const legend = screen.getByRole('list', { name: 'Rijen' })
    expect((within(legend).getByText('Lotte Verhaegen').closest('li') as HTMLElement).style.getPropertyValue('--tone')).toBe('var(--tone-teal)')
    expect(tone(/vergadering Antwerpen/)).toBe('var(--tone-violet)')
    expect(api.records).toHaveBeenCalledWith('persoon', '')
  })

  it("waits for the lane records' tones on a first open: no event or legend is drawn in the palette and repainted", async () => {
    const groep = {
      key: 'groep', label: 'Groepen', title_label: 'Naam', title_readonly: false, tone: 'kleur',
      fields: { kleur: { label: 'Kleur', type: 'select', options: { teal: 'Groenblauw' }, tones: { teal: 'teal' } } },
    } as unknown as Model
    const laned = { ...model, fields: { ...model.fields, persoon_id: { label: 'Persoon', type: 'relation', relation: { model: 'groep' } } } } as unknown as Model
    let answer: (found: { rows: Row[]; total: number }) => void = () => undefined
    vi.mocked(api.records).mockReturnValue(new Promise((done) => { answer = done }))
    shown({ model: laned, models: { persoon_dag: laned, groep } })

    expect(screen.queryByRole('list', { name: 'Rijen' })).toBeNull()
    expect(screen.queryByRole('button', { name: /repetitie Gent/ })).toBeNull()
    answer({ rows: [{ id: 1, title: 'Lotte', status: '', fields: { kleur: 'teal' } }], total: 1 })
    const block = await screen.findByRole('button', { name: /repetitie Gent/ })
    expect(block.style.getPropertyValue('--tone')).toBe('var(--tone-teal)')
  })

  it('without a lane, events take the tone of their option and no legend shows', () => {
    const toned = { ...model, fields: { ...model.fields, soort: { label: 'Soort', type: 'select', options: { repetitie: 'Repetitie', reis: 'Reis' }, tones: { repetitie: 'violet', reis: 'sky' } } } } as unknown as Model
    const of = (r: Row, soort: string): Row => ({ ...r, fields: { ...r.fields, soort } })
    shown({ model: toned, models: { persoon_dag: toned }, lane: null, rows: [of(rows[0], 'repetitie'), of(rows[2], 'reis')] })
    expect(screen.queryByRole('list', { name: 'Rijen' })).toBeNull()
    const tone = (name: RegExp) => screen.getByRole('button', { name }).style.getPropertyValue('--tone')
    expect([tone(/repetitie Gent/), tone(/vergadering Antwerpen/)]).toEqual(['var(--tone-violet)', 'var(--tone-sky)'])
  })

  it('with a lane chosen, events keep the lane colours even when none of them has one', () => {
    const toned = { ...model, fields: { ...model.fields, soort: { label: 'Soort', type: 'select', options: { repetitie: 'Repetitie' }, tones: { repetitie: 'violet' } } } } as unknown as Model
    const loose: Row = { ...rows[0], fields: { ...rows[0].fields, persoon_id: null, soort: 'repetitie' }, lookups: {} }
    shown({ model: toned, models: { persoon_dag: toned }, rows: [loose] })
    expect(screen.getByRole('button', { name: /repetitie Gent/ }).style.getPropertyValue('--tone')).not.toBe('var(--tone-violet)')
  })

  it('an event with no title still reads, as untitled', () => {
    shown({ rows: [{ ...rows[1], title: '' }] })
    const band = screen.getByRole('group', { name: 'Hele dag do 15' })
    expect(within(band).getByRole('button', { name: /Zonder titel/ }).textContent).toBe('Zonder titel')
  })

  it('a source without a start column shows only the all-day band, stacked per day', () => {
    shown({ cal: { ...CAL, start: null, end: null } })
    expect(screen.queryByTestId('hours')).toBeNull()
    expect(within(screen.getByRole('group', { name: 'Hele dag ma 12' })).getByRole('button', { name: /repetitie Gent/ })).toBeTruthy()
  })

  it("the row drawer opens beside the calendar, as the grid's does, not under it", () => {
    shown()
    fireEvent.click(screen.getByRole('button', { name: /repetitie Gent/ }))
    const drawer = screen.getByRole('complementary', { name: 'repetitie Gent' })
    const body = drawer.parentElement as HTMLElement
    expect(body.className).toBe('nv-body')
    expect(body.querySelector(':scope > .nv-cal__body')).toBeTruthy()
  })

  it("a month carries each lane's colour, as the week and the legend do", () => {
    shown({ shown: { from: '2026-10-01', to: '2026-10-31' } })
    const legend = screen.getByRole('list', { name: 'Rijen' })
    const noor = within(legend).getByText('Noor Claes').closest('li') as HTMLElement
    const chip = screen.getByRole('button', { name: /Noor Claes · vergadering Antwerpen/ })
    expect(chip.style.getPropertyValue('--tone')).not.toBe('')
    expect(chip.style.getPropertyValue('--tone')).toBe(noor.style.getPropertyValue('--tone'))
  })

  it('clicking an event opens the drawer on its row', () => {
    shown()
    fireEvent.click(screen.getByRole('button', { name: /repetitie Gent/ }))
    expect(screen.getByRole('complementary', { name: 'repetitie Gent' })).toBeTruthy()
  })

  it('a month shows each event on its day, named with its lane', () => {
    shown({ shown: { from: '2026-10-01', to: '2026-10-31' } })
    expect(screen.getByRole('button', { name: /Noor Claes · vergadering Antwerpen/ })).toBeTruthy()
  })

  it('a month from a Sunday the 1st shows six whole weeks, the 1st last in the first and the 30th first in the last', () => {
    shown({ shown: { from: '2026-11-01', to: '2026-11-30' } })
    const weeks = document.querySelectorAll('table.nv-cal--month tbody tr')
    expect(weeks).toHaveLength(6)
    expect(weeks[0].querySelector('td:last-child .nv-cal__date')?.textContent).toBe('1')
    expect(weeks[5].querySelector('td:first-child .nv-cal__date')?.textContent).toBe('30')
  })
})

describe('a spanning row', () => {
  const SPANS: CalendarDef = { day: 'start_datum', start: null, end: 'eind_datum', lanes: [], spans: true }
  const stop = (id: number, title: string, from: string, to: string): Row => ({ id, title, status: '', fields: { start_datum: from, eind_datum: to } })
  const spanning = (shownDays: { from: string; to: string }, list: Row[]) =>
    render(<Calendar view={{ ...view, calendar: SPANS } as View} model={model} models={{ persoon_dag: model }} rows={list} cal={SPANS}
      shown={shownDays} lane={null} layout={defaults(view)} />)

  it('is one bar across its days in the week, not a chip per day', () => {
    spanning({ from: '2026-10-12', to: '2026-10-18' }, [stop(1, 'Brugge', '2026-10-12', '2026-10-15')])
    const bars = screen.getAllByRole('button', { name: 'Brugge' })
    expect(bars).toHaveLength(1)
    expect(bars[0].style.gridColumn).toBe('2 / span 4')
  })

  it('is one bar per week it crosses in the month', () => {
    spanning({ from: '2026-10-01', to: '2026-10-31' }, [stop(1, 'Brugge', '2026-10-16', '2026-10-20')])
    const bars = screen.getAllByRole('button', { name: 'Brugge' })
    expect(bars.map((bar) => bar.style.gridColumn)).toEqual(['5 / span 3', '1 / span 2'])
    expect(bars[0].className).toContain('nv-cal__event--after')
    expect(bars[1].className).toContain('nv-cal__event--before')
  })
})

describe("a flagged place in the calendar's own drawer", () => {
  const cal: CalendarDef = { day: 'plandag', start: null, end: null, lanes: [] }
  const link = { item: 'Plaats', dataset: 'assignment', key: 'activity_id', target: 'person_id', target_dataset: 'person' }
  const activity = {
    key: 'activity', label: 'Activiteiten', title_label: 'Omschrijving', title_readonly: false,
    fields: { plandag: { type: 'date', label: 'Plandag', required: true, fact: false }, people: { type: 'links', label: 'Mensen', required: false, fact: false, link } },
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
  const calendar = { key: 'k', label: 'Kalender', table: 'activity', model: 'activity', type: 'calendar', calendar: cal } as unknown as View
  const holding = (target: number, title: string): Row => ({ id: 1, title: 'Repetitie', status: '', fields: { plandag: '2030-01-08', people: [{ id: 11, target, title, state: null }] } })
  const places = vi.fn(() => vi.fn())
  const sheet = (row: Row) => (
    <SchemaContext.Provider value={served}>
      <Calendar view={calendar} model={activity} models={served.models} rows={[row]} cal={cal} shown={{ from: '2030-01-07', to: '2030-01-13' }} lane={null}
        layout={defaults(calendar)} places={places} />
    </SchemaContext.Provider>
  )

  afterEach(() => vi.mocked(api.rows).mockReset())

  it('offers "Iemand anders kiezen" beside Negeren with the page\'s place writer, and shows the place as the rows now hold it', async () => {
    vi.mocked(api.rows).mockResolvedValue({ rows: [{ id: 1, title: 'Sien staat dubbel ingepland.', status: '', fields: { activity_id: 1, assignment_id: 11, weight: 'clash' } }], total: 1 })
    const { rerender } = render(sheet(holding(5, 'Sien Peeters')))

    fireEvent.click(screen.getByRole('button', { name: /Repetitie/ }))
    const band = await within(screen.getByRole('complementary', { name: 'Repetitie' })).findByRole('alert')
    expect([...band.querySelectorAll('.nv-dw-alert__acts button')].map((b) => b.textContent)).toEqual(['Iemand anders kiezen', 'Negeren'])
    expect(places).toHaveBeenCalledWith('activity', 1)

    // A pick writes the place and the record is read again: the drawer shows who holds it now.
    rerender(sheet(holding(7, 'Noor Janssens')))
    const mensen = within(screen.getByRole('complementary', { name: 'Repetitie' })).getByRole('region', { name: 'Mensen' })
    expect(within(mensen).getByRole('listitem').textContent).toContain('Noor Janssens')
  })
})
