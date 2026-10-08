import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { LinkItem, Model, Row, View } from '../../types'
import { filterFields } from '../filter'
import { Grid } from '../Grid'
import { defaults } from '../layout'
import { createStore, type StoreApi } from '../store'
import type { LinkActions } from './Links'

const remote = vi.hoisted(() => ({ records: vi.fn() }))
vi.mock('../../api', () => remote)

const day: Model = {
  key: 'day', label: 'Dag', title_label: 'Omschrijving', title_readonly: false, query: true,
  fields: {
    people: {
      type: 'links', label: 'Mensen', required: false, fact: false,
      link: {
        item: 'Toewijzing', dataset: 'assignment', key: 'day_id', target: 'person_id', target_dataset: 'person',
        state: { options: { invited: 'Uitgenodigd', confirmed: 'Bevestigd' }, tones: { invited: 'warn', confirmed: 'ok' }, default: 'invited' },
      },
    },
  },
}
const view: View = {
  key: 'day', label: 'Dag', table: 'day', table_label: 'Dag', model: 'day', type: 'grid',
  columns: ['title', 'people'], lookups: {}, rollups: {}, filters: [], sort: [], group: null,
}
const lotte: LinkItem = { id: 70, target: 1, title: 'Lotte', state: 'confirmed' }
const jan_: LinkItem = { id: 71, target: 2, title: 'Jan', state: 'invited' }
const guest: LinkItem = { id: 72, target: null, title: 'Gastmuzikant', state: 'invited' }
const lunch: Row = { id: 5, title: 'Lunch', status: '', fields: { people: [lotte, jan_, guest] } }
const person = (id: number, title: string): Row => ({ id, title, status: '', fields: {} })

const stores: ReturnType<typeof createStore>[] = []
let actions: { add: ReturnType<typeof vi.fn<LinkActions['add']>>; remove: ReturnType<typeof vi.fn<LinkActions['remove']>> }

function renderGrid() {
  actions = { add: vi.fn<LinkActions['add']>().mockResolvedValue(), remove: vi.fn<LinkActions['remove']>().mockResolvedValue() }
  const api = { update: vi.fn<StoreApi['update']>(), create: vi.fn<StoreApi['create']>() }
  const store = createStore({ model: 'day', rows: [lunch], api })
  stores.push(store)
  render(
    <Grid model={day} view={view} store={store} writable layout={defaults(view)} onLayout={() => undefined}
      query="" emptyTitle="" models={{ day }} links={actions} />,
  )
}

const cell = () => {
  const row = screen.getAllByRole('row').find((r) => r.dataset.title === 'Lunch')
  if (!row) throw new Error('no row')
  const headers = screen.getAllByRole('columnheader').map((h) => h.dataset.column)
  return within(row).getAllByRole('gridcell')[headers.indexOf('people')]
}
const open = () => {
  fireEvent.click(cell())
  fireEvent.keyDown(cell(), { key: 'Enter' })
}
const popup = () => document.querySelector<HTMLElement>('.nv-picker') as HTMLElement

beforeEach(() => {
  remote.records.mockResolvedValue({ rows: [person(1, 'Lotte'), person(2, 'Jan'), person(3, 'Mira')], total: 3 })
})
afterEach(() => {
  cleanup()
  vi.resetAllMocks()
})

