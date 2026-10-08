import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { type ReactNode, useState } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { setStrings } from '../i18n'
import { renderNl, typeKeys } from '../test-setup'
import type { Model, Row, Saved, SavedView, Schema, Scope, View } from '../types'
import { activity, calais, planning, schema } from './calais.test.data'
import { Grid } from './Grid'
import { defaults, type Layout } from './layout'
import { createStore, type StoreApi } from './store'

const remote = vi.hoisted(() => ({ schema: vi.fn(), rows: vi.fn(), records: vi.fn(), update: vi.fn(), create: vi.fn(), remove: vi.fn(), savedViews: vi.fn((): Promise<unknown[]> => Promise.resolve([])), updateView: vi.fn(),
  me: () => Promise.resolve({ id: 1, email: 'an@example.test', role: 'editor', subject: null }), onUnauthenticated: () => () => undefined,
  prefs: () => Promise.resolve({ order: {}, last: {} }), savePrefs: () => Promise.resolve(),
  rowOf: vi.fn(), undoBatch: vi.fn(), runAction: vi.fn() }))
vi.mock('../api', () => remote)
const { App } = await import('../ui/App')

let api: {
  update: ReturnType<typeof vi.fn<StoreApi['update']>>; create: ReturnType<typeof vi.fn<StoreApi['create']>>; remove: ReturnType<typeof vi.fn<NonNullable<StoreApi['remove']>>>
  read: ReturnType<typeof vi.fn<NonNullable<StoreApi['read']>>>; undo: ReturnType<typeof vi.fn<NonNullable<StoreApi['undo']>>>
}
let saved: Layout | null

function renderGrid(rows: Row[] = calais, options: { query?: string; layout?: Layout; title?: string; filters?: ReactNode; model?: Model; view?: View; cut?: Row | null; scope?: Scope | null; scopeChip?: string; onShown?: (shown: { rows: number; groups: number | null; cut: boolean } | null) => void } = {}) {
  api = {
    update: vi.fn<StoreApi['update']>(), create: vi.fn<StoreApi['create']>(), remove: vi.fn<NonNullable<StoreApi['remove']>>(),
    read: vi.fn<NonNullable<StoreApi['read']>>(), undo: vi.fn<NonNullable<StoreApi['undo']>>(),
  }
  const store = createStore({ model: 'activity', rows, api })
  function Harness() {
    const [layout, setLayout] = useState(options.layout ?? defaults(options.view ?? planning))
    const change = (next: Layout) => {
      saved = next
      setLayout(next)
    }
    return (
      <Grid model={options.model ?? activity} view={options.view ?? planning} store={store} writable layout={layout} onLayout={change} title={options.title}
        query={options.query ?? ''} emptyTitle="Geen rijen in deze periode" emptyHint="Week 21 · 18–24 mei" filters={options.filters}
        cut={options.cut} onShown={options.onShown} scope={options.scope ?? null} scopeChip={options.scopeChip ?? null} />
    )
  }
  return { store, ...renderNl(<Harness />) }
}

const headers = () => screen.getAllByRole('columnheader').map((h) => h.dataset.column)
const bands = () => screen.getAllByRole('row').filter((r) => r.classList.contains('nv-group'))
const labels = () => bands().map((b) => b.querySelector('.nv-group__label')?.textContent)
const band = (label: string) => bands().find((b) => b.querySelector('.nv-group__label')?.textContent === label)!
const titled = () => screen.getAllByRole('row').flatMap((r) => (r.dataset.title ? [r.dataset.title] : []))
function cell(title: string, column: string): HTMLElement {
  const row = screen.getAllByRole('row').find((r) => r.dataset.title === title)
  if (!row) throw new Error(`no row ${title}`)
  return within(row).getAllByRole('gridcell')[headers().indexOf(column)]
}
const type = (target: HTMLElement, key: string, mods: object = {}) => fireEvent.keyDown(target, { key, ...mods })
const editor = () => document.activeElement as HTMLInputElement

beforeEach(() => {
  document.documentElement.lang = 'nl-BE'
  saved = null
})
afterEach(() => {
  cleanup()
  document.documentElement.lang = ''
})

describe('the sheet', () => {
  it("is named after the title it is given, else after the view's label", () => {
    renderGrid(calais, { title: 'Tabellen' })
    expect(screen.getByRole('grid', { name: 'Tabellen' })).toBeTruthy()
    cleanup()

    renderGrid()
    expect(screen.getByRole('grid', { name: planning.label })).toBeTruthy()
  })

  it('renders the Calais week grouped by day, header and first column sticky, a count per band and a total', () => {
    const { container } = renderGrid()

    expect(container.querySelector('thead')?.classList.contains('nv-grid__head')).toBe(true)
    expect(headers()).toEqual(['title', 'start', 'end', 'kind', 'status', 'location', 'place', 'settled_by', 'rollups.confirmed'])
    expect(screen.getAllByRole('row').filter((r) => r.dataset.title).every((r) => r.children[1]?.classList.contains('nv-first'))).toBe(true)

    expect(labels()).toEqual(['Maandag 18 mei', 'Dinsdag 19 mei', 'Woensdag 20 mei'])
    expect(bands().map((b) => b.querySelector('.nv-group__count')?.textContent)).toEqual(['3', '2', '1'])
    expect(screen.queryByTestId('group-foot')).toBeNull()

    const total = screen.getByTestId('total')
    expect(total.textContent).toContain('Totaal · 6 rijen')
    expect(within(total).getByText('47')).toBeTruthy()
  })

  it('numbers the rows it shows, top to bottom across the groups, and skips a folded group', () => {
    const { container } = renderGrid()
    const numbers = () => [...container.querySelectorAll('tbody tr.nv-tr')].map((tr) => tr.firstElementChild?.textContent)

    expect(numbers()).toEqual(['1', '2', '3', '4', '5', '6'])
    expect(container.querySelector('tbody tr.nv-tr .nv-num')?.getAttribute('aria-hidden')).toBe('true')
    expect(container.querySelector('thead .nv-num')?.textContent).toBe('#')
    fireEvent.click(bands()[0])
    expect(numbers()).toEqual(['1', '2', '3'])
    expect(screen.getAllByRole('gridcell').some((c) => c.classList.contains('nv-num'))).toBe(false)
    fireEvent.click(bands()[0])
    expect(numbers()).toHaveLength(6)
  })

  it("hides the scoped column under a scope: every row would hold the same record", () => {
    renderGrid(calais, { scope: { field: 'location', id: 12 } })
    expect(headers()).not.toContain('location')
    cleanup()

    renderGrid()
    expect(headers()).toContain('location')
  })

  it('heads the bar with a tinted scope chip nobody removes, then the group; no sort chip; Kolommen an icon after the count', () => {
    const { container } = renderGrid(calais, { scope: { field: 'location', id: 12 }, scopeChip: 'Locatie is Le Grenier' })
    const chips = [...container.querySelectorAll('.nv-bar .nv-chip')]

    expect(chips.map((c) => c.textContent)).toEqual(['Locatie is Le Grenier', 'Groep: datum'])
    const end = container.querySelector<HTMLElement>('.nv-bar__end')!
    expect(end.querySelector('.nv-bar__count')?.textContent).toBe('6 rijen')
    const columnsButton = within(end).getByRole('button', { name: 'Kolommen' })
    expect(columnsButton.textContent).toBe('')
    expect(columnsButton.title).toBe('Kolommen')
    expect(chips[0].className).toContain('nv-chip--set')
    expect(chips[0].tagName).toBe('SPAN')
    expect(chips[0].querySelector('button')).toBeNull()
  })

  it('regroups from the group chip; the sort shows in its column header, in the accent', () => {
    renderGrid()
    fireEvent.click(screen.getByRole('button', { name: 'Groep: datum' }))
    fireEvent.click(within(screen.getByRole('group', { name: 'Groeperen' })).getByRole('button', { name: 'Soort' }))
    expect(saved?.group).toBe('kind')
    expect(screen.getByRole('button', { name: 'Groep: soort' }).className).toContain('nv-chip--set')

    const sorted = screen.getAllByRole('columnheader').filter((h) => h.classList.contains('nv-th--sorted')).map((h) => h.dataset.column)
    expect(sorted).toEqual(['date', 'start'])
  })

  it('shows the title where the view puts it', () => {
    renderGrid(calais, { layout: { ...defaults(planning), order: ['date', 'start', 'kind', 'title'] } })
    expect(headers().slice(0, 3)).toEqual(['start', 'kind', 'title'])
  })

  it('shows the label of a stored view in the sheet', () => {
    renderGrid()
    expect(within(screen.getAllByRole('columnheader')[0]).getByRole('button').textContent).toBe('Titel')
  })

  it('shows a select as its option label and a relation as the looked-up title', () => {
    renderGrid()

    expect(cell('Lunch bistrot', 'kind').textContent).toBe('Maaltijd')
    expect(cell('Lunch bistrot', 'location').textContent).toBe('Le Grenier, Calais')
    expect(cell('Lunch bistrot', 'location').getAttribute('aria-readonly')).toBeNull()
    expect(screen.getAllByRole('columnheader').map((h) => h.textContent).join()).not.toMatch(/Required|\*/)
  })

  it('marks a required cell only while it is empty', () => {
    renderGrid([{ ...calais[2], fields: { ...calais[2].fields, kind: '' } }])

    expect(within(cell('Lunch bistrot', 'kind')).getByText('Verplicht')).toBeTruthy()
    expect(within(cell('Lunch bistrot', 'status')).queryByText('Verplicht')).toBeNull()
    expect(within(cell('Lunch bistrot', 'place')).queryByText('Verplicht')).toBeNull()
  })

  it('hides the date column while the sections carry the day, and brings it back for another grouping', () => {
    renderGrid()
    expect(screen.queryByRole('columnheader', { name: /Datum/ })).toBeNull()

    cleanup()
    renderGrid(calais, { layout: { ...defaults(planning), group: 'kind' } })
    expect(screen.getByRole('columnheader', { name: /Datum/ })).toBeTruthy()
  })

  it('names the window when it is empty', () => {
    renderGrid([])

    expect(screen.getByText('Geen rijen in deze periode')).toBeTruthy()
    expect(screen.getByText('Week 21 · 18–24 mei')).toBeTruthy()
  })

  it('keeps the arrangement bar, an active filter chip with it, above an empty window (R10)', () => {
    renderGrid([], { filters: <button type="button">Productie: Calais ×</button> })

    expect(screen.getByRole('button', { name: 'Productie: Calais ×' })).toBeTruthy()
    expect(screen.getByText('Geen rijen in deze periode')).toBeTruthy()
  })

  it('renders a stored value with markup as its characters, never as an element (threat 8)', () => {
    const hostile = { ...calais[0], title: '<img src=x onerror=alert(1)>', fields: { ...calais[0].fields, place: '<b>bold</b>' } }
    const { container } = renderGrid([hostile])

    expect(screen.getByText('<img src=x onerror=alert(1)>')).toBeTruthy()
    expect(screen.getByText('<b>bold</b>')).toBeTruthy()
    expect(container.querySelector('img')).toBeNull()
    expect(container.querySelector('tbody b')).toBeNull()
  })

  it('finds rows by title from the search, and says so when none match', () => {
    renderGrid(calais, { query: 'lunch' })
    expect(screen.getAllByRole('row').filter((r) => r.dataset.title).map((r) => r.dataset.title)).toEqual(['Lunch bistrot'])

    cleanup()
    renderGrid(calais, { query: 'zzz' })
    expect(screen.getByText('Geen rijen voor deze zoekterm of filters')).toBeTruthy()
  })

  it('applies no condition itself: the server answered for them, and every row it sent shows', () => {
    renderGrid(calais, { layout: { ...defaults(planning), filters: [{ field: 'status', op: 'in', values: ['option'] }] } })

    expect(screen.getAllByRole('row').filter((r) => r.dataset.title)).toHaveLength(calais.length)
  })

  it('sorts on a header click and keeps it in the layout', () => {
    renderGrid(calais, { layout: { ...defaults(planning), group: null, sort: [] } })

    fireEvent.click(within(screen.getAllByRole('columnheader')[0]).getByRole('button'))

    expect(saved?.sort).toEqual([{ id: 'title', desc: false }])
    expect(screen.getAllByRole('row').filter((r) => r.dataset.title).map((r) => r.dataset.title)[0]).toBe('Auto Pavel + Sien')
    expect(screen.getAllByRole('row').filter((r) => r.dataset.title).map((r) => r.dataset.title)[1]).toBe('Diner door Rosalie')
  })

  it('sorts datetimes by when they are, not by their weekday text', () => {
    const when = { ...activity, fields: { ...activity.fields, date: { type: 'datetime' as const, label: 'Moment', required: true, fact: false } } }
    const monday = { ...calais[0], fields: { ...calais[0].fields, date: '2026-10-19T09:00' } }
    const friday = { ...calais[1], fields: { ...calais[1].fields, date: '2026-10-16T09:00' } }
    renderGrid([monday, friday], { model: when, layout: { ...defaults(planning), group: null, sort: [{ id: 'date', desc: false }] } })

    expect(screen.getAllByRole('row').filter((r) => r.dataset.title).map((r) => r.dataset.title)).toEqual([friday.title, monday.title])
  })
})

