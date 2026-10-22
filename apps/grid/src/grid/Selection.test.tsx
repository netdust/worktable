import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react'
import { useState } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { renderNl } from '../test-setup'
import type { Available, Model, ModelAction, Row, View } from '../types'
import { activity, calais, planning } from './calais.test.data'
import { Grid } from './Grid'
import { defaults } from './layout'
import { createStore } from './store'

const remote = vi.hoisted(() => ({
  rowOf: vi.fn(), optionsFrom: vi.fn(), attachmentsOf: vi.fn(), recordHistory: vi.fn(() => Promise.resolve([])), recordCount: vi.fn(() => Promise.resolve(0)),
}))
vi.mock('../api', () => remote)

const gather: ModelAction = { name: 'gather', label: 'Bundelen', many: true, input: {} }
const named: ModelAction = { name: 'name_it', label: 'Benoemen', many: true, input: { name: { type: 'text', label: 'Naam' } } }
const withMany = { ...activity, actions: [gather] }

type Opened = { dataset: string; id: number } | null

function sheet(rows: Row[] = calais, options: { model?: typeof activity; view?: View; onAction?: () => Promise<Opened | void>; query?: string; onSelection?: (action: ModelAction, ids: number[], input: Record<string, unknown>) => Promise<Opened | void>; models?: Record<string, Model>; onNotice?: (message: string) => void } = {}) {
  const store = createStore({ model: 'activity', rows, api: { update: vi.fn(), create: vi.fn(), remove: vi.fn() } })
  const onSelection = options.onSelection ?? vi.fn(() => Promise.resolve())
  function Harness({ query }: { query: string }) {
    const [layout, setLayout] = useState(defaults(planning))
    return <Grid model={options.model ?? withMany} view={options.view ?? planning} store={store} writable layout={layout} onLayout={setLayout}
      query={query} emptyTitle="Leeg" onSelection={onSelection} onAction={options.onAction} models={options.models} onNotice={options.onNotice} />
  }
  const rendered = renderNl(<Harness query={options.query ?? ''} />)
  return { ...rendered, onSelection, search: (query: string) => rendered.rerender(<Harness query={query} />) }
}

const boxes = () => screen.queryAllByRole('checkbox')
const rowBox = (title: string) => screen.getByRole('checkbox', { name: `${title} selecteren` })
const headerBox = () => screen.getByRole('checkbox', { name: 'Alle rijen selecteren' })

beforeEach(() => {
  localStorage.clear()
  document.documentElement.lang = 'nl-BE'
})
afterEach(() => {
  cleanup()
  document.documentElement.lang = ''
})

