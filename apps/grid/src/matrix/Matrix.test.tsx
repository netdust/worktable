import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { useState, useSyncExternalStore } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { setStrings } from '../i18n'
import { defaults } from '../grid/layout'
import type { Model, Row, View } from '../types'
import { createMatrixStore, type MatrixApi, type MatrixStore } from './store'

const api = vi.hoisted(() => ({ records: vi.fn(), optionsFrom: vi.fn() }))
vi.mock('../api', () => api)
const { Legend } = await import('./Legend')
const { Matrix } = await import('./Matrix')
const { absentOn } = await import('./away')
const { buildColumns, cellFor, markFor } = await import('./columns')

const view: View = {
  key: 'bezetting', label: 'Bezetting', table: 'planning', model: 'activity', type: 'matrix', date_field: 'date', group: 'date', sort: ['date', 'start'], space: 'scoped',
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
      kind: { type: 'select', label: 'Soort', required: false, fact: true, options: { build: 'Opbouw', show: 'Voorstelling' } },
    },
  },
  assignment: {
    key: 'assignment', label: 'Toewijzing', title_label: 'Titel', title_readonly: false,
    fields: {
      person: { type: 'relation', label: 'Persoon', required: false, fact: true, relation: { model: 'person', multiple: false } },
      status: { type: 'select', label: 'Status', required: true, fact: true, options: { requested: 'Gevraagd', confirmed: 'Bevestigd', maybe: 'Misschien', declined: 'Afgezegd' } },
    },
  },
}

const join = (id: number, fields: Record<string, unknown>) => ({ id, title: `join ${id}`, status: 'publish', fields: { name: '', note: '', status: 'requested', person: [], ...fields } })
const activity = (id: number, title: string, date: string, cells: ReturnType<typeof join>[] = []): Row => ({
  id, title, status: 'publish', fields: { date, start: '09:00' }, rollups: { cells },
})

const titles = new Map([[5, 'Sien'], [6, 'Sien'], [7, 'Marit']])
const week: Row[] = [
  activity(1, 'Montage', '2026-05-18', [join(11, { person: [5], status: 'confirmed' }), join(12, { name: 'Lieve', status: 'maybe', note: 'komt later' })]),
  activity(2, 'Repetitie', '2026-05-19', [
    join(13, { person: [5], status: 'declined' }), join(14, { name: 'lieve ', status: 'confirmed' }), join(15, { person: ['6'], status: 'confirmed' }),
  ]),
  activity(3, 'Leeg', '2026-05-19'),
]
const away: Row[] = [{ id: 90, title: 'x', status: 'publish', fields: { person: [5], from: '2026-05-18', to: '2026-05-19', reason: 'Examen' } }]

const layout = defaults(view)
const props = { view, models, rows: week, away, titles, layout, onLayout: () => undefined, emptyTitle: 'Geen rijen', emptyHint: 'Week 18 – 24 mei' }

beforeEach(() => {
  window.localStorage.clear()
  api.records.mockResolvedValue({ rows: [{ id: 7, title: 'Marit', status: 'publish', fields: {} }, { id: 5, title: 'Sien', status: 'publish', fields: {} }], total: 2 })
})
afterEach(() => {
  cleanup()
  vi.resetAllMocks()
  setStrings(undefined)
})

