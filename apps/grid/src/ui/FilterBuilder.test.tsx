import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { useState } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { renderNl, typeKeys } from '../test-setup'
import type { Filter, Join } from '../grid/conditions'
import type { FilterField } from '../grid/filter'
import { Filters } from './Filters'

const remote = vi.hoisted(() => ({ recordHistory: vi.fn(() => Promise.resolve([])), rowsWhere: vi.fn(() => Promise.resolve({ rows: [], total: 0 })),  records: vi.fn() }))
vi.mock('../api', () => remote)

const fields: FilterField[] = [
  { field: 'omschrijving', label: 'Omschrijving', kind: 'text', options: [] },
  { field: 'plandag', label: 'Plandag', kind: 'date', options: [] },
  { field: 'status', label: 'Status', kind: 'choice', options: [['optie', 'Optie'], ['bevestigd', 'Bevestigd'], ['geannuleerd', 'Geannuleerd']] },
  { field: 'klaar', label: 'Klaar', kind: 'bool', options: [['1', 'Ja'], ['0', 'Nee']] },
  { field: 'soort', label: 'Soort', kind: 'choice', options: [['repetitie', 'Repetitie'], ['opbouw', 'Opbouw'], ['reis', 'Reis'], ['maaltijd', 'Maaltijd']] },
]

let changed: Filter[] | null = null
let joined: Join | null = null
function bar(filters: Filter[], join?: Join) {
  changed = null
  joined = null
  const result = render(<Filters fields={fields} filters={filters} join={join} onChange={(next) => (changed = next)} onJoin={(next) => (joined = next)} />)
  return result
}
const chips = () => [...document.querySelectorAll<HTMLElement>('.nv-chip--filter')].map((c) => c.textContent)
const open = () => fireEvent.click(screen.getByRole('button', { name: /^Filter\s*\d*$/ }))
const row = (n: number) => screen.getAllByRole('group', { name: /^Voorwaarde/ })[n] as HTMLElement
/** A picker's list in a row, opened by its button. */
const listOf = (at: HTMLElement, label: string) => {
  fireEvent.click(within(at).getByRole('button', { name: new RegExp(`^${label}:`) }))
  return within(at).getByRole('listbox', { name: label })
}
const choiceList = (at: HTMLElement, search: string) => {
  fireEvent.focus(within(at).getByRole('searchbox', { name: search }))
  return within(at).getByRole('listbox')
}

afterEach(() => {
  cleanup()
  vi.resetAllMocks()
})

describe('the filter chips', () => {
  it('shows each complete condition as a chip in words, and a stored "in" as "is … of …"', () => {
    bar([
      { field: 'status', op: 'in', values: ['optie', 'bevestigd'] },
      { field: 'plandag', op: 'week', values: [] },
      { field: 'omschrijving', op: 'like', values: [''] },
    ])
    expect(chips()).toEqual(['Plandag deze week', 'Status is Optie of Bevestigd'])
    expect(screen.getByRole('button', { name: /^Filter\s*\d*$/ }).textContent).toContain('2')
  })

  it("removes a condition with its chip's ×", () => {
    bar([{ field: 'status', op: 'in', values: ['optie'] }, { field: 'plandag', op: 'week', values: [] }])
    fireEvent.click(screen.getByRole('button', { name: 'Filter Plandag wissen' }))
    expect(changed).toEqual([{ field: 'status', op: 'in', values: ['optie'] }])
  })

  it('has no Periode chip', () => {
    bar([])
    expect(screen.queryByText(/Periode/)).toBeNull()
  })
})

