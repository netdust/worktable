import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Model, Row, Scope } from '../../types'
import { activity, calais, planning } from '../calais.test.data'
import { Grid } from '../Grid'
import { defaults } from '../layout'
import { createStore, type StoreApi } from '../store'

const remote = vi.hoisted(() => ({ records: vi.fn() }))
vi.mock('../../api', () => remote)

const organisation: Model = {
  key: 'organisation', label: 'Organisatie', title_label: 'Naam', title_readonly: false,
  fields: { production: { type: 'relation', label: 'Productie', required: false, fact: true, relation: { model: 'production', multiple: false } } },
}
const models = { activity, organisation }
const org = (id: number, title: string, production: number[] = []): Row => ({ id, title, status: 'publish', fields: { production } })

let api: { update: ReturnType<typeof vi.fn<StoreApi['update']>>; create: ReturnType<typeof vi.fn<StoreApi['create']>> }

function renderGrid(scope: Scope | null = null, spaceModel = 'production') {
  api = { update: vi.fn<StoreApi['update']>(), create: vi.fn<StoreApi['create']>() }
  const store = createStore({ model: 'activity', rows: calais, api })
  render(
    <Grid model={activity} view={planning} store={store} writable layout={defaults(planning)} onLayout={() => undefined}
      query="" emptyTitle="" models={models} scope={scope} spaceModel={spaceModel} />,
  )
}

const headers = () => screen.getAllByRole('columnheader').map((h) => h.dataset.column)
function cell(title: string, column: string): HTMLElement {
  const row = screen.getAllByRole('row').find((r) => r.dataset.title === title)
  if (!row) throw new Error(`no row ${title}`)
  return within(row).getAllByRole('gridcell')[headers().indexOf(column)]
}
const picker = () => screen.getByRole('combobox', { name: 'Locatie' })
const titles = async () => (await screen.findAllByRole('option')).map((o) => o.textContent)

beforeEach(() => {
  remote.records.mockResolvedValue({ rows: [org(14, 'Bijloke'), org(15, 'Vooruit', [7]), org(12, 'Le Grenier, Calais')], total: 3 })
})
afterEach(() => {
  cleanup()
  vi.resetAllMocks()
})

