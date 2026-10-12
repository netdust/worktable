import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { CalendarDef, Model, Row, View } from '../types'

vi.mock('../api', () => ({ records: vi.fn(), recordLink: vi.fn(), rotateRecordLink: vi.fn(), attachmentsOf: vi.fn() }))
const { Calendar, HOUR_PX } = await import('./Calendar')

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
  const onShown = vi.fn()
  render(<Calendar view={view} model={model} models={{ persoon_dag: model }} rows={rows} cal={CAL} shown={{ from: '2026-10-12', to: '2026-10-18' }}
    lane="persoon_id" onShown={onShown} onLane={() => undefined} {...over} />)
  return onShown
}

describe('the calendar', () => {
  it('a timed event sits on the hour axis, at its start and for its length', () => {
    shown()
    const monday = screen.getByRole('region', { name: 'ma 12' })
    const block = within(monday).getByRole('button', { name: /14:00–17:00.*repetitie Gent/ })
    expect([block.style.top, block.style.height]).toEqual([`${(14 - 8) * HOUR_PX}px`, `${3 * HOUR_PX}px`])
    expect(screen.getByTestId('hours').textContent).toContain('08:00')
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

  it('a source without a start column shows only the all-day band, stacked per day', () => {
    shown({ cal: { ...CAL, start: null, end: null } })
    expect(screen.queryByTestId('hours')).toBeNull()
    expect(within(screen.getByRole('group', { name: 'Hele dag ma 12' })).getByRole('button', { name: /repetitie Gent/ })).toBeTruthy()
  })

  it('clicking an event opens the drawer on its row', () => {
    shown()
    fireEvent.click(screen.getByRole('button', { name: /repetitie Gent/ }))
    expect(screen.getByRole('complementary', { name: 'repetitie Gent' })).toBeTruthy()
  })

  it('Maand asks for the month the week sits in, and the arrows move a week', () => {
    const onShown = shown()
    fireEvent.click(screen.getByRole('radio', { name: 'Maand' }))
    expect(onShown).toHaveBeenLastCalledWith({ from: '2026-10-01', to: '2026-10-31' })
    fireEvent.click(screen.getByRole('button', { name: 'Volgende periode' }))
    expect(onShown).toHaveBeenLastCalledWith({ from: '2026-10-19', to: '2026-10-25' })
  })

  it('a month shows each event on its day, named with its lane', () => {
    shown({ shown: { from: '2026-10-01', to: '2026-10-31' } })
    expect(screen.getByRole('button', { name: /Noor Claes · vergadering Antwerpen/ })).toBeTruthy()
  })
})
