import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Model, Row, SavedView } from '../types'

const api = vi.hoisted(() => ({ rows: vi.fn(), update: vi.fn(), records: vi.fn() }))
vi.mock('../api', () => api)
const { Dashboard } = await import('./Dashboard')

const view = (id: number, label: string, model: string, extra: Partial<SavedView> = {}): SavedView =>
  ({
    key: String(id), id, label, model, table: model, type: 'grid', date_field: 'deadline',
    arrangement: { hidden: [], order: [], widths: [], sort: [], filters: [], group: null, picked: [] },
    shared: true, owner: { id: -1, name: '' }, mine: false, editable: false, ...extra,
  }) as unknown as SavedView

const werklijst: Model = {
  key: 'werklijst', label: 'Werklijst', title_label: 'Titel', title_readonly: true,
  fields: {
    soort: { type: 'select', label: 'Soort', required: false, fact: false, options: { taak: 'Taak', open_slot: 'Open plaats' } },
    status: { type: 'select', label: 'Status', required: false, fact: false, options: { open: 'Open', gedaan: 'Gedaan' }, writes: { dataset: 'taak', field: 'status', key: 'taak_id' } },
  },
} as unknown as Model
const models = { werklijst, conflicten: { ...werklijst, key: 'conflicten', fields: {} } } as Record<string, Model>
const conflicten = view(1, 'Conflicten', 'conflicten', { space: 'scoped' })
const lijst = view(2, 'Werklijst', 'werklijst')
const row = (id: number, title: string, taak: number | null): Row => ({ id, title, status: '', fields: { soort: taak ? 'taak' : 'open_slot', taak_id: taak } })

const dashboard = (tiles: unknown[]): SavedView =>
  ({ ...view(9, 'Overzicht', ''), type: 'dashboard', layout: { sections: [{ label: 'Nu', tiles }], actions: [] } }) as unknown as SavedView
const stat = { kind: 'stat', view: 1, measure: 'count', tone: { above: 0, tone: 'bad' } }
const list = { kind: 'list', view: 2, rows: 8, columns: ['soort'], set: { column: 'status', value: 'gedaan', label: 'Gedaan' } }

function show(tiles: unknown[], scope = null as { field: string; id: number } | null) {
  const onOpenView = vi.fn()
  render(<Dashboard dashboard={dashboard(tiles)} views={[conflicten, lijst]} models={models} tables={[]} scope={scope} onOpenView={onOpenView} />)
  return onOpenView
}

beforeEach(() => {
  api.rows.mockReset()
  api.update.mockReset()
})
afterEach(cleanup)

describe('a stat tile', () => {
  it('shows its count red above 0, and its title opens the view', async () => {
    api.rows.mockResolvedValue({ rows: [], total: 3 })
    const open = show([stat])
    const tile = screen.getByRole('region', { name: 'Conflicten' })
    await waitFor(() => expect(within(tile).getByTestId('stat-value').textContent).toBe('3'))
    expect(tile.className).toContain('nv-stat--bad')
    fireEvent.click(within(tile).getByRole('button', { name: 'Conflicten' }))
    expect(open).toHaveBeenCalledWith('1')
  })

  it('reads 0 with no tone over an empty view', async () => {
    api.rows.mockResolvedValue({ rows: [], total: 0 })
    show([stat])
    const tile = screen.getByRole('region', { name: 'Conflicten' })
    await waitFor(() => expect(within(tile).getByTestId('stat-value').textContent).toBe('0'))
    expect(tile.className).not.toContain('nv-stat--')
  })

  it('shows its change against the previous period', async () => {
    const weekly = view(1, 'Conflicten', 'conflicten', {
      arrangement: { hidden: [], order: [], widths: [], sort: [], filters: [{ field: 'deadline', op: 'between', values: ['2026-10-12', '2026-10-18'] }], group: null, picked: [] },
    } as Partial<SavedView>)
    api.rows.mockImplementation(async (_v, _w, _s, layout) => ({ rows: [], total: layout.filters[0].values[0] === '2026-10-12' ? 5 : 3 }))
    render(<Dashboard dashboard={dashboard([stat])} views={[weekly, lijst]} models={models} tables={[]} scope={null} onOpenView={() => undefined} />)
    expect(await screen.findByText('+2 t.o.v. vorige week')).toBeTruthy()
  })

  it('sends the space to a scoped view only', async () => {
    api.rows.mockResolvedValue({ rows: [], total: 0 })
    show([stat, { ...list, set: undefined }], { field: 'productie_id', id: 2 })
    // No date condition: each tile reads once, with no previous period.
    await waitFor(() => expect(api.rows).toHaveBeenCalledTimes(2))
    const scopes = api.rows.mock.calls.map((c) => [c[0].key, c[2]])
    expect(scopes).toContainEqual(['1', { field: 'productie_id', id: 2 }])
    expect(scopes).toContainEqual(['2', null])
  })
})

