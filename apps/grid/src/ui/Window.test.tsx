import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { formatWindow, isoWeek, shift, weekOf } from './Window'

const api = vi.hoisted(() => ({ schema: vi.fn(), rows: vi.fn(), update: vi.fn(), create: vi.fn(), remove: vi.fn(), records: vi.fn(), awayRows: vi.fn(), savedViews: () => Promise.resolve([]),
  me: () => Promise.resolve({ id: 1, email: 'an@example.test', role: 'editor', subject: null }), onUnauthenticated: () => () => undefined,
  prefs: () => Promise.resolve({ order: {}, last: {} }), savePrefs: () => Promise.resolve(),
  rowOf: vi.fn(), undoBatch: vi.fn(), runAction: vi.fn() }))
vi.mock('../api', () => api)
const { App } = await import('./App')

beforeEach(() => {
  document.documentElement.lang = 'nl-BE'
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date(2026, 4, 20, 10, 0))
})
afterEach(() => {
  cleanup()
  vi.useRealTimers()
  vi.resetAllMocks()
  window.location.hash = ''
  document.documentElement.lang = ''
})

describe('the week window', () => {
  it('runs Monday to Sunday around a day', () => {
    expect(weekOf(new Date(2026, 4, 20))).toEqual({ from: '2026-05-18', to: '2026-05-24' })
    expect(weekOf(new Date(2026, 4, 24))).toEqual({ from: '2026-05-18', to: '2026-05-24' })
    expect(weekOf(new Date(2026, 4, 18))).toEqual({ from: '2026-05-18', to: '2026-05-24' })
  })

  it('moves by seven days across a month', () => {
    expect(shift({ from: '2026-05-25', to: '2026-05-31' }, 7)).toEqual({ from: '2026-06-01', to: '2026-06-07' })
    expect(shift({ from: '2026-05-04', to: '2026-05-10' }, -7)).toEqual({ from: '2026-04-27', to: '2026-05-03' })
  })

  it('numbers the week as ISO does: week 1 holds the first Thursday', () => {
    expect(isoWeek(new Date(2026, 10, 2))).toBe(45)
    expect(isoWeek(new Date(2026, 0, 1))).toBe(1)
    expect(isoWeek(new Date(2027, 0, 3))).toBe(53)
    expect(isoWeek(new Date(2027, 0, 4))).toBe(1)
  })

  it("names the month in the admin locale, once when the week stays in it", () => {
    expect(formatWindow({ from: '2026-05-18', to: '2026-05-24' })).toBe('Week 21 · 18–24 mei')
    expect(formatWindow({ from: '2026-04-27', to: '2026-05-03' })).toBe('Week 18 · 27 apr–3 mei')
  })

  it('crosses a year boundary with both months named', () => {
    expect(formatWindow({ from: '2026-12-28', to: '2027-01-03' })).toBe('Week 53 · 28 dec–3 jan')
  })

  it('follows an English admin locale', () => {
    document.documentElement.lang = 'en-GB'
    expect(formatWindow({ from: '2026-05-18', to: '2026-05-24' })).toBe('Week 21 · 18–24 May')
  })
})

describe('App and the window', () => {
  it('requests rows with the window it shows', async () => {
    const planning = { key: 'planning', label: 'Planning', table: 'planning', model: 'activity', date_field: 'date' }
    api.rows.mockResolvedValue({ rows: [], total: 0 })
    const tables = [{ key: 'planning', label: 'Planning', model: 'activity', types: ['grid' as const] }]
    const models = { activity: { key: 'activity', label: 'Activiteit', title_label: 'Titel', title_readonly: false, fields: {} } }
    api.schema.mockResolvedValue({ models, tables, views: [planning], writable: {} })
    render(<App />)

    await screen.findByText('Geen rijen in deze periode')
    expect(screen.getAllByText('Week 21 · 18–24 mei').length).toBeGreaterThan(0)
    expect(api.rows).toHaveBeenLastCalledWith(planning, { from: '2026-05-18', to: '2026-05-24' }, null, expect.any(Object))

    fireEvent.click(screen.getByRole('button', { name: 'Volgende periode' }))

    expect(screen.getAllByText('Week 22 · 25–31 mei').length).toBeGreaterThan(0)
    await vi.waitFor(() => expect(api.rows).toHaveBeenLastCalledWith(planning, { from: '2026-05-25', to: '2026-05-31' }, null, expect.any(Object)))
    await screen.findByText('Geen rijen in deze periode')
  })
})
