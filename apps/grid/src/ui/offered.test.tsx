import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
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

  it('does not drag by a column the person only reads', async () => {
    await open(schemaOf(unit({ fields: { status: { ...state, readonly: true } } })), 'bord')
    expect(cardClass()).not.toContain('nv-board__card--drags')
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
