import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Model, SavedView } from '../types'

const api = vi.hoisted(() => ({ rows: vi.fn(), update: vi.fn(), create: vi.fn(), records: vi.fn(), createView: vi.fn(), updateView: vi.fn() }))
vi.mock('../api', () => api)
const { Dashboard } = await import('./Dashboard')

const view = (id: number, label: string, extra: Partial<SavedView> = {}): SavedView =>
  ({
    key: String(id), id, label, model: 'conflicten', table: 'conflicten', type: 'grid',
    arrangement: { hidden: [], order: [], widths: [], sort: [], filters: [], group: null, picked: [] },
    shared: true, owner: { id: -1, name: '' }, mine: false, editable: false, ...extra,
  }) as unknown as SavedView
const conflicten = view(1, 'Conflicten')
const werklijst = view(2, 'Werklijst')
const models = { conflicten: { key: 'conflicten', label: 'Conflicten', title_label: 't', title_readonly: true, fields: {} } } as unknown as Record<string, Model>

const dashboard = (extra: Partial<SavedView> = {}, sections = [{ label: 'Nu', tiles: [{ kind: 'stat', view: 1, measure: 'count' }, { kind: 'list', view: 2, rows: 5 }] }]) =>
  ({ ...view(9, 'Overzicht'), type: 'dashboard', layout: { sections, actions: [] }, ...extra }) as unknown as SavedView

function show(board: SavedView, role: 'administrator' | 'editor' = 'administrator') {
  const onSaved = vi.fn()
  render(<Dashboard dashboard={board} views={[conflicten, werklijst]} models={models} tables={[]} scope={null} role={role} onOpenView={() => undefined} onSaved={onSaved} />)
  return onSaved
}

beforeEach(() => {
  for (const fn of Object.values(api)) fn.mockReset()
  api.rows.mockResolvedValue({ rows: [], total: 0 })
})
afterEach(cleanup)

describe('the composer', () => {
  it('adds, moves and removes a tile, and saves the layout on an editable dashboard', async () => {
    api.updateView.mockResolvedValue({ key: '9' })
    show(dashboard({ editable: true, mine: true, owner: { id: 4, name: '' } }))
    fireEvent.click(screen.getByRole('button', { name: 'Bewerken' }))
    const section = screen.getByRole('group', { name: 'Sectie Nu' })
    fireEvent.change(within(section).getByLabelText('Soort tegel'), { target: { value: 'stat' } })
    fireEvent.change(within(section).getByLabelText('Weergave'), { target: { value: '2' } })
    fireEvent.click(within(section).getByRole('button', { name: 'Tegel toevoegen' }))
    // The section's own Omhoog comes first; the third tile's is the fourth.
    fireEvent.click(within(section).getAllByRole('button', { name: 'Omhoog' })[3])
    fireEvent.click(within(section).getAllByRole('button', { name: 'Verwijderen' })[0])
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Opslaan' })))
    const [, sent] = api.updateView.mock.calls[0]
    expect(sent.layout.sections[0].tiles).toEqual([
      { kind: 'stat', view: 2, measure: 'count' },
      { kind: 'list', view: 2, rows: 5 },
    ])
  })

  it('on the system dashboard an administrator saves a shared copy, an editor a private one', async () => {
    api.createView.mockResolvedValue({ key: '10' })
    const onSaved = show(dashboard())
    fireEvent.click(screen.getByRole('button', { name: 'Bewerken' }))
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Opslaan' })))
    expect(api.createView.mock.calls[0][0]).toMatchObject({ type: 'dashboard', name: 'Overzicht', shared: true })
    expect(onSaved).toHaveBeenCalledWith({ key: '10' })
    cleanup()
    show(dashboard(), 'editor')
    fireEvent.click(screen.getByRole('button', { name: 'Bewerken' }))
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Opslaan' })))
    expect(api.createView.mock.calls[1][0]).toMatchObject({ shared: false })
  })

  it('shows a refusal inline and stays in edit mode', async () => {
    api.updateView.mockRejectedValue({ code: 'bad_view', message: 'a tile names no view 2' })
    show(dashboard({ editable: true, mine: true, owner: { id: 4, name: '' } }))
    fireEvent.click(screen.getByRole('button', { name: 'Bewerken' }))
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Opslaan' })))
    expect(screen.getByRole('alert').textContent).toContain('a tile names no view 2')
    expect(screen.getByRole('button', { name: 'Opslaan' })).toBeTruthy()
  })

  it('an empty dashboard offers Bewerken and a new section', () => {
    show(dashboard({}, []))
    fireEvent.click(screen.getByRole('button', { name: 'Bewerken' }))
    fireEvent.click(screen.getByRole('button', { name: 'Sectie toevoegen' }))
    expect(screen.getByRole('group', { name: /^Sectie/ })).toBeTruthy()
  })
})
