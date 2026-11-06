import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Schema } from '../types'

const api = vi.hoisted(() => ({ recordCount: vi.fn(() => Promise.resolve(0)), recordHistory: vi.fn(() => Promise.resolve([])), rowsWhere: vi.fn(() => Promise.resolve({ rows: [], total: 0 })),
  schema: vi.fn(), rows: vi.fn(), awayRows: vi.fn(), records: vi.fn(), update: vi.fn(), create: vi.fn(), remove: vi.fn(),
  savedViews: vi.fn(), createView: vi.fn(), updateView: vi.fn(), deleteView: vi.fn(), restoreView: vi.fn(), prefs: vi.fn(), savePrefs: vi.fn(),
  me: vi.fn(), requestLink: vi.fn(), consumeLink: vi.fn(), signOut: vi.fn(), onUnauthenticated: vi.fn(), onNotices: vi.fn(),
  rowOf: vi.fn(), undoBatch: vi.fn(), runAction: vi.fn(), runSelection: vi.fn(), setDisplay: vi.fn(), publishView: vi.fn(), history: vi.fn(),
}))
vi.mock('../api', () => api)
const { App } = await import('./App')

const state = { type: 'select', label: 'Status', required: true, fact: false, options: { open: 'Open', klaar: 'Klaar' } }
const name = { type: 'text', label: 'Naam', required: true, fact: false }
const unit = (extra: object = {}) => ({ key: 'unit', label: 'Unit', title_label: 'Naam', title_readonly: false, fields: { status: state }, ...extra })
const schemaOf = (model: object, table: object = {}): Schema => ({
  models: { unit: model },
  tables: [{ key: 'unit', label: 'Units', model: 'unit', types: ['grid', 'board'], board: { column: 'status' }, ...table }],
  views: [{ key: 'unit', label: 'Units', table: 'unit', model: 'unit' }, { key: 'bord', label: 'Bord', table: 'unit', model: 'unit', type: 'board', board: { column: 'status', ...(table as { board?: object }).board } }],
  writable: { unit: true },
}) as unknown as Schema
const row = { id: 1, title: 'Alpha', status: '', fields: { status: 'open' } }

async function open(schema: Schema, view: string) {
  api.schema.mockResolvedValue(schema)
  api.rows.mockResolvedValue({ rows: [row], total: 1 })
  window.location.hash = `#view=${view}`
  render(<App />)
  await screen.findByText('Alpha')
}

beforeEach(() => {
  api.me.mockResolvedValue({ id: 1, email: 'hester@example.test', role: 'editor', subject: null })
  api.onUnauthenticated.mockReturnValue(() => undefined)
  api.awayRows.mockResolvedValue([])
  api.records.mockResolvedValue({ rows: [], total: 0 })
  api.savedViews.mockResolvedValue([])
  api.prefs.mockResolvedValue({ order: {}, last: {} })
  api.savePrefs.mockImplementation((sent) => Promise.resolve(sent))
})
afterEach(() => {
  cleanup()
  vi.resetAllMocks()
  window.location.hash = ''
  window.localStorage.clear()
})

describe('a model only a service creates', () => {
  it('offers + Nieuw on a plain model, and none on a created_by one', async () => {
    await open(schemaOf(unit()), 'unit')
    expect(screen.getByRole('button', { name: 'Nieuw Unit' })).toBeTruthy()
    cleanup()
    await open(schemaOf(unit({ created_by: 'service' })), 'unit')
    expect(screen.queryByRole('button', { name: /^Nieuw/ })).toBeNull()
  })

  it('offers no + in a board column and no + Nieuw on its board', async () => {
    await open(schemaOf(unit({ created_by: 'service' })), 'bord')
    expect(screen.queryByRole('button', { name: /^Nieuw/ })).toBeNull()
  })

  it('offers no lane + where the person may not set the board’s column, and keeps it where drag is only switched off', async () => {
    await open(schemaOf(unit({ lifecycle: 'status', lifecycle_buttons: true })), 'bord')
    expect(screen.queryByRole('button', { name: /^Nieuw in/ })).toBeNull()
    cleanup()
    await open(schemaOf(unit({ fields: { status: { ...state, readonly: true } } })), 'bord')
    expect(screen.queryByRole('button', { name: /^Nieuw in/ })).toBeNull()
    cleanup()
    await open(schemaOf(unit(), { board: { column: 'status', drag: false } }), 'bord')
    expect(screen.getAllByRole('button', { name: /^Nieuw in/ }).length).toBeGreaterThan(0)
  })

  it('still offers the board column + on a plain model', async () => {
    await open(schemaOf(unit()), 'bord')
    expect(screen.getAllByRole('button', { name: /^Nieuw in/ }).length).toBeGreaterThan(0)
  })
})

