import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { LinkItem, Model, Row, View } from '../../types'
import { filterFields } from '../filter'
import { Grid } from '../Grid'
import { defaults } from '../layout'
import { createStore, type StoreApi } from '../store'
import type { LinkActions } from './Links'

const remote = vi.hoisted(() => ({ records: vi.fn() }))
vi.mock('../../api', () => remote)

const day: Model = {
  key: 'day', label: 'Dag', title_label: 'Omschrijving', title_readonly: false, query: true,
  fields: {
    people: {
      type: 'links', label: 'Mensen', required: false, fact: false,
      link: {
        item: 'Toewijzing', dataset: 'assignment', key: 'day_id', target: 'person_id', target_dataset: 'person',
        state: { options: { invited: 'Uitgenodigd', confirmed: 'Bevestigd' }, tones: { invited: 'warn', confirmed: 'ok' }, default: 'invited' },
      },
    },
  },
}
const view: View = {
  key: 'day', label: 'Dag', table: 'day', table_label: 'Dag', model: 'day', type: 'grid',
  columns: ['title', 'people'], lookups: {}, rollups: {}, filters: [], sort: [], group: null,
}
const lotte: LinkItem = { id: 70, target: 1, title: 'Lotte', state: 'confirmed' }
const jan: LinkItem = { id: 71, target: 2, title: 'Jan', state: 'invited' }
const guest: LinkItem = { id: 72, target: null, title: 'Gastmuzikant', state: 'invited' }
const lunch: Row = { id: 5, title: 'Lunch', status: '', fields: { people: [lotte, jan, guest] } }
const person = (id: number, title: string): Row => ({ id, title, status: '', fields: {} })

let actions: { add: ReturnType<typeof vi.fn<LinkActions['add']>>; remove: ReturnType<typeof vi.fn<LinkActions['remove']>> }

function renderGrid() {
  actions = { add: vi.fn<LinkActions['add']>().mockResolvedValue(), remove: vi.fn<LinkActions['remove']>().mockResolvedValue() }
  const api = { update: vi.fn<StoreApi['update']>(), create: vi.fn<StoreApi['create']>() }
  const store = createStore({ model: 'day', rows: [lunch], api })
  render(
    <Grid model={day} view={view} store={store} writable layout={defaults(view)} onLayout={() => undefined}
      query="" emptyTitle="" models={{ day }} links={actions} />,
  )
}

const cell = () => {
  const row = screen.getAllByRole('row').find((r) => r.dataset.title === 'Lunch')
  if (!row) throw new Error('no row')
  const headers = screen.getAllByRole('columnheader').map((h) => h.dataset.column)
  return within(row).getAllByRole('gridcell')[headers.indexOf('people')]
}
const open = () => {
  fireEvent.click(cell())
  fireEvent.keyDown(cell(), { key: 'Enter' })
}
const popup = () => document.querySelector<HTMLElement>('.nv-links-pop') as HTMLElement
const tag = (name: string) => within(popup()).getByRole('listitem', { name })

beforeEach(() => {
  remote.records.mockResolvedValue({ rows: [person(1, 'Lotte'), person(2, 'Jan'), person(3, 'Mira')], total: 3 })
})
afterEach(() => {
  cleanup()
  vi.resetAllMocks()
})

describe('a links cell', () => {
  it("shows a tag per link in its state's tone, the free-text one grey", () => {
    renderGrid()
    const tags = within(cell()).getAllByRole('listitem')
    expect(tags.map((t) => t.textContent)).toEqual(['Lotte', 'Jan', 'Gastmuzikant'])
    expect(tags[0]?.className).toContain('nv-pill--ok')
    expect(tags[1]?.className).toContain('nv-pill--warn')
    expect(tags[2]?.className).toContain('nv-pill--muted')
  })

  it('opens on Enter with the people listed, those already linked checked; Escape closes it', async () => {
    renderGrid()
    open()
    const options = await screen.findAllByRole('option')
    expect(options.map((o) => [o.textContent, o.getAttribute('aria-checked')])).toEqual([
      ['Lotte', 'true'],
      ['Jan', 'true'],
      ['Mira', 'false'],
    ])
    fireEvent.keyDown(screen.getByRole('combobox', { name: 'Mensen' }), { key: 'Escape' })
    expect(screen.queryByRole('combobox', { name: 'Mensen' })).toBeNull()
  })

  it('adds an unchecked person, and keeps the list open', async () => {
    renderGrid()
    open()
    const mira = (await screen.findAllByRole('option'))[2] as HTMLElement
    await act(async () => fireEvent.click(mira))
    expect(actions.add).toHaveBeenCalledWith('people', lunch, 3)
    expect(screen.getByRole('combobox', { name: 'Mensen' })).toBeTruthy()
  })

  it('removes a link in the default state at once, by the tag or by unchecking', async () => {
    renderGrid()
    open()
    await act(async () => fireEvent.click(within(tag('Jan')).getByRole('button', { name: 'Jan verwijderen' })))
    expect(actions.remove).toHaveBeenCalledWith('people', lunch, jan)
    actions.remove.mockClear()
    const unchecked = (await screen.findAllByRole('option'))[1] as HTMLElement
    await act(async () => fireEvent.click(unchecked))
    expect(actions.remove).toHaveBeenCalledWith('people', lunch, jan)
  })

  it('asks before removing a link that left the default state; Annuleren keeps it', async () => {
    renderGrid()
    open()
    fireEvent.click(within(tag('Lotte')).getByRole('button', { name: 'Lotte verwijderen' }))
    expect(screen.getByRole('alertdialog').textContent).toContain('Toewijzing van Lotte verwijderen?')
    fireEvent.click(screen.getByRole('button', { name: 'Annuleren' }))
    expect(actions.remove).not.toHaveBeenCalled()
    fireEvent.click(within(tag('Lotte')).getByRole('button', { name: 'Lotte verwijderen' }))
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Verwijderen' })))
    expect(actions.remove).toHaveBeenCalledWith('people', lunch, lotte)
  })

  it('offers no remove on a link without a target', () => {
    renderGrid()
    open()
    expect(within(tag('Gastmuzikant')).queryByRole('button')).toBeNull()
  })

  it('is never cleared by Delete, nor offered to sort, group or filter', () => {
    renderGrid()
    fireEvent.click(cell())
    fireEvent.keyDown(cell(), { key: 'Delete' })
    expect(actions.remove).not.toHaveBeenCalled()
    expect(filterFields(day, [lunch]).map((f) => f.field)).not.toContain('people')
    fireEvent.click(screen.getByRole('button', { name: /^Groep/ }))
    expect(screen.queryByRole('menuitemradio', { name: 'Mensen' })).toBeNull()
  })
})
