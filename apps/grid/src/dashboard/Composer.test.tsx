import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Model, SavedView } from '../types'

const api = vi.hoisted(() => ({ recordCount: vi.fn(() => Promise.resolve(0)), recordHistory: vi.fn(() => Promise.resolve([])), rowsWhere: vi.fn(() => Promise.resolve({ rows: [], total: 0 })),  rows: vi.fn(), update: vi.fn(), create: vi.fn(), records: vi.fn(), createView: vi.fn(), updateView: vi.fn() }))
vi.mock('../api', () => api)
const { Dashboard } = await import('./Dashboard')

const view = (id: number, label: string, extra: Partial<SavedView> = {}): SavedView =>
  ({
    key: String(id), id, label, model: 'conflicten', table: 'conflicten', type: 'grid',
    arrangement: { hidden: [], order: [], widths: [], sort: [], filters: [], group: null, picked: [] },
    shared: true, owner: { id: -1, name: '' }, mine: false, editable: false, ...extra,
  }) as unknown as SavedView
const conflicten = view(1, 'Conflicten')
const werklijst = view(2, 'Werklijst', { model: 'werklijst' })
const models = {
  conflicten: { key: 'conflicten', label: 'Conflicten', title_label: 't', title_readonly: true, fields: {} },
  werklijst: {
    key: 'werklijst', label: 'Werklijst', title_label: 't', title_readonly: true, query: true,
    fields: {
      status: { type: 'text', label: 'Status', options: { open: 'Open', gedaan: 'Gedaan' } },
      soort: { type: 'text', label: 'Soort', options: { taak: 'Taak' }, readonly: true },
    },
  },
  taak: { key: 'taak', label: 'Taken', title_label: 'Titel', title_readonly: false, new_label: 'Nieuwe taak', fields: {} },
} as unknown as Record<string, Model>

const dashboard = (extra: Partial<SavedView> = {}, sections = [{ label: 'Nu', tiles: [{ kind: 'stat', view: 1, measure: 'count' }, { kind: 'list', view: 2, rows: 5 }] }]) =>
  ({ ...view(9, 'Overzicht'), type: 'dashboard', layout: { sections, actions: [] }, ...extra }) as unknown as SavedView

function show(board: SavedView, role: 'administrator' | 'editor' = 'administrator', extraViews: SavedView[] = []) {
  const onSaved = vi.fn()
  render(<Dashboard dashboard={board} views={[conflicten, werklijst, ...extraViews]} models={models} tables={[]} scope={null} role={role} onOpenView={() => undefined} onSaved={onSaved} />)
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

  it("sets a tile's options: a stat's label and tone, a list's rows and button, a progress's total and label", async () => {
    api.updateView.mockResolvedValue({ key: '9' })
    show(dashboard({ editable: true, mine: true, owner: { id: 4, name: '' } }, [{ label: 'Nu', tiles: [] }]))
    fireEvent.click(screen.getByRole('button', { name: 'Bewerken' }))
    const section = screen.getByRole('group', { name: 'Sectie Nu' })
    const pick = (label: string, value: string) => fireEvent.change(within(section).getByLabelText(label), { target: { value } })

    pick('Soort tegel', 'stat')
    pick('Weergave', '1')
    pick('Titel tegel', 'Botsingen')
    pick('Kleur', 'bad')
    pick('Boven', '2')
    fireEvent.click(within(section).getByRole('button', { name: 'Tegel toevoegen' }))

    pick('Soort tegel', 'list')
    pick('Weergave', '2')
    pick('Rijen', '8')
    pick('Knop zet', 'status')
    pick('Op', 'gedaan')
    pick('Knoptekst', 'Gedaan')
    fireEvent.click(within(section).getByRole('button', { name: 'Tegel toevoegen' }))

    pick('Soort tegel', 'progress')
    pick('Weergave', '2')
    pick('Totaal', '1')
    pick('Titel tegel', 'Gevuld')
    fireEvent.click(within(section).getByRole('button', { name: 'Tegel toevoegen' }))

    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Opslaan' })))
    expect(api.updateView.mock.calls[0][1].layout.sections[0].tiles).toEqual([
      { kind: 'stat', view: 1, measure: 'count', label: 'Botsingen', tone: { above: 2, tone: 'bad' } },
      { kind: 'list', view: 2, rows: 8, set: { column: 'status', value: 'gedaan', label: 'Gedaan' } },
      { kind: 'progress', done: 2, total: 1, label: 'Gevuld' },
    ])
  })

  it('offers a button only on a column that writes', () => {
    show(dashboard({ editable: true, mine: true, owner: { id: 4, name: '' } }, [{ label: 'Nu', tiles: [] }]))
    fireEvent.click(screen.getByRole('button', { name: 'Bewerken' }))
    const section = screen.getByRole('group', { name: 'Sectie Nu' })
    fireEvent.change(within(section).getByLabelText('Soort tegel'), { target: { value: 'list' } })
    fireEvent.change(within(section).getByLabelText('Weergave'), { target: { value: '2' } })
    const offered = within(within(section).getByLabelText('Knop zet')).getAllByRole('option').map((o) => o.getAttribute('value'))
    expect(offered).toEqual(['', 'status'])
  })

  it('adds and removes a quick action', async () => {
    api.updateView.mockResolvedValue({ key: '9' })
    show(dashboard({ editable: true, mine: true, owner: { id: 4, name: '' }, layout: { sections: [], actions: [{ create: 'conflicten', label: 'Weg' }] } } as Partial<SavedView>))
    fireEvent.click(screen.getByRole('button', { name: 'Bewerken' }))
    const actions = screen.getByRole('group', { name: 'Snelle acties' })
    expect(within(actions).getByText('Snelle acties').tagName).toBe('LEGEND')
    fireEvent.click(within(actions).getByRole('button', { name: 'Actie verwijderen' }))
    fireEvent.change(within(actions).getByLabelText('Nieuw in'), { target: { value: 'taak' } })
    fireEvent.click(within(actions).getByRole('button', { name: 'Actie toevoegen' }))
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Opslaan' })))
    expect(api.updateView.mock.calls[0][1].layout.actions).toEqual([{ create: 'taak', label: 'Nieuwe taak' }])
  })

  it("an administrator composing the system dashboard updates the team's shared copy when there is one", async () => {
    api.updateView.mockResolvedValue({ key: '11' })
    const team = dashboard({ id: 11, key: '11', editable: true, shared: true, owner: { id: 5, name: 'A' } })
    const onSaved = show(dashboard(), 'administrator', [team])
    fireEvent.click(screen.getByRole('button', { name: 'Bewerken' }))
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Opslaan' })))
    expect(api.createView).not.toHaveBeenCalled()
    expect(api.updateView.mock.calls[0][0]).toBe(team)
    expect(onSaved).toHaveBeenCalledWith({ key: '11' })
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
    expect(screen.getByText('Dit dashboard is nog leeg.')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Bewerken' }))
    fireEvent.click(screen.getByRole('button', { name: 'Sectie toevoegen' }))
    expect(screen.getByRole('group', { name: /^Sectie/ })).toBeTruthy()
  })
})
