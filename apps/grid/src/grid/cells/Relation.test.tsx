import { act, cleanup, fireEvent, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { renderNl } from '../../test-setup'
import type { Model, Row, Scope } from '../../types'
import { activity, calais, planning } from '../calais.test.data'
import { Grid } from '../Grid'
import { defaults } from '../layout'
import { createStore, type StoreApi } from '../store'

const remote = vi.hoisted(() => ({ recordCount: vi.fn(() => Promise.resolve(0)), recordHistory: vi.fn(() => Promise.resolve([])), rowsWhere: vi.fn(() => Promise.resolve({ rows: [], total: 0 })),  records: vi.fn(), optionsFrom: vi.fn() }))
vi.mock('../../api', () => remote)

const organisation: Model = {
  key: 'organisation', label: 'Organisatie', title_label: 'Naam', title_readonly: false,
  fields: { production: { type: 'relation', label: 'Productie', required: false, fact: true, relation: { model: 'production', multiple: false } } },
}
const models = { activity, organisation }
const org = (id: number, title: string, production: number[] = []): Row => ({ id, title, status: 'publish', fields: { production } })

let api: { update: ReturnType<typeof vi.fn<StoreApi['update']>>; create: ReturnType<typeof vi.fn<StoreApi['create']>> }

function renderGrid(scope: Scope | null = null, spaceModel = 'production', model: Model = activity, known: Record<string, Model> = models, rows: Row[] = calais) {
  api = { update: vi.fn<StoreApi['update']>(), create: vi.fn<StoreApi['create']>() }
  const store = createStore({ model: 'activity', rows, api })
  renderNl(
    <Grid model={model} view={planning} store={store} writable layout={defaults(planning)} onLayout={() => undefined}
      query="" emptyTitle="" models={known} scope={scope} spaceModel={spaceModel} />,
  )
}

const headers = () => screen.getAllByRole('columnheader').map((h) => h.dataset.column)
function cell(title: string, column: string): HTMLElement {
  const row = screen.getAllByRole('row').find((r) => r.dataset.title === title)
  if (!row) throw new Error(`no row ${title}`)
  return within(row).getAllByRole('gridcell')[headers().indexOf(column)]
}
const picker = () => screen.getByRole('combobox', { name: 'Locatie' })
const open = (key = 'Enter') => {
  fireEvent.click(cell('Lunch bistrot', 'location'))
  fireEvent.keyDown(cell('Lunch bistrot', 'location'), { key })
}
const titles = async () => (await screen.findAllByRole('option')).map((o) => o.textContent)

beforeEach(() => {
  remote.records.mockResolvedValue({ rows: [org(14, 'Bijloke'), org(15, 'Vooruit', [7]), org(12, 'Le Grenier, Calais')], total: 3 })
})
afterEach(() => {
  cleanup()
  vi.resetAllMocks()
})

describe('a relation with a candidates source', () => {
  const from = { source: 'candidates', match: { activity_id: 'id' }, value: 'location' }
  const withSource: Model = { ...activity, fields: { ...activity.fields, location: { ...activity.fields.location, options_from: from } } }
  const known = { ...models, activity: withSource }
  const emptied = calais.map((r) => (r.title === 'Lunch bistrot' ? { ...r, fields: { ...r.fields, location: '' }, lookups: {} } : r))

  it('an empty cell lists the candidates of its row', async () => {
    remote.optionsFrom.mockResolvedValue([org(15, 'Vooruit')])
    renderGrid(null, 'production', withSource, known, emptied)
    open()

    expect(await titles()).toEqual(['Vooruit'])
    expect(remote.optionsFrom).toHaveBeenCalledWith(from, expect.objectContaining({ id: emptied.find((r) => r.title === 'Lunch bistrot')?.id }))
    expect(screen.getByRole('button', { name: 'Iedereen tonen' })).toBeTruthy()
  })

  it("a filled row's relation cell keeps the plain picker", async () => {
    renderGrid(null, 'production', withSource, known)
    open()

    expect(await titles()).toEqual(['Bijloke', 'Vooruit', 'Le Grenier, Calais'])
    expect(remote.optionsFrom).not.toHaveBeenCalled()
    expect(screen.queryByRole('button', { name: 'Iedereen tonen' })).toBeNull()
  })
})

describe('the relation picker', () => {
  it('the input has the column\'s accessible name', async () => {
    renderGrid()
    open()

    expect(picker().getAttribute('placeholder')).toBe('Locatie…')
    expect(document.activeElement).toBe(picker())
    await titles()
  })

  it('lists every record on opening, searching with nothing', async () => {
    renderGrid()
    open()

    expect(await titles()).toEqual(['Bijloke', 'Vooruit', 'Le Grenier, Calais'])
    expect(remote.records).toHaveBeenCalledWith('organisation', '')
  })

  it('the opening character starts the search', async () => {
    renderGrid()
    open('b')

    expect((picker() as HTMLInputElement).value).toBe('b')
    await titles()
    expect(remote.records).toHaveBeenLastCalledWith('organisation', 'b')
  })

  it('Escape cancels', async () => {
    renderGrid()
    open()
    await titles()
    fireEvent.keyDown(picker(), { key: 'Escape' })

    expect(screen.queryByRole('combobox', { name: 'Locatie' })).toBeNull()
    expect(api.update).not.toHaveBeenCalled()
    expect(cell('Lunch bistrot', 'location').textContent).toBe('Le Grenier, Calais')
  })

  it('lists the space\'s records first', async () => {
    renderGrid({ field: 'production', id: 7 })
    open()

    expect(await titles()).toEqual(['Vooruit', 'Bijloke', 'Le Grenier, Calais'])
  })

  it('lists nothing first when the related model\'s field of that name points elsewhere', async () => {
    renderGrid({ field: 'production', id: 7 }, 'festival')
    open()

    expect(await titles()).toEqual(['Bijloke', 'Vooruit', 'Le Grenier, Calais'])
  })

  it('shows at most 50 and says how many more', async () => {
    remote.records.mockResolvedValue({ rows: Array.from({ length: 53 }, (_, i) => org(100 + i, `Zaal ${i}`)), total: 53 })
    renderGrid()
    open()

    expect(await titles()).toHaveLength(50)
    expect(screen.getByText('Nog 3 meer: verfijn je zoekopdracht')).toBeTruthy()
  })

  it('says when nothing matches', async () => {
    remote.records.mockResolvedValue({ rows: [], total: 0 })
    renderGrid()
    open()

    expect(await screen.findByText('Geen resultaten')).toBeTruthy()
  })

  it('waits for the search it typed before Enter picks', async () => {
    let answer!: (r: { rows: Row[]; total: number }) => void
    remote.records.mockImplementation((_model: string, query: string) => query === 'le'
      ? new Promise((resolve) => (answer = resolve))
      : Promise.resolve({ rows: [org(14, 'Bijloke'), org(15, 'Vooruit')], total: 2 }))
    renderGrid()
    api.update.mockResolvedValue({ row: { ...calais[2], fields: { ...calais[2].fields, location: [16] }, lookups: { location: org(16, 'Beektheater') } }, batch: 'b1' })

    open()
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
    open()
    await titles()

    expect(fireEvent.mouseDown(screen.getByRole('listbox'))).toBe(false)
  })

  it('Delete in an empty search clears, unless required', async () => {
    renderGrid()
    api.update.mockResolvedValue({ row: { ...calais[2], fields: { ...calais[2].fields, location: [] }, lookups: { location: null } }, batch: 'b1' })
    open()
    await titles()
    await act(async () => {
      fireEvent.keyDown(picker(), { key: 'Delete' })
    })
    expect(api.update).toHaveBeenCalledWith('activity', 103, { location: [] }, expect.objectContaining({ id: 103 }))
    cleanup()

    const required = { ...activity, fields: { ...activity.fields, location: { ...activity.fields.location, required: true } } }
    renderGrid(null, 'production', required)
    open()
    await titles()
    await act(async () => {
      fireEvent.keyDown(picker(), { key: 'Delete' })
    })
    expect(api.update).not.toHaveBeenCalled()
    expect(picker()).toBeTruthy()
  })
})

describe('the open button of a to-one cell', () => {
  const opener = (title: string) => within(cell(title, 'location')).queryByRole('button', { name: /^Open / })

  it('a filled cell shows an open button named after the record', () => {
    renderGrid()

    expect(opener('Lunch bistrot')?.getAttribute('aria-label')).toBe('Open Le Grenier, Calais')
  })

  it('an empty cell shows none', () => {
    const bare: Row = { ...calais[2], fields: { ...calais[2].fields, location: [] }, lookups: {} }
    renderGrid(null, 'production', activity, models, [bare])

    expect(opener('Lunch bistrot')).toBeNull()
  })

  it('shows none when the target model is not readable', () => {
    renderGrid(null, 'production', activity, { activity })

    expect(opener('Lunch bistrot')).toBeNull()
  })

  it('joins the tab order only on the active cell, and is still pressable there', () => {
    renderGrid()
    const button = (title: string) => within(cell(title, 'location')).getByRole('button', { name: /^Open / })
    expect(button('Lunch bistrot').tabIndex).toBe(-1)

    fireEvent.click(cell('Lunch bistrot', 'location'))

    expect(button('Lunch bistrot').tabIndex).toBe(0)
    expect(button('Montage').tabIndex).toBe(-1)
  })
})
