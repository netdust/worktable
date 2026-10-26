import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { useSyncExternalStore } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { defaults } from '../grid/layout'
import type { Model, Row, View } from '../types'
import { openTab } from '../test-setup'
import { createMatrixStore, type MatrixApi, type MatrixStore } from './store'

vi.mock('../api', () => ({ recordCount: vi.fn(() => Promise.resolve(0)), recordHistory: vi.fn(() => Promise.resolve([])), rowsWhere: vi.fn(() => Promise.resolve({ rows: [], total: 0 })),  records: vi.fn() }))
const { Matrix } = await import('./Matrix')

const view: View = {
  key: 'bezetting', label: 'Bezetting', table: 'planning', model: 'activity', type: 'matrix', date_field: 'date', group: 'date', sort: ['date'], space: 'scoped',
  join: {
    model: 'assignment', row_field: 'activity', column_field: 'person', name_field: 'name', cell_field: 'status', note_field: 'note',
    keys: { x: 'confirmed', '?': 'maybe' }, marks: { confirmed: '✓', requested: '·', maybe: '?', declined: '✕' }, count: 'confirmed',
  },
  away: { table: 'afwezigheden', column_field: 'person', label_field: 'reason', model: 'absence', date_field: 'from', end_field: 'to' },
}

const models: Record<string, Model> = {
  activity: {
    key: 'activity', label: 'Activiteit', title_label: 'Titel', title_readonly: false,
    fields: {
      date: { type: 'date', label: 'Datum', required: true, fact: true },
      place: { type: 'text', label: 'Plaats', required: false, fact: false },
      production: { type: 'relation', label: 'Productie', required: false, fact: true, relation: { model: 'production', multiple: false } },
    },
  },
  assignment: {
    key: 'assignment', label: 'Toewijzing', title_label: 'Titel', title_readonly: false,
    fields: {
      status: { type: 'select', label: 'Status', required: true, fact: true, options: { requested: 'Gevraagd', confirmed: 'Bevestigd', maybe: 'Misschien', declined: 'Afgezegd' } },
    },
  },
}

const evil = '<img src=x onerror=alert(1)>'
const join = (id: number, fields: Record<string, unknown>) => ({ id, title: `join ${id}`, status: 'publish', fields: { name: '', note: '', status: 'requested', person: [], ...fields } })
const activity = (id: number, title: string, date: string, cells: ReturnType<typeof join>[] = []): Row => ({
  id, title, status: 'publish', fields: { date, place: 'Grote zaal' }, rollups: { cells },
})

const titles = new Map([[5, 'Sien'], [7, 'Marit']])
const week = (note = 'komt later'): Row[] => [
  activity(1, 'Montage', '2026-05-18', [join(11, { person: [5], status: 'confirmed' }), join(12, { name: 'Lieve', status: 'maybe', note })]),
  activity(2, 'Diner', '2026-05-19', [join(14, { name: 'Lieve', status: 'confirmed' }), join(13, { person: [7], status: 'declined', note: 'eerste' }), join(16, { person: [7], status: 'maybe', note: 'tweede' })]),
]
const away = (reason = 'Examen'): Row[] => [{ id: 90, title: 'x', status: 'publish', fields: { person: [5], from: '2026-05-18', to: '2026-05-18', reason } }]