describe('selecting rows', () => {
  it('a model with a selection action shows a checkbox per row and in the header; a model without one shows none', () => {
    sheet()
    expect(boxes()).toHaveLength(calais.length + 1)
    cleanup()

    sheet(calais, { model: activity })
    expect(boxes()).toHaveLength(0)
  })

  it('ticking two rows shows 2 geselecteerd and one button per selection action', () => {
    sheet(calais, { model: { ...activity, actions: [gather, named] } })
    expect(screen.queryByRole('region', { name: /geselecteerd/ })).toBeNull()

    fireEvent.click(rowBox('Montage'))
    fireEvent.click(rowBox('Repetitie'))

    const bar = screen.getByRole('region', { name: '2 geselecteerd' })
    expect(within(bar).getByRole('button', { name: 'Bundelen' })).toBeTruthy()
    expect(within(bar).getByRole('button', { name: 'Benoemen' })).toBeTruthy()
  })

  it('the header box selects every row the view shows, search applied', () => {
    sheet(calais, { query: 'Repetitie' })
    fireEvent.click(headerBox())
    expect(screen.getByRole('region', { name: '1 geselecteerd' })).toBeTruthy()
    expect(rowBox('Repetitie')).toHaveProperty('checked', true)
  })

  it('a ticked row that leaves the view leaves the selection', async () => {
    const { search } = sheet()
    fireEvent.click(rowBox('Montage'))
    fireEvent.click(rowBox('Repetitie'))

    search('Repetitie')

    await waitFor(() => expect(screen.getByRole('region', { name: '1 geselecteerd' })).toBeTruthy())
    search('')
    expect(screen.getByRole('region', { name: '1 geselecteerd' })).toBeTruthy()
    expect(rowBox('Montage')).toHaveProperty('checked', false)
  })

  it('the header box takes rows in folded groups too', () => {
    sheet()
    const band = screen.getAllByRole('row').find((r) => r.classList.contains('nv-group'))!
    fireEvent.click(band)
    expect(screen.queryByRole('checkbox', { name: 'Auto Pavel + Sien selecteren' })).toBeNull()

    fireEvent.click(headerBox())

    expect(screen.getByRole('region', { name: `${calais.length} geselecteerd` })).toBeTruthy()
  })

  it('Selectie wissen empties the selection and hides the bar', () => {
    sheet()
    fireEvent.click(headerBox())
    fireEvent.click(screen.getByRole('button', { name: 'Selectie wissen' }))
    expect(screen.queryByRole('region', { name: /geselecteerd/ })).toBeNull()
    expect(rowBox('Montage')).toHaveProperty('checked', false)
  })

  it('running an action sends the ticked ids once, then clears the selection', async () => {
    const { onSelection } = sheet()
    fireEvent.click(rowBox('Repetitie'))
    fireEvent.click(rowBox('Montage'))

    fireEvent.click(screen.getByRole('button', { name: 'Bundelen' }))

    await waitFor(() => expect(onSelection).toHaveBeenCalledExactlyOnceWith(gather, [102, 104], {}))
    await waitFor(() => expect(screen.queryByRole('region', { name: /geselecteerd/ })).toBeNull())
  })

  it('500 runs; 501 disables the buttons with Maximaal 500 tegelijk', () => {
    const many = Array.from({ length: 501 }, (_, i): Row => ({ id: i + 1, title: `Rij ${i + 1}`, status: '', fields: {} }))
    sheet(many, { view: { ...planning, columns: ['title'], lookups: {}, rollups: {}, group: undefined, sort: [] } })
    fireEvent.click(headerBox())
    expect(screen.getByRole('region', { name: '501 geselecteerd' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Bundelen' })).toHaveProperty('disabled', true)
    expect(screen.getByText('Maximaal 500 tegelijk')).toBeTruthy()

    fireEvent.click(rowBox('Rij 501'))

    expect(screen.getByRole('region', { name: '500 geselecteerd' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Bundelen' })).toHaveProperty('disabled', false)
    expect(screen.queryByText('Maximaal 500 tegelijk')).toBeNull()
  })

  it('keeps its strip while nothing is ticked, so a first tick moves no row', () => {
    const { container } = sheet()
    const idle = container.querySelector('.nv-selection')
    expect(idle).not.toBeNull()
    expect(idle?.getAttribute('aria-hidden')).toBe('true')

    fireEvent.click(rowBox('Montage'))

    expect(container.querySelectorAll('.nv-selection')).toHaveLength(1)
    expect(screen.getByRole('region', { name: '1 geselecteerd' })).toBe(container.querySelector('.nv-selection'))
  })

  it('leaves the row boxes out of the tab order except on the active row; the header box stays in it', () => {
    sheet()
    expect(rowBox('Montage')).toHaveProperty('tabIndex', -1)
    expect(headerBox()).toHaveProperty('tabIndex', 0)

    fireEvent.click(screen.getAllByRole('gridcell').find((c) => c.closest('tr')?.dataset.title === 'Montage' && c.hasAttribute('data-cell'))!)

    expect(rowBox('Montage')).toHaveProperty('tabIndex', 0)
    expect(rowBox('Repetitie')).toHaveProperty('tabIndex', -1)
  })

  it('disables the other actions while one run is sending, and frees them when it settles', async () => {
    let finish: () => void = () => undefined
    const onSelection = vi.fn(() => new Promise<void>((done) => { finish = done }))
    sheet(calais, { model: { ...activity, actions: [gather, { ...named, input: {} }] }, onSelection })
    fireEvent.click(rowBox('Montage'))

    fireEvent.click(screen.getByRole('button', { name: 'Bundelen' }))

    await waitFor(() => expect(screen.getByRole('button', { name: 'Benoemen' })).toHaveProperty('disabled', true))
    finish()
    await waitFor(() => expect(screen.queryByRole('region', { name: /geselecteerd/ })).toBeNull())
  })

  it("offers the drawer only the actions whose handler exists", () => {
    const single: ModelAction = { name: 'once', label: 'Eenmalig', input: {} }
    sheet(calais, { model: { ...activity, actions: [single, gather] } })

    fireEvent.click(screen.getAllByRole('button', { name: 'Openen' })[0] as HTMLElement)

    expect(screen.getByRole('group', { name: 'Bundelen' })).toBeTruthy()
    expect(screen.queryByRole('group', { name: 'Eenmalig' })).toBeNull()
  })

  it('prunes through a re-read of the same sheet, a store that no longer holds the ticked row', async () => {
    const { rerender } = renderStores()
    fireEvent.click(rowBox('Montage'))
    fireEvent.click(rowBox('Repetitie'))

    rerender(calais.filter((r) => r.title !== 'Montage'))

    await waitFor(() => expect(screen.getByRole('region', { name: '1 geselecteerd' })).toBeTruthy())
  })
})

function renderStores() {
  const onSelection = vi.fn(() => Promise.resolve())
  const storeOf = (rows: Row[]) => createStore({ model: 'activity', rows, api: { update: vi.fn(), create: vi.fn(), remove: vi.fn() } })
  function Harness({ store }: { store: ReturnType<typeof storeOf> }) {
    const [layout, setLayout] = useState(defaults(planning))
    return <Grid model={withMany} view={planning} store={store} writable layout={layout} onLayout={setLayout} query="" emptyTitle="Leeg" onSelection={onSelection} />
  }
  const rendered = renderNl(<Harness store={storeOf(calais)} />)
  return { ...rendered, rerender: (rows: Row[]) => rendered.rerender(<Harness store={storeOf(rows)} />) }
}

const marked = (...actions: string[]): Available => ({ state: null, buttons: [], actions })
const withMarks = (marks: Record<number, Available>): Row[] => calais.map((row) => (marks[row.id] ? { ...row, available: marks[row.id] } : row))

describe('an action the rows do not all allow', () => {
  it('is disabled with Past niet op N rijen when a ticked row’s available.actions lacks it', () => {
    sheet(withMarks({ 102: marked('gather'), 104: marked() }))
    fireEvent.click(rowBox('Montage'))
    fireEvent.click(rowBox('Repetitie'))

    expect(screen.getByRole('button', { name: 'Bundelen' })).toHaveProperty('disabled', true)
    expect(screen.getByText('Past niet op 1 rijen')).toBeTruthy()

    fireEvent.click(rowBox('Repetitie'))

    expect(screen.getByRole('button', { name: 'Bundelen' })).toHaveProperty('disabled', false)
    expect(screen.queryByText(/Past niet op/)).toBeNull()
  })

  it('stays enabled on rows that carry no marks: a source without conditions allows every action', () => {
    sheet()
    fireEvent.click(rowBox('Montage'))
    expect(screen.getByRole('button', { name: 'Bundelen' })).toHaveProperty('disabled', false)
  })
})

describe('an action that opens its result', () => {
  const organisation = { key: 'organisation', label: 'Organisatie', title_label: 'Naam', title_readonly: false, fields: {} } as unknown as Model
  const models = { activity: withMany, organisation } as Record<string, Model>
  const record: Row = { id: 12, title: 'Le Grenier, Calais', status: '', fields: {} }
  const many = { ...gather, opens: true as const }
  const opening = { ...withMany, actions: [many] }

  beforeEach(() => remote.rowOf.mockReset())

  it('opens the created record’s drawer after a run from the bar, and clears the selection', async () => {
    remote.rowOf.mockResolvedValue(record)
    const onSelection = vi.fn(() => Promise.resolve({ dataset: 'organisation', id: 12 }))
    sheet(calais, { model: opening, models, onSelection })
    fireEvent.click(rowBox('Montage'))

    fireEvent.click(screen.getByRole('button', { name: 'Bundelen' }))

    expect(await screen.findByRole('complementary', { name: 'Le Grenier, Calais' })).toBeTruthy()
    expect(remote.rowOf).toHaveBeenCalledWith('organisation', 12)
    expect(screen.queryByRole('region', { name: /geselecteerd/ })).toBeNull()
  })

  it('opens it after a run from the drawer too', async () => {
    remote.rowOf.mockResolvedValue(record)
    const onSelection = vi.fn(() => Promise.resolve({ dataset: 'organisation', id: 12 }))
    sheet(calais, { model: opening, models, onSelection })
    fireEvent.click(screen.getAllByRole('button', { name: 'Openen' })[0])
    const drawer = await screen.findByRole('complementary')

    fireEvent.click(within(drawer).getByRole('button', { name: 'Bundelen' }))

    expect(await screen.findByRole('complementary', { name: 'Le Grenier, Calais' })).toBeTruthy()
  })

  it('keeps the table’s own drawer when the result is a record the table holds', async () => {
    const onSelection = vi.fn(() => Promise.resolve({ dataset: 'activity', id: 102 }))
    sheet(calais, { model: opening, models, onSelection })
    fireEvent.click(screen.getAllByRole('button', { name: 'Openen' })[0])
    const drawer = await screen.findByRole('complementary')

    fireEvent.click(within(drawer).getByRole('button', { name: 'Bundelen' }))

    expect(await screen.findByRole('complementary', { name: 'Montage' })).toBeTruthy()
    expect(remote.rowOf).not.toHaveBeenCalled()
  })

  it('a gone record shows the recordGone notice and opens nothing', async () => {
    remote.rowOf.mockResolvedValue(null)
    const onNotice = vi.fn()
    const onSelection = vi.fn(() => Promise.resolve({ dataset: 'organisation', id: 12 }))
    sheet(calais, { model: opening, models, onSelection, onNotice })
    fireEvent.click(rowBox('Montage'))

    fireEvent.click(screen.getByRole('button', { name: 'Bundelen' }))

    await waitFor(() => expect(onNotice).toHaveBeenCalledExactlyOnceWith('Dit record bestaat niet meer of je mag het niet zien'))
    expect(screen.queryByRole('complementary')).toBeNull()
  })

  it('opens nothing for an action that does not declare it', async () => {
    const onSelection = vi.fn(() => Promise.resolve(undefined))
    sheet(calais, { model: withMany, models, onSelection })
    fireEvent.click(rowBox('Montage'))
    fireEvent.click(screen.getByRole('button', { name: 'Bundelen' }))
    await waitFor(() => expect(onSelection).toHaveBeenCalled())
    expect(screen.queryByRole('complementary')).toBeNull()
  })
})

describe('the drawer’s actions', () => {
  it('leaves out an action its row is not marked for, and offers every action on a row with no marks', async () => {
    sheet(withMarks({ 102: marked('name_it') }), { model: { ...activity, actions: [gather, named] } })
    fireEvent.click(screen.getAllByRole('button', { name: 'Openen' }).find((b) => b.closest('tr')?.textContent?.includes('Montage'))!)
    const marked104 = await screen.findByRole('complementary', { name: 'Montage' })
    expect(within(marked104).queryByRole('group', { name: 'Bundelen' })).toBeNull()
    expect(within(marked104).getByRole('group', { name: 'Benoemen' })).toBeTruthy()
  })
})