describe('the filter builder', () => {
  it('lists a row per condition, with the operators of its field', () => {
    bar([{ field: 'omschrijving', op: 'like', values: ['zaal'] }, { field: 'plandag', op: 'week', values: [] }])
    open()
    const operators = (n: number) => within(listOf(row(n), 'Vergelijking')).getAllByRole('option').map((o) => o.textContent)
    expect(operators(0)).toEqual(['is vandaag', 'is deze week', 'is volgende week', 'is deze maand', 'ligt tussen'])
    expect(operators(1)).toEqual(['bevat', 'bevat niet', 'is', 'is leeg'])
  })

  it('asks no value of a period, today included', () => {
    for (const op of ['today', 'week', 'next_week', 'month'] as const) {
      bar([{ field: 'plandag', op, values: [] }])
      open()
      expect(row(0).querySelector('.nv-fb__value')?.childElementCount).toBe(0)
      expect(within(row(0)).queryByRole('searchbox')).toBeNull()
      cleanup()
    }
  })

  it('adds a condition, its field the first not yet filtered on', () => {
    bar([{ field: 'omschrijving', op: 'like', values: ['zaal'] }])
    open()
    fireEvent.click(screen.getByRole('button', { name: 'Voorwaarde toevoegen' }))
    expect(changed?.[1]).toEqual({ field: 'plandag', op: 'week', values: [] })
  })

  it('searches a choice as one types, lists only what is not chosen, and adds a pick', () => {
    bar([{ field: 'soort', op: 'in', values: ['repetitie'] }])
    open()
    const search = within(row(0)).getByRole('searchbox', { name: 'Soort zoeken' })
    expect(within(row(0)).queryByRole('listbox')).toBeNull()
    expect(within(choiceList(row(0), 'Soort zoeken')).getAllByRole('option').map((o) => o.textContent)).toEqual(['Opbouw', 'Reis', 'Maaltijd'])
    fireEvent.change(search, { target: { value: 'op' } })
    expect(within(within(row(0)).getByRole('listbox')).getAllByRole('option').map((o) => o.textContent)).toEqual(['Opbouw'])
    fireEvent.click(within(within(row(0)).getByRole('listbox')).getByRole('option', { name: 'Opbouw' }))
    expect(changed).toEqual([{ field: 'soort', op: 'in', values: ['repetitie', 'opbouw'] }])
  })

  it('takes the last chosen value away with Backspace in an empty search', () => {
    bar([{ field: 'soort', op: 'in', values: ['repetitie', 'opbouw'] }])
    open()
    fireEvent.keyDown(within(row(0)).getByRole('searchbox', { name: 'Soort zoeken' }), { key: 'Backspace' })
    expect(changed).toEqual([{ field: 'soort', op: 'in', values: ['repetitie'] }])
  })

  it('keeps one date condition on a date field: choosing a range replaces the period', () => {
    bar([{ field: 'plandag', op: 'week', values: [] }, { field: 'status', op: 'in', values: ['optie'] }])
    open()
    fireEvent.click(within(listOf(row(0), 'Vergelijking')).getByRole('option', { name: 'ligt tussen' }))
    expect(changed).toEqual([{ field: 'plandag', op: 'between', values: [] }, { field: 'status', op: 'in', values: ['optie'] }])
  })

  it('removes a row with its ×', () => {
    bar([{ field: 'soort', op: 'in', values: ['reis'] }, { field: 'plandag', op: 'week', values: [] }])
    open()
    fireEvent.click(within(row(1)).getByRole('button', { name: 'Voorwaarde weghalen' }))
    expect(changed).toEqual([{ field: 'plandag', op: 'week', values: [] }])
  })
})

describe('a yes/no condition', () => {
  it('starts at "ja", so the chip says what the select shows, and "nee" applies', () => {
    bar([{ field: 'omschrijving', op: 'like', values: ['zaal'] }])
    open()
    fireEvent.click(within(listOf(row(0), 'Veld')).getByRole('option', { name: 'Klaar' }))
    expect(changed).toEqual([{ field: 'klaar', op: 'in', values: ['1'] }])
    cleanup()
    bar([{ field: 'klaar', op: 'in', values: ['1'] }])
    expect(chips()).toEqual(['Klaar is Ja'])
    open()
    fireEvent.change(within(row(0)).getByRole('combobox', { name: 'Klaar' }), { target: { value: '0' } })
    expect(changed).toEqual([{ field: 'klaar', op: 'in', values: ['0'] }])
  })
})

describe('the field picker', () => {
  it('shows each field with its kind, searches them, and checks the current one', () => {
    bar([{ field: 'omschrijving', op: 'like', values: ['zaal'] }])
    open()
    const list = listOf(row(0), 'Veld')
    expect(within(list).getByRole('option', { name: 'Omschrijving' }).getAttribute('aria-selected')).toBe('true')
    fireEvent.change(within(row(0)).getByRole('searchbox', { name: 'Veld zoeken' }), { target: { value: 'sta' } })
    expect(within(list).getAllByRole('option').map((o) => o.textContent)).toEqual(['Status'])
    fireEvent.click(within(list).getByRole('option', { name: 'Status' }))
    expect(changed).toEqual([{ field: 'status', op: 'in', values: [] }])
  })

  it('closes on Escape without closing the builder', () => {
    bar([{ field: 'omschrijving', op: 'like', values: ['zaal'] }])
    open()
    listOf(row(0), 'Veld')
    fireEvent.keyDown(within(row(0)).getByRole('searchbox', { name: 'Veld zoeken' }), { key: 'Escape' })
    expect(within(row(0)).queryByRole('listbox')).toBeNull()
    expect(screen.getByRole('button', { name: 'Voorwaarde toevoegen' })).toBeTruthy()
  })
})