describe('editing', () => {
  it('typing in a cell and pressing Enter writes that one field', async () => {
    renderGrid()
    api.update.mockResolvedValue({ row: { ...calais[1], fields: { ...calais[1].fields, place: 'Zaal 2' } }, batch: 'b1' })

    const place = cell('Montage', 'place')
    fireEvent.click(place)
    type(place, 'Z')
    expect(editor().value).toBe('Z')
    fireEvent.change(editor(), { target: { value: 'Zaal 2' } })
    type(editor(), 'Enter')

    expect(api.update).toHaveBeenCalledWith('activity', 102, { place: 'Zaal 2' }, expect.objectContaining({ id: 102 }))
    expect(cell('Montage', 'place').textContent).toBe('Zaal 2')
    await act(async () => undefined)
  })

  it('shows a refusal on the cell and puts the old value back', async () => {
    renderGrid()
    api.update.mockRejectedValue({ code: 'title_required', message: 'A title is required.', data: { status: 422 } })

    const title = cell('Montage', 'title')
    fireEvent.doubleClick(title)
    expect(editor().value).toBe('Montage')
    fireEvent.change(editor(), { target: { value: '' } })
    await act(async () => {
      type(editor(), 'Enter')
    })

    const refused = cell('Montage', 'title')
    expect(within(refused).getByRole('alert').textContent).toContain('A title is required.')
    expect(refused.getAttribute('aria-invalid')).toBe('true')

    fireEvent.click(within(refused).getByRole('button', { name: 'Negeren' }))
    expect(within(cell('Montage', 'title')).queryByRole('alert')).toBeNull()
  })

  it('cancels on Escape without a write', () => {
    renderGrid()

    const place = cell('Montage', 'place')
    fireEvent.click(place)
    type(place, 'x')
    type(editor(), 'Escape')

    expect(api.update).not.toHaveBeenCalled()
    expect(cell('Montage', 'place').textContent).toBe('Grote zaal')
  })

  it('picks a select from its listbox by letter and Enter', async () => {
    renderGrid()
    api.update.mockResolvedValue({ row: { ...calais[2], fields: { ...calais[2].fields, kind: 'show' } }, batch: 'b1' })

    const kind = cell('Lunch bistrot', 'kind')
    fireEvent.click(kind)
    type(kind, 'v')
    const listbox = screen.getByRole('listbox', { name: 'Soort' })
    expect(within(listbox).getByRole('option', { selected: true }).textContent).toBe('Voorstelling')
    await act(async () => {
      type(listbox, 'Enter')
    })

    expect(api.update).toHaveBeenCalledWith('activity', 103, { kind: 'show' }, expect.objectContaining({ id: 103 }))
    expect(cell('Lunch bistrot', 'kind').textContent).toBe('Voorstelling')
  })

  it('reads a typed time the way a hand types it', async () => {
    renderGrid()
    api.update.mockResolvedValue({ row: calais[1], batch: 'b1' })

    const start = cell('Montage', 'start')
    fireEvent.click(start)
    type(start, '9')
    typeKeys('30')
    await act(async () => {
      type(editor(), 'Tab')
    })

    expect(api.update).toHaveBeenCalledWith('activity', 102, { start: '09:30' }, expect.objectContaining({ id: 102 }))
  })

  it('empties an optional field on Delete and leaves a required one', async () => {
    renderGrid()
    api.update.mockResolvedValue({ row: calais[1], batch: 'b1' })

    fireEvent.click(cell('Montage', 'kind'))
    type(cell('Montage', 'kind'), 'Delete')
    expect(api.update).not.toHaveBeenCalled()

    fireEvent.click(cell('Montage', 'place'))
    await act(async () => {
      type(cell('Montage', 'place'), 'Delete')
    })
    expect(api.update).toHaveBeenCalledWith('activity', 102, { place: '' }, expect.objectContaining({ id: 102 }))
  })

  it('undoes the last write on Ctrl+Z by its batch on the server, and repaints the row it reads back', async () => {
    renderGrid()
    api.update.mockImplementation(async (_m, id, data) => ({ row: { ...calais.find((r) => r.id === id)!, fields: { ...calais.find((r) => r.id === id)!.fields, ...data } }, batch: `b${id}` }))

    api.undo.mockResolvedValueOnce('u1')
    api.read.mockResolvedValueOnce(calais[1])

    fireEvent.click(cell('Montage', 'place'))
    await act(async () => {
      type(cell('Montage', 'place'), 'Delete')
    })
    await act(async () => {
      type(cell('Montage', 'place'), 'z', { ctrlKey: true })
    })

    expect(api.undo).toHaveBeenCalledExactlyOnceWith('b102')
    expect(api.update).toHaveBeenCalledTimes(1)
    expect(cell('Montage', 'place').textContent).toBe('Grote zaal')
  })

  // Sorted on a text column within the day, so a typed value re-sorts the rows.
  const byPlace = { ...defaults(planning), sort: [{ id: 'date', desc: false }, { id: 'place', desc: false }] }

  it('follows the record, not the position, when a commit re-sorts the rows', async () => {
    renderGrid(calais, { layout: byPlace })
    api.update.mockImplementation(async (_m, id, data) => ({ row: { ...calais.find((r) => r.id === id)!, fields: { ...calais.find((r) => r.id === id)!.fields, ...data } }, batch: `b${id}` }))

    fireEvent.click(cell('Montage', 'place'))
    type(cell('Montage', 'place'), 'Z')
    fireEvent.change(editor(), { target: { value: 'Zolder' } })
    await act(async () => {
      type(editor(), 'Enter')
    })

    expect(api.update).toHaveBeenLastCalledWith('activity', 102, { place: 'Zolder' }, expect.objectContaining({ id: 102 }))
    const titles = screen.getAllByRole('row').filter((r) => r.dataset.title).map((r) => r.dataset.title)
    expect(titles.indexOf('Montage')).toBeGreaterThan(titles.indexOf('Lunch bistrot'))
    expect(document.activeElement).toBe(cell('Lunch bistrot', 'place'))

    type(document.activeElement as HTMLElement, 'Z')
    fireEvent.change(editor(), { target: { value: 'Zaal 2' } })
    await act(async () => {
      type(editor(), 'Enter')
    })
    expect(api.update).toHaveBeenLastCalledWith('activity', 103, { place: 'Zaal 2' }, expect.objectContaining({ id: 103 }))
  })

  it('commits an open editor to its own record when a server answer re-sorts underneath it', async () => {
    renderGrid(calais, { layout: byPlace })
    let answer!: (saved: Saved) => void
    api.update.mockReturnValueOnce(new Promise<Saved>((resolve) => (answer = resolve))).mockResolvedValue({ row: calais[2], batch: 'b1' })

    fireEvent.click(cell('Montage', 'place'))
    type(cell('Montage', 'place'), 'Z')
    fireEvent.change(editor(), { target: { value: 'Zolder' } })
    type(editor(), 'Enter')
    fireEvent.click(cell('Auto Pavel + Sien', 'place'))
    type(cell('Auto Pavel + Sien', 'place'), 'X')
    await act(async () => answer({ row: { ...calais[1], fields: { ...calais[1].fields, place: 'Aula' } }, batch: 'b1' }))
    expect(screen.getAllByRole('row').filter((r) => r.dataset.title)[0].dataset.title).toBe('Montage')
    fireEvent.change(editor(), { target: { value: 'Xavier' } })
    await act(async () => {
      type(editor(), 'Enter')
    })

    expect(api.update).toHaveBeenLastCalledWith('activity', 101, { place: 'Xavier' }, expect.objectContaining({ id: 101 }))
  })

  it('leaves Enter on a header to its sort button once a cell was active', () => {
    renderGrid(calais, { layout: { ...defaults(planning), group: null, sort: [] } })

    fireEvent.click(cell('Montage', 'place'))
    const sortTitle = within(screen.getAllByRole('columnheader')[0]).getByRole('button')
    expect(fireEvent.keyDown(sortTitle, { key: 'Enter' })).toBe(true)
    expect(screen.queryByRole('textbox')).toBeNull()
  })

  it('lets Cmd/Ctrl+K through a focused header button and keeps Open buttons out of the Tab order but the active row', () => {
    renderGrid()
    const seen = vi.fn()
    document.addEventListener('keydown', seen)

    fireEvent.keyDown(within(screen.getAllByRole('columnheader')[0]).getByRole('button'), { key: 'k', metaKey: true })
    document.removeEventListener('keydown', seen)
    expect(seen).toHaveBeenCalled()

    fireEvent.click(cell('Montage', 'place'))
    const opens = screen.getAllByRole('button', { name: 'Openen' })
    expect(opens.filter((b) => b.tabIndex === 0).map((b) => b.closest('tr')?.dataset.title)).toEqual(['Montage'])
  })

  it('leaves keys on a header button and on Open out of the cells, and lets Cmd/Ctrl+K through both', () => {
    renderGrid(calais, { layout: { ...defaults(planning), group: null, sort: [] } })
    api.update.mockResolvedValue({ row: calais[1], batch: 'b1' })
    fireEvent.click(cell('Montage', 'place'))
    const sortTitle = within(screen.getAllByRole('columnheader')[0]).getByRole('button')

    sortTitle.focus()
    fireEvent.keyDown(sortTitle, { key: 'Delete' })
    fireEvent.keyDown(sortTitle, { key: 'q' })
    expect(api.update).not.toHaveBeenCalled()
    expect(screen.queryByRole('textbox')).toBeNull()

    const open = within(cell('Montage', 'title')).getByRole('button', { name: 'Openen' })
    expect(fireEvent.keyDown(open, { key: 'Enter' })).toBe(true)
    expect(screen.queryByRole('textbox')).toBeNull()

    const seen = vi.fn()
    document.addEventListener('keydown', seen)
    fireEvent.keyDown(sortTitle, { key: 'k', ctrlKey: true })
    fireEvent.keyDown(open, { key: 'k', metaKey: true })
    document.removeEventListener('keydown', seen)
    expect(seen).toHaveBeenCalledTimes(2)
  })

  it('moves a column from the Columns menu with words', () => {
    renderGrid()

    fireEvent.click(screen.getByRole('button', { name: 'Kolommen' }))
    fireEvent.click(screen.getByRole('button', { name: 'Start: naar rechts' }))

    expect(headers().slice(0, 3)).toEqual(['title', 'end', 'start'])
    expect(saved?.order.slice(0, 4)).toEqual(['title', 'date', 'end', 'start'])
  })

  it('moves with the arrows, without a mouse', () => {
    renderGrid()

    fireEvent.click(cell('Montage', 'start'))
    type(document.activeElement as HTMLElement, 'ArrowRight')
    type(document.activeElement as HTMLElement, 'ArrowDown')

    expect(document.activeElement).toBe(cell('Lunch bistrot', 'end'))
    expect(document.activeElement?.getAttribute('aria-selected')).toBe('true')
  })

  it('copies the shown value and pastes one cell', async () => {
    renderGrid()
    api.update.mockResolvedValue({ row: calais[1], batch: 'b1' })
    const data = new Map<string, string>()
    const clipboardData = { setData: (k: string, v: string) => data.set(k, v), getData: (k: string) => data.get(k) ?? '' }

    fireEvent.click(cell('Lunch bistrot', 'kind'))
    fireEvent.copy(cell('Lunch bistrot', 'kind'), { clipboardData })
    expect(data.get('text/plain')).toBe('Maaltijd')

    fireEvent.click(cell('Montage', 'kind'))
    await act(async () => {
      fireEvent.paste(cell('Montage', 'kind'), { clipboardData })
    })
    expect(api.update).toHaveBeenCalledWith('activity', 102, { kind: 'meal' }, expect.objectContaining({ id: 102 }))
  })

  it('opens a new row with its title in edit and creates it on Enter', async () => {
    const { store } = renderGrid()
    api.create.mockResolvedValue({ row: { ...calais[0], id: 200, title: 'Soundcheck' }, batch: 'b1' })

    act(() => store.draft({ date: '2026-05-19', kind: 'travel', status: 'confirmed' }))

    expect(editor().getAttribute('aria-label')).toBe('Titel')
    fireEvent.change(editor(), { target: { value: 'Soundcheck' } })
    await act(async () => {
      type(editor(), 'Enter')
    })

    expect(api.create).toHaveBeenCalledWith('activity', { date: '2026-05-19', kind: 'travel', status: 'confirmed', title: 'Soundcheck' })
  })
})