function setup({ rows = week(), awayRows = away(), models: given = models }: { rows?: Row[]; awayRows?: Row[]; models?: Record<string, Model> } = {}) {
  let next = 500
  const writes = { create: vi.fn<MatrixApi['create']>(), update: vi.fn<MatrixApi['update']>(), remove: vi.fn<MatrixApi['remove']>(), undoBatch: vi.fn<MatrixApi['undoBatch']>(), runAction: vi.fn<MatrixApi['runAction']>() }
  writes.create.mockImplementation(async (_m, data) => ({ row: { id: ++next, title: 'j', status: 'publish', fields: { name: '', note: '', person: [], ...data } }, batch: null }))
  writes.update.mockImplementation(async (_m, id, data) => ({ row: { id, title: 'j', status: 'publish', fields: { name: '', note: '', person: [5], status: 'confirmed', ...data } }, batch: null }))
  writes.remove.mockImplementation(async (_m, id) => ({ deleted: true, id }))
  const store = createMatrixStore({ view, rows, api: writes })
  vi.spyOn(store, 'set')
  vi.spyOn(store, 'setNote')
  function Live({ store }: { store: MatrixStore }) {
    const state = useSyncExternalStore(store.subscribe, store.getState)
    return <Matrix view={view} models={given} rows={state.rows} away={awayRows} titles={titles} layout={defaults(view)} onLayout={() => undefined} emptyTitle="Geen rijen" store={store} writable />
  }
  const utils = render(<Live store={store} />)
  const at = (title: RegExp, key: string) => screen.getByRole('row', { name: title }).querySelector<HTMLElement>(`[data-column="${key}"]`)!
  const panel = () => screen.queryByRole('complementary')
  // The status is a badge until pressed; then its choices open in place.
  const group = () => {
    const status = panel()!.querySelector<HTMLButtonElement>('.nv-dw-status[aria-expanded="false"]')
    if (status) fireEvent.click(status)
    return within(panel()!).getByRole('radiogroup', { name: 'Status' })
  }
  const checked = () => within(group()).getByRole('radio', { checked: true })
  const choose = (name: string) => {
    const choices = group()
    return act(async () => {
      fireEvent.click(within(choices).getByRole('radio', { name }))
    })
  }
  // The note is a line until pressed; then its field.
  const noteField = () => {
    const line = panel()!.querySelector<HTMLButtonElement>('.nv-dw-note')
    if (line) fireEvent.click(line)
    return within(panel()!).getByLabelText('Notitie')
  }
  return { ...utils, writes, store, at, panel, group, checked, choose, noteField }
}

/** A click as a browser sends it: mousedown, then focus unless the mousedown was prevented, then click. */
function realClick(el: HTMLElement, init: MouseEventInit = {}) {
  if (fireEvent.mouseDown(el, init)) act(() => el.focus())
  fireEvent.mouseUp(el, init)
  fireEvent.click(el, init)
}

beforeEach(() => window.localStorage.clear())
afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

describe('the cell drawer is the record drawer', () => {
  beforeEach(() => {
    document.documentElement.lang = 'nl-BE'
  })
  afterEach(() => {
    document.documentElement.lang = ''
  })

  it('reads alert, fields, the rest of the day and who could stand in on Gegevens, and the history in its own tab, on the drawer\'s own edge', async () => {
    const { panel, at } = setup()
    fireEvent.click(at(/Montage/, 'record:5'))
    const aside = panel()!
    expect(aside.querySelector('.nv-drawer__editor')).toBeNull()
    const order = () => [...aside.querySelectorAll('.nv-dw-alert, .nv-drawer__fields, .nv-dw-sec')].map((el) =>
      el.classList.contains('nv-dw-alert') ? 'alert' : el.classList.contains('nv-drawer__fields') ? 'fields' : (el.getAttribute('aria-label') ?? ''))
    expect(order()[0]).toBe('alert')
    expect(order()[1]).toBe('fields')
    expect(order().some((label) => label.startsWith('Ook op'))).toBe(true)
    expect(order()).not.toContain('Geschiedenis')
    await openTab('Geschiedenis')
    await within(aside).findByRole('region', { name: 'Geschiedenis' })
    expect(order()).toEqual(['Geschiedenis'])
  })

  it('names its lines by the join\'s own field labels, no word of its own', () => {
    const named = { ...models, assignment: { ...models.assignment, fields: { ...models.assignment.fields,
      person: { type: 'relation', label: 'Medewerker', required: false, fact: false, relation: { model: 'people', multiple: false } },
      activity: { type: 'relation', label: 'Klus', required: true, fact: false, relation: { model: 'activity', multiple: false } } } } } as Record<string, Model>
    const { panel, at } = setup({ models: named })
    fireEvent.click(at(/Montage/, 'record:5'))
    const labels = [...panel()!.querySelectorAll('.nv-drawer__field dt')].map((dt) => dt.textContent)
    expect(labels).toEqual(['Medewerker', 'Status', 'Klus', 'Notitie'])
  })

  it('opens the status for the hand-off only: a plain click on another cell afterwards shows the badge closed', () => {
    const { panel, at } = setup()
    fireEvent.click(at(/Montage/, 'record:5'))
    fireEvent.keyDown(at(/Montage/, 'record:5'), { key: 'Enter' })
    expect(within(panel()!).queryByRole('radiogroup', { name: 'Status' })).not.toBeNull()
    fireEvent.click(at(/Diner/, 'record:7'))
    expect(within(panel()!).queryByRole('radiogroup', { name: 'Status' })).toBeNull()
    expect(panel()!.querySelector('.nv-dw-status')?.getAttribute('aria-expanded')).toBe('false')
  })

  it('heads its alert with the icon and the title on one line, says the reason as a sentence, and offers its actions as words', () => {
    const { panel, at } = setup()
    fireEvent.click(at(/Montage/, 'record:5'))
    const alert = within(panel()!).getByRole('alert')
    const head = alert.querySelector('.nv-dw-alert__head')!
    expect(head.querySelector('svg')).not.toBeNull()
    expect(head.textContent).toBe('Afwezig en toegewezen')
    expect(alert.querySelector('.nv-dw-alert__text')?.textContent).toBe('Sien is afwezig op ma 18 mei: Examen.')
    expect([...alert.querySelectorAll('.nv-dw-alert__acts button')].map((b) => b.textContent)).toEqual(['Iemand anders kiezen', 'Toch laten staan'])
  })
})

