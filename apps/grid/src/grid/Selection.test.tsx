import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react'
import { useState } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { renderNl } from '../test-setup'
import type { ModelAction, Row, View } from '../types'
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

function sheet(rows: Row[] = calais, options: { model?: typeof activity; view?: View; query?: string; onSelection?: (action: ModelAction, ids: number[], input: Record<string, unknown>) => Promise<void> } = {}) {
  const store = createStore({ model: 'activity', rows, api: { update: vi.fn(), create: vi.fn(), remove: vi.fn() } })
  const onSelection = options.onSelection ?? vi.fn(() => Promise.resolve())
  function Harness({ query }: { query: string }) {
    const [layout, setLayout] = useState(defaults(planning))
    return <Grid model={options.model ?? withMany} view={options.view ?? planning} store={store} writable layout={layout} onLayout={setLayout}
      query={query} emptyTitle="Leeg" onSelection={onSelection} />
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
})