describe('the group bands', () => {
  const declared: View = {
    ...planning,
    facts: [
      { kind: 'first', column: 'start', where: { kind: 'show' }, label: 'avondshow' },
      { kind: 'count', where: { kind: 'meal' }, label: 'maaltijd' },
    ],
  }
  afterEach(() => window.localStorage.clear())

  it('carry a chevron, the label, a count badge, the declared facts and the totals', () => {
    renderGrid(calais, { view: declared })

    const tuesday = band('Dinsdag 19 mei')
    expect(tuesday.querySelector('.nv-group__chevron')).toBeTruthy()
    expect(tuesday.querySelector('.nv-group__count')?.textContent).toBe('2')
    expect([...tuesday.querySelectorAll('.nv-group__fact')].map((f) => f.textContent)).toEqual(['● avondshow 16:30'])
    expect([...band('Maandag 18 mei').querySelectorAll('.nv-group__fact')].map((f) => f.textContent)).toEqual(['1 maaltijd'])
    expect(tuesday.querySelector('.nv-group__totals')?.textContent).toContain('24')
  })

  it('shows … for each fact of the group the read limit may have cut short', () => {
    renderGrid(calais, { view: declared, cut: calais[5] })

    expect([...band('Woensdag 20 mei').querySelectorAll('.nv-group__fact')].map((f) => f.textContent)).toEqual(['● avondshow …', '… maaltijd'])
    expect([...band('Dinsdag 19 mei').querySelectorAll('.nv-group__fact')].map((f) => f.textContent)).toEqual(['● avondshow 16:30'])
  })

  it('marks the count and the totals of the group the read limit may have cut short, and the summary', () => {
    const onShown = vi.fn()
    renderGrid(calais, { view: declared, cut: calais[5], onShown })

    const wednesday = band('Woensdag 20 mei')
    expect(wednesday.querySelector('.nv-group__count')?.textContent).toBe('1+')
    expect(wednesday.querySelector('.nv-group__totals')?.textContent).not.toMatch(/\d/)
    expect(wednesday.querySelector('.nv-group__totals')?.textContent).toContain('…')
    expect(band('Dinsdag 19 mei').querySelector('.nv-group__count')?.textContent).toBe('2')
    expect(band('Dinsdag 19 mei').querySelector('.nv-group__totals')?.textContent).toContain('24')
    expect(onShown).toHaveBeenLastCalledWith({ rows: 6, groups: 3, cut: true })
  })

  it('says N+ rijen in the bar and the foot when the read limit cut the rows', () => {
    renderGrid(calais, { view: declared, cut: calais[5] })

    expect(document.querySelector('.nv-bar__count')?.textContent).toBe('6+ rijen')
    expect(screen.getByTestId('total').textContent).toContain('Totaal · 6+ rijen')
  })

  it('keeps … on the group the last loaded row was in while the search hides that row', () => {
    const koffie: Row = { ...calais[5], id: 107, title: 'Ochtendkoffie', fields: { ...calais[5].fields, kind: 'travel' } }
    renderGrid([...calais, koffie], { view: declared, cut: calais[5], query: 'koffie' })

    expect([...band('Woensdag 20 mei').querySelectorAll('.nv-group__fact')].map((f) => f.textContent)).toEqual(['● avondshow …', '… maaltijd'])
  })

  it('fold on a click, and open on Enter, aria-expanded following', () => {
    renderGrid()

    expect(band('Dinsdag 19 mei').getAttribute('aria-expanded')).toBe('true')
    fireEvent.click(band('Dinsdag 19 mei'))
    expect(band('Dinsdag 19 mei').getAttribute('aria-expanded')).toBe('false')
    expect(titled()).not.toContain('Présentation interne')

    type(band('Dinsdag 19 mei'), 'Enter')
    expect(band('Dinsdag 19 mei').getAttribute('aria-expanded')).toBe('true')
    expect(titled()).toContain('Présentation interne')

    type(band('Dinsdag 19 mei'), ' ')
    expect(band('Dinsdag 19 mei').getAttribute('aria-expanded')).toBe('false')
  })

  it('keep the count, totals and summary of folded rows', () => {
    const onShown = vi.fn()
    renderGrid(calais, { onShown })

    fireEvent.click(band('Dinsdag 19 mei'))

    expect(band('Dinsdag 19 mei').querySelector('.nv-group__count')?.textContent).toBe('2')
    expect(band('Dinsdag 19 mei').querySelector('.nv-group__totals')?.textContent).toContain('24')
    const total = screen.getByTestId('total')
    expect(total.textContent).toContain('Totaal · 6 rijen')
    expect(within(total).getByText('47')).toBeTruthy()
    expect(onShown).toHaveBeenLastCalledWith({ rows: 6, groups: 3, cut: false })
  })

  it('leave folded rows out of keyboard movement', () => {
    renderGrid()

    fireEvent.click(band('Dinsdag 19 mei'))
    fireEvent.click(cell('Montage', 'start'))
    type(document.activeElement as HTMLElement, 'ArrowDown')
    type(document.activeElement as HTMLElement, 'ArrowDown')

    expect(document.activeElement).toBe(cell('Diner door Rosalie', 'start'))
  })

  it("never fold the draft's group", () => {
    const { store } = renderGrid()

    fireEvent.click(band('Dinsdag 19 mei'))
    act(() => store.draft({ date: '2026-05-19', kind: 'travel', status: 'confirmed' }))

    expect(band('Dinsdag 19 mei').getAttribute('aria-expanded')).toBe('true')
    expect(screen.getAllByRole('row').some((r) => r.classList.contains('nv-tr--draft'))).toBe(true)
    expect(titled()).toContain('Présentation interne')
  })

  it('stay folded in this browser, per view', () => {
    renderGrid()
    fireEvent.click(band('Dinsdag 19 mei'))
    cleanup()

    renderGrid()
    expect(band('Dinsdag 19 mei').getAttribute('aria-expanded')).toBe('false')
    cleanup()

    renderGrid(calais, { view: { ...planning, key: 'other' } })
    expect(band('Dinsdag 19 mei').getAttribute('aria-expanded')).toBe('true')
  })
})

