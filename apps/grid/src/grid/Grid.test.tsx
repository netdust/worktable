import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { type ReactNode, useState } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { setStrings } from '../i18n'
import type { Model, Row, SavedView, Schema } from '../types'
import { activity, calais, planning, schema } from './calais.test.data'
import { Grid } from './Grid'
import { defaults, type Layout } from './layout'
import { createStore, type StoreApi } from './store'

const remote = vi.hoisted(() => ({ schema: vi.fn(), rows: vi.fn(), records: vi.fn(), update: vi.fn(), create: vi.fn(), remove: vi.fn(), savedViews: vi.fn((): Promise<unknown[]> => Promise.resolve([])), updateView: vi.fn(),
  prefs: () => Promise.resolve({ order: {}, last: {} }), savePrefs: () => Promise.resolve() }))
vi.mock('../api', () => remote)
const { App } = await import('../ui/App')

let api: { update: ReturnType<typeof vi.fn<StoreApi['update']>>; create: ReturnType<typeof vi.fn<StoreApi['create']>>; remove: ReturnType<typeof vi.fn<NonNullable<StoreApi['remove']>>> }
let saved: Layout | null

function renderGrid(rows: Row[] = calais, options: { query?: string; layout?: Layout; title?: string; filters?: ReactNode; model?: Model } = {}) {
  api = { update: vi.fn<StoreApi['update']>(), create: vi.fn<StoreApi['create']>(), remove: vi.fn<NonNullable<StoreApi['remove']>>() }
  const store = createStore({ model: 'activity', rows, api })
  function Harness() {
    const [layout, setLayout] = useState(options.layout ?? defaults(planning))
    const change = (next: Layout) => {
      saved = next
      setLayout(next)
    }
    return (
      <Grid model={options.model ?? activity} view={planning} store={store} writable layout={layout} onLayout={change} title={options.title}
        query={options.query ?? ''} emptyTitle="No rows in this window" emptyHint="Week 18 – 24 mei" filters={options.filters} />
    )
  }
  return { store, ...render(<Harness />) }
}

const headers = () => screen.getAllByRole('columnheader').map((h) => h.dataset.column)
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

  it('renders the Calais week grouped by day, header and first column sticky, a foot per group and a total', () => {
    const { container } = renderGrid()

    expect(container.querySelector('thead')?.classList.contains('nv-grid__head')).toBe(true)
    expect(headers()).toEqual(['title', 'start', 'end', 'kind', 'status', 'location', 'place', 'settled_by', 'rollups.confirmed'])
    expect(screen.getAllByRole('row').filter((r) => r.dataset.title).every((r) => r.firstElementChild?.classList.contains('nv-first'))).toBe(true)

    const sections = screen.getAllByRole('rowheader').map((h) => h.textContent)
    expect(sections).toEqual(['Maandag 18 mei', 'Dinsdag 19 mei', 'Woensdag 20 mei'])
    expect(screen.getAllByTestId('group-foot').map((f) => f.textContent)).toEqual(['3 rows', '2 rows', '1 row'])

    const total = screen.getByTestId('total')
    expect(total.textContent).toContain('Total · 6 rows')
    expect(within(total).getByText('47')).toBeTruthy()
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

    expect(within(cell('Lunch bistrot', 'kind')).getByText('Required')).toBeTruthy()
    expect(within(cell('Lunch bistrot', 'status')).queryByText('Required')).toBeNull()
    expect(within(cell('Lunch bistrot', 'place')).queryByText('Required')).toBeNull()
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

    expect(screen.getByText('No rows in this window')).toBeTruthy()
    expect(screen.getByText('Week 18 – 24 mei')).toBeTruthy()
  })

  it('keeps the arrangement bar, an active filter chip with it, above an empty window (R10)', () => {
    renderGrid([], { filters: <button type="button">Productie: Calais ×</button> })

    expect(screen.getByRole('button', { name: 'Productie: Calais ×' })).toBeTruthy()
    expect(screen.getByText('No rows in this window')).toBeTruthy()
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
    expect(screen.getByText('No rows match the search or filters')).toBeTruthy()
  })

  it('keeps the rows a filter chip asks for', () => {
    renderGrid(calais, { layout: { ...defaults(planning), filters: [{ field: 'status', value: 'option' }] } })

    expect(screen.getAllByRole('row').filter((r) => r.dataset.title).map((r) => r.dataset.title)).toEqual(['Présentation interne'])
  })

  it('sorts on a header click and keeps it in the layout', () => {
    renderGrid(calais, { layout: { ...defaults(planning), group: null, sort: [] } })

    fireEvent.click(within(screen.getAllByRole('columnheader')[0]).getByRole('button'))

    expect(saved?.sort).toEqual([{ id: 'title', desc: false }])
    expect(screen.getAllByRole('row').filter((r) => r.dataset.title).map((r) => r.dataset.title)[0]).toBe('Auto Pavel + Sien')
    expect(screen.getAllByRole('row').filter((r) => r.dataset.title).map((r) => r.dataset.title)[1]).toBe('Diner door Rosalie')
  })
})