describe('the relation picker', () => {
  it('opens on Enter with the field\'s word, and picks with the arrows and Enter as a list of one id', async () => {
    renderGrid()
    api.update.mockResolvedValue({ row: { ...calais[2], fields: { ...calais[2].fields, location: [15] }, lookups: { location: org(15, 'Vooruit') } }, batch: 'b1' })

    fireEvent.click(cell('Lunch bistrot', 'location'))
    fireEvent.keyDown(cell('Lunch bistrot', 'location'), { key: 'Enter' })

    expect(picker().getAttribute('placeholder')).toBe('Locatie…')
    expect(await titles()).toEqual(['Bijloke', 'Vooruit', 'Le Grenier, Calais'])
    expect(remote.records).toHaveBeenCalledWith('organisation', '')
    fireEvent.keyDown(picker(), { key: 'ArrowDown' })
    await act(async () => {
      fireEvent.keyDown(picker(), { key: 'Enter' })
    })

    expect(api.update).toHaveBeenCalledWith('activity', 103, { location: [15] }, expect.objectContaining({ id: 103 }))
    expect(cell('Lunch bistrot', 'location').textContent).toBe('Vooruit')
    expect(screen.queryByRole('combobox', { name: 'Locatie' })).toBeNull()
  })

  it('opens on a typed letter and searches with it', async () => {
    renderGrid()

    fireEvent.click(cell('Lunch bistrot', 'location'))
    fireEvent.keyDown(cell('Lunch bistrot', 'location'), { key: 'b' })

    expect(picker().getAttribute('value') ?? (picker() as HTMLInputElement).value).toBe('b')
    await titles()
    expect(remote.records).toHaveBeenLastCalledWith('organisation', 'b')
  })

  it('cancels on Escape without a write', async () => {
    renderGrid()

    fireEvent.click(cell('Lunch bistrot', 'location'))
    fireEvent.keyDown(cell('Lunch bistrot', 'location'), { key: 'Enter' })
    await titles()
    fireEvent.keyDown(picker(), { key: 'Escape' })

    expect(screen.queryByRole('combobox', { name: 'Locatie' })).toBeNull()
    expect(api.update).not.toHaveBeenCalled()
    expect(cell('Lunch bistrot', 'location').textContent).toBe('Le Grenier, Calais')
  })

  it('lists the selected production\'s records first where the related model has one', async () => {
    renderGrid({ field: 'production', id: 7 })

    fireEvent.click(cell('Lunch bistrot', 'location'))
    fireEvent.keyDown(cell('Lunch bistrot', 'location'), { key: 'Enter' })

    expect(await titles()).toEqual(['Vooruit', 'Bijloke', 'Le Grenier, Calais'])
  })

  it('lists nothing first when the related model\'s field of that name points elsewhere', async () => {
    renderGrid({ field: 'production', id: 7 }, 'festival')

    fireEvent.click(cell('Lunch bistrot', 'location'))
    fireEvent.keyDown(cell('Lunch bistrot', 'location'), { key: 'Enter' })

    expect(await titles()).toEqual(['Bijloke', 'Vooruit', 'Le Grenier, Calais'])
  })

  it('waits for the search it typed before Enter picks', async () => {
    let answer!: (r: { rows: Row[]; total: number }) => void
    remote.records.mockImplementation((_model: string, query: string) => query === 'le'
      ? new Promise((resolve) => (answer = resolve))
      : Promise.resolve({ rows: [org(14, 'Bijloke'), org(15, 'Vooruit')], total: 2 }))
    renderGrid()
    api.update.mockResolvedValue({ row: { ...calais[2], fields: { ...calais[2].fields, location: [16] }, lookups: { location: org(16, 'Beektheater') } }, batch: 'b1' })

    fireEvent.click(cell('Lunch bistrot', 'location'))
    fireEvent.keyDown(cell('Lunch bistrot', 'location'), { key: 'Enter' })
    await titles()
    fireEvent.change(picker(), { target: { value: 'le' } })
    fireEvent.keyDown(picker(), { key: 'Enter' })
    expect(api.update).not.toHaveBeenCalled()

    await vi.waitFor(() => expect(remote.records).toHaveBeenLastCalledWith('organisation', 'le'))
    await act(async () => answer({ rows: [org(16, 'Beektheater')], total: 1 }))
    await act(async () => {
      fireEvent.keyDown(picker(), { key: 'Enter' })
    })
    expect(api.update).toHaveBeenCalledWith('activity', 103, { location: [16] }, expect.objectContaining({ id: 103 }))
  })

  it('keeps the list open while its scrollbar is dragged', async () => {
    renderGrid()
    fireEvent.click(cell('Lunch bistrot', 'location'))
    fireEvent.keyDown(cell('Lunch bistrot', 'location'), { key: 'Enter' })
    await titles()

    expect(fireEvent.mouseDown(screen.getByRole('listbox', { name: 'Locatie' }))).toBe(false)
  })

  it('empties an optional relation on Delete', async () => {
    renderGrid()
    api.update.mockResolvedValue({ row: { ...calais[2], fields: { ...calais[2].fields, location: [] }, lookups: { location: null } }, batch: 'b1' })

    fireEvent.click(cell('Lunch bistrot', 'location'))
    fireEvent.keyDown(cell('Lunch bistrot', 'location'), { key: 'Enter' })
    await titles()
    await act(async () => {
      fireEvent.keyDown(picker(), { key: 'Delete' })
    })

    expect(api.update).toHaveBeenCalledWith('activity', 103, { location: [] }, expect.objectContaining({ id: 103 }))
  })

  it('says when there are more matches than it lists', async () => {
    remote.records.mockResolvedValue({ rows: [org(14, 'Bijloke')], total: 80 })
    renderGrid()

    fireEvent.click(cell('Lunch bistrot', 'location'))
    fireEvent.keyDown(cell('Lunch bistrot', 'location'), { key: 'Enter' })

    expect(await screen.findByText('Meer resultaten: verfijn je zoekopdracht')).toBeTruthy()
  })
})