describe('the matrix side panel', () => {
  it('shows a clicked cell in the panel and leaves focus on the cell, so typing still goes to it', async () => {
    const { at, panel, writes } = setup()

    fireEvent.click(at(/Montage/, 'name:lieve'))

    const aside = panel()!
    expect(aside.getAttribute('aria-label')).toBe('Lieve · Montage')
    expect(within(aside).getAllByText(/Montage/).length).toBeGreaterThan(0)
    expect(aside.querySelector('.nv-dw-status')?.textContent).toBe('? Misschien')
    expect(aside.querySelector('.nv-dw-note')?.textContent).toBe('komt later')
    expect(document.activeElement).toBe(at(/Montage/, 'name:lieve'))

    await act(async () => {
      fireEvent.keyDown(document.activeElement!, { key: 'x' })
    })
    expect(writes.update).toHaveBeenCalledWith('assignment', 12, { status: 'confirmed' })
  })

  it('focuses the checked status on Enter', () => {
    const { at, checked } = setup()
    fireEvent.click(at(/Montage/, 'record:5'))

    fireEvent.keyDown(at(/Montage/, 'record:5'), { key: 'Enter' })

    expect(document.activeElement).toBe(checked())
    expect(checked().textContent).toBe('Bevestigd')
  })

  it('focuses the checked status on a double-click', () => {
    const { at, checked } = setup()

    fireEvent.click(at(/Diner/, 'name:lieve'))
    fireEvent.doubleClick(at(/Diner/, 'name:lieve'))

    expect(document.activeElement).toBe(checked())
  })

  it('takes a double-click whose second click lands in the panel as the double-click, never as a status', () => {
    const { at, checked, group, store } = setup()
    fireEvent.click(at(/Diner/, 'name:lieve'))

    const under = within(group()).getByRole('radio', { name: 'Afgezegd' })
    fireEvent.mouseDown(under, { detail: 2 })
    fireEvent.click(under, { detail: 2 })

    expect(store.set).not.toHaveBeenCalled()
    expect(document.activeElement).toBe(checked())
  })

  it('moves through the options with the arrows without writing, and Space or Enter picks one', async () => {
    const { at, checked, store } = setup()
    fireEvent.click(at(/Montage/, 'record:5'))
    fireEvent.keyDown(at(/Montage/, 'record:5'), { key: 'Enter' })

    fireEvent.keyDown(checked(), { key: 'ArrowDown' })
    expect(document.activeElement?.textContent).toBe('Misschien')
    fireEvent.keyDown(document.activeElement!, { key: 'ArrowUp' })
    fireEvent.keyDown(document.activeElement!, { key: 'ArrowUp' })
    expect(document.activeElement?.textContent).toBe('Gevraagd')
    expect(store.set).not.toHaveBeenCalled()

    await act(async () => {
      fireEvent.keyDown(document.activeElement!, { key: ' ' })
    })
    expect(store.set).toHaveBeenCalledWith(1, expect.objectContaining({ key: 'record:5' }), 'requested')
  })

  it('focuses the first option on Enter when the cell is empty', () => {
    const { at, group } = setup()
    fireEvent.click(at(/Diner/, 'record:5'))

    fireEvent.keyDown(at(/Diner/, 'record:5'), { key: 'Enter' })

    expect(document.activeElement).toBe(within(group()).getAllByRole('radio')[0])
  })

  it('removes the cell on None', async () => {
    const { at, choose, store } = setup()
    fireEvent.click(at(/Montage/, 'record:5'))

    await choose('Geen')

    expect(store.set).toHaveBeenCalledWith(1, expect.objectContaining({ key: 'record:5' }), null)
  })

  it('offers the status options inline, in declared order with their words, and a change writes through the store', async () => {
    const { at, group, choose, store, writes } = setup()
    fireEvent.click(at(/Montage/, 'record:5'))

    const options = within(group()).getAllByRole('radio').map((o) => o.textContent)
    expect(options).toEqual(['Geen', 'Gevraagd', 'Bevestigd', 'Misschien', 'Afgezegd'])
    await choose('Afgezegd')

    expect(store.set).toHaveBeenCalledWith(1, expect.objectContaining({ key: 'record:5' }), 'declined')
    expect(writes.update).toHaveBeenCalledWith('assignment', 11, { status: 'declined' })
    expect(store.getState().canUndo).toBe(true)
  })

  it('saves the note on leaving the field, sending the note alone', async () => {
    const { at, store, writes, noteField } = setup()
    fireEvent.click(at(/Montage/, 'name:lieve'))
    const note = noteField()

    fireEvent.change(note, { target: { value: 'komt om 10u' } })
    await act(async () => {
      fireEvent.blur(note)
    })

    expect(store.setNote).toHaveBeenCalledWith(1, expect.objectContaining({ key: 'name:lieve' }), 'komt om 10u')
    expect(writes.update).toHaveBeenCalledWith('assignment', 12, { note: 'komt om 10u' })
  })

  it('edits the note as the record drawer edits a long text: Escape keeps it and the panel, Cmd+Enter saves', async () => {
    const { at, panel, store, noteField } = setup()
    fireEvent.click(at(/Montage/, 'name:lieve'))

    fireEvent.change(noteField(), { target: { value: 'weg' } })
    fireEvent.keyDown(noteField(), { key: 'Escape' })
    expect(panel()).not.toBeNull()
    expect(panel()!.querySelector('.nv-dw-note')?.textContent).toBe('komt later')
    expect(store.setNote).not.toHaveBeenCalled()

    fireEvent.change(noteField(), { target: { value: 'komt om 10u' } })
    await act(async () => {
      fireEvent.keyDown(noteField(), { key: 'Enter', ctrlKey: true })
    })
    expect(store.setNote).toHaveBeenCalledExactlyOnceWith(1, expect.objectContaining({ key: 'name:lieve' }), 'komt om 10u')
  })

  it('shows the away reason and the warning on an away day, and still sends the write', async () => {
    const { at, panel, choose, writes } = setup()
    fireEvent.click(at(/Montage/, 'record:5'))

    expect(within(panel()!).getByText(/is afwezig op .*: Examen\.$/)).toBeTruthy()
    expect(within(panel()!).getByText('Afwezig en toegewezen')).toBeTruthy()
    await choose('Misschien')

    expect(writes.update).toHaveBeenCalledWith('assignment', 11, { status: 'maybe' })
  })

  it('shows the reason without the warning on an away day nobody is set on', () => {
    const { at, panel } = setup({ rows: [activity(3, 'Leeg', '2026-05-18', [join(11, { person: [5] })]), activity(4, 'Leeg ook', '2026-05-18')] })

    fireEvent.click(at(/Leeg ook/, 'record:5'))

    expect(within(panel()!).getByText(/is afwezig op .*: Examen\.$/)).toBeTruthy()
    expect(within(panel()!).queryByText('Afwezig en toegewezen')).toBeNull()
  })

  it('shows a row label\'s fields and who is on it', () => {
    const { container, panel } = setup()

    fireEvent.click(within(screen.getByRole('row', { name: /Diner/ })).getByRole('rowheader'))

    const aside = panel()!
    expect(aside.getAttribute('aria-label')).toBe('Diner')
    expect(within(aside).getByText('Plaats')).toBeTruthy()
    expect(within(aside).getByText('Grote zaal')).toBeTruthy()
    const people = [...container.querySelectorAll('.nv-panel__people li')].map((li) => li.textContent)
    expect(people).toEqual(['MaritAfgezegd', 'MaritMisschien', 'LieveBevestigd'])
  })

  it('shows a relation the row carries a title for, by its title', () => {
    const rows = week()
    rows[1].fields.production = [40]
    rows[1].lookups = { production: { id: 40, title: 'Zomerfeest', status: 'publish', fields: {} } }
    const { panel } = setup({ rows })

    fireEvent.click(within(screen.getByRole('row', { name: /Diner/ })).getByRole('rowheader'))

    expect(within(panel()!).getByText('Productie')).toBeTruthy()
    expect(within(panel()!).getAllByText('Zomerfeest').length).toBeGreaterThan(0)
  })

  it('leaves out a relation the row carries no title for, rather than calling it empty', () => {
    const rows = week()
    rows[1].fields.production = [40]
    const { panel } = setup({ rows })

    fireEvent.click(within(screen.getByRole('row', { name: /Diner/ })).getByRole('rowheader'))

    expect(within(panel()!).queryByText('Productie')).toBeNull()
  })

  it('closes on Escape and gives focus back to the cell', () => {
    const { at, panel, checked } = setup()
    fireEvent.click(at(/Montage/, 'record:5'))
    fireEvent.keyDown(at(/Montage/, 'record:5'), { key: 'Enter' })

    fireEvent.keyDown(checked(), { key: 'Escape' })

    expect(panel()).toBeNull()
    expect(document.activeElement).toBe(at(/Montage/, 'record:5'))
  })

  it('closes on Escape from the cell too', () => {
    const { at, panel } = setup()
    fireEvent.click(at(/Montage/, 'record:5'))

    fireEvent.keyDown(at(/Montage/, 'record:5'), { key: 'Escape' })

    expect(panel()).toBeNull()
    expect(document.activeElement).toBe(at(/Montage/, 'record:5'))
  })

  it('keeps a 10,000-character note inside its scrolling field', () => {
    const long = 'a'.repeat(10_000)
    const { at, noteField } = setup({ rows: week(long) })

    fireEvent.click(at(/Montage/, 'name:lieve'))

    const note = noteField() as HTMLTextAreaElement
    expect(note.tagName).toBe('TEXTAREA')
    expect(note.value).toHaveLength(10_000)
    expect(note.closest('.nv-drawer__field')).not.toBeNull()
  })

  it('renders a markup note and away reason as characters', () => {
    const { at, panel, container, noteField } = setup({ rows: week(evil), awayRows: away(evil) })

    fireEvent.click(at(/Montage/, 'name:lieve'))
    expect((noteField() as HTMLTextAreaElement).value).toBe(evil)
    fireEvent.click(at(/Montage/, 'record:5'))
    expect(within(panel()!).getByText((text) => text.endsWith(`: ${evil}.`))).toBeTruthy()

    expect(container.querySelector('img')).toBeNull()
  })

  it('lists the further joins that share a cell, the lowest id holding it', () => {
    const { at, panel } = setup()

    fireEvent.click(at(/Diner/, 'record:7'))

    const aside = panel()!
    expect(aside.querySelector('.nv-dw-status')?.textContent).toBe('✕ Afgezegd')
    const others = [...aside.querySelectorAll('.nv-panel__others li')].map((li) => li.textContent)
    expect(others).toEqual(['Misschien — tweede'])
  })

  it('extends the selection on a real Shift+click (mousedown, focus, click), leaves the panel, and fills and clears the block', async () => {
    const { at, panel, writes } = setup()
    writes.update.mockImplementation(async (_m, id, data) => ({ row: { id, title: 'j', status: 'publish', fields: { name: 'Lieve', note: '', person: [], status: 'confirmed', ...data } }, batch: null }))
    const selected = () => [...document.querySelectorAll<HTMLElement>('[aria-selected="true"]')].map((el) => `${el.closest('tr')?.dataset.title}/${el.dataset.column}`)
    realClick(at(/Montage/, 'record:5'))

    realClick(at(/Diner/, 'name:lieve'), { shiftKey: true })

    expect(panel()!.getAttribute('aria-label')).toBe('Sien · Montage')
    expect(selected()).toEqual(['Montage/record:5', 'Montage/name:lieve', 'Diner/record:5', 'Diner/name:lieve'])
    await act(async () => {
      fireEvent.keyDown(document.activeElement!, { key: 'd', ctrlKey: true })
    })
    expect(writes.create).toHaveBeenCalledWith('assignment', { activity: [2], person: [5], status: 'confirmed' })
    expect(writes.update).toHaveBeenCalledWith('assignment', 14, { status: 'maybe' })

    await act(async () => {
      fireEvent.keyDown(document.activeElement!, { key: 'Delete' })
    })
    expect(writes.remove.mock.calls.map(([, id]) => id).sort()).toEqual([11, 12, 14, 501])
  })

  it('moves an open cell panel with the arrows, without taking focus, so a typed key and the panel agree', async () => {
    const { at, panel, checked, writes } = setup()
    writes.update.mockImplementation(async (_m, id, data) => ({ row: { id, title: 'j', status: 'publish', fields: { name: 'Lieve', note: '', person: [], status: 'maybe', ...data } }, batch: null }))
    fireEvent.click(at(/Montage/, 'record:5'))
    expect(checked().textContent).toBe('Bevestigd')

    act(() => {
      fireEvent.keyDown(document.activeElement!, { key: 'ArrowRight' })
    })

    expect(panel()!.getAttribute('aria-label')).toBe('Lieve · Montage')
    expect(checked().textContent).toBe('Misschien')
    expect(document.activeElement).toBe(at(/Montage/, 'name:lieve'))
    await act(async () => {
      fireEvent.keyDown(document.activeElement!, { key: 'x' })
    })
    expect(writes.update).toHaveBeenCalledWith('assignment', 12, { status: 'confirmed' })
    expect(checked().textContent).toBe('Bevestigd')
    expect(panel()!.getAttribute('aria-label')).toBe('Lieve · Montage')
  })

  it('draws no dialog, list or popover anywhere in the document, with the panel open and a status chosen', async () => {
    const { at, choose, container } = setup()
    fireEvent.click(at(/Montage/, 'record:5'))
    fireEvent.keyDown(at(/Montage/, 'record:5'), { key: 'Enter' })

    await choose('Misschien')

    expect(document.querySelector('[role="dialog"], [role="listbox"], .nv-pop, [class*="popover"]')).toBeNull()
    expect([...document.body.children].filter((el) => el !== container)).toEqual([])
    expect([...document.querySelectorAll('*')].filter((el) => getComputedStyle(el).position === 'fixed')).toEqual([])
  })

  it('scrolls the clicked cell into view beside the opened panel, clear of the frozen header and column', () => {
    const scroll = vi.fn()
    Element.prototype.scrollIntoView = scroll
    const { at, container } = setup()

    fireEvent.click(at(/Diner/, 'name:lieve'))

    expect(scroll).toHaveBeenCalledWith({ block: 'nearest', inline: 'nearest' })
    expect(scroll.mock.contexts.at(-1)).toBe(at(/Diner/, 'name:lieve'))
    expect(container.querySelector('.nv-scroll')?.classList.contains('nv-mx__scroll')).toBe(true)
    delete (Element.prototype as Partial<Element>).scrollIntoView
  })

  it('opens a row label\'s panel in a week with rows and no columns, and Escape closes it', () => {
    const { panel, container } = setup({ rows: [activity(3, 'Leeg', '2026-05-19'), activity(4, 'Leeg ook', '2026-05-20')], awayRows: [] })
    expect(container.querySelectorAll('td[data-cell]')).toHaveLength(0)

    fireEvent.mouseDown(within(screen.getByRole('row', { name: /Leeg ook/ })).getByRole('rowheader'))
    fireEvent.click(within(screen.getByRole('row', { name: /Leeg ook/ })).getByRole('rowheader'))
    expect(panel()!.getAttribute('aria-label')).toBe('Leeg ook')

    fireEvent.keyDown(document.activeElement!, { key: 'Escape' })
    expect(panel()).toBeNull()
  })

  it('still shows the empty state for a week without rows', () => {
    setup({ rows: [] })

    expect(screen.getByText('Geen rijen')).toBeTruthy()
    expect(screen.queryByRole('grid')).toBeNull()
  })

  it('keeps the keyboard on a cell when a row label is clicked: Escape closes, arrows move', () => {
    const { at, panel } = setup()
    fireEvent.click(at(/Montage/, 'record:7'))

    const label = within(screen.getByRole('row', { name: /Diner/ })).getByRole('rowheader')
    expect(fireEvent.mouseDown(label)).toBe(false)
    fireEvent.click(label)
    expect(panel()!.getAttribute('aria-label')).toBe('Diner')
    expect(document.activeElement).toBe(at(/Diner/, 'record:7'))

    fireEvent.keyDown(document.activeElement!, { key: 'Escape' })
    expect(panel()).toBeNull()
    expect(document.activeElement).toBe(at(/Diner/, 'record:7'))
    act(() => {
      fireEvent.keyDown(document.activeElement!, { key: 'ArrowRight' })
    })
    expect(document.activeElement).toBe(at(/Diner/, 'record:5'))
  })
})
