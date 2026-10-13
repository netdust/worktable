import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Model, Row, SavedView, TableDef } from '../types'
import { iso, weekOf } from '../ui/Window'

const api = vi.hoisted(() => ({ rows: vi.fn(), update: vi.fn(), create: vi.fn(), records: vi.fn(), recordLink: vi.fn(), rotateRecordLink: vi.fn(), attachmentsOf: vi.fn() }))
vi.mock('../api', () => api)
const { Dashboard } = await import('./Dashboard')

const base = (id: number, label: string, model: string, extra: Partial<SavedView> = {}): SavedView =>
  ({
    key: String(id), id, label, model, table: model, type: 'grid',
    arrangement: { hidden: [], order: [], widths: [], sort: [], filters: [], group: null, picked: [] },
    shared: true, owner: { id: -1, name: '' }, mine: false, editable: false, ...extra,
  }) as unknown as SavedView

const week = base(3, 'Bedrijfsweek', 'productie_dag', { type: 'calendar', date_field: 'plandag', calendar: { day: 'plandag', start: null, end: null, lanes: ['productie_id'] } })
const filled = base(4, 'Plaatsen gevuld', 'toewijzing')
const all = base(5, 'Plaatsen', 'toewijzing')
const taak: Model = {
  key: 'taak', label: 'Taken', title_label: 'Titel', title_field: 'titel', title_readonly: false,
  fields: {
    status: { type: 'select', label: 'Status', required: true, defaulted: true, fact: false, options: { open: 'Open', gedaan: 'Gedaan' } },
  },
} as unknown as Model
const activiteit: Model = {
  key: 'activiteit', label: 'Activiteiten', title_label: 'Omschrijving', title_field: 'omschrijving', title_readonly: false, title_required: false,
  fields: {
    productie_id: { type: 'relation', label: 'Productie', required: true, fact: false, relation: { model: 'productie', multiple: false } },
    plandag: { type: 'date', label: 'Plandag', required: true, fact: false },
    soort: { type: 'select', label: 'Soort', required: true, fact: false, options: { repetitie: 'Repetitie', voorstelling: 'Voorstelling' } },
    status: { type: 'select', label: 'Status', required: true, defaulted: true, fact: false, options: { optie: 'Optie' } },
    notitie: { type: 'text', label: 'Notitie', fact: false },
  },
} as unknown as Model
const models = { activiteit, productie_dag: { key: 'productie_dag', label: 'Per productie per dag', title_label: 'Productie', title_readonly: true, fields: {} }, toewijzing: { key: 'toewijzing', label: 'Toewijzingen', title_label: 't', title_readonly: true, fields: {} }, taak } as unknown as Record<string, Model>
const tables = [
  { key: 'taak', label: 'Taken', model: 'taak', types: ['grid'] },
  { key: 'activiteit', label: 'Activiteiten', model: 'activiteit', types: ['grid'], date_field: 'plandag', space: 'scoped' },
] as unknown as TableDef[]

const dashboard = (tiles: unknown[], actions: unknown[] = []): SavedView =>
  ({ ...base(9, 'Overzicht', ''), type: 'dashboard', layout: { sections: [{ label: 'Deze week', tiles }], actions } }) as unknown as SavedView

function show(tiles: unknown[], actions: unknown[] = [], scope: { field: string; id: number } | null = null) {
  return render(<Dashboard dashboard={dashboard(tiles, actions)} views={[week, filled, all]} models={models} tables={tables} scope={scope} onOpenView={() => undefined} role="administrator" onSaved={() => undefined} />)
}

beforeEach(() => {
  for (const fn of Object.values(api)) fn.mockReset()
})
afterEach(cleanup)

describe('the week strip', () => {
  it('shows this week in seven days, today marked, and an event opens its row in the drawer', async () => {
    const today = iso(new Date())
    const event: Row = { id: 11, title: 'De Kersentuin', status: '', fields: { plandag: today, productie_id: 1 } }
    api.rows.mockResolvedValue({ rows: [event], total: 1 })
    show([{ kind: 'week', view: 3 }])
    const strip = screen.getByRole('region', { name: 'Bedrijfsweek' })
    await within(strip).findByRole('button', { name: /De Kersentuin/ })
    expect(within(strip).getAllByRole('group')).toHaveLength(7)
    expect(within(strip).getByRole('group', { current: 'date' })).toBeTruthy()
    expect(api.rows.mock.calls[0][1]).toEqual(weekOf(new Date()))
    fireEvent.click(within(strip).getByRole('button', { name: /De Kersentuin/ }))
    expect(screen.getByRole('complementary', { name: 'De Kersentuin' })).toBeTruthy()
  })
})

describe('the progress tile', () => {
  it('reads done of total', async () => {
    api.rows.mockImplementation(async (view: SavedView) => ({ rows: [], total: view.id === 4 ? 3 : 5 }))
    show([{ kind: 'progress', done: 4, total: 5, label: 'Plaatsen gevuld' }])
    expect(await screen.findByText('3 van 5')).toBeTruthy()
    expect(screen.getByRole('progressbar', { name: 'Plaatsen gevuld' }).getAttribute('aria-valuenow')).toBe('3')
  })
})