describe('editing', () => {
  it('typing in a cell and pressing Enter writes that one field', async () => {
    renderGrid()
    api.update.mockResolvedValue({ ...calais[1], fields: { ...calais[1].fields, place: 'Zaal 2' } })

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

    fireEvent.click(within(refused).getByRole('button', { name: 'Dismiss' }))
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
    api.update.mockResolvedValue({ ...calais[2], fields: { ...calais[2].fields, kind: 'show' } })

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
    api.update.mockResolvedValue(calais[1])

    const start = cell('Montage', 'start')
    fireEvent.click(start)
    type(start, '9')
    fireEvent.change(editor(), { target: { value: '930' } })
    await act(async () => {
      type(editor(), 'Tab')
    })

    expect(api.update).toHaveBeenCalledWith('activity', 102, { start: '09:30' }, expect.objectContaining({ id: 102 }))
  })

  it('empties an optional field on Delete and leaves a required one', async () => {
    renderGrid()
    api.update.mockResolvedValue(calais[1])

    fireEvent.click(cell('Montage', 'kind'))
    type(cell('Montage', 'kind'), 'Delete')
    expect(api.update).not.toHaveBeenCalled()

    fireEvent.click(cell('Montage', 'place'))
    await act(async () => {
      type(cell('Montage', 'place'), 'Delete')
    })
    expect(api.update).toHaveBeenCalledWith('activity', 102, { place: '' }, expect.objectContaining({ id: 102 }))
  })

  it('undoes the last write on Ctrl+Z with the inverse write', async () => {
    renderGrid()
    api.update.mockImplementation(async (_m, id, data) => ({ ...calais.find((r) => r.id === id)!, fields: { ...calais.find((r) => r.id === id)!.fields, ...data } }))

    fireEvent.click(cell('Montage', 'place'))
    await act(async () => {
      type(cell('Montage', 'place'), 'Delete')
    })
    await act(async () => {
      type(cell('Montage', 'place'), 'z', { ctrlKey: true })
    })

    expect(api.update).toHaveBeenLastCalledWith('activity', 102, { place: 'Grote zaal' }, expect.objectContaining({ id: 102 }))
    expect(cell('Montage', 'place').textContent).toBe('Grote zaal')
  })

  it('follows the record, not the position, when a commit re-sorts the rows', async () => {
    renderGrid()
    api.update.mockImplementation(async (_m, id, data) => ({ ...calais.find((r) => r.id === id)!, fields: { ...calais.find((r) => r.id === id)!.fields, ...data } }))

    fireEvent.click(cell('Montage', 'start'))
    type(cell('Montage', 'start'), '1')
    fireEvent.change(editor(), { target: { value: '14:00' } })
    await act(async () => {
      type(editor(), 'Enter')
    })

    expect(api.update).toHaveBeenLastCalledWith('activity', 102, { start: '14:00' }, expect.objectContaining({ id: 102 }))
    const titles = screen.getAllByRole('row').filter((r) => r.dataset.title).map((r) => r.dataset.title)
    expect(titles.indexOf('Montage')).toBeGreaterThan(titles.indexOf('Lunch bistrot'))
    expect(document.activeElement).toBe(cell('Lunch bistrot', 'start'))

    type(document.activeElement as HTMLElement, '1')
    fireEvent.change(editor(), { target: { value: '15:00' } })
    await act(async () => {
      type(editor(), 'Enter')
    })
    expect(api.update).toHaveBeenLastCalledWith('activity', 103, { start: '15:00' }, expect.objectContaining({ id: 103 }))
  })

  it('commits an open editor to its own record when a server answer re-sorts underneath it', async () => {
    renderGrid()
    let answer!: (row: Row) => void
    api.update.mockReturnValueOnce(new Promise<Row>((resolve) => (answer = resolve))).mockResolvedValue(calais[2])

    fireEvent.click(cell('Montage', 'start'))
    type(cell('Montage', 'start'), '2')
    fireEvent.change(editor(), { target: { value: '23:00' } })
    type(editor(), 'Enter')
    fireEvent.click(cell('Auto Pavel + Sien', 'place'))
    type(cell('Auto Pavel + Sien', 'place'), 'X')
    await act(async () => answer({ ...calais[1], fields: { ...calais[1].fields, start: '06:00' } }))
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
    const opens = screen.getAllByRole('button', { name: 'Open' })
    expect(opens.filter((b) => b.tabIndex === 0).map((b) => b.closest('tr')?.dataset.title)).toEqual(['Montage'])
  })

  it('leaves keys on a header button and on Open out of the cells, and lets Cmd/Ctrl+K through both', () => {
    renderGrid(calais, { layout: { ...defaults(planning), group: null, sort: [] } })
    api.update.mockResolvedValue(calais[1])
    fireEvent.click(cell('Montage', 'place'))
    const sortTitle = within(screen.getAllByRole('columnheader')[0]).getByRole('button')

    sortTitle.focus()
    fireEvent.keyDown(sortTitle, { key: 'Delete' })
    fireEvent.keyDown(sortTitle, { key: 'q' })
    expect(api.update).not.toHaveBeenCalled()
    expect(screen.queryByRole('textbox')).toBeNull()

    const open = within(cell('Montage', 'title')).getByRole('button', { name: 'Open' })
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

    fireEvent.click(screen.getByRole('button', { name: 'Columns' }))
    fireEvent.click(screen.getByRole('button', { name: 'Start: move right' }))

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
    api.update.mockResolvedValue(calais[1])
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
    api.create.mockResolvedValue({ ...calais[0], id: 200, title: 'Soundcheck' })

    act(() => store.draft({ date: '2026-05-19', kind: 'travel', status: 'confirmed' }))

    expect(editor().getAttribute('aria-label')).toBe('Titel')
    fireEvent.change(editor(), { target: { value: 'Soundcheck' } })
    await act(async () => {
      type(editor(), 'Enter')
    })

    expect(api.create).toHaveBeenCalledWith('activity', { date: '2026-05-19', kind: 'travel', status: 'confirmed', title: 'Soundcheck' })
  })
})