describe('a links cell', () => {
  it("shows the names as text on one line, each in its state's colour, the free-text one muted; all of them in its title", () => {
    renderGrid()
    const names = cell().querySelector('.nv-names') as HTMLElement
    expect(names.textContent).toBe('Lotte, Jan, Gastmuzikant')
    const name = (text: string) => within(names).getByText(text)
    expect(name('Lotte').className).toContain('nv-pill--ok')
    expect(name('Jan').className).toContain('nv-pill--warn')
    expect(name('Gastmuzikant').className).toContain('nv-pill--muted')
    expect(names.getAttribute('title')).toBe('Lotte, Jan, Gastmuzikant')
    expect(within(cell()).queryAllByRole('button')).toEqual([])
  })

  const box = () => within(popup())
  const chips = () => within(box().getByRole('grid')).getAllByRole('row').map((chip) => chip.textContent)
  const chip = (name: string) => within(box().getByRole('grid')).getByRole('row', { name })
  const search = () => screen.getByRole('combobox', { name: 'Mensen' })

  it('opens on Enter: one box with the chosen names and a search; the list offers only the others', async () => {
    renderGrid()
    open()
    expect(chips()).toEqual(['Lotte', 'Jan', 'Gastmuzikant'])
    expect(box().getByRole('combobox', { name: 'Mensen' })).toBeTruthy()
    expect((await screen.findAllByRole('option')).map((o) => o.textContent)).toEqual(['Mira'])
    expect(within(chip('Gastmuzikant')).queryByRole('button')).toBeNull()
    fireEvent.keyDown(screen.getByRole('combobox', { name: 'Mensen' }), { key: 'Escape' })
    expect(screen.queryByRole('combobox', { name: 'Mensen' })).toBeNull()
  })

  it('says only that nothing else matches when every match is chosen already', async () => {
    remote.records.mockResolvedValue({ rows: [person(1, 'Lotte'), person(2, 'Jan')], total: 2 })
    renderGrid()
    open()
    expect(await screen.findByText('Geen resultaten')).toBeTruthy()
    expect(screen.queryByText(/Nog \d+ meer/)).toBeNull()
  })

  it('adds a person picked from the list, and keeps the box open', async () => {
    renderGrid()
    open()
    const mira = (await screen.findAllByRole('option'))[0] as HTMLElement
    await act(async () => fireEvent.click(mira))
    expect(actions.add).toHaveBeenCalledWith('people', lunch, 3)
    expect(screen.getByRole('combobox', { name: 'Mensen' })).toBeTruthy()
  })

  it('chips flow inline and the box caps at two lines: one TagGroup grid holds every chip', () => {
    renderGrid()
    open()
    const grids = box().getAllByRole('grid')
    expect(grids).toHaveLength(1)
    expect(grids[0]?.closest('.nv-chosen')).not.toBeNull()
    expect(chips()).toEqual(['Lotte', 'Jan', 'Gastmuzikant'])
  })

  it("a chip's remove button names the person", () => {
    renderGrid()
    open()
    expect(within(chip('Jan')).getByRole('button', { name: 'Jan verwijderen' })).toBeTruthy()
    expect(within(chip('Lotte')).getByRole('button', { name: 'Lotte verwijderen' })).toBeTruthy()
  })

  it('removes a name in the default state at once by its ×', async () => {
    renderGrid()
    open()
    await act(async () => fireEvent.click(within(chip('Jan')).getByRole('button', { name: 'Jan verwijderen' })))
    expect(actions.remove).toHaveBeenCalledWith('people', lunch, jan_)
  })

  it('Backspace in an empty search removes the last chip', async () => {
    renderGrid()
    open()
    await act(async () => fireEvent.keyDown(search(), { key: 'Backspace' }))
    expect(actions.remove).toHaveBeenCalledTimes(1)
    expect(actions.remove).toHaveBeenCalledWith('people', lunch, jan_)
  })

  it('Delete on a focused chip removes that chip, through the same question', async () => {
    renderGrid()
    open()
    act(() => chip('Lotte').focus())
    await act(async () => fireEvent.keyDown(chip('Lotte'), { key: 'Delete' }))
    expect(screen.getByRole('alertdialog').textContent).toContain('Toewijzing van Lotte verwijderen?')
    expect(actions.remove).not.toHaveBeenCalled()
  })

  it("focus a chip's remove button: the typed search and the list survive", async () => {
    renderGrid()
    open()
    await screen.findAllByRole('option')
    fireEvent.change(search(), { target: { value: 'Mi' } })
    act(() => within(chip('Jan')).getByRole('button', { name: 'Jan verwijderen' }).focus())
    expect((search() as HTMLInputElement).value).toBe('Mi')
    expect(screen.getByRole('listbox')).toBeTruthy()
  })

  it('removing a confirmed link asks first: an alertdialog over the sheet, Annuleren has focus, Escape keeps the person', async () => {
    renderGrid()
    open()
    fireEvent.click(within(chip('Lotte')).getByRole('button', { name: 'Lotte verwijderen' }))
    const question = screen.getByRole('alertdialog')
    expect(cell().contains(question)).toBe(false)
    expect(within(question).getByRole('button', { name: 'Verwijderen' })).toBeTruthy()
    expect(document.activeElement).toBe(within(question).getByRole('button', { name: 'Annuleren' }))
    fireEvent.keyDown(document.activeElement as HTMLElement, { key: 'Escape' })
    expect(screen.queryByRole('alertdialog')).toBeNull()
    expect(actions.remove).not.toHaveBeenCalled()
    expect(document.activeElement).toBe(search())
    fireEvent.click(within(chip('Lotte')).getByRole('button', { name: 'Lotte verwijderen' }))
    screen.getByRole('button', { name: 'Verwijderen' }).focus()
    await act(async () => fireEvent.click(document.activeElement as HTMLElement))
    expect(actions.remove).toHaveBeenCalledWith('people', lunch, lotte)
  })

  it('Tab in the question moves between its two answers and goes no further', () => {
    renderGrid()
    open()
    fireEvent.click(within(chip('Lotte')).getByRole('button', { name: 'Lotte verwijderen' }))
    const question = screen.getByRole('alertdialog')
    fireEvent.keyDown(document.activeElement as HTMLElement, { key: 'Tab' })
    expect(document.activeElement).toBe(within(question).getByRole('button', { name: 'Verwijderen' }))
    fireEvent.keyDown(document.activeElement as HTMLElement, { key: 'Tab' })
    expect(document.activeElement).toBe(within(question).getByRole('button', { name: 'Annuleren' }))
    expect(screen.getByRole('alertdialog')).toBe(question)
  })

  it('asks before removing a person who left the default state; Annuleren keeps them', async () => {
    renderGrid()
    open()
    fireEvent.click(within(chip('Lotte')).getByRole('button', { name: 'Lotte verwijderen' }))
    expect(screen.getByRole('alertdialog').textContent).toContain('Toewijzing van Lotte verwijderen?')
    fireEvent.click(screen.getByRole('button', { name: 'Annuleren' }))
    expect(actions.remove).not.toHaveBeenCalled()
    fireEvent.click(within(chip('Lotte')).getByRole('button', { name: 'Lotte verwijderen' }))
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Verwijderen' })))
    expect(actions.remove).toHaveBeenCalledWith('people', lunch, lotte)
  })

  it('offers no people on a draft row: it has no record to link to yet', async () => {
    renderGrid()
    await act(async () => stores[stores.length - 1]?.draft({}, ['title']))
    const draft = screen.getAllByRole('row').find((r) => r.dataset.title === '') as HTMLElement
    const headers = screen.getAllByRole('columnheader').map((h) => h.dataset.column)
    const people = within(draft).getAllByRole('gridcell')[headers.indexOf('people')] as HTMLElement
    fireEvent.click(people)
    fireEvent.keyDown(people, { key: 'Enter' })
    expect(screen.queryByRole('combobox', { name: 'Mensen' })).toBeNull()
    expect(people.getAttribute('aria-readonly')).toBe('true')
  })

  it('is never cleared by Delete, nor offered to sort, group or filter', () => {
    renderGrid()
    fireEvent.click(cell())
    fireEvent.keyDown(cell(), { key: 'Delete' })
    expect(actions.remove).not.toHaveBeenCalled()
    expect(filterFields(day, [lunch]).map((f) => f.field)).not.toContain('people')
    fireEvent.click(screen.getByRole('button', { name: /^Groep/ }))
    expect(screen.queryByRole('menuitemradio', { name: 'Mensen' })).toBeNull()
  })
})
