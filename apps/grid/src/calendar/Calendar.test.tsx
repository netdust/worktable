import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { CalendarDef, Model, Row, View } from '../types'

vi.mock('../api', () => ({ records: vi.fn(), recordLink: vi.fn(), rotateRecordLink: vi.fn(), attachmentsOf: vi.fn() }))
const { Calendar } = await import('./Calendar')

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

const row = (id: number, title: string, day: string, start: string | null, person: [number, string]): Row => ({
  id, title, status: '',
  fields: { plandag: day, start_at: start, eind_at: null, persoon_id: person[0] },
  lookups: { persoon_id: { id: person[0], title: person[1], status: '', fields: {} } },
})
const rows = [
  row(1, 'repetitie Gent', '2026-10-12', '2026-10-12T14:00', [1, 'Lotte Verhaegen']),
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
  it('a week shows its lanes as rows and a chip per event, untimed ones as all-day', () => {
    shown()
    const lotte = screen.getByRole('row', { name: 'Lotte Verhaegen' })
    expect(within(lotte).getByRole('button', { name: /14:00.*repetitie Gent/ })).toBeTruthy()
    expect(within(lotte).getByRole('button', { name: /Hele dag.*overnachting Antwerpen/ })).toBeTruthy()
    expect(within(screen.getByRole('row', { name: 'Noor Claes' })).getByRole('button', { name: /17:30/ })).toBeTruthy()
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