describe('the drawer', () => {
  it("shows one row's every field, the long ones too, and closes", () => {
    const noted = { ...calais[2], fields: { ...calais[2].fields, notes: 'Twee veggie\nEén glutenvrij' } }
    renderGrid([noted])

    fireEvent.click(within(cell('Lunch bistrot', 'title')).getByRole('button', { name: 'Open' }))

    const drawer = screen.getByRole('complementary', { name: 'Lunch bistrot' })
    expect(within(drawer).getByText('Notities')).toBeTruthy()
    expect(within(drawer).getByText(/Twee veggie/).textContent).toBe('Twee veggie\nEén glutenvrij')
    fireEvent.click(within(drawer).getByRole('button', { name: 'Close' }))
    expect(screen.queryByRole('complementary')).toBeNull()
  })

  const openDrawer = (title: string) => {
    fireEvent.click(within(cell(title, 'title')).getByRole('button', { name: 'Open' }))
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
    fireEvent.click(screen.getByRole('button', { name: 'Close' }))

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

  it('labels every toolbar and bar control with a visible word, a filter chip included', async () => {
    render(<App />)
    await screen.findByText('Maandag 18 mei')
    fireEvent.click(within(bar()).getByRole('button', { name: '+ Filter' }))
    fireEvent.click(within(bar()).getByRole('button', { name: 'Status: Optie' }))
    // A chip asks the server again: the grid comes back once the rows do.
    await screen.findByRole('grid')
    expect(within(bar()).getByRole('button', { name: 'Remove filter Status' })).toBeTruthy()
    for (const control of within(bar()).getAllByRole('button')) {
      expect(visibleText(control), control.outerHTML).toMatch(/\p{L}/u)
    }

    // The one icon button, ⋯ (Stefan, 2026-10-03: menus when it gets crowded), says its word on hover.
    const more = within(toolbar()).getByRole('button', { name: 'More actions' })
    expect(more.getAttribute('title')).toBe('More actions')
    const controls = within(toolbar()).getAllByRole('button').filter((control) => control !== more)
    expect(controls.length).toBeGreaterThan(3)
    for (const control of controls) {
      expect(visibleText(control), control.outerHTML).toMatch(/\p{L}/u)
    }
    expect(within(toolbar()).getByRole('searchbox', { name: 'Search' }).getAttribute('placeholder')).toBe('Search')
    expect(within(toolbar()).getByText('Previous')).toBeTruthy()
    expect(within(toolbar()).getByText('Next')).toBeTruthy()
    expect(within(toolbar()).getByRole('status').textContent).toContain('Saved')
  })

  it('shows a refused delete in the toolbar as the Dutch in-use sentence', async () => {
    remote.schema.mockResolvedValue({ ...schema, models: { activity: { ...schema.models.activity, deletable: true } } })
    remote.remove.mockRejectedValueOnce({ code: 'in_use', message: 'Still referenced by Toewijzingen (2)', by: [{ label: 'Toewijzingen', count: 2 }, { label: 'Personen', count: 1 }] })
    render(<App />)
    await screen.findByText('Maandag 18 mei')

    fireEvent.click(within(cell('Lunch bistrot', 'title')).getByRole('button', { name: 'Open' }))
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
    await screen.findByText('Maandag 18 mei')

    fireEvent.doubleClick(cell('Montage', 'title'))
    fireEvent.change(editor(), { target: { value: '' } })
    await act(async () => {
      type(editor(), 'Enter')
    })

    expect(within(toolbar()).getByRole('status').textContent).toBe('Not saved: Een activiteit heeft een <b>naam</b> nodig')
    expect(within(cell('Montage', 'title')).getByRole('alert').textContent).toContain('Een activiteit heeft een <b>naam</b> nodig')
    expect(document.querySelector('.nv-td b')).toBeNull()
  })

  it('a click away from an empty new title sends nothing', async () => {
    render(<App />)
    await screen.findByText('Maandag 18 mei')

    fireEvent.click(within(toolbar()).getByRole('button', { name: 'New Activiteit' }))
    await act(async () => {
      fireEvent.blur(editor())
    })

    expect(remote.create).not.toHaveBeenCalled()
    const draft = screen.getAllByRole('row').find((r) => r.classList.contains('nv-tr--draft'))!
    expect(within(within(draft).getAllByRole('gridcell')[0]).getByText('Required')).toBeTruthy()
  })

  it('keeps a refusal whole in the DOM however narrow the toolbar', async () => {
    const long = 'Deze persoon staat al op deze activiteit en kan er geen tweede keer op'
    remote.update.mockRejectedValueOnce({ code: 'duplicate_assignment', message: long })
    render(<App />)
    await screen.findByText('Maandag 18 mei')

    fireEvent.click(cell('Montage', 'place'))
    await act(async () => {
      type(cell('Montage', 'place'), 'Delete')
    })

    const status = within(toolbar()).getByRole('status')
    expect(status.textContent).toBe(`Not saved: ${long}`)
    expect(status.getAttribute('title')).toBe(long)
  })

  it('is one row of title, week, search and + New, with no theme or undo in it; the chips sit in the bar beneath (Stefan, 2026-10-03)', async () => {
    render(<App />)
    await screen.findByText('Maandag 18 mei')

    expect(within(toolbar()).getByRole('heading', { level: 1, name: 'Planning' })).toBeTruthy()
    expect(within(toolbar()).getByText('Previous')).toBeTruthy()
    expect(within(toolbar()).queryByRole('button', { name: '+ Filter' })).toBeNull()
    expect(within(bar()).getAllByRole('button').map((b) => b.textContent)).toEqual(['Columns', '+ Filter'])
    expect(within(toolbar()).getByRole('searchbox', { name: 'Search' })).toBeTruthy()
    expect(within(toolbar()).getByRole('button', { name: 'New Activiteit' })).toBeTruthy()
    expect(within(toolbar()).queryByRole('button', { name: /Theme|Undo|Redo/ })).toBeNull()
    expect(screen.queryByRole('status', { name: 'Changed' })).toBeNull()
  })

  it('offers undo in a toast after a change', async () => {
    remote.update.mockResolvedValueOnce({ ...calais[1], fields: { ...calais[1].fields, place: '' } })
    render(<App />)
    await screen.findByText('Maandag 18 mei')

    fireEvent.click(cell('Montage', 'place'))
    await act(async () => {
      type(cell('Montage', 'place'), 'Delete')
    })

    const toast = screen.getByRole('status', { name: 'Changed' })
    expect(toast.textContent).toContain('⌘Z')
    remote.update.mockResolvedValueOnce(calais[1])
    await act(async () => {
      fireEvent.click(within(toast).getByRole('button', { name: 'Undo' }))
    })
    expect(remote.update).toHaveBeenLastCalledWith('activity', 102, { place: 'Grote zaal' }, expect.objectContaining({ id: 102 }))
  })

  it('keeps an edited cell and its undo through Save on a saved view', async () => {
    const empty = { hidden: [], order: [], widths: [], sort: [], filters: [], group: null, picked: [] }
    const mine: SavedView = { ...schema.views[0], key: '42', id: 42, label: 'Calais techniek', starting: false, arrangement: empty,
      shared: false, owner: { id: 1, name: 'Hester' }, mine: true, editable: true }
    window.location.hash = '#view=42'
    window.localStorage.setItem('ntdst-views/layout/v1/42', JSON.stringify({ hidden: ['kind'], order: [], widths: {}, sort: [], filters: [], group: 'date' }))
    remote.savedViews.mockResolvedValue([mine])
    remote.updateView.mockResolvedValue({ ...mine, arrangement: { ...empty, hidden: ['kind'], group: 'date' } })
    remote.update.mockResolvedValueOnce({ ...calais[1], fields: { ...calais[1].fields, place: '' } })
    render(<App />)
    await screen.findByText('Maandag 18 mei')
    fireEvent.click(cell('Montage', 'place'))
    await act(async () => {
      type(cell('Montage', 'place'), 'Delete')
    })

    await act(async () => {
      fireEvent.click(within(toolbar()).getByRole('button', { name: 'Save' }))
    })

    expect(remote.updateView).toHaveBeenCalled()
    expect(window.localStorage.getItem('ntdst-views/layout/v1/42')).toBeNull()
    expect(cell('Montage', 'place').textContent).toBe('')
    remote.update.mockResolvedValueOnce(calais[1])
    await act(async () => {
      type(cell('Montage', 'place'), 'z', { ctrlKey: true })
    })
    expect(remote.update).toHaveBeenLastCalledWith('activity', 102, { place: 'Grote zaal' }, expect.objectContaining({ id: 102 }))
    expect(remote.rows).toHaveBeenCalledTimes(1)
  })

  it('adds a filter chip from + Filter and removes it with its ×', async () => {
    render(<App />)
    await screen.findByText('Maandag 18 mei')

    fireEvent.click(within(bar()).getByRole('button', { name: '+ Filter' }))
    fireEvent.click(within(bar()).getByRole('button', { name: 'Status: Optie' }))
    await screen.findByRole('grid')

    expect(remote.rows).toHaveBeenLastCalledWith(expect.anything(), expect.anything(), null, expect.objectContaining({ filters: [{ field: 'status', value: 'option' }] }))
    expect(within(bar()).getByText('Optie', { selector: 'b' })).toBeTruthy()
    expect(screen.getAllByRole('row').filter((r) => r.dataset.title).map((r) => r.dataset.title)).toEqual(['Présentation interne'])

    fireEvent.click(within(bar()).getByRole('button', { name: 'Remove filter Status' }))
    await screen.findByRole('grid')
    expect(remote.rows).toHaveBeenLastCalledWith(expect.anything(), expect.anything(), null, expect.objectContaining({ filters: [] }))
    expect(screen.getAllByRole('row').filter((r) => r.dataset.title)).toHaveLength(6)
  })

  it('shows Saving, then Saved; Not saved with the message on a refusal; and Undo with a word', async () => {
    let answer!: (row: Row) => void
    remote.update.mockReturnValueOnce(new Promise<Row>((resolve) => (answer = resolve)))
    render(<App />)
    await screen.findByText('Maandag 18 mei')

    fireEvent.click(cell('Montage', 'place'))
    type(cell('Montage', 'place'), 'Delete')
    expect(within(toolbar()).getByRole('status').textContent).toContain('Saving…')

    await act(async () => answer({ ...calais[1], fields: { ...calais[1].fields, place: '' } }))
    expect(within(toolbar()).getByRole('status').textContent).toContain('Saved')

    remote.update.mockRejectedValueOnce({ code: 'title_required', message: 'A title is required.' })
    fireEvent.doubleClick(cell('Montage', 'title'))
    fireEvent.change(editor(), { target: { value: '' } })
    await act(async () => {
      type(editor(), 'Enter')
    })
    expect(within(toolbar()).getByRole('status').textContent).toBe('Not saved: A title is required.')

    remote.update.mockResolvedValueOnce(calais[1])
    await act(async () => {
      fireEvent.click(within(screen.getByRole('status', { name: 'Changed' })).getByRole('button', { name: 'Undo' }))
    })
    expect(remote.update).toHaveBeenLastCalledWith('activity', 102, { place: 'Grote zaal' }, expect.objectContaining({ id: 102 }))
  })

  it("+ New opens a row at the top of today's group with its title in edit", async () => {
    render(<App />)
    await screen.findByText('Maandag 18 mei')

    fireEvent.click(within(toolbar()).getByRole('button', { name: 'New Activiteit' }))

    const tuesday = screen.getAllByRole('row')
    const header = tuesday.findIndex((r) => r.textContent === 'Dinsdag 19 mei')
    expect(tuesday[header + 1].classList.contains('nv-tr--draft')).toBe(true)
    expect(editor().getAttribute('aria-label')).toBe('Titel')
  })

  it('keeps focus in the search while the rows it filters move under the active cell', async () => {
    render(<App />)
    await screen.findByText('Maandag 18 mei')

    fireEvent.click(cell('Lunch bistrot', 'kind'))
    fireEvent.keyDown(cell('Lunch bistrot', 'kind'), { key: 'Delete' })
    const search = within(toolbar()).getByRole('searchbox', { name: 'Search' })
    search.focus()
    fireEvent.change(search, { target: { value: 'lu' } })

    expect(screen.getAllByRole('row').filter((r) => r.dataset.title).map((r) => r.dataset.title)).toEqual(['Lunch bistrot'])
    expect(document.activeElement).toBe(search)
  })

  it('commits an open editor when focus leaves for the search, and leaves focus there', async () => {
    remote.update.mockResolvedValue({ ...calais[2], fields: { ...calais[2].fields, place: 'x' } })
    render(<App />)
    await screen.findByText('Maandag 18 mei')

    fireEvent.click(cell('Lunch bistrot', 'place'))
    fireEvent.keyDown(cell('Lunch bistrot', 'place'), { key: 'x' })
    const search = within(toolbar()).getByRole('searchbox', { name: 'Search' })
    await act(async () => {
      search.focus()
    })

    expect(remote.update).toHaveBeenCalledWith('activity', 103, { place: 'x' }, expect.objectContaining({ id: 103 }))
    expect(document.activeElement).toBe(search)
  })

  it('jumps to a view from the search', async () => {
    render(<App />)
    await screen.findByText('Maandag 18 mei')

    fireEvent.change(within(toolbar()).getByRole('searchbox', { name: 'Search' }), { target: { value: 'afwez' } })
    fireEvent.click(within(toolbar()).getByRole('button', { name: 'Go to Afwezigheden' }))

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
    fireEvent.click(screen.getByRole('button', { name: 'New Toewijzing' }))
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
    expect(screen.getByRole('banner').querySelector('[role=status]')?.textContent).not.toContain('A person or a name')
  })

  it('+ Nieuwe twice focuses the existing draft', async () => {
    await refusedOnce()

    fireEvent.click(screen.getByRole('button', { name: 'New Toewijzing' }))

    expect(drafts()).toHaveLength(1)
    expect(document.activeElement).toBe(screen.getByRole('combobox', { name: 'Persoon' }))
  })

  it('+ Nieuwe on a draft nothing was written to starts it again', async () => {
    render(<App />)
    await screen.findByText('Bert op Lunch')
    fireEvent.click(screen.getByRole('button', { name: 'New Toewijzing' }))
    fireEvent.blur(screen.getByRole('combobox', { name: 'Activiteit' }))
    expect(screen.queryByRole('combobox', { name: 'Activiteit' })).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: 'New Toewijzing' }))

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
    remote.create.mockResolvedValueOnce({ id: 50, title: 'Ann op Montage', status: 'publish', fields: { activity: [102], person: [5], status: 'requested' }, lookups: { person: ann } })
    render(<App />)
    await screen.findByText('Bert op Lunch')

    fireEvent.click(screen.getByRole('button', { name: 'New Toewijzing' }))
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
    remote.create.mockResolvedValue({ id: 40, title: 'Ann 19/05', status: 'publish', fields: { person: [5], from: '2026-05-19', to: '2026-05-19' }, lookups: { person: ann } })
    render(<App />)
    await screen.findAllByText('Bert')

    fireEvent.click(screen.getByRole('button', { name: 'New Afwezigheid' }))
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
    remote.create.mockResolvedValue({ id: 41, title: 'Ann 19/05', status: 'publish', fields: { person: [5], from: '2026-05-19', to: '2026-05-19' }, lookups: {} })
    render(<App />)
    await screen.findByText('Bert')
    expect(screen.queryByRole('columnheader', { name: /Persoon/ })).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: 'New Afwezigheid' }))
    screen.getByRole('combobox', { name: 'Persoon' })
    fireEvent.click(await screen.findByRole('option', { name: 'Ann' }))
    await act(async () => undefined)

    expect(remote.create).toHaveBeenCalledWith('absence', { person: [5], from: '2026-05-19', to: '2026-05-19', title: '' })
  })

  it('keeps the draft when focus leaves its picker, and drops it on Escape', async () => {
    render(<App />)
    await screen.findAllByText('Bert')

    fireEvent.click(screen.getByRole('button', { name: 'New Afwezigheid' }))
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