describe('the join', () => {
  const soort: Filter = { field: 'soort', op: 'in', values: ['reis'] }
  const status: Filter = { field: 'status', op: 'in', values: ['optie'] }
  const tekst: Filter = { field: 'omschrijving', op: 'like', values: ['zaal'] }
  const week: Filter = { field: 'plandag', op: 'week', values: [] }
  // The join's picker also holds React Aria's hidden native select, whose options are text too: its word is the button's.
  const words = () => screen.getAllByRole('group', { name: /^Voorwaarde/ }).map((r) => (r.querySelector('.nv-fb__join .nv-pick__text') ?? r.querySelector('.nv-fb__join'))?.textContent)

  it('is chosen on the second row, En or Of, and the rows after it say the same word', () => {
    bar([soort, status, tekst], 'or')
    open()
    expect(words()).toEqual(['Waar', 'Of', 'Of'])
    const list = listOf(row(1), 'Verbinding')
    expect(within(list).getAllByRole('option').map((o) => o.textContent)).toEqual(['En', 'Of'])
    fireEvent.click(within(list).getByRole('option', { name: 'En' }))
    expect(joined).toBe('and')
  })

  it('puts a period first, joined with En, so it always narrows; the join holds over the rest', () => {
    bar([soort, week, status], 'or')
    open()
    expect(screen.getAllByRole('group', { name: /^Voorwaarde/ }).map((r) => r.querySelector('.nv-fb__field .nv-pick__text')?.textContent)).toEqual(['Plandag', 'Soort', 'Status'])
    expect(words()).toEqual(['Waar', 'En', 'Of'])
  })

  it('says "of" between the chips the join holds over', () => {
    bar([week, soort, status], 'or')
    expect([...document.querySelectorAll('.nv-filters > *')].map((c) => c.textContent)).toEqual(['Plandag deze week', 'Soort is Reis', 'of', 'Status is Optie', 'Filter3'])
  })
})

/** The builder holding its own filters, as the toolbar does, so each typed segment builds on the last. */
let drafts = 0
function Held({ start }: { start: Filter[] }) {
  const [filters, setFilters] = useState(start)
  return <Filters fields={fields} filters={filters} onChange={(next) => {
    changed = next
    drafts++
    setFilters(next)
  }} onJoin={() => undefined} />
}

describe('the range of "ligt tussen"', () => {
  const ranged = (from: string, to: string) => {
    changed = null
    drafts = 0
    renderNl(<Held start={[{ field: 'plandag', op: 'between', values: [from, to] }]} />)
    open()
  }
  const end = (name: string) => within(within(row(0)).getByRole('group', { name })).getAllByRole('spinbutton')

  it('shows Dutch dates and drafts YYYY-MM-DD for both ends', () => {
    ranged('2026-12-21', '2026-12-27')
    expect(end('Van').map((s) => s.textContent)).toEqual(['21', '12', '2026'])
    expect(end('Tot').map((s) => s.textContent)).toEqual(['27', '12', '2026'])

    end('Van')[0].focus()
    typeKeys('14')
    expect(changed).toEqual([{ field: 'plandag', op: 'between', values: ['2026-12-14', '2026-12-27'] }])
    end('Tot')[0].focus()
    typeKeys('31')
    expect(changed).toEqual([{ field: 'plandag', op: 'between', values: ['2026-12-14', '2026-12-31'] }])
  })

  /** What a mouse does: down, up, click. */
  const press = (target: HTMLElement) => {
    fireEvent.pointerDown(target, { button: 0, pointerType: 'mouse' })
    fireEvent.mouseDown(target, { button: 0 })
    fireEvent.pointerUp(target, { button: 0, pointerType: 'mouse' })
    fireEvent.mouseUp(target, { button: 0 })
    fireEvent.click(target, { button: 0 })
  }
  const calendar = (name: string) => {
    press(within(row(0)).getByRole('button', { name: `Kalender ${name}` }))
    return screen.getByRole('dialog')
  }

  it('opens its calendar without locking the page or hiding it', () => {
    ranged('2026-12-21', '2026-12-27')
    calendar('Van')
    expect(document.documentElement.style.overflow).not.toBe('hidden')
    expect(document.querySelector('[aria-hidden="true"] .nv-fb')).toBeNull()
    expect(screen.getByRole('button', { name: 'Voorwaarde toevoegen' })).toBeTruthy()
  })

  it('closes its calendar on a press elsewhere, the builder staying open', async () => {
    ranged('2026-12-21', '2026-12-27')
    calendar('Van')
    press(within(row(0)).getByText('Waar'))
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(screen.getByRole('button', { name: 'Voorwaarde toevoegen' })).toBeTruthy()
    expect(changed).toBeNull()
  })

  it('drafts a picked day once, as YYYY-MM-DD', async () => {
    ranged('2026-12-21', '2026-12-27')
    press(within(calendar('Van')).getByRole('button', { name: /15 december 2026/ }))
    expect(changed).toEqual([{ field: 'plandag', op: 'between', values: ['2026-12-15', '2026-12-27'] }])
    expect(drafts).toBe(1)
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(screen.getByRole('button', { name: 'Voorwaarde toevoegen' })).toBeTruthy()
  })

  it('closes the builder on Escape in a segment, as the native field did', () => {
    ranged('2026-12-21', '2026-12-27')
    fireEvent.keyDown(end('Tot')[0], { key: 'Escape' })
    expect(screen.queryByRole('button', { name: 'Voorwaarde toevoegen' })).toBeNull()
  })

  it('drafts a reversed range as typed', () => {
    ranged('2026-12-21', '2026-12-27')
    end('Tot')[0].focus()
    typeKeys('07')
    expect(changed).toEqual([{ field: 'plandag', op: 'between', values: ['2026-12-21', '2026-12-07'] }])
  })

  it('starts empty, in Dutch placeholders', () => {
    ranged('', '')
    expect(end('Van').map((s) => s.textContent)).toEqual(['dd', 'mm', 'jjjj'])
  })
})

