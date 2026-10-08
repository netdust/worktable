import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Period } from './Period'
import { step, useWindow } from './Window'

function Harness({ unbounded = true }: { unbounded?: boolean }) {
  const [value, setValue] = useWindow()
  return <Period window={value} onChange={setValue} unbounded={unbounded} />
}

const open = () => fireEvent.click(document.querySelector('.nv-chip__value') as HTMLElement)
const menu = () => document.querySelector<HTMLElement>('.nv-filters__menu') as HTMLElement

beforeEach(() => {
  document.documentElement.lang = 'nl-BE'
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date(2026, 10, 4, 10, 0))
})
afterEach(() => {
  cleanup()
  vi.useRealTimers()
  window.location.hash = ''
  document.documentElement.lang = ''
})

describe('the Periode chip', () => {
  it('reads the period after its name and has no remove button', () => {
    render(<Harness />)

    expect(screen.getByRole('group', { name: 'Periode' }).textContent).toBe('Periode Week 45 · 2–8 nov')
    expect(screen.queryByRole('button', { name: /verwijder|remove/i })).toBeNull()
  })

  it('steps a week by seven days', () => {
    render(<Harness />)

    fireEvent.click(screen.getByRole('button', { name: 'Volgende periode' }))
    expect(screen.getByText('Week 46 · 9–15 nov')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Vorige periode' }))
    fireEvent.click(screen.getByRole('button', { name: 'Vorige periode' }))
    expect(screen.getByText('Week 44 · 26 okt–1 nov')).toBeTruthy()
  })

  it('steps a month by a calendar month, and any other range by its span', () => {
    expect(step({ from: '2027-01-01', to: '2027-01-31' }, 1)).toEqual({ from: '2027-02-01', to: '2027-02-28' })
    expect(step({ from: '2026-03-01', to: '2026-03-31' }, -1)).toEqual({ from: '2026-02-01', to: '2026-02-28' })
    expect(step({ from: '2026-10-12', to: '2026-10-22' }, 1)).toEqual({ from: '2026-10-23', to: '2026-11-02' })
    expect(step({ from: '2026-10-12', to: '2026-10-22' }, -1)).toEqual({ from: '2026-10-01', to: '2026-10-11' })
  })

  it('names a month and a range', () => {
    window.location.hash = '#from=2026-10-01&to=2026-10-31'
    const { unmount } = render(<Harness />)
    expect(screen.getByRole('group', { name: 'Periode' }).textContent).toBe('Periode oktober 2026')
    unmount()

    window.location.hash = '#from=2026-10-12&to=2026-11-03'
    render(<Harness />)
    expect(screen.getByRole('group', { name: 'Periode' }).textContent).toBe('Periode 12 okt – 3 nov')
  })

  it('lands on the week of a from alone, keeps a month, and reads period=all as every day', () => {
    window.location.hash = '#from=2026-10-14'
    const week = render(<Harness />)
    expect(screen.getByText('Week 42 · 12–18 okt')).toBeTruthy()
    week.unmount()

    window.location.hash = '#from=2026-10-01&to=2026-10-31'
    const month = render(<Harness />)
    expect(screen.getByText('oktober 2026')).toBeTruthy()
    month.unmount()

    window.location.hash = '#period=all'
    render(<Harness />)
    expect(screen.getByText('Alles')).toBeTruthy()
  })

  it('offers this week, next week, this month and a Van–tot', () => {
    render(<Harness />)

    open()
    fireEvent.click(within(menu()).getByRole('button', { name: 'Deze maand' }))
    expect(window.location.hash).toBe('#from=2026-11-01&to=2026-11-30')

    open()
    fireEvent.click(within(menu()).getByRole('button', { name: 'Volgende week' }))
    expect(window.location.hash).toBe('#from=2026-11-09&to=2026-11-15')

    open()
    fireEvent.click(within(menu()).getByRole('button', { name: 'Deze week' }))
    expect(window.location.hash).toBe('#from=2026-11-02&to=2026-11-08')

    open()
    fireEvent.change(screen.getByLabelText('Tot'), { target: { value: '2026-11-20' } })
    expect(window.location.hash).toBe('#from=2026-11-02&to=2026-11-08')
    fireEvent.click(screen.getByRole('button', { name: 'Toepassen' }))
    expect(window.location.hash).toBe('#from=2026-11-02&to=2026-11-20')
  })

  it('next week crosses New Year into ISO week 1', () => {
    vi.setSystemTime(new Date(2026, 11, 28, 10, 0))
    render(<Harness />)

    open()
    fireEvent.click(within(menu()).getByRole('button', { name: 'Volgende week' }))

    expect(window.location.hash).toBe('#from=2027-01-04&to=2027-01-10')
    expect(screen.getByText('Week 1 · 4–10 jan')).toBeTruthy()
  })

  it('offers Alles only where the skin is unbounded, and Alles hides the arrows', () => {
    const bounded = render(<Harness unbounded={false} />)
    open()
    expect(within(menu()).queryByRole('button', { name: 'Alles' })).toBeNull()
    bounded.unmount()

    render(<Harness />)
    open()
    fireEvent.click(within(menu()).getByRole('button', { name: 'Alles' }))

    expect(document.querySelector('.nv-chip__value')?.textContent).toBe('Alles')
    expect(screen.queryByRole('button', { name: 'Volgende periode' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Vorige periode' })).toBeNull()
    expect(window.location.hash).toBe('#period=all')
  })

  it('holds Van–tot as a draft: typing reads nothing until Toepassen', () => {
    render(<Harness />)

    open()
    fireEvent.change(screen.getByLabelText('Van'), { target: { value: '2026-11-03' } })
    fireEvent.change(screen.getByLabelText('Tot'), { target: { value: '2026-11-12' } })
    expect(window.location.hash).toBe('')
    fireEvent.click(screen.getByRole('button', { name: 'Toepassen' }))

    expect(window.location.hash).toBe('#from=2026-11-03&to=2026-11-12')
  })

  it('applies a Van–tot typed under Alles', () => {
    window.location.hash = '#period=all'
    render(<Harness />)

    open()
    fireEvent.change(screen.getByLabelText('Van'), { target: { value: '2026-11-03' } })
    fireEvent.change(screen.getByLabelText('Tot'), { target: { value: '2026-11-12' } })
    fireEvent.click(screen.getByRole('button', { name: 'Toepassen' }))

    expect(window.location.hash).toBe('#from=2026-11-03&to=2026-11-12')
  })

  it('moves Tot along when Van is set past it', () => {
    render(<Harness />)

    open()
    fireEvent.change(screen.getByLabelText('Van'), { target: { value: '2026-11-20' } })

    expect((screen.getByLabelText('Tot') as HTMLInputElement).value).toBe('2026-11-20')
  })

  it('disables Toepassen for an empty date, and over 92 days where the skin is bounded', () => {
    const bounded = render(<Harness unbounded={false} />)
    open()
    fireEvent.change(screen.getByLabelText('Tot'), { target: { value: '2027-03-01' } })
    expect((screen.getByRole('button', { name: 'Toepassen' }) as HTMLButtonElement).disabled).toBe(true)
    bounded.unmount()

    render(<Harness />)
    open()
    fireEvent.change(screen.getByLabelText('Tot'), { target: { value: '' } })
    expect((screen.getByRole('button', { name: 'Toepassen' }) as HTMLButtonElement).disabled).toBe(true)
    fireEvent.change(screen.getByLabelText('Tot'), { target: { value: '2027-03-01' } })
    expect((screen.getByRole('button', { name: 'Toepassen' }) as HTMLButtonElement).disabled).toBe(false)
  })
})