describe('the drawer', () => {
  it("shows one row's every field, the long ones too, and closes", () => {
    const noted = { ...calais[2], fields: { ...calais[2].fields, notes: 'Twee veggie\nEén glutenvrij' } }
    renderGrid([noted])

    fireEvent.click(within(cell('Lunch bistrot', 'title')).getByRole('button', { name: 'Openen' }))

    const drawer = screen.getByRole('complementary', { name: 'Lunch bistrot' })
    expect(within(drawer).getByText('Notities')).toBeTruthy()
    expect(within(drawer).getByText(/Twee veggie/).textContent).toBe('Twee veggie\nEén glutenvrij')
    fireEvent.click(within(drawer).getByRole('button', { name: 'Sluiten' }))
    expect(screen.queryByRole('complementary')).toBeNull()
  })

  const openDrawer = (title: string) => {
    fireEvent.click(within(cell(title, 'title')).getByRole('button', { name: 'Openen' }))
    return screen.getByRole('complementary', { name: title })
  }
  const deletable: Model = { ...activity, deletable: true }

  it('offers Verwijderen only for a deletable model', () => {
    renderGrid()
    expect(within(openDrawer('Lunch bistrot')).queryByRole('button', { name: 'Verwijderen' })).toBeNull()
    cleanup()

    renderGrid(calais, { model: deletable })
    expect(within(openDrawer('Lunch bistrot')).getByRole('button', { name: 'Verwijderen' })).toBeTruthy()
  })

  it('asks Zeker? on the first press and sends nothing; the second press deletes and the row leaves', async () => {
    renderGrid(calais, { model: deletable })
    api.remove.mockResolvedValueOnce({ id: 103 })
    const drawer = openDrawer('Lunch bistrot')

    fireEvent.click(within(drawer).getByRole('button', { name: 'Verwijderen' }))
    expect(api.remove).not.toHaveBeenCalled()

    await act(async () => {
      fireEvent.click(within(drawer).getByRole('button', { name: 'Zeker?' }))
    })
    expect(api.remove).toHaveBeenCalledWith('activity', 103)
    expect(screen.queryByRole('complementary')).toBeNull()
    expect(screen.getAllByRole('row').some((r) => r.dataset.title === 'Lunch bistrot')).toBe(false)
  })

  it('leaving the drawer resets Zeker? to Verwijderen', () => {
    renderGrid(calais, { model: deletable })
    fireEvent.click(within(openDrawer('Lunch bistrot')).getByRole('button', { name: 'Verwijderen' }))
    fireEvent.click(screen.getByRole('button', { name: 'Sluiten' }))

    const again = openDrawer('Lunch bistrot')
    expect(within(again).getByRole('button', { name: 'Verwijderen' })).toBeTruthy()
    expect(within(again).queryByRole('button', { name: 'Zeker?' })).toBeNull()

    fireEvent.click(within(again).getByRole('button', { name: 'Verwijderen' }))
    const other = openDrawer('Montage')
    expect(within(other).getByRole('button', { name: 'Verwijderen' })).toBeTruthy()
    expect(api.remove).not.toHaveBeenCalled()
  })

  it('a double click does not confirm: Zeker? is armed only by a fresh press', async () => {
    renderGrid(calais, { model: deletable })
    const drawer = openDrawer('Lunch bistrot')

    fireEvent.click(within(drawer).getByRole('button', { name: 'Verwijderen' }), { detail: 1 })
    fireEvent.click(within(drawer).getByRole('button', { name: 'Zeker?' }), { detail: 2 })
    expect(api.remove).not.toHaveBeenCalled()

    api.remove.mockResolvedValueOnce({ id: 103 })
    await act(async () => {
      fireEvent.click(within(drawer).getByRole('button', { name: 'Zeker?' }), { detail: 1 })
    })
    expect(api.remove).toHaveBeenCalledTimes(1)
  })

  it('sends one DELETE however often Zeker? is pressed while it is in flight, and announces the swap', async () => {
    renderGrid(calais, { model: deletable })
    api.remove.mockReturnValueOnce(new Promise(() => undefined))
    const drawer = openDrawer('Lunch bistrot')

    const button = within(drawer).getByRole('button', { name: 'Verwijderen' })
    expect(button.closest('[aria-live="polite"]')).not.toBeNull()
    fireEvent.click(button)
    await act(async () => {
      fireEvent.click(within(drawer).getByRole('button', { name: 'Zeker?' }))
    })
    fireEvent.click(within(drawer).getByRole('button', { name: 'Zeker?' }))
    fireEvent.click(within(drawer).getByRole('button', { name: 'Zeker?' }))

    expect(api.remove).toHaveBeenCalledTimes(1)
  })

  it('keeps the row and its drawer when the delete is refused', async () => {
    const { store } = renderGrid(calais, { model: deletable })
    api.remove.mockRejectedValueOnce({ code: 'in_use', message: 'Still referenced', by: [{ label: 'Toewijzingen', count: 2 }] })
    const drawer = openDrawer('Lunch bistrot')

    fireEvent.click(within(drawer).getByRole('button', { name: 'Verwijderen' }))
    await act(async () => {
      fireEvent.click(within(drawer).getByRole('button', { name: 'Zeker?' }))
    })

    expect(screen.getByRole('complementary', { name: 'Lunch bistrot' })).toBeTruthy()
    expect(store.getState().error?.message).toBe('Nog in gebruik door Toewijzingen (2).')
  })
})