describe('a board', () => {
  const cardClass = () => screen.getByRole('button', { name: /Alpha/ }).className

  it('drags its cards by default', async () => {
    await open(schemaOf(unit()), 'bord')
    expect(cardClass()).toContain('nv-board__card--drags')
  })

  it('says how to drag only where it drags', async () => {
    await open(schemaOf(unit()), 'bord')
    expect(screen.getByText('Sleep een kaart om haar te verplaatsen')).toBeTruthy()
    cleanup()
    await open(schemaOf(unit(), { board: { column: 'status', drag: false } }), 'bord')
    expect(screen.queryByText('Sleep een kaart om haar te verplaatsen')).toBeNull()
    expect(screen.queryByText('Spatie oppakken en neerzetten')).toBeNull()
    expect(screen.getByText(/↑↓←→/)).toBeTruthy()
    expect(screen.getByText(/↵/)).toBeTruthy()
    expect(screen.getByText(/ongedaan maken/)).toBeTruthy()
  })

  it('does not drag with drag false, and its cards still open', async () => {
    await open(schemaOf(unit(), { board: { column: 'status', drag: false } }), 'bord')
    expect(cardClass()).not.toContain('nv-board__card--drags')
    fireEvent.click(screen.getByRole('button', { name: /Alpha/ }))
    expect(screen.getByRole('complementary', { name: 'Alpha' })).toBeTruthy()
  })

  it('does not drag by a column that changes through its buttons only', async () => {
    await open(schemaOf(unit({ lifecycle: 'status', lifecycle_buttons: true })), 'bord')
    expect(cardClass()).not.toContain('nv-board__card--drags')
  })

  it('drags by a lifecycle column without buttons', async () => {
    await open(schemaOf(unit({ lifecycle: 'status', lifecycle_transitions: [{ from: '*', to: 'klaar' }] })), 'bord')
    expect(cardClass()).toContain('nv-board__card--drags')
  })

  it('does not drag a query board whose column writes a lifecycle that changes through its buttons only', async () => {
    const taak = unit({ key: 'taak', lifecycle: 'status', lifecycle_buttons: true })
    const overzicht = unit({ query: true, fields: { status: { ...state, writes: { dataset: 'taak', field: 'status', key: 'taak_id' } } } })
    await open({ ...schemaOf(overzicht), models: { unit: overzicht, taak } } as unknown as Schema, 'bord')
    expect(cardClass()).not.toContain('nv-board__card--drags')
  })

  it('does not drag by a column the person only reads', async () => {
    await open(schemaOf(unit({ fields: { status: { ...state, readonly: true } } })), 'bord')
    expect(cardClass()).not.toContain('nv-board__card--drags')
  })
})