describe('a list tile', () => {
  it('shows its total, its rows, Alles tonen, and Gedaan only where the row writes', async () => {
    api.rows.mockResolvedValue({ rows: [row(1, 'Rider versturen', 5), row(2, 'Open plaats Speler', null)], total: 12 })
    const open = show([list])
    const tile = screen.getByRole('region', { name: 'Werklijst' })
    expect(await within(tile).findByRole('button', { name: 'Werklijst · 12' })).toBeTruthy()
    const items = within(tile).getAllByRole('listitem')
    expect(within(items[0]).getByRole('button', { name: 'Gedaan' })).toBeTruthy()
    expect(within(items[1]).queryByRole('button', { name: 'Gedaan' })).toBeNull()
    fireEvent.click(within(tile).getByRole('button', { name: 'Alles tonen' }))
    expect(open).toHaveBeenCalledWith('2')
  })

  it('Gedaan writes through update and the page reads again', async () => {
    api.rows.mockResolvedValue({ rows: [row(1, 'Rider versturen', 5)], total: 1 })
    api.update.mockResolvedValue({})
    show([list])
    const done = await screen.findByRole('button', { name: 'Gedaan' })
    await act(async () => fireEvent.click(done))
    expect(api.update).toHaveBeenCalledWith('werklijst', 1, { status: 'gedaan' }, expect.objectContaining({ id: 1 }))
    await waitFor(() => expect(api.rows).toHaveBeenCalledTimes(2))
  })

  it('a refused write shows the refusal and reads nothing again', async () => {
    api.rows.mockResolvedValue({ rows: [row(1, 'Rider versturen', 5)], total: 1 })
    api.update.mockRejectedValue({ code: 'refused', message: 'Ongeldige status.' })
    show([list])
    const done = await screen.findByRole('button', { name: 'Gedaan' })
    await act(async () => fireEvent.click(done))
    expect((await screen.findByRole('alert')).textContent).toContain('Ongeldige status.')
    expect(api.rows).toHaveBeenCalledTimes(1)
  })

  it('says Geen rijen over an empty view', async () => {
    api.rows.mockResolvedValue({ rows: [], total: 0 })
    show([list])
    expect(await screen.findByText('Geen rijen')).toBeTruthy()
  })
})

describe('the page', () => {
  it('a tile on a view the reader cannot list says Geen toegang', () => {
    show([{ ...stat, view: 77 }])
    expect(screen.getByText('Geen toegang')).toBeTruthy()
  })

  it('reads every tile again when the window regains focus', async () => {
    api.rows.mockResolvedValue({ rows: [], total: 1 })
    show([stat])
    await waitFor(() => expect(api.rows).toHaveBeenCalledTimes(1))
    await act(async () => window.dispatchEvent(new Event('focus')))
    await waitFor(() => expect(api.rows).toHaveBeenCalledTimes(2))
  })

  it('an empty dashboard says so', () => {
    show([])
    expect(screen.queryByRole('region')).toBeTruthy()
  })
})