describe('the toolbar over the grid', () => {
  const toolbar = () => screen.getByRole('banner')
  const bar = () => document.querySelector<HTMLElement>('.nv-bar')!
/** Through the builder: Filter, a new condition, its field, then a value from its list. */
async function addCondition(field: string, value: string) {
  fireEvent.click(within(bar()).getByRole('button', { name: /^Filter\s*\d*$/ }))
  fireEvent.click(screen.getByRole('button', { name: 'Voorwaarde toevoegen' }))
  await screen.findAllByRole('group', { name: /^Voorwaarde/ })
  const last = () => screen.getAllByRole('group', { name: /^Voorwaarde/ }).at(-1) as HTMLElement
  fireEvent.click(within(last()).getByRole('button', { name: /^Veld:/ }))
  fireEvent.click(within(within(last()).getByRole('listbox', { name: 'Veld' })).getByRole('option', { name: field }))
  fireEvent.focus(await within(last()).findByRole('searchbox', { name: `${field} zoeken` }))
  fireEvent.click(within(within(last()).getByRole('listbox')).getByRole('option', { name: value }))
}
  const visibleText = (el: Element) => {
    const copy = el.cloneNode(true) as Element
    copy.querySelectorAll('.nv-sr').forEach((sr) => sr.remove())
    return copy.textContent?.trim() ?? ''
  }

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date(2026, 4, 19, 10, 0))
    remote.schema.mockResolvedValue(schema)
    remote.rows.mockResolvedValue({ rows: calais, total: calais.length })
    remote.records.mockResolvedValue({ rows: [], total: 0 })
    try {
      window.localStorage.clear()
    } catch {
      // jsdom without storage: the layout starts from the defaults anyway
    }
  })
  afterEach(() => {
    vi.useRealTimers()
    vi.resetAllMocks()
    setStrings(undefined)
    window.location.hash = ''
  })

  it('labels every toolbar and bar control with a visible word, or an icon that says its word on hover (the ⋯, the week steps, a chip\'s ×)', async () => {
    render(<App />)
    await screen.findByText('18 mei')
    await addCondition('Status', 'Optie')
    // A chip asks the server again: the grid comes back once the rows do.
    await screen.findByRole('grid')
    expect(within(bar()).getByRole('button', { name: 'Filter Status wissen' })).toBeTruthy()
    const said = (control: HTMLElement) => {
      const title = control.getAttribute('title')
      return visibleText(control).match(/\p{L}/u) !== null || (title !== null && title === control.getAttribute('aria-label'))
    }
    expect(said(Object.assign(document.createElement('button'), { textContent: '×' })), 'a bare icon button says nothing').toBe(false)
    for (const control of within(bar()).getAllByRole('button')) {
      expect(said(control), control.outerHTML).toBe(true)
    }

    // The one icon button, ⋯ (Stefan, 2026-10-03: menus when it gets crowded), says its word on hover.
    const more = within(toolbar()).getByRole('button', { name: 'More actions' })
    expect(more.getAttribute('title')).toBe('Meer acties')
    const controls = within(toolbar()).getAllByRole('button').filter((control) => control !== more)
    expect(controls.length).toBeGreaterThan(0)
    for (const control of controls) {
      expect(said(control), control.outerHTML).toBe(true)
    }
    expect(within(toolbar()).getByRole('searchbox', { name: 'Zoeken' }).getAttribute('placeholder')).toBe('Zoeken')
    expect(within(toolbar()).queryByRole('button', { name: 'Volgende periode' })).toBeNull()
    expect(within(toolbar()).queryByRole('status')).toBeNull()
  })

  it('shows a refused delete in the toolbar as the Dutch in-use sentence', async () => {
    remote.schema.mockResolvedValue({ ...schema, models: { activity: { ...schema.models.activity, deletable: true } } })
    remote.remove.mockRejectedValueOnce({ code: 'in_use', message: 'Still referenced by Toewijzingen (2)', by: [{ label: 'Toewijzingen', count: 2 }, { label: 'Personen', count: 1 }] })
    render(<App />)
    await screen.findByText('18 mei')

    fireEvent.click(within(cell('Lunch bistrot', 'title')).getByRole('button', { name: 'Openen' }))
    const drawer = screen.getByRole('complementary', { name: 'Lunch bistrot' })
    fireEvent.click(within(drawer).getByRole('button', { name: 'Verwijderen' }))
    await act(async () => {
      fireEvent.click(within(drawer).getByRole('button', { name: 'Zeker?' }))
    })

    // The drawer's own header is a banner too: the toolbar is found by its class.
    expect(within(document.querySelector<HTMLElement>('.nv-toolbar')!).getByRole('status').textContent).toContain('Nog in gebruik door Toewijzingen (2) en Personen (1).')
    expect(screen.getAllByRole('row').some((r) => r.dataset.title === 'Lunch bistrot')).toBe(true)
  })

  it('says a refusal in the site\'s words when it has them, as text', async () => {
    remote.schema.mockResolvedValue({ ...schema, strings: { 'error.title_required': 'Een activiteit heeft een <b>naam</b> nodig' } })
    remote.update.mockRejectedValueOnce({ code: 'title_required', message: 'A title is required.' })
    render(<App />)
    await screen.findByText('18 mei')

    fireEvent.doubleClick(cell('Montage', 'title'))
    fireEvent.change(editor(), { target: { value: '' } })
    await act(async () => {
      type(editor(), 'Enter')
    })

    expect(within(toolbar()).getByRole('status').textContent).toBe('Niet opgeslagen: Een activiteit heeft een <b>naam</b> nodig')
    expect(within(cell('Montage', 'title')).getByRole('alert').textContent).toContain('Een activiteit heeft een <b>naam</b> nodig')
    expect(document.querySelector('.nv-td b')).toBeNull()
  })

  it('a click away from an empty new title sends nothing', async () => {
    render(<App />)
    await screen.findByText('18 mei')

    fireEvent.click(within(toolbar()).getByRole('button', { name: 'Nieuw Activiteit' }))
    await act(async () => {
      fireEvent.blur(editor())
    })

    expect(remote.create).not.toHaveBeenCalled()
    const draft = screen.getAllByRole('row').find((r) => r.classList.contains('nv-tr--draft'))!
    expect(within(within(draft).getAllByRole('gridcell')[0]).getByText('Verplicht')).toBeTruthy()
  })

  it('keeps a refusal whole in the DOM however narrow the toolbar', async () => {
    const long = 'Deze persoon staat al op deze activiteit en kan er geen tweede keer op'
    remote.update.mockRejectedValueOnce({ code: 'duplicate_assignment', message: long })
    render(<App />)
    await screen.findByText('18 mei')

    fireEvent.click(cell('Montage', 'place'))
    await act(async () => {
      type(cell('Montage', 'place'), 'Delete')
    })

    const status = within(toolbar()).getByRole('status')
    expect(status.textContent).toBe(`Niet opgeslagen: ${long}`)
    expect(status.getAttribute('title')).toBe(long)
  })

  it('is one row of title, search and + New, with no theme or undo in it; the chips sit in the bar beneath (Stefan, 2026-10-03)', async () => {
    render(<App />)
    await screen.findByText('18 mei')

    expect(within(toolbar()).getByRole('heading', { level: 1, name: 'Planning' })).toBeTruthy()
    expect(screen.queryByRole('group', { name: 'Periode' })).toBeNull()
    expect(within(toolbar()).queryByRole('button', { name: 'Filter' })).toBeNull()
    expect(within(bar()).getAllByRole('button').map((b) => b.getAttribute('aria-label') ?? b.textContent)).toEqual(['Groep: datum', 'Filter', 'Kolommen'])
    expect(within(toolbar()).getByRole('searchbox', { name: 'Zoeken' })).toBeTruthy()
    expect(within(toolbar()).getByRole('button', { name: 'Nieuw Activiteit' })).toBeTruthy()
    expect(within(toolbar()).queryByRole('button', { name: /Theme|Undo|Redo/ })).toBeNull()
    expect(screen.queryByRole('status', { name: 'Gewijzigd' })).toBeNull()
  })

  it('offers undo in a toast after a change', async () => {
    remote.update.mockResolvedValueOnce({ row: { ...calais[1], fields: { ...calais[1].fields, place: '' } }, batch: 'b1' })
    render(<App />)
    await screen.findByText('18 mei')

    fireEvent.click(cell('Montage', 'place'))
    await act(async () => {
      type(cell('Montage', 'place'), 'Delete')
    })

    const toast = screen.getByRole('status', { name: 'Gewijzigd' })
    expect(toast.textContent).toContain('⌘Z')
    remote.undoBatch.mockResolvedValueOnce('u1')
    remote.rowOf.mockResolvedValueOnce(calais[1])
    await act(async () => {
      fireEvent.click(within(toast).getByRole('button', { name: 'Ongedaan maken' }))
    })
    expect(remote.undoBatch).toHaveBeenLastCalledWith('b1')
    expect(remote.rowOf).toHaveBeenLastCalledWith('activity', 102)
    expect(cell('Montage', 'place').textContent).toBe('Grote zaal')
  })

  it('keeps an edited cell and its undo through a save of a saved view', async () => {
    const empty = { hidden: [], order: [], widths: [], sort: [], filters: [], group: null, picked: [] }
    const mine: SavedView = { ...schema.views[0], key: '42', id: 42, label: 'Calais techniek', starting: false, arrangement: empty,
      shared: false, owner: { id: 1, name: 'Hester' }, mine: true, editable: true, public: true }
    window.location.hash = '#view=42'
    window.localStorage.setItem('ntdst-views/layout/v2/42', JSON.stringify({ hidden: ['kind'], order: [], widths: {}, sort: [], filters: [], group: 'date' }))
    remote.savedViews.mockResolvedValue([mine])
    remote.updateView.mockResolvedValue({ ...mine, arrangement: { ...empty, hidden: ['kind'], group: 'date' } })
    remote.update.mockResolvedValueOnce({ row: { ...calais[1], fields: { ...calais[1].fields, place: '' } }, batch: 'b1' })
    render(<App />)
    await screen.findByText('18 mei')
    fireEvent.click(cell('Montage', 'place'))
    await act(async () => {
      type(cell('Montage', 'place'), 'Delete')
    })

    fireEvent.click(within(toolbar()).getByRole('button', { name: 'More actions' }))
    await act(async () => {
      fireEvent.click(screen.getByRole('menuitem', { name: 'Publieke weergave bijwerken' }))
    })

    expect(remote.updateView).toHaveBeenCalled()
    expect(window.localStorage.getItem('ntdst-views/layout/v2/42')).toBeNull()
    expect(cell('Montage', 'place').textContent).toBe('')
    remote.undoBatch.mockResolvedValueOnce('u1')
    remote.rowOf.mockResolvedValueOnce(calais[1])
    await act(async () => {
      type(cell('Montage', 'place'), 'z', { ctrlKey: true })
    })
    expect(remote.undoBatch).toHaveBeenLastCalledWith('b1')
    expect(remote.rowOf).toHaveBeenLastCalledWith('activity', 102)
    expect(cell('Montage', 'place').textContent).toBe('Grote zaal')
    expect(remote.rows).toHaveBeenCalledTimes(1)
  })

  it('adds a condition through the builder, shows it as a chip, and removes it with its ×', async () => {
    render(<App />)
    await screen.findByText('18 mei')

    await addCondition('Status', 'Optie')
    await screen.findByRole('grid')

    expect(remote.rows).toHaveBeenLastCalledWith(expect.anything(), expect.anything(), null, expect.objectContaining({ filters: [{ field: 'status', op: 'in', values: ['option'] }] }))
    expect(within(bar()).getByText('Status is Optie')).toBeTruthy()

    fireEvent.click(within(bar()).getByRole('button', { name: 'Filter Status wissen' }))
    await screen.findByRole('grid')
    expect(remote.rows).toHaveBeenLastCalledWith(expect.anything(), expect.anything(), null, expect.objectContaining({ filters: [] }))
  })

  it('says nothing while a cell saves and once it saved; Not saved with the message on a refusal; and Undo with a word', async () => {
    let answer!: (saved: Saved) => void
    remote.update.mockReturnValueOnce(new Promise<Saved>((resolve) => (answer = resolve)))
    render(<App />)
    await screen.findByText('18 mei')

    fireEvent.click(cell('Montage', 'place'))
    type(cell('Montage', 'place'), 'Delete')
    expect(within(toolbar()).queryByRole('status')).toBeNull()

    await act(async () => answer({ row: { ...calais[1], fields: { ...calais[1].fields, place: '' } }, batch: 'b1' }))
    expect(within(toolbar()).queryByRole('status')).toBeNull()

    remote.update.mockRejectedValueOnce({ code: 'title_required', message: 'A title is required.' })
    fireEvent.doubleClick(cell('Montage', 'title'))
    fireEvent.change(editor(), { target: { value: '' } })
    await act(async () => {
      type(editor(), 'Enter')
    })
    expect(within(toolbar()).getByRole('status').textContent).toBe('Niet opgeslagen: A title is required.')

    remote.undoBatch.mockResolvedValueOnce('u1')
    remote.rowOf.mockResolvedValueOnce(calais[1])
    await act(async () => {
      fireEvent.click(within(screen.getByRole('status', { name: 'Gewijzigd' })).getByRole('button', { name: 'Ongedaan maken' }))
    })
    expect(remote.undoBatch).toHaveBeenLastCalledWith('b1')
    expect(remote.rowOf).toHaveBeenLastCalledWith('activity', 102)
    expect(cell('Montage', 'place').textContent).toBe('Grote zaal')
  })

  it("+ New opens a row at the top of today's group with its title in edit", async () => {
    render(<App />)
    await screen.findByText('18 mei')

    fireEvent.click(within(toolbar()).getByRole('button', { name: 'Nieuw Activiteit' }))

    const tuesday = screen.getAllByRole('row')
    const header = tuesday.findIndex((r) => r.querySelector('.nv-group__label')?.textContent === 'Dinsdag 19 mei')
    expect(tuesday[header + 1].classList.contains('nv-tr--draft')).toBe(true)
    expect(editor().getAttribute('aria-label')).toBe('Titel')
  })

  it('keeps focus in the search while the rows it filters move under the active cell', async () => {
    render(<App />)
    await screen.findByText('18 mei')

    fireEvent.click(cell('Lunch bistrot', 'kind'))
    fireEvent.keyDown(cell('Lunch bistrot', 'kind'), { key: 'Delete' })
    const search = within(toolbar()).getByRole('searchbox', { name: 'Zoeken' })
    search.focus()
    fireEvent.change(search, { target: { value: 'lu' } })

    expect(screen.getAllByRole('row').filter((r) => r.dataset.title).map((r) => r.dataset.title)).toEqual(['Lunch bistrot'])
    expect(document.activeElement).toBe(search)
  })

  it('commits an open editor when focus leaves for the search, and leaves focus there', async () => {
    remote.update.mockResolvedValue({ row: { ...calais[2], fields: { ...calais[2].fields, place: 'x' } }, batch: 'b1' })
    render(<App />)
    await screen.findByText('18 mei')

    fireEvent.click(cell('Lunch bistrot', 'place'))
    fireEvent.keyDown(cell('Lunch bistrot', 'place'), { key: 'x' })
    const search = within(toolbar()).getByRole('searchbox', { name: 'Zoeken' })
    await act(async () => {
      search.focus()
    })

    expect(remote.update).toHaveBeenCalledWith('activity', 103, { place: 'x' }, expect.objectContaining({ id: 103 }))
    expect(document.activeElement).toBe(search)
  })

  it('jumps to a view from the search', async () => {
    render(<App />)
    await screen.findByText('18 mei')

    fireEvent.change(within(toolbar()).getByRole('searchbox', { name: 'Zoeken' }), { target: { value: 'afwez' } })
    fireEvent.click(within(toolbar()).getByRole('button', { name: 'Naar Afwezigheden' }))

    expect(screen.getByRole('heading', { level: 1, name: 'Afwezigheden' })).toBeTruthy()
  })
})

