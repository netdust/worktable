import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { renderNl } from '../test-setup'
import type { Field, Model, Row, View } from '../types'

const remote = vi.hoisted(() => ({ rowsWhere: vi.fn((): Promise<{ rows: Row[]; total: number }> => Promise.resolve({ rows: [], total: 0 })), recordHistory: vi.fn(() => Promise.resolve([])), rowOf: vi.fn() }))
vi.mock('../api', async (original) => ({ ...(await original<typeof import('../api')>()), ...remote }))
const { Grid } = await import('./Grid')
const { createStore } = await import('./store')
const { defaults } = await import('./layout')

afterEach(() => {
  cleanup()
  window.localStorage.clear()
})

const status: Field = {
  type: 'select', label: 'Status', required: true, fact: false, options: { todo: 'Te doen', klaar: 'Klaar' }, categories: { todo: 'open', klaar: 'done' },
}
const model = {
  key: 'taak', label: 'Taken', title_label: 'Titel', title_readonly: false, parent: 'parent_id', progress: true,
  fields: { status, parent_id: { type: 'relation', label: 'Hoort bij', required: false, fact: false, relation: { model: 'taak', multiple: false } } },
} as unknown as Model
const view = { key: 'taken', label: 'Taken', table: 'taken', model: 'taak', type: 'grid' } as unknown as View
const row = (id: number, title: string, parent: number | null, extra: Partial<Row> = {}): Row => ({ id, title, status: '', fields: { status: 'todo', parent_id: parent === null ? null : [parent] }, ...extra })

function draw(rows: Row[], onShown = vi.fn()) {
  const store = createStore({ model: 'taak', rows, api: { update: vi.fn(), create: vi.fn(), remove: vi.fn() } })
  renderNl(<Grid model={model} view={view} store={store} writable layout={defaults(view)} onLayout={() => undefined} query="" emptyTitle="leeg" onShown={onShown} />)
  return onShown
}
const titles = () => screen.getAllByRole('row').flatMap((r) => (r.dataset.title ? [r.dataset.title] : []))
const depthOf = (title: string) => screen.getAllByRole('row').find((r) => r.dataset.title === title)!.querySelector<HTMLElement>('.nv-rowtree')?.style.getPropertyValue('--depth')

describe('the grid as a tree', () => {
  const rows = [row(1, 'Bouwen', null, { progress: { done: 1, total: 2 } }), row(2, 'Fundering', 1), row(3, 'Muren', 1), row(4, 'Verven', null)]

  it('indents children under their parent, and shows "1/2" on the parent', () => {
    draw(rows)
    expect(titles()).toEqual(['Bouwen', 'Fundering', 'Muren', 'Verven'])
    expect(depthOf('Bouwen')).toBe('0')
    expect(depthOf('Fundering')).toBe('1')
    const parent = screen.getAllByRole('row').find((r) => r.dataset.title === 'Bouwen')!
    expect(parent.textContent).toContain('1/2')
  })

  it('folds a parent from its chevron, and remembers it for the view', () => {
    draw(rows)
    fireEvent.click(screen.getByRole('button', { name: 'Bouwen inklappen' }))
    expect(titles()).toEqual(['Bouwen', 'Verven'])
    expect(window.localStorage.getItem('ntdst-views/folded/v1/taken/parent_id')).toBe('["1"]')
    cleanup()
    draw(rows)
    expect(titles()).toEqual(['Bouwen', 'Verven'])
    fireEvent.click(screen.getByRole('button', { name: 'Bouwen uitklappen' }))
    expect(titles()).toEqual(['Bouwen', 'Fundering', 'Muren', 'Verven'])
  })

  it('keeps an ancestor a filter dropped greyed, and leaves it out of the count', () => {
    const onShown = draw([row(1, 'Bouwen', null, { muted: true }), row(2, 'Fundering', 1)])
    expect(titles()).toEqual(['Bouwen', 'Fundering'])
    expect(screen.getAllByRole('row').find((r) => r.dataset.title === 'Bouwen')?.hasAttribute('data-muted')).toBe(true)
    expect(screen.getAllByRole('row').find((r) => r.dataset.title === 'Fundering')?.hasAttribute('data-muted')).toBe(false)
    expect(onShown).toHaveBeenLastCalledWith(expect.objectContaining({ rows: 1 }))
  })

  it('walks the keyboard in the order shown, children after their parent', () => {
    draw([row(3, 'Muren', 1), row(1, 'Bouwen', null), row(2, 'Fundering', 1)])
    expect(titles()).toEqual(['Bouwen', 'Muren', 'Fundering'])
    const cells = screen.getAllByRole('gridcell').filter((c) => c.dataset.cell?.endsWith('-0'))
    expect(cells.map((c) => c.dataset.cell)).toEqual(['0-0', '1-0', '2-0'])
  })

  it('lists the children in the open drawer', async () => {
    remote.rowsWhere.mockResolvedValue({ rows: [row(2, 'Fundering', 1)], total: 1 })
    draw(rows)
    fireEvent.click(screen.getAllByRole('row').find((r) => r.dataset.title === 'Bouwen')!.querySelector('.nv-open')!)
    const region = await screen.findByRole('region', { name: 'Onderliggend' })
    await waitFor(() => expect(within(region).getByText('Fundering')).toBeTruthy())
  })
})