describe('a board on a query', () => {
  const cardClass = () => screen.getByRole('button', { name: /Alpha/ }).className
  const writes = { dataset: 'taak', field: 'staat', key: 'taak_id' }
  const taak = (extra: object = {}) => ({ key: 'taak', label: 'Taak', title_label: 'Naam', title_readonly: false, title_required: false, fields: { staat: state }, ...extra })
  const overview = (extra: object = {}, column: object = { writes }) => unit({ query: true, fields: { status: { ...state, ...column } }, ...extra })
  const schemaWith = (query: object, target: object = taak(), writable: object = { unit: true, taak: true }): Schema =>
    ({ ...schemaOf(query), models: { unit: query, taak: target }, writable }) as unknown as Schema
  const plus = () => screen.queryAllByRole('button', { name: /^Nieuw in/ })

  it('drags through a column that writes, and offers + only where it creates in the dataset that column writes and may write it', async () => {
    await open(schemaWith(overview({ creates: 'taak' })), 'bord')
    expect(cardClass()).toContain('nv-board__card--drags')
    expect(plus().length).toBeGreaterThan(0)
    cleanup()
    await open(schemaWith(overview({ creates: 'taak' }), taak(), { unit: true, taak: false }), 'bord')
    expect(plus()).toEqual([])
    cleanup()
    await open(schemaWith(overview({ creates: 'ander' })), 'bord')
    expect(cardClass()).toContain('nv-board__card--drags')
    expect(plus()).toEqual([])
  })

  it('drags but offers no + where the query creates nothing', async () => {
    await open(schemaWith(overview()), 'bord')
    expect(cardClass()).toContain('nv-board__card--drags')
    expect(plus()).toEqual([])
  })

  it('neither drags nor offers + by a column that writes nothing', async () => {
    await open(schemaWith(overview({ creates: 'taak' }, { readonly: true })), 'bord')
    expect(cardClass()).not.toContain('nv-board__card--drags')
    expect(plus()).toEqual([])
  })

  it("greys the lanes the target's lifecycle cannot reach on a lift, and never targets Geen", async () => {
    const life = taak({ lifecycle: 'staat', lifecycle_transitions: [{ from: ['klaar'], to: 'open' }] })
    api.schema.mockResolvedValue(schemaWith(overview(), life))
    api.rows.mockResolvedValue({ rows: [row, { id: 2, title: 'Beta', status: '', fields: { status: null } }], total: 2 })
    window.location.hash = '#view=bord'
    render(<App />)
    await screen.findByText('Alpha')
    expect(cardClass()).toContain('nv-board__card--drags')
    fireEvent.keyDown(screen.getByRole('button', { name: /Alpha/ }), { code: 'Space', key: ' ' })
    await act(() => new Promise((resolve) => setTimeout(resolve, 0)))
    const lane = (name: string) => screen.getByRole('region', { name }).className
    expect(lane('Klaar')).toContain('nv-board__column--blocked')
    expect(lane('Geen')).toContain('nv-board__column--blocked')
    expect(lane('Open')).not.toContain('nv-board__column--blocked')
  })

  it('a + opens the quick create on the target with the lane preset under the field it writes, and one undo takes the row back', async () => {
    api.create.mockResolvedValue({ row: { id: 9, title: '', status: '', fields: { staat: 'klaar' } }, batch: 'b9' })
    api.undoBatch.mockResolvedValue('u9')
    await open(schemaWith(overview({ creates: 'taak' })), 'bord')
    const reads = api.rows.mock.calls.length
    fireEvent.click(screen.getByRole('button', { name: 'Nieuw in Klaar' }))
    const dialog = await screen.findByRole('dialog')
    await act(async () => fireEvent.click(within(dialog).getByRole('button', { name: 'Aanmaken' })))
    expect(api.create).toHaveBeenCalledExactlyOnceWith('taak', { staat: 'klaar' })
    await waitFor(() => expect(api.rows.mock.calls.length).toBeGreaterThan(reads))
    await act(async () => fireEvent.keyDown(document.body, { key: 'z', ctrlKey: true }))
    expect(api.undoBatch).toHaveBeenCalledExactlyOnceWith('b9')
  })
})

describe('a table', () => {
  const cell = () => screen.getAllByRole('gridcell').find((c) => c.textContent === 'Open') as HTMLElement

  it('edits a lifecycle column inline unless its transitions declare buttons', async () => {
    await open(schemaOf(unit({ lifecycle: 'status' })), 'unit')
    fireEvent.click(cell())
    fireEvent.keyDown(cell(), { key: 'Enter' })
    expect(within(cell()).queryByRole('combobox') ?? screen.queryByRole('listbox')).not.toBeNull()
  })

  it('offers no inline select on a lifecycle column with button transitions', async () => {
    await open(schemaOf(unit({ lifecycle: 'status', lifecycle_buttons: true })), 'unit')
    fireEvent.click(cell())
    fireEvent.keyDown(cell(), { key: 'Enter' })
    expect(within(cell()).queryByRole('combobox')).toBeNull()
    expect(screen.queryByRole('listbox')).toBeNull()
  })

  it('offers no inline edit on a column the person only reads', async () => {
    await open(schemaOf(unit({ fields: { status: { ...state, readonly: true }, naam: name } })), 'unit')
    fireEvent.click(cell())
    fireEvent.keyDown(cell(), { key: 'Enter' })
    expect(within(cell()).queryByRole('combobox')).toBeNull()
    expect(screen.queryByRole('listbox')).toBeNull()
  })
})