describe('a new row the writer refuses', () => {
  const assignment: Model = {
    key: 'assignment', label: 'Toewijzing', title_label: 'Omschrijving', title_readonly: true,
    fields: {
      activity: { type: 'relation', label: 'Activiteit', required: true, fact: true, relation: { model: 'activity', multiple: false } },
      person: { type: 'relation', label: 'Persoon', required: false, fact: true, relation: { model: 'person', multiple: false } },
      status: { type: 'select', label: 'Status', required: true, fact: true, options: { requested: 'Gevraagd', confirmed: 'Bevestigd' } },
    },
  }
  const person: Model = { key: 'person', label: 'Persoon', title_label: 'Naam', title_readonly: false, fields: {} }
  // A view keyed apart from its table: a write names the table, never the view.
  const toewijzingen = { key: 'tabel', label: 'Tabel', table: 'toewijzingen', model: 'assignment', columns: ['title', 'activity', 'status'], lookups: { person: ['title'] } }
  const tables = [{ key: 'toewijzingen', label: 'Toewijzingen', model: 'assignment', types: ['grid' as const] }]
  const served: Schema = { models: { assignment, person, activity }, tables, views: [toewijzingen], writable: { assignment: true } }
  const montage: Row = { id: 102, title: 'Montage', status: 'publish', fields: {} }
  const ann: Row = { id: 5, title: 'Ann', status: 'publish', fields: {} }
  const held: Row = { id: 3, title: 'Bert op Lunch', status: 'publish', fields: { activity: [103], person: [6], status: 'confirmed' }, lookups: {} }

  beforeEach(() => {
    window.localStorage.clear()
    remote.schema.mockResolvedValue(served)
    remote.rows.mockResolvedValue({ rows: [held], total: 1 })
    remote.records.mockImplementation((model: string) => Promise.resolve({ rows: model === 'person' ? [ann] : [montage], total: 1 }))
  })
  afterEach(() => {
    vi.resetAllMocks()
    setStrings(undefined)
  })

  async function refusedOnce() {
    remote.create.mockRejectedValueOnce({ code: 'person_or_name', message: 'A person or a name is required.' })
    render(<App />)
    await screen.findByText('Bert op Lunch')
    fireEvent.click(screen.getByRole('button', { name: 'Nieuw Toewijzing' }))
    const montage = await screen.findByRole('option', { name: 'Montage' })
    await act(async () => {
      fireEvent.click(montage)
    })
    fireEvent.blur(screen.getByRole('combobox', { name: 'Persoon' }))
  }
  const drafts = () => screen.getAllByRole('row').filter((r) => r.classList.contains('nv-tr--draft'))

  it('Escape on a refused draft discards it', async () => {
    await refusedOnce()
    const cellOf = within(drafts()[0]).getAllByRole('gridcell')[0]

    fireEvent.click(cellOf)
    fireEvent.keyDown(cellOf, { key: 'Escape' })

    expect(drafts()).toHaveLength(0)
    expect(screen.getByRole('banner').querySelector('[role=status]')?.textContent ?? '').not.toContain('A person or a name')
  })

  it('+ Nieuwe twice focuses the existing draft', async () => {
    await refusedOnce()

    fireEvent.click(screen.getByRole('button', { name: 'Nieuw Toewijzing' }))

    expect(drafts()).toHaveLength(1)
    expect(document.activeElement).toBe(screen.getByRole('combobox', { name: 'Persoon' }))
  })

  it('+ Nieuwe on a draft nothing was written to starts it again', async () => {
    render(<App />)
    await screen.findByText('Bert op Lunch')
    fireEvent.click(screen.getByRole('button', { name: 'Nieuw Toewijzing' }))
    fireEvent.blur(screen.getByRole('combobox', { name: 'Activiteit' }))
    expect(screen.queryByRole('combobox', { name: 'Activiteit' })).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: 'Nieuw Toewijzing' }))

    expect(drafts()).toHaveLength(1)
    expect(document.activeElement).toBe(screen.getByRole('combobox', { name: 'Activiteit' }))
    await act(async () => undefined)
  })

  it('a refused draft offers only the view\'s relations', async () => {
    const extra: Model = { ...assignment, fields: { ...assignment.fields, shift: { type: 'relation', label: 'Ploeg', required: false, fact: true, relation: { model: 'team', multiple: false } } } }
    remote.schema.mockResolvedValue({ ...served, models: { ...served.models, assignment: extra } })
    await refusedOnce()

    expect(screen.queryByRole('columnheader', { name: /Ploeg/ })).toBeNull()
    expect(screen.getAllByRole('columnheader').map((h) => h.dataset.column)).toContain('person')
  })

  it('a new row refused for a missing person offers the Persoon picker and saves on the pick', async () => {
    remote.create.mockRejectedValueOnce({ code: 'person_or_name', message: 'A person or a name is required.' })
    remote.create.mockResolvedValueOnce({ row: { id: 50, title: 'Ann op Montage', status: 'publish', fields: { activity: [102], person: [5], status: 'requested' }, lookups: { person: ann } }, batch: 'b1' })
    render(<App />)
    await screen.findByText('Bert op Lunch')

    fireEvent.click(screen.getByRole('button', { name: 'Nieuw Toewijzing' }))
    screen.getByRole('combobox', { name: 'Activiteit' })
    const montage = await screen.findByRole('option', { name: 'Montage' })
    await act(async () => {
      fireEvent.click(montage)
    })

    expect(screen.getByRole('banner').querySelector('[role=status]')?.textContent).toContain('A person or a name is required.')
    screen.getByRole('combobox', { name: 'Persoon' })
    const annOption = await screen.findByRole('option', { name: 'Ann' })
    await act(async () => {
      fireEvent.click(annOption)
    })

    expect(remote.create).toHaveBeenCalledTimes(2)
    expect(remote.create).toHaveBeenLastCalledWith('assignment', { status: 'requested', activity: [102], person: [5], title: '' })
    expect(screen.getAllByRole('row').some((r) => r.dataset.title === 'Ann op Montage')).toBe(true)
    expect(screen.getAllByRole('row').some((r) => r.classList.contains('nv-tr--draft'))).toBe(false)
  })
})