describe('a picker', () => {
  const button = (at: HTMLElement, label: string) => within(at).getByRole('button', { name: new RegExp(`^${label}:`) })

  it('closes on Escape without closing the builder', () => {
    bar([{ field: 'plandag', op: 'week', values: [] }])
    open()
    const list = listOf(row(0), 'Vergelijking')
    fireEvent.keyDown(within(list).getAllByRole('option')[0], { key: 'Escape' })
    expect(within(row(0)).queryByRole('listbox')).toBeNull()
    expect(screen.getByRole('button', { name: 'Voorwaarde toevoegen' })).toBeTruthy()
  })

  /** What a mouse does: down, up, click. */
  const press = (target: HTMLElement) => {
    fireEvent.pointerDown(target, { button: 0, pointerType: 'mouse' })
    fireEvent.mouseDown(target, { button: 0 })
    fireEvent.pointerUp(target, { button: 0, pointerType: 'mouse' })
    fireEvent.mouseUp(target, { button: 0 })
    fireEvent.click(target, { button: 0 })
  }

  it('closes on a press elsewhere in the builder, which still reaches its target', async () => {
    bar([{ field: 'omschrijving', op: 'like', values: ['zaal'] }])
    open()
    listOf(row(0), 'Vergelijking')
    press(screen.getByRole('button', { name: 'Voorwaarde toevoegen' }))
    await waitFor(() => expect(within(row(0)).queryByRole('listbox')).toBeNull())
    expect(changed?.length).toBe(2)
  })

  it('closes on a second press on its button', async () => {
    bar([{ field: 'plandag', op: 'week', values: [] }])
    open()
    listOf(row(0), 'Vergelijking')
    press(button(row(0), 'Vergelijking'))
    await waitFor(() => expect(within(row(0)).queryByRole('listbox')).toBeNull())
  })

  it('closes its search on one Escape, with text typed in it', () => {
    bar([{ field: 'omschrijving', op: 'like', values: ['zaal'] }])
    open()
    listOf(row(0), 'Veld')
    const search = within(row(0)).getByRole('searchbox', { name: 'Veld zoeken' })
    fireEvent.change(search, { target: { value: 'sta' } })
    fireEvent.keyDown(search, { key: 'Escape' })
    expect(within(row(0)).queryByRole('listbox')).toBeNull()
    expect(screen.getByRole('button', { name: 'Voorwaarde toevoegen' })).toBeTruthy()
    expect(changed).toBeNull()
  })

  it('writes nothing when its current value is picked again', () => {
    bar([{ field: 'plandag', op: 'week', values: [] }])
    open()
    fireEvent.click(within(listOf(row(0), 'Vergelijking')).getByRole('option', { name: 'is deze week' }))
    expect(changed).toBeNull()
    expect(within(row(0)).queryByRole('listbox')).toBeNull()
  })

  it('writes nothing from a letter or an arrow on its closed button', () => {
    bar([{ field: 'plandag', op: 'week', values: [] }])
    open()
    const closed = button(row(0), 'Vergelijking')
    closed.focus()
    for (const key of ['l', 'ArrowRight', 'ArrowLeft']) fireEvent.keyDown(closed, { key })
    expect(changed).toBeNull()
  })

  it('picks the first match of its search with Enter', () => {
    bar([{ field: 'omschrijving', op: 'like', values: ['zaal'] }])
    open()
    listOf(row(0), 'Veld')
    const search = within(row(0)).getByRole('searchbox', { name: 'Veld zoeken' })
    expect(document.activeElement).toBe(search)
    fireEvent.change(search, { target: { value: 'so' } })
    fireEvent.keyDown(search, { key: 'Enter' })
    expect(changed).toEqual([{ field: 'soort', op: 'in', values: [] }])
  })
})
