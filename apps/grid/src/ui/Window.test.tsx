import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { formatWindow, shift, useWindow, weekOf, WindowControl } from './Window'

const api = vi.hoisted(() => ({ schema: vi.fn(), rows: vi.fn(), update: vi.fn(), create: vi.fn(), savedViews: () => Promise.resolve([]),
  me: () => Promise.resolve({ id: 1, email: 'an@example.test', role: 'editor', subject: null }), onUnauthenticated: () => () => undefined,
  prefs: () => Promise.resolve({ order: {}, last: {} }), savePrefs: () => Promise.resolve() }))
vi.mock('../api', () => api)
const { App } = await import('./App')

function Harness() {
  const [value, setValue] = useWindow()
  return <WindowControl value={value} onChange={setValue} />
}

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

  it("names the month in the admin locale, once when the week stays in it", () => {
    expect(formatWindow({ from: '2026-05-18', to: '2026-05-24' })).toBe('Week 18 – 24 mei')
    expect(formatWindow({ from: '2026-04-27', to: '2026-05-03' })).toBe('Week 27 apr – 3 mei')
  })

  it('crosses a year boundary with both months named', () => {
    expect(formatWindow({ from: '2026-12-28', to: '2027-01-03' })).toBe('Week 28 dec – 3 jan')
  })

  it('follows an English admin locale', () => {
    document.documentElement.lang = 'en-GB'
    expect(formatWindow({ from: '2026-05-18', to: '2026-05-24' })).toBe('Week 18 – 24 May')
  })
})

describe('WindowControl', () => {
  it('defaults to the current Monday to Sunday', () => {
    render(<Harness />)

    expect(screen.getByText('Week 18 – 24 mei')).toBeTruthy()
  })

  it('next and previous move it by seven days and keep it in the hash', () => {
    render(<Harness />)

    fireEvent.click(screen.getByRole('button', { name: 'Next week' }))
    expect(screen.getByText('Week 25 – 31 mei')).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: 'Previous week' }))
    fireEvent.click(screen.getByRole('button', { name: 'Previous week' }))
    expect(screen.getByText('Week 11 – 17 mei')).toBeTruthy()
    expect(window.location.hash).toBe('#from=2026-05-11&to=2026-05-17')
  })

  it('a reload keeps the window from the hash', () => {
    window.location.hash = '#from=2026-06-01&to=2026-06-07'

    render(<Harness />)

    expect(screen.getByText('Week 1 – 7 jun')).toBeTruthy()
  })

  it('a hash that is not a date falls back to the current week', () => {
    window.location.hash = '#from=soon'

    render(<Harness />)

    expect(screen.getByText('Week 18 – 24 mei')).toBeTruthy()
  })

  it('picking a day shows its week', () => {
    render(<Harness />)

    fireEvent.change(screen.getByLabelText('Pick a day'), { target: { value: '2026-07-02' } })

    expect(screen.getByText('Week 29 jun – 5 jul')).toBeTruthy()
  })
})

describe('App and the window', () => {
  it('requests rows with the window it shows', async () => {
    const planning = { key: 'planning', label: 'Planning', table: 'planning', model: 'activity', date_field: 'date' }
    api.rows.mockResolvedValue({ rows: [], total: 0 })
    const tables = [{ key: 'planning', label: 'Planning', model: 'activity', types: ['grid' as const] }]
    api.schema.mockResolvedValue({ models: {}, tables, views: [planning], writable: {} })
    render(<App />)

    await screen.findByText('No rows in this window')
    expect(screen.getByText('Week 18 – 24 mei')).toBeTruthy()
    expect(api.rows).toHaveBeenLastCalledWith(planning, { from: '2026-05-18', to: '2026-05-24' }, null, expect.any(Object))

    fireEvent.click(screen.getByRole('button', { name: 'Next week' }))

    expect(screen.getByText('Week 25 – 31 mei')).toBeTruthy()
    await vi.waitFor(() => expect(api.rows).toHaveBeenLastCalledWith(planning, { from: '2026-05-25', to: '2026-05-31' }, null, expect.any(Object)))
    await screen.findByText('No rows in this window')
  })
})