describe('a new record with a required relation', () => {
  const absence: Model = {
    key: 'absence', label: 'Afwezigheid', title_label: 'Omschrijving', title_readonly: true,
    fields: {
      person: { type: 'relation', label: 'Persoon', required: true, fact: true, relation: { model: 'person', multiple: false } },
      from: { type: 'date', label: 'Van', required: true, fact: true },
      to: { type: 'date', label: 'Tot', required: true, fact: true },
    },
  }
  const person: Model = { key: 'person', label: 'Persoon', title_label: 'Naam', title_readonly: false, fields: {} }
  const absences = { key: 'absences', label: 'Afwezigheden', table: 'absences', model: 'absence', date_field: 'from', columns: ['title', 'person', 'from', 'to'], lookups: { person: ['title'] } }
  const tables = [{ key: 'absences', label: 'Afwezigheden', model: 'absence', types: ['grid' as const] }]
  const served: Schema = { models: { absence, person }, tables, views: [absences], writable: { absence: true } }
  const ann: Row = { id: 5, title: 'Ann', status: 'publish', fields: {} }
  const held: Row = { id: 3, title: 'Bert', status: 'publish', fields: { person: [6], from: '2026-05-18', to: '2026-05-19' }, lookups: { person: { ...ann, id: 6, title: 'Bert' } } }

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date(2026, 4, 19, 10, 0))
    window.localStorage.clear()
    remote.schema.mockResolvedValue(served)
    remote.rows.mockResolvedValue({ rows: [held], total: 1 })
    remote.records.mockResolvedValue({ rows: [ann], total: 1 })
  })
  afterEach(() => {
    vi.useRealTimers()
    vi.resetAllMocks()
    window.location.hash = ''
  })

  it('opens the picker on the person and creates the absence once one is picked', async () => {
    remote.create.mockResolvedValue({ row: { id: 40, title: 'Ann 19/05', status: 'publish', fields: { person: [5], from: '2026-05-19', to: '2026-05-19' }, lookups: { person: ann } }, batch: 'b1' })
    render(<App />)
    await screen.findAllByText('Bert')

    fireEvent.click(screen.getByRole('button', { name: 'Nieuw Afwezigheid' }))
    const picker = screen.getByRole('combobox', { name: 'Persoon' })
    expect(remote.create).not.toHaveBeenCalled()
    fireEvent.click(await screen.findByRole('option', { name: 'Ann' }))
    await act(async () => undefined)

    expect(remote.create).toHaveBeenCalledWith('absence', { person: [5], from: '2026-05-19', to: '2026-05-19', title: '' })
    expect(picker.isConnected).toBe(false)
    expect(screen.getAllByRole('row').some((r) => r.dataset.title === 'Ann 19/05')).toBe(true)
  })

  it('shows the column a draft needs when the view does not, and saves the pick', async () => {
    remote.schema.mockResolvedValue({ ...served, views: [{ ...absences, columns: ['title', 'from', 'to'], lookups: {} }] })
    remote.create.mockResolvedValue({ row: { id: 41, title: 'Ann 19/05', status: 'publish', fields: { person: [5], from: '2026-05-19', to: '2026-05-19' }, lookups: {} }, batch: 'b1' })
    render(<App />)
    await screen.findByText('Bert')
    expect(screen.queryByRole('columnheader', { name: /Persoon/ })).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: 'Nieuw Afwezigheid' }))
    screen.getByRole('combobox', { name: 'Persoon' })
    fireEvent.click(await screen.findByRole('option', { name: 'Ann' }))
    await act(async () => undefined)

    expect(remote.create).toHaveBeenCalledWith('absence', { person: [5], from: '2026-05-19', to: '2026-05-19', title: '' })
  })

  it('keeps the draft when focus leaves its picker, and drops it on Escape', async () => {
    render(<App />)
    await screen.findAllByText('Bert')

    fireEvent.click(screen.getByRole('button', { name: 'Nieuw Afwezigheid' }))
    fireEvent.blur(screen.getByRole('combobox', { name: 'Persoon' }))

    expect(screen.queryByRole('combobox', { name: 'Persoon' })).toBeNull()
    const draft = () => screen.getAllByRole('row').find((r) => r.classList.contains('nv-tr--draft'))
    expect(draft()).toBeTruthy()

    const person = within(draft()!).getAllByRole('gridcell')[1]
    fireEvent.click(person)
    fireEvent.keyDown(person, { key: 'Enter' })
    fireEvent.keyDown(screen.getByRole('combobox', { name: 'Persoon' }), { key: 'Escape' })

    expect(draft()).toBeUndefined()
    expect(remote.create).not.toHaveBeenCalled()
    await act(async () => undefined)
  })
})