describe('the matrix columns', () => {
  it('keeps two people with one title as two columns, a name equal to a title as its own', () => {
    const rows = [activity(1, 'a', '2026-05-18', [join(1, { person: [5] }), join(2, { person: [6] }), join(3, { name: 'Sien' })])]

    expect(buildColumns(view, rows, titles, []).map((c) => c.key)).toEqual(['record:5', 'record:6', 'name:sien'])
  })

  it('folds a name by trimming and case: one column, the first spelling its title', () => {
    const columns = buildColumns(view, week, titles, [])

    expect(columns.filter((c) => c.kind === 'name')).toEqual([{ key: 'name:lieve', kind: 'name', title: 'Lieve' }])
  })

  it('puts the records first, then the names, and converts ids to numbers', () => {
    const columns = buildColumns(view, week, titles, [])

    expect(columns.map((c) => c.kind)).toEqual(['record', 'record', 'name'])
    expect(columns.filter((c) => c.kind === 'record').map((c) => c.id)).toEqual([5, 6])
  })

  it('drops a record whose title is missing, and adds a picked one without joins', () => {
    const rows = [activity(1, 'a', '2026-05-18', [join(1, { person: [99] })])]

    expect(buildColumns(view, rows, titles, [])).toEqual([])
    expect(buildColumns(view, rows, titles, [7]).map((c) => c.title)).toEqual(['Marit'])
  })

  it('gives a shared cell to the lowest id and keeps the others', () => {
    const row = activity(1, 'a', '2026-05-18', [join(30, { person: [5], status: 'maybe' }), join(20, { person: [5], status: 'confirmed' })])
    const [column] = buildColumns(view, [row], titles, [])

    expect(cellFor(view, row, column)?.id).toBe(20)
    expect(cellFor(view, activity(2, 'b', '2026-05-18'), column)).toBeUndefined()
  })

  it('says the declared mark for a status', () => {
    expect(markFor(view, 'confirmed')).toBe('✓')
    expect(markFor(view, 'declined')).toBe('✕')
  })

  it('finds the away record covering a day, for a record column only', () => {
    const [sien] = buildColumns(view, week, titles, [])

    expect(absentOn(away, view, sien, '2026-05-19')?.id).toBe(90)
    expect(absentOn(away, view, sien, '2026-05-20')).toBeUndefined()
    expect(absentOn(away, view, { key: 'name:sien', kind: 'name', title: 'Sien' }, '2026-05-18')).toBeUndefined()
  })
})

