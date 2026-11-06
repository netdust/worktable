import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { defaults } from '../grid/layout'
import type { CalendarDef, Model, Row, View } from '../types'

const api = vi.hoisted(() => ({ records: vi.fn(), rows: vi.fn(), recordCount: vi.fn(() => Promise.resolve(0)), recordHistory: vi.fn(() => Promise.resolve([])), rowsWhere: vi.fn(() => Promise.resolve({ rows: [], total: 0 })) }))
vi.mock('../api', () => api)
const { Timeline } = await import('./Timeline')

const CAL: CalendarDef = { day: 'start', start: null, end: 'eind', lanes: [], spans: true }
const status = (categories: boolean) => ({
  type: 'select', label: 'Status', required: false, options: { open: 'Open', klaar: 'Klaar', weg: 'Weg', mislukt: 'Mislukt' },
  tones: { klaar: 'bad', mislukt: 'bad' }, ...(categories ? { categories: { open: 'open', klaar: 'done', weg: 'cancelled', mislukt: 'cancelled' } } : {}),
})
const model = (categories: boolean) => ({
  key: 'taak', label: 'Taken', title_label: 'Titel', title_readonly: false,
  fields: { start: { type: 'date', label: 'Start', required: true }, eind: { type: 'date', label: 'Einde', required: true }, status: status(categories) },
}) as unknown as Model
const view = { key: '1', label: 'Tijdlijn', table: 'taak', model: 'taak', type: 'timeline', calendar: CAL } as unknown as View
const row = (id: number, title: string, value: string): Row => ({ id, title, status: '', fields: { start: '2026-10-13', eind: '2026-10-15', status: value }, lookups: {} })

const draw = (categories: boolean, rows: Row[], onTitle = vi.fn()) => {
  const m = model(categories)
  render(<Timeline view={view} model={m} models={{ taak: m }} rows={rows} cal={CAL} shown={{ from: '2026-10-12', to: '2026-10-18' }} lane={null} layout={defaults(view)} onTitle={onTitle} />)
  return onTitle
}
const cancelled = () => [...document.querySelectorAll('.nv-tl__bar--cancelled')].map((b) => b.textContent)

afterEach(() => {
  cleanup()
  vi.resetAllMocks()
})

describe('the timeline cancelled bars by category', () => {
  it('draws a cancelled-category bar cancelled and leaves it out of overlap, whatever its tone', () => {
    const onTitle = draw(true, [row(1, 'Eerste', 'open'), row(2, 'Tweede', 'weg')])

    expect(cancelled()).toHaveLength(1)
    expect(cancelled()[0]).toContain('Tweede')
    expect(screen.queryAllByTitle(/^Overlapt met /)).toHaveLength(0)
    expect(onTitle).toHaveBeenLastCalledWith(expect.objectContaining({ overlaps: 0 }))
  })

  it('does not draw a done bar cancelled although its tone is bad', () => {
    const onTitle = draw(true, [row(1, 'Eerste', 'open'), row(2, 'Tweede', 'klaar')])

    expect(cancelled()).toHaveLength(0)
    expect(screen.getAllByTitle(/^Overlapt met /)).toHaveLength(2)
    expect(onTitle).toHaveBeenLastCalledWith(expect.objectContaining({ overlaps: 1 }))
  })

  it('keeps the tone bad rule where the model has no categories', () => {
    const onTitle = draw(false, [row(1, 'Eerste', 'open'), row(2, 'Tweede', 'klaar')])

    expect(cancelled()).toHaveLength(1)
    expect(onTitle).toHaveBeenLastCalledWith(expect.objectContaining({ overlaps: 0 }))
  })
})