describe('a day plan', () => {
  const field = { required: false, fact: false }
  const plan: Model = {
    key: 'plan', label: 'Plan', title_label: 'Wat', title_readonly: false,
    fields: {
      day: { ...field, type: 'date', label: 'Dag' },
      from: { ...field, type: 'datetime', label: 'Start' },
      until: { ...field, type: 'datetime', label: 'Einde' },
      kind: { ...field, type: 'select', label: 'Soort', options: { spel: 'Spel', maal: 'Maal' }, tones: { spel: 'rose', maal: 'green' } },
    },
  }
  const view: View = {
    key: 'plan', label: 'Plan', table: 'plan', model: 'plan', type: 'grid', date_field: 'day', columns: ['day', 'from', 'until', 'kind'], hidden: ['until'],
    sort: ['from'], group: 'day',
    facts: [{ kind: 'first', column: 'from', where: { kind: 'spel' }, label: 'spel' }, { kind: 'empty', column: 'from', label: 'geen uur' }],
  }
  const at = (id: number, title: string, from: string | null, until: string | null, kind: string): Row =>
    ({ id, title, status: '', fields: { day: '2026-11-02', from, until, kind } })
  const rows = [at(1, 'Lunch', '2026-11-02T13:00', '2026-11-02T14:00', 'maal'), at(2, 'Spel', '2026-11-02T20:00', null, 'spel'), at(3, 'Nacht', null, null, 'maal')]

  it("reads a moment as its time, the end muted, under Tijd; an empty one as the view's empty fact", () => {
    renderGrid(rows, { model: plan, view })
    const time = cell('Lunch', 'from')

    expect(screen.getByRole('columnheader', { name: /Tijd/ })).toBeTruthy()
    expect(headers()).not.toContain('until')
    expect(time.textContent).toBe('13:00–14:00')
    expect(time.querySelector('.nv-time__end')?.textContent).toBe('–14:00')
    expect(cell('Spel', 'from').textContent).toBe('20:00')
    expect(cell('Nacht', 'from').querySelector('.nv-blank')?.textContent).toBe('geen uur')
  })

  it('colours an option by its tone and the band by its day, its date and its toned facts', () => {
    renderGrid(rows, { model: plan, view })

    expect(cell('Lunch', 'kind').querySelector('.nv-dot')?.className).toBe('nv-dot nv-dot--green')
    expect(bands()[0].querySelector('.nv-group__day')?.textContent).toBe('Maandag')
    expect(bands()[0].querySelector('.nv-group__date')?.textContent).toBe('2 november')
    expect(bands()[0].querySelector('.nv-group__fact i')?.className).toBe('nv-tone--rose')
  })
})

describe('a date cell', () => {
  const dated: Model = { ...activity, fields: { ...activity.fields, due: { type: 'date', label: 'Deadline', required: false, fact: false } } }
  const withDue: View = { ...planning, columns: [...(planning.columns ?? []), 'due'] }
  const rows = calais.map((r) => ({ ...r, fields: { ...r.fields, due: '2026-05-22' } }))
  const segments = () => screen.getAllByRole('spinbutton')

  function openDue(how: 'Enter' | string = 'Enter') {
    renderGrid(rows, { model: dated, view: withDue })
    api.update.mockImplementation(async (_m, id, data) => ({ row: { ...rows.find((r) => r.id === id)!, fields: { ...rows.find((r) => r.id === id)!.fields, ...data } }, batch: `b${id}` }))
    const due = cell('Montage', 'due')
    fireEvent.click(due)
    type(due, how)
    return due
  }

  // Down and up: React Aria presses a calendar day on the key's release.
  const press = async (key: string) => {
    await act(async () => {
      const target = document.activeElement as HTMLElement
      type(target, key)
      fireEvent.keyUp(target, { key })
    })
  }

  it('Enter commits a typed date once', async () => {
    openDue()
    expect(document.activeElement).toBe(segments()[0])
    typeKeys('25')
    await press('Enter')

    expect(api.update).toHaveBeenCalledExactlyOnceWith('activity', 102, { due: '2026-05-25' }, expect.objectContaining({ id: 102 }))
  })

  it('Escape writes nothing', async () => {
    const due = openDue()
    typeKeys('25')
    await press('Escape')

    expect(api.update).not.toHaveBeenCalled()
    expect(screen.queryAllByRole('spinbutton')).toHaveLength(0)
    expect(due.textContent).toBe(cell('Auto Pavel + Sien', 'due').textContent)
  })

  it('a calendar day click commits the date once, and the edit stays open until Enter', async () => {
    openDue()
    const open = screen.getByRole('button', { name: /kalender/i })
    open.focus()
    fireEvent.click(open)
    const calendar = document.querySelector('.nv-calendar') as HTMLElement
    fireEvent.click(within(calendar).getByRole('button', { name: 'woensdag 27 mei 2026' }))

    expect(document.querySelector('.nv-calendar')).toBeNull()
    expect(segments().map((s) => s.textContent)).toEqual(['27', '05', '2026'])
    expect(api.update).not.toHaveBeenCalled()
    await press('Enter')
    expect(api.update).toHaveBeenCalledExactlyOnceWith('activity', 102, { due: '2026-05-27' }, expect.objectContaining({ id: 102 }))
  })

  it('Enter on an incomplete date writes nothing and keeps the editor', async () => {
    openDue()
    segments()[0].focus()
    type(segments()[0], 'Backspace')
    type(segments()[0], 'Backspace')
    await press('Enter')

    expect(api.update).not.toHaveBeenCalled()
    expect(segments()).toHaveLength(3)
  })

  // A date column sends what Delete sends for it ('', columns.ts); a datetime's momentOf makes it null.
  it('clearing every segment and Enter writes the cleared value on an optional date', async () => {
    openDue()
    segments()[2].focus()
    for (let i = 0; i < 12; i++) type(document.activeElement as HTMLElement, 'Backspace')
    await press('Enter')

    expect(api.update).toHaveBeenCalledExactlyOnceWith('activity', 102, { due: '' }, expect.objectContaining({ id: 102 }))
  })

  it('Escape with the calendar open cancels the edit', async () => {
    openDue()
    const open = screen.getByRole('button', { name: /kalender/i })
    open.focus()
    fireEvent.click(open)
    expect(document.querySelector('.nv-calendar')).not.toBeNull()
    await press('Escape')

    expect(api.update).not.toHaveBeenCalled()
    expect(document.querySelector('.nv-calendar')).toBeNull()
    expect(screen.queryAllByRole('spinbutton')).toHaveLength(0)
  })

  function onADay() {
    openDue()
    const open = screen.getByRole('button', { name: /kalender/i })
    open.focus()
    fireEvent.click(open)
    const day = within(document.querySelector('.nv-calendar') as HTMLElement).getByRole('button', { name: 'woensdag 27 mei 2026' })
    day.focus()
    expect(document.activeElement).toBe(day)
    return day
  }

  it('Escape on a calendar day cancels the edit', async () => {
    onADay()
    await press('Escape')

    expect(api.update).not.toHaveBeenCalled()
    expect(document.querySelector('.nv-calendar')).toBeNull()
    expect(screen.queryAllByRole('spinbutton')).toHaveLength(0)
  })

  it('Enter on a calendar day picks it without a write; a second Enter commits it once', async () => {
    onADay()
    await press('Enter')

    expect(api.update).not.toHaveBeenCalled()
    expect(document.querySelector('.nv-calendar')).toBeNull()
    expect(segments().map((s) => s.textContent)).toEqual(['27', '05', '2026'])
    expect(document.activeElement).toBe(segments()[0])
    await press('Enter')
    expect(api.update).toHaveBeenCalledExactlyOnceWith('activity', 102, { due: '2026-05-27' }, expect.objectContaining({ id: 102 }))
  })

  it('a click on a segment keeps the edit', () => {
    openDue()
    fireEvent.click(segments()[1])
    fireEvent.doubleClick(segments()[1])

    expect(segments()).toHaveLength(3)
  })

  it('↑ steps the focused segment and does not move the cell', () => {
    openDue('2')
    expect(segments()[0].textContent).toBe('02')
    type(document.activeElement as HTMLElement, 'ArrowUp')

    expect(segments()[0].textContent).toBe('03')
    expect(cell('Montage', 'due').contains(document.activeElement)).toBe(true)
  })
})