describe('the matrix', () => {
  it("is named after the title it is given, else after the view's label", () => {
    render(<Matrix {...props} title="Planning" />)
    expect(screen.getByRole('grid', { name: 'Planning' })).toBeTruthy()
    cleanup()

    render(<Matrix {...props} />)
    expect(screen.getByRole('grid', { name: 'Bezetting' })).toBeTruthy()
  })

  it('lays the week out by day under a frozen header row and first column', () => {
    const { container } = render(<Matrix {...props} />)
    const grid = screen.getByRole('grid', { name: 'Bezetting' })

    expect(within(grid).getAllByRole('columnheader').map((h) => h.textContent)).toEqual(
      expect.arrayContaining(['Activiteit', 'Sien', 'Sien', 'Lieve']),
    )
    expect([...container.querySelectorAll('.nv-group__label')].map((g) => g.textContent)).toEqual(['Monday May 18', 'Tuesday May 19'])
    expect(container.querySelector('thead th.nv-first.nv-th')).not.toBeNull()
    expect(container.querySelectorAll('tbody tr.nv-tr > .nv-first')).toHaveLength(3)
  })

  it('draws the divider before the first name column down the whole sheet: header, every body cell and foot', () => {
    const { container } = render(<Matrix {...props} />)
    const split = [...container.querySelectorAll('.nv-mx__split')]

    expect(container.querySelectorAll('td[data-column="name:lieve"]')).toHaveLength(3)
    expect(split.filter((el) => el.matches('td[data-column="name:lieve"]'))).toHaveLength(3)
    expect(split.filter((el) => el.matches('th'))).toHaveLength(1)
    expect(split.filter((el) => el.matches('tfoot td'))).toHaveLength(1)
    expect(container.querySelectorAll('td[data-column="record:6"].nv-mx__split')).toHaveLength(0)
  })

  it('groups by a select field in the declared option order, with the option words', () => {
    const rows = [
      { ...activity(1, 'Avond', '2026-05-18'), fields: { date: '2026-05-18', kind: 'show' } },
      { ...activity(2, 'Ochtend', '2026-05-19'), fields: { date: '2026-05-19', kind: 'build' } },
    ]
    const { container } = render(<Matrix {...props} layout={{ ...layout, group: 'kind' }} rows={rows} />)

    expect([...container.querySelectorAll('.nv-group__label')].map((g) => g.textContent)).toEqual(['Opbouw', 'Voorstelling'])
  })

  it('shows a row for an activity nobody is on, with empty cells', () => {
    render(<Matrix {...props} />)
    const row = screen.getByRole('row', { name: /Leeg/ })

    expect(within(row).getAllByRole('gridcell').every((cell) => !/[✓?✕·]/.test(cell.textContent ?? ''))).toBe(true)
  })

  it('counts the confirmed per row, per column and in total', () => {
    render(<Matrix {...props} />)

    expect(within(screen.getByRole('row', { name: /Montage/ })).getByTestId('row-count').textContent).toBe('1')
    expect(within(screen.getByRole('row', { name: /Repetitie/ })).getByTestId('row-count').textContent).toBe('2')
    const foot = screen.getByTestId('total')
    expect(within(foot).getAllByTestId('column-count').map((c) => c.textContent)).toEqual(['1', '1', '1'])
    expect(within(foot).getByTestId('row-count').textContent).toBe('3')
  })

  it('shows the declared mark, and a dot with the note when there is one', () => {
    render(<Matrix {...props} />)
    const montage = screen.getByRole('row', { name: /Montage/ })

    expect(within(montage).getByRole('gridcell', { name: /Sien.*Bevestigd/ }).textContent).toContain('✓')
    const lieve = within(montage).getByRole('gridcell', { name: /Lieve.*Notitie: komt later/ })
    expect(lieve.textContent).toContain('?')
    expect(lieve.querySelector('.nv-mx__dot')).not.toBeNull()
  })

  it('shades a cell where the person is away, with the reason, and warns when they are on it', () => {
    render(<Matrix {...props} />)

    const planned = within(screen.getByRole('row', { name: /Montage/ })).getByRole('gridcell', { name: /Afwezig: Examen/ })
    expect(planned.getAttribute('aria-label')).toContain('Afwezig en toegewezen')
    expect(planned.classList.contains('nv-mx__away')).toBe(true)
    const free = within(screen.getByRole('row', { name: /Leeg/ })).getByRole('gridcell', { name: /Afwezig: Examen/ })
    expect(free.getAttribute('aria-label')).not.toContain('assigned')
    expect(free.classList.contains('nv-mx__away')).toBe(true)
  })

  it('tints a status by its tone, keeps a refusal quiet, reds away-and-on, and names the reason where nobody is', () => {
    const toned = { ...models, assignment: { ...models.assignment, fields: { ...models.assignment.fields, status: { ...models.assignment.fields.status, tones: { confirmed: 'ok', maybe: 'warn', declined: 'bad' } } } } } as Record<string, Model>
    render(<Matrix {...props} models={toned} />)
    const cell = (row: RegExp, name: RegExp) => within(screen.getByRole('row', { name: row })).getByRole('gridcell', { name })
    const lieve = cell(/Montage/, /Lieve/)
    expect([lieve.classList.contains('nv-mx__cell--on'), lieve.style.getPropertyValue('--c')]).toEqual([true, 'var(--color-warning-fg)'])
    expect(cell(/Montage/, /Sien.*Bevestigd/).classList.contains('nv-mx__cell--bad')).toBe(true)
    expect(cell(/Repetitie/, /Sien.*Afgezegd/).classList.contains('nv-mx__cell--no')).toBe(true)
    expect(cell(/Leeg/, /Afwezig: Examen/).textContent).toBe('Examen')
  })

  it('explains the toned marks and the away shades in a legend', () => {
    const toned = { ...models, assignment: { ...models.assignment, fields: { ...models.assignment.fields, status: { ...models.assignment.fields.status, tones: { confirmed: 'ok', maybe: 'warn', declined: 'bad' } } } } } as Record<string, Model>
    render(<Legend view={view} models={toned} />)
    expect(within(screen.getByRole('list')).getAllByRole('listitem').map((li) => li.textContent)).toEqual(['✓bevestigd', '?misschien', 'afwezig', '⚠afwezig en toegewezen'])
  })

  it('heads a column with its first name, and with the whole name where two first names meet', () => {
    const names = new Map([[5, 'Sien Peeters'], [6, 'Sien Claes'], [7, 'Marit Vos']])
    const { container } = render(<Matrix {...props} titles={names} />)
    const heads = [...container.querySelectorAll('th.nv-mx__head')].map((th) => [th.querySelector('.nv-th__label')?.textContent, th.getAttribute('title')])
    expect(heads).toContainEqual(['Sien Peeters', 'Sien Peeters'])
    expect(heads).toContainEqual(['Sien Claes', 'Sien Claes'])
  })

  it('names the window when it has no activities', () => {
    render(<Matrix {...props} rows={[]} />)

    expect(screen.getByText('Geen rijen')).toBeTruthy()
    expect(screen.getByText('Week 18 – 24 mei')).toBeTruthy()
  })

  it('renders what the server sent as characters, never as an element', () => {
    const evil = '<img src=x onerror=alert(1)>'
    const rows = [activity(1, evil, '2026-05-18', [join(1, { person: [5], note: evil }), join(2, { name: evil })])]
    const { container } = render(<Matrix {...props} rows={rows} titles={new Map([[5, evil]])} away={[]} />)

    expect(container.querySelector('img')).toBeNull()
    expect(screen.getAllByText(evil).length).toBeGreaterThanOrEqual(1)
    expect([...container.querySelectorAll('th.nv-mx__head')].map((th) => th.getAttribute('title'))).toEqual([evil, evil])
  })

  it('opens no floating layer: no dialog, no popover', async () => {
    const { container } = render(<Matrix {...props} />)
    fireEvent.click(screen.getByRole('button', { name: '+ Kolom' }))
    await screen.findByRole('button', { name: 'Marit' })

    expect(screen.queryByRole('dialog')).toBeNull()
    expect(container.querySelector('.nv-pop')).toBeNull()
  })

  it('adds an empty column from the picker, and keeps it for the next visit', async () => {
    const { unmount } = render(<Matrix {...props} />)
    fireEvent.click(screen.getByRole('button', { name: '+ Kolom' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Marit' }))
    expect(api.records).toHaveBeenCalledWith('person', '')

    expect(screen.getAllByRole('columnheader').map((h) => h.textContent)).toContain('Marit')
    unmount()
    render(<Matrix {...props} />)
    expect(screen.getAllByRole('columnheader').map((h) => h.textContent)).toContain('Marit')
  })
})

function Held(extra: Partial<Parameters<typeof Matrix>[0]> = {}) {
  const [held, setHeld] = useState(layout)
  return <Matrix {...props} layout={held} onLayout={setHeld} {...extra} />
}
const headers = () => screen.getAllByRole('columnheader').map((h) => h.textContent)
const counts = () => within(screen.getByTestId('total')).getAllByTestId('column-count').map((c) => c.textContent)
const strip = (container: HTMLElement, key: string) => container.querySelector<HTMLElement>(`.nv-mx__columns li[data-column="${key}"] button`)!

describe('the matrix arrangement', () => {
  it('hides a record column and its count through the strip, and shows it again from the same list', () => {
    const { container } = render(<Held />)
    fireEvent.click(screen.getByRole('button', { name: '+ Kolom' }))

    fireEvent.click(strip(container, 'record:5'))

    expect(headers()).toEqual(['Activiteit', 'Sien', 'Lieve', '✓Bevestigd'])
    expect(container.querySelectorAll('td[data-column="record:5"]')).toHaveLength(0)
    expect(counts()).toEqual(['1', '1'])
    expect(within(screen.getByRole('row', { name: /Repetitie/ })).getByTestId('row-count').textContent).toBe('2')
    expect(within(screen.getByTestId('total')).getByTestId('row-count').textContent).toBe('3')
    expect(strip(container, 'record:5').textContent).toBe('Tonen')

    fireEvent.click(strip(container, 'record:5'))

    expect(headers()).toContain('Sien')
    expect(container.querySelectorAll('td[data-column="record:5"]')).toHaveLength(3)
    expect(counts()).toEqual(['1', '1', '1'])
  })

  it('hides a name column and shows it again, the same way', () => {
    const { container } = render(<Held />)
    fireEvent.click(screen.getByRole('button', { name: '+ Kolom' }))

    fireEvent.click(strip(container, 'name:lieve'))

    expect(container.querySelectorAll('td[data-column="name:lieve"]')).toHaveLength(0)
    expect(counts()).toEqual(['1', '1'])
    fireEvent.click(strip(container, 'name:lieve'))
    expect(container.querySelectorAll('td[data-column="name:lieve"]')).toHaveLength(3)
  })

  it('hands the layout on with the column hidden, under its key', () => {
    const onLayout = vi.fn()
    const { container } = render(<Matrix {...props} onLayout={onLayout} />)
    fireEvent.click(screen.getByRole('button', { name: '+ Kolom' }))

    fireEvent.click(strip(container, 'name:lieve'))

    expect(onLayout).toHaveBeenCalledWith(expect.objectContaining({ hidden: ['name:lieve'] }))
  })

  it('applies no condition itself: the server answered for them, and every row it sent shows', () => {
    const rows = week.map((row) => ({ ...row, fields: { ...row.fields, kind: 'build' } }))
    render(<Matrix {...props} rows={rows} layout={{ ...layout, filters: [{ field: 'kind', op: 'in', values: ['show'] }] }} />)

    expect(screen.getByRole('row', { name: /Repetitie/ })).toBeTruthy()
  })

  it('keeps its bar, an active filter chip with it, above an empty window (R10)', () => {
    render(<Matrix {...props} rows={[]} filters={<button type="button">Locatie: Calais ×</button>} />)

    expect(screen.getByRole('button', { name: 'Locatie: Calais ×' })).toBeTruthy()
    expect(screen.getByText('Geen rijen')).toBeTruthy()
  })

  it('says no rows match when the search leaves none, and the window is empty only when it is', () => {
    render(<Matrix {...props} rows={week} query="zzz" />)
    expect(screen.getByText('Geen rijen voor deze zoekterm of filters')).toBeTruthy()
    expect(screen.queryByText('Geen rijen')).toBeNull()
  })

  it('regroups the rows by the layout\'s group', () => {
    const rows = [
      { ...activity(1, 'Avond', '2026-05-18'), fields: { date: '2026-05-18', kind: 'show' } },
      { ...activity(2, 'Ochtend', '2026-05-19'), fields: { date: '2026-05-19', kind: 'build' } },
    ]
    const { container } = render(<Matrix {...props} rows={rows} layout={{ ...layout, group: null }} />)

    expect([...container.querySelectorAll('.nv-group__label')].map((g) => g.textContent)).toEqual(['Monday May 18', 'Tuesday May 19'])
    cleanup()
    const grouped = render(<Matrix {...props} rows={rows} layout={{ ...layout, group: 'kind' }} />)
    expect([...grouped.container.querySelectorAll('.nv-group__label')].map((g) => g.textContent)).toEqual(['Opbouw', 'Voorstelling'])
  })
})

describe('the matrix, edited from the keyboard', () => {
  function setup(extra: Partial<Parameters<typeof Matrix>[0]> = {}, rows: Row[] = week) {
    let next = 500
    const writes = { create: vi.fn<MatrixApi['create']>(), update: vi.fn<MatrixApi['update']>(), remove: vi.fn<MatrixApi['remove']>(), undoBatch: vi.fn<MatrixApi['undoBatch']>(), runAction: vi.fn<MatrixApi['runAction']>() }
    writes.create.mockImplementation(async (_m, data) => ({ row: { id: ++next, title: 'j', status: 'publish', fields: { name: '', note: '', person: [], ...data } }, batch: null }))
    writes.update.mockImplementation(async (_m, id, data) => ({ row: { id, title: 'j', status: 'publish', fields: { name: '', note: '', person: [5], ...data } }, batch: null }))
    writes.remove.mockImplementation(async (_m, id) => ({ deleted: true, id }))
    const store = createMatrixStore({ view, rows, api: writes })
    function Live({ store }: { store: MatrixStore }) {
      const state = useSyncExternalStore(store.subscribe, store.getState)
      return <Matrix {...props} rows={state.rows} store={store} writable {...extra} />
    }
    render(<Live store={store} />)
    const at = (title: RegExp, key: string) => screen.getByRole('row', { name: title }).querySelector<HTMLElement>(`[data-column="${key}"]`)!
    const selected = () => [...document.querySelectorAll<HTMLElement>('[aria-selected="true"]')].map((el) => `${el.closest('tr')?.dataset.title}/${el.dataset.column}`)
    const press = (key: string, init: Record<string, boolean> = {}) => act(() => {
      fireEvent.keyDown(document.activeElement ?? document.body, { key, ...init })
    })
    return { writes, store, at, selected, press }
  }

  it('focuses a clicked cell and shows it in the side panel beside the sheet', () => {
    const { at } = setup()

    fireEvent.click(at(/Montage/, 'record:5'))

    expect(document.activeElement).toBe(at(/Montage/, 'record:5'))
    const panel = screen.getByRole('complementary', { name: 'Sien' })
    expect(panel.closest('.nv-body')?.querySelector('.nv-scroll')).not.toBeNull()
    expect(within(panel).getByRole('radio', { checked: true }).textContent).toBe('Bevestigd')
  })

  it('moves with the arrows and Tab, across the day sections', async () => {
    const { at, press } = setup()
    fireEvent.click(at(/Montage/, 'record:5'))

    await press('ArrowRight')
    expect(document.activeElement).toBe(at(/Montage/, 'record:6'))
    await press('ArrowDown')
    expect(document.activeElement).toBe(at(/Repetitie/, 'record:6'))
    await press('Tab')
    expect(document.activeElement).toBe(at(/Repetitie/, 'name:lieve'))
    await press('Tab', { shiftKey: true })
    expect(document.activeElement).toBe(at(/Repetitie/, 'record:6'))
    await press('ArrowUp')
    await press('ArrowLeft')
    expect(document.activeElement).toBe(at(/Montage/, 'record:5'))
  })

  it('extends a selection with Shift+arrow, and Escape cancels it', async () => {
    const { at, press, selected } = setup()
    fireEvent.click(at(/Montage/, 'record:5'))

    await press('ArrowDown', { shiftKey: true })
    await press('ArrowDown', { shiftKey: true })
    expect(selected()).toEqual(['Montage/record:5', 'Repetitie/record:5', 'Leeg/record:5'])

    await press('Escape')
    expect(selected()).toEqual(['Leeg/record:5'])
  })

  it('sets the status from a typed key, and removes it on Delete', async () => {
    const { at, press, writes } = setup()
    fireEvent.click(at(/Leeg/, 'record:5'))

    await press('x')
    expect(writes.create).toHaveBeenCalledWith('assignment', { activity: [3], person: [5], status: 'confirmed' })
    expect(at(/Leeg/, 'record:5').textContent).toContain('✓')

    await press('Delete')
    expect(writes.remove).toHaveBeenCalledWith('assignment', 501)
    expect(at(/Leeg/, 'record:5').textContent).not.toContain('✓')
  })

  it('keeps a name column whose only cell is deleted, with the cursor on it, so Ctrl+Z brings the cell back', async () => {
    const rows = [activity(1, 'Montage', '2026-05-18', [join(12, { name: 'Lieve', status: 'maybe' })]), activity(3, 'Leeg', '2026-05-19')]
    const { at, press, writes } = setup({}, rows)
    fireEvent.click(at(/Montage/, 'name:lieve'))

    await press('Delete')
    expect(writes.remove).toHaveBeenCalledWith('assignment', 12)
    expect(document.activeElement).toBe(at(/Montage/, 'name:lieve'))

    await press('z', { ctrlKey: true })
    expect(writes.create).toHaveBeenCalledWith('assignment', expect.objectContaining({ activity: [1], name: 'Lieve', status: 'maybe' }))
    expect(at(/Montage/, 'name:lieve').textContent).toContain('?')
  })

  it('copies a block of statuses as text and pastes it from another cell down and right', async () => {
    const { at, press, writes } = setup()
    fireEvent.click(at(/Montage/, 'record:5'))
    await press('ArrowDown', { shiftKey: true })
    await press('ArrowRight', { shiftKey: true })
    const copied = { setData: vi.fn() }

    fireEvent.copy(document.activeElement!, { clipboardData: copied })
    expect(copied.setData).toHaveBeenCalledWith('text/plain', 'confirmed\t\ndeclined\tconfirmed')

    fireEvent.click(at(/Repetitie/, 'record:5'))
    await act(async () => {
      fireEvent.paste(document.activeElement!, { clipboardData: { getData: () => 'confirmed\t\ndeclined\tconfirmed\n' } })
    })
    expect(writes.update).toHaveBeenCalledWith('assignment', 13, { status: 'confirmed' })
    expect(writes.remove).toHaveBeenCalledWith('assignment', 15)
    expect(writes.create).toHaveBeenCalledWith('assignment', { activity: [3], person: [5], status: 'declined' })
    expect(writes.create).toHaveBeenCalledWith('assignment', { activity: [3], person: [6], status: 'confirmed' })
    expect(at(/Leeg/, 'record:6').textContent).toContain('✓')
  })

  it('cycles the status in the declared option order on Space', async () => {
    const { at, press, writes } = setup()
    fireEvent.click(at(/Montage/, 'record:5'))

    await press(' ')

    expect(writes.update).toHaveBeenCalledWith('assignment', 11, { status: 'maybe' })
  })

  it('fills a column selection down with Ctrl/Cmd+D, and Ctrl/Cmd+Z undoes it in one step', async () => {
    const { at, press, writes, store } = setup()
    fireEvent.click(at(/Montage/, 'record:5'))
    await press('ArrowDown', { shiftKey: true })
    await press('ArrowDown', { shiftKey: true })

    await press('d', { metaKey: true })
    expect(writes.update).toHaveBeenCalledWith('assignment', 13, { status: 'confirmed' })
    expect(writes.create).toHaveBeenCalledWith('assignment', { activity: [3], person: [5], status: 'confirmed' })

    await press('z', { ctrlKey: true })
    expect(store.getState().canUndo).toBe(false)
    expect(writes.update).toHaveBeenLastCalledWith('assignment', 13, { status: 'declined' })
  })

  it('does nothing on a typed key when the join model has no writer, and shows no edit cursor', async () => {
    const { at, press, writes } = setup({ writable: false })
    fireEvent.click(at(/Leeg/, 'record:5'))

    await press('x')
    await press('Delete')
    await press('d', { ctrlKey: true })

    expect(writes.create).not.toHaveBeenCalled()
    expect(writes.remove).not.toHaveBeenCalled()
    expect(writes.update).not.toHaveBeenCalled()
    expect(screen.getByRole('grid').getAttribute('aria-readonly')).toBe('true')
  })

  it('shows a refused write on its cell, in the site\'s words', async () => {
    setStrings({ 'error.duplicate_assignment': 'Deze persoon staat al op deze activiteit' })
    const { at, press, writes } = setup()
    writes.create.mockRejectedValueOnce({ code: 'duplicate_assignment', message: 'Already on it.' })
    fireEvent.click(at(/Leeg/, 'record:5'))

    await press('x')

    expect(at(/Leeg/, 'record:5').textContent).toContain('Deze persoon staat al op deze activiteit')
    expect(at(/Leeg/, 'record:5').getAttribute('aria-invalid')).toBe('true')
  })
})

describe('the open column', () => {
  // 'pencilled' stands for voorlopig: what a fill writes.
  const openView: View = {
    ...view,
    join: { ...view.join!, lifecycle: 'status', marks: { ...view.join!.marks, pencilled: '~' }, open: { match_field: 'role', count_field: 'size', action: 'fill_slot', input: 'person' } },
  }
  const slot = (id: number, role: number, label: string, size: number) => ({
    ...join(id, { role: [role], size, status: 'open' }), lookups: { role: { id: role, title: label, status: '', fields: {} } },
  })
  const rows = [
    activity(1, 'Montage', '2026-05-18', [join(11, { person: [5], status: 'pencilled' }), join(12, { name: 'Lieve', status: 'maybe' }), slot(21, 8, 'Speler', 2), slot(24, 8, 'Speler', 1), slot(22, 9, 'Licht', 1)]),
    activity(2, 'Repetitie', '2026-05-19', [slot(23, 8, 'Speler', 1)]),
    activity(3, 'Leeg', '2026-05-19'),
  ]

  function setup(shownView: View = openView) {
    const writes = { create: vi.fn<MatrixApi['create']>(), update: vi.fn<MatrixApi['update']>(), remove: vi.fn<MatrixApi['remove']>(), undoBatch: vi.fn<MatrixApi['undoBatch']>(), runAction: vi.fn<MatrixApi['runAction']>() }
    writes.runAction.mockResolvedValue({ batch: 'f1', created: [] })
    writes.undoBatch.mockResolvedValue('uf1')
    const store = createMatrixStore({ view: openView, rows, api: writes, onStale: async () => rows })
    function Live() {
      const state = useSyncExternalStore(store.subscribe, store.getState)
      return <Matrix {...props} view={shownView} rows={state.rows} store={store} writable />
    }
    render(<Live />)
    const openCell = (title: RegExp) => within(screen.getByRole('row', { name: title })).getByTestId('open')
    return { writes, store, openCell }
  }

  it('leads with the summed count and the role labels; records next, free-text names last', () => {
    const { openCell } = setup()

    expect(headers().slice(0, 4)).toEqual(['Activiteit', 'Open', 'Sien', 'Lieve'])
    expect(openCell(/Montage/).textContent).toContain('4')
    expect(openCell(/Montage/).textContent).toContain('Speler, Licht')
    expect(openCell(/Repetitie/).textContent).toContain('1')
    expect(openCell(/Leeg/).textContent).toBe('')
    expect(within(screen.getByTestId('total')).getByTestId('open-count').textContent).toBe('5')
  })

  it('shows a pencilled cell with its mark', () => {
    setup()

    expect(within(screen.getByRole('row', { name: /Montage/ })).getByRole('gridcell', { name: /^Sien/ }).textContent).toContain('~')
  })

  it('with two open roles asks the role first, in Dutch, then fills the lowest open row of that role', async () => {
    const { writes, openCell } = setup()

    fireEvent.click(within(openCell(/Montage/)).getByRole('button'))
    const picker = screen.getByRole('region', { name: 'Open plek invullen' })
    expect(within(picker).getByText('Kies eerst een rol')).toBeTruthy()
    expect(within(picker).getByRole('button', { name: /Speler/ }).textContent).toBe('Speler · 3')
    expect(within(picker).queryByRole('button', { name: 'Marit' })).toBeNull()

    fireEvent.click(within(picker).getByRole('button', { name: /Speler/ }))
    expect(within(picker).getAllByRole('button', { name: 'Sien' })).toHaveLength(1)
    await act(async () => {
      fireEvent.click(within(picker).getByRole('button', { name: 'Marit' }))
    })

    expect(writes.runAction).toHaveBeenCalledWith('fill_slot', 21, { person: 7 })
    expect(screen.queryByRole('region', { name: 'Open plek invullen' })).toBeNull()
  })

  it('with one open role goes straight to the people', async () => {
    const { writes, openCell } = setup()

    fireEvent.click(within(openCell(/Repetitie/)).getByRole('button'))
    const picker = screen.getByRole('region', { name: 'Open plek invullen' })
    expect(within(picker).queryByText('Kies eerst een rol')).toBeNull()
    await act(async () => {
      fireEvent.click(within(picker).getByRole('button', { name: 'Marit' }))
    })

    expect(writes.runAction).toHaveBeenCalledWith('fill_slot', 23, { person: 7 })
  })

  describe('with a candidates source', () => {
    const from = { source: 'candidates', match: { slot_id: 'id' }, value: 'person', sort: ['rank'] }
    const fromView: View = { ...openView, join: { ...openView.join!, open: { ...openView.join!.open!, options_from: from } } }
    const person = (id: number, title: string) => ({ id, title, status: '', fields: {} })

    it('lists the candidates only, in their order, then everyone after Iedereen tonen', async () => {
      api.optionsFrom.mockResolvedValue([person(7, 'Marit'), person(5, 'Sien')])
      const { writes, openCell } = setup(fromView)

      fireEvent.click(within(openCell(/Repetitie/)).getByRole('button'))
      const picker = screen.getByRole('region', { name: 'Open plek invullen' })
      await act(async () => undefined)
      expect(api.optionsFrom).toHaveBeenCalledWith(from, expect.objectContaining({ id: 23 }))
      expect(within(picker).getAllByRole('button').map((b) => b.textContent)).toEqual(['Marit', 'Sien', 'Iedereen tonen', 'Annuleren'])

      fireEvent.click(within(picker).getByRole('button', { name: 'Iedereen tonen' }))
      expect(within(picker).getAllByRole('button', { name: 'Sien' })).toHaveLength(2)
      await act(async () => {
        fireEvent.click(within(picker).getByRole('button', { name: 'Marit' }))
      })
      expect(writes.runAction).toHaveBeenCalledWith('fill_slot', 23, { person: 7 })
    })

    it('says Geen kandidaten for an empty list, and still offers everyone', async () => {
      api.optionsFrom.mockResolvedValue([])
      const { openCell } = setup(fromView)

      fireEvent.click(within(openCell(/Repetitie/)).getByRole('button'))
      await act(async () => undefined)
      const picker = screen.getByRole('region', { name: 'Open plek invullen' })
      expect(within(picker).getByText('Geen kandidaten')).toBeTruthy()
      expect(within(picker).getByRole('button', { name: 'Iedereen tonen' })).toBeTruthy()
    })
  })

  it('takes the keyboard into the picker, and Escape gives it back to the open cell', () => {
    const { openCell } = setup()
    fireEvent.click(within(openCell(/Montage/)).getByRole('button'))
    const picker = screen.getByRole('region', { name: 'Open plek invullen' })
    expect(picker.contains(document.activeElement)).toBe(true)

    fireEvent.keyDown(document.activeElement!, { key: 'Escape' })

    expect(screen.queryByRole('region', { name: 'Open plek invullen' })).toBeNull()
    expect(document.activeElement).toBe(openCell(/Montage/))
  })

  it('Ctrl+Z right after a fill, from the open cell the keyboard is back on, undoes its batch and re-sends no write', async () => {
    const { writes, openCell } = setup()
    fireEvent.click(within(openCell(/Repetitie/)).getByRole('button'))
    await act(async () => {
      fireEvent.click(within(screen.getByRole('region', { name: 'Open plek invullen' })).getByRole('button', { name: 'Marit' }))
    })

    expect(document.activeElement).toBe(openCell(/Repetitie/))
    await act(async () => {
      fireEvent.keyDown(document.activeElement!, { key: 'z', ctrlKey: true })
    })

    expect(writes.undoBatch).toHaveBeenCalledWith('f1')
    expect(writes.runAction).toHaveBeenCalledTimes(1)
    expect([writes.create, writes.update, writes.remove].map((f) => f.mock.calls.length)).toEqual([0, 0, 0])
  })
})