describe('quick creates', () => {
  it('Nieuwe taak asks the title and creates through the rows route, then reads again', async () => {
    api.rows.mockResolvedValue({ rows: [], total: 0 })
    api.create.mockResolvedValue({ row: { id: 9 }, batch: 'b' })
    show([], [{ create: 'taak', label: 'Nieuwe taak' }])
    fireEvent.click(screen.getByRole('button', { name: 'Nieuwe taak' }))
    const dialog = screen.getByRole('dialog', { name: 'Nieuwe taak' })
    fireEvent.change(within(dialog).getByLabelText('Titel'), { target: { value: 'Rider sturen' } })
    await act(async () => fireEvent.click(within(dialog).getByRole('button', { name: 'Aanmaken' })))
    expect(api.create).toHaveBeenCalledWith('taak', { title: 'Rider sturen' })
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('Nieuwe activiteit asks each required column once, its day and option filled in and changeable', async () => {
    api.rows.mockResolvedValue({ rows: [], total: 0 })
    api.records.mockResolvedValue({ rows: [{ id: 7, title: 'Nachtwacht', status: '', fields: {} }], total: 1 })
    api.create.mockResolvedValue({ row: { id: 9 }, batch: 'b' })
    show([], [{ create: 'activiteit', label: 'Nieuwe activiteit' }])
    fireEvent.click(screen.getByRole('button', { name: 'Nieuwe activiteit' }))
    const dialog = screen.getByRole('dialog', { name: 'Nieuwe activiteit' })
    expect(within(dialog).getAllByLabelText('Productie')).toHaveLength(1)
    expect(within(dialog).queryByLabelText('Status')).toBeNull()
    expect(within(dialog).queryByLabelText('Notitie')).toBeNull()
    expect((within(dialog).getByLabelText('Plandag') as HTMLInputElement).value).toBe(iso(new Date()))
    expect((within(dialog).getByLabelText('Soort') as HTMLSelectElement).value).toBe('repetitie')
    await screen.findByRole('option', { name: 'Nachtwacht' })
    fireEvent.change(within(dialog).getByLabelText('Productie'), { target: { value: '7' } })
    fireEvent.change(within(dialog).getByLabelText('Plandag'), { target: { value: '2028-06-05' } })
    fireEvent.change(within(dialog).getByLabelText('Soort'), { target: { value: 'voorstelling' } })
    await act(async () => fireEvent.click(within(dialog).getByRole('button', { name: 'Aanmaken' })))
    expect(api.create).toHaveBeenCalledWith('activiteit', { productie_id: [7], plandag: '2028-06-05', soort: 'voorstelling' })
  })

  it('fills the chosen space in, and it stays changeable', async () => {
    api.rows.mockResolvedValue({ rows: [], total: 0 })
    api.records.mockResolvedValue({ rows: [{ id: 7, title: 'Nachtwacht', status: '', fields: {} }, { id: 8, title: 'Kersentuin', status: '', fields: {} }], total: 2 })
    api.create.mockResolvedValue({ row: { id: 9 }, batch: 'b' })
    show([], [{ create: 'activiteit', label: 'Nieuwe activiteit' }], { field: 'productie_id', id: 8 })
    fireEvent.click(screen.getByRole('button', { name: 'Nieuwe activiteit' }))
    const dialog = screen.getByRole('dialog', { name: 'Nieuwe activiteit' })
    await screen.findByRole('option', { name: 'Kersentuin' })
    expect((within(dialog).getByLabelText('Productie') as HTMLSelectElement).value).toBe('8')
    await act(async () => fireEvent.click(within(dialog).getByRole('button', { name: 'Aanmaken' })))
    expect(api.create.mock.calls[0][1]).toMatchObject({ productie_id: [8] })
  })

  it('shows a refusal in the dialog', async () => {
    api.create.mockRejectedValue({ code: 'refused', message: 'Titel is verplicht.' })
    show([], [{ create: 'taak', label: 'Nieuwe taak' }])
    fireEvent.click(screen.getByRole('button', { name: 'Nieuwe taak' }))
    await act(async () => fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Aanmaken' })))
    expect(within(screen.getByRole('dialog')).getByRole('alert').textContent).toContain('Titel is verplicht.')
  })

  it('is reached by keyboard: a native button in the tab order, and the dialog opens on its first field', async () => {
    show([], [{ create: 'taak', label: 'Nieuwe taak' }])
    const action = screen.getByRole('button', { name: 'Nieuwe taak' })
    expect([action.tagName, action.tabIndex]).toEqual(['BUTTON', 0])
    action.focus()
    fireEvent.click(action)
    await waitFor(() => expect(document.activeElement).toBe(within(screen.getByRole('dialog')).getByLabelText('Titel')))
  })
})
