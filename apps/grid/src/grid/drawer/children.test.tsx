import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { renderHook } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { Board } from '../../board/Board'
import type { Field, Model, Row, Scope, TableDef, View } from '../../types'
import { SkinChips } from '../../ui/SkinChips'
import { defaults } from '../layout'
import { columnsFor } from '../columns'
import { Display } from '../cells'
import { createStore } from '../store'

const remote = vi.hoisted(() => ({
  rowsWhere: vi.fn(), create: vi.fn(), update: vi.fn(), remove: vi.fn(), rowOf: vi.fn(), recordHistory: vi.fn(() => Promise.resolve([])),
}))
vi.mock('../../api', async (original) => ({ ...(await original<typeof import('../../api')>()), ...remote }))
const { ChildrenSection } = await import('./ChildrenSection')
const { useGridStore } = await import('../hooks')
const { createHistory } = await import('../../ui/history')

afterEach(() => {
  cleanup()
  for (const fn of Object.values(remote)) fn.mockReset()
})

const status: Field = {
  type: 'select', label: 'Status', required: true, fact: false,
  options: { todo: 'Te doen', bezig: 'Bezig', klaar: 'Klaar', geschrapt: 'Geschrapt' },
  categories: { todo: 'open', bezig: 'active', klaar: 'done', geschrapt: 'cancelled' },
}
const parent: Field = { type: 'relation', label: 'Hoort bij', required: false, fact: false, relation: { model: 'taak', multiple: false } }
const model = {
  key: 'taak', label: 'Taken', title_label: 'Titel', title_readonly: false, new_label: 'Nieuwe taak', parent: 'parent_id', progress: true, archive_after: 30,
  fields: { status, parent_id: parent, organisatie_id: { ...parent, label: 'Klant', relation: { model: 'organisatie', multiple: false } } },
} as unknown as Model
const tables = [{ key: 'taken', label: 'Taken', model: 'taak', space: 'scoped' }] as unknown as TableDef[]
const scope: Scope = { field: 'organisatie_id', id: 4 } as Scope
const row = (id: number, title: string, state: string): Row => ({ id, title, status: '', fields: { status: state, parent_id: [1] } })
const parentRow: Row = { id: 1, title: 'Bouwen', status: '', fields: { status: 'bezig', parent_id: null }, progress: { done: 1, total: 3 } }

/** What the three reads of the section answer: the listed children, every child with the archived, and the unfinished ones. */
function reads(listed: Row[], all: number, unfinished: number) {
  remote.rowsWhere.mockImplementation(async (_source, where: Record<string, unknown>, _sort, limit: number, archived?: boolean) => {
    if (!archived) return { rows: listed, total: listed.length }
    return { rows: [], total: 'status' in where ? unfinished : all, limit }
  })
}

const section = (props: Partial<Parameters<typeof ChildrenSection>[0]> = {}) =>
  render(<ChildrenSection model={model} row={parentRow} tables={tables} scope={scope} version="0" onCreate={vi.fn(() => Promise.resolve())} onFinish={vi.fn()} {...props} />)

describe('the drawer’s children', () => {
  it('lists every child with its status mark, and creates one with the parent and the space set', async () => {
    reads([row(2, 'Fundering', 'klaar'), row(3, 'Muren', 'todo')], 2, 1)
    const onCreate = vi.fn(() => Promise.resolve())
    section({ onCreate })

    const region = await screen.findByRole('region', { name: 'Onderliggend' })
    expect(within(region).getByText('Fundering').closest('li')?.querySelector('[data-category="done"]')).not.toBeNull()
    expect(within(region).getByText('Muren').closest('li')?.querySelector('[data-category="open"]')).not.toBeNull()
    expect(remote.rowsWhere).toHaveBeenCalledWith('taak', { parent_id: 1 }, [], 200)

    fireEvent.click(within(region).getByRole('button', { name: '+ Nieuwe taak' }))
    fireEvent.change(within(region).getByLabelText('Titel'), { target: { value: 'Dak' } })
    fireEvent.click(within(region).getByRole('button', { name: 'Toevoegen' }))
    await waitFor(() => expect(onCreate).toHaveBeenCalledWith({ organisatie_id: [4], status: 'todo', parent_id: [1], title: 'Dak' }))
  })

  it('offers no "+" without a way to create', async () => {
    reads([], 0, 0)
    section({ onCreate: undefined })
    await screen.findByRole('region', { name: 'Onderliggend' })
    expect(screen.queryByRole('button', { name: /Nieuwe taak/ })).toBeNull()
  })

  it('says every subtask is done once none is open or active, and writes the parent to done', async () => {
    reads([row(2, 'Fundering', 'klaar'), row(3, 'Muren', 'geschrapt')], 2, 0)
    const onFinish = vi.fn()
    section({ onFinish })

    fireEvent.click(await screen.findByRole('button', { name: 'Markeer als afgerond' }))
    expect(screen.getByText('Alle subtaken afgerond')).toBeTruthy()
    expect(onFinish).toHaveBeenCalledWith('klaar')
  })

  it('decides it from a count that sees every child: six children, the first five done, one still open', async () => {
    const five = [1, 2, 3, 4, 5].map((n) => row(n + 10, `Klaar ${n}`, 'klaar'))
    reads(five, 6, 1)
    section()
    await screen.findByRole('region', { name: 'Onderliggend' })
    expect(screen.queryByText('Alle subtaken afgerond')).toBeNull()
    expect(remote.rowsWhere).toHaveBeenCalledWith('taak', { parent_id: 1, status: { $in: ['todo', 'bezig'] } }, [], 1, true)
  })

  it('says it when every child is archived, though the list shows none', async () => {
    reads([], 2, 0)
    section()
    expect(await screen.findByText('Alle subtaken afgerond')).toBeTruthy()
    expect(remote.rowsWhere).toHaveBeenCalledWith('taak', { parent_id: 1 }, [], 1, true)
  })

  it('says nothing for a parent with no child, or one that is already done', async () => {
    reads([], 0, 0)
    const { unmount } = section()
    await screen.findByRole('region', { name: 'Onderliggend' })
    expect(screen.queryByText('Alle subtaken afgerond')).toBeNull()
    unmount()
    reads([row(2, 'Fundering', 'klaar')], 1, 0)
    section({ row: { ...parentRow, fields: { ...parentRow.fields, status: 'klaar' } } })
    await screen.findByText('Fundering')
    expect(screen.queryByText('Alle subtaken afgerond')).toBeNull()
  })

  it('reads again when the view was read again', async () => {
    reads([], 0, 0)
    const { rerender } = section()
    await screen.findByRole('region', { name: 'Onderliggend' })
    const asked = remote.rowsWhere.mock.calls.length
    rerender(<ChildrenSection model={model} row={parentRow} tables={tables} scope={scope} version="1" />)
    await waitFor(() => expect(remote.rowsWhere.mock.calls.length).toBeGreaterThan(asked))
  })
})

describe('progress', () => {
  const view = { key: 't', label: 'Taken', table: 'taken', model: 'taak', type: 'grid' } as unknown as View

  it('reads "1/3" with a bar on the grid row, and nothing for a row with no children', () => {
    const column = columnsFor(model, view).find((c) => c.id === 'progress')!
    const { container } = render(<Display column={column} row={parentRow} onToggle={() => undefined} />)
    expect(container.textContent).toBe('1/3')
    expect(container.querySelector('.nv-progress__bar i')?.getAttribute('style')).toContain('33%')
    cleanup()
    const none = render(<Display column={column} row={{ ...parentRow, progress: { done: 0, total: 0 } }} onToggle={() => undefined} />)
    expect(none.container.textContent).toBe('')
  })

  it('sorts by its share, and a model without it has no such column', () => {
    const column = columnsFor(model, view).find((c) => c.id === 'progress')!
    expect(column.value({ ...parentRow, progress: { done: 1, total: 4 } })).toBe(0.25)
    expect(columnsFor({ ...model, progress: undefined } as Model, view).some((c) => c.id === 'progress')).toBe(false)
  })

  it('shows on a board card', () => {
    const board = { key: 'b', label: 'Bord', table: 'taken', model: 'taak', type: 'board', board: { column: 'status' } } as unknown as View
    render(<Board view={board} model={model} models={{}} rows={[parentRow]} column="status" layout={defaults(board)} />)
    expect(screen.getByRole('button', { name: /Bouwen/ }).textContent).toContain('1/3')
  })
})

describe('deleting a parent that has children', () => {
  it('says what still uses it, not a raw error', async () => {
    const refused = { code: 'in_use', message: 'Still referenced by taken (2)', by: [{ label: 'Taken', count: 2 }], status: 409 }
    const store = createStore({ model: 'taak', rows: [parentRow], api: { update: vi.fn(), create: vi.fn(), remove: () => Promise.reject(refused) } })
    await store.remove(1)
    expect(store.getState().error?.message).toBe('Nog in gebruik door Taken (2).')
    expect(store.getState().rows).toHaveLength(1)
  })
})

describe('a write on a dataset with a parent', () => {
  const view = { key: 't', label: 'Taken', table: 'taken', model: 'taak', type: 'grid' } as unknown as View
  const stored = { row: { ...parentRow }, batch: 'b1' }

  async function written(data: Record<string, unknown>, rereads: string[] | undefined) {
    remote.update.mockResolvedValue(stored)
    const reload = vi.fn()
    const { result } = renderHook(() => useGridStore(view, [parentRow], createHistory(vi.fn()), reload, undefined, rereads))
    await act(async () => {
      const [field, value] = Object.entries(data)[0]
      await result.current[0]?.apply({ id: 1, field, value })
    })
    return reload
  }

  it('reads the view again when the status or the parent changes, and for nothing else', async () => {
    expect(await written({ status: 'klaar' }, ['parent_id', 'status'])).toHaveBeenCalled()
    expect(await written({ parent_id: [9] }, ['parent_id', 'status'])).toHaveBeenCalled()
    expect(await written({ title: 'Anders' }, ['parent_id', 'status'])).not.toHaveBeenCalled()
  })

  it('does not, for a dataset without a parent', async () => {
    expect(await written({ status: 'klaar' }, undefined)).not.toHaveBeenCalled()
  })

  it('reads again after a create and after a delete', async () => {
    remote.create.mockResolvedValue({ row: row(7, 'Nieuw', 'todo'), batch: 'b2' })
    remote.remove.mockResolvedValue(undefined)
    const reload = vi.fn()
    const { result } = renderHook(() => useGridStore(view, [parentRow], createHistory(vi.fn()), reload, undefined, ['parent_id', 'status']))
    await act(async () => { await result.current[0]?.create({ title: 'Nieuw' }) })
    expect(reload).toHaveBeenCalledTimes(1)
    await act(async () => { await result.current[0]?.remove(1) })
    expect(reload).toHaveBeenCalledTimes(2)
  })
})

describe('"Archief tonen"', () => {
  const chips = (m: Model) => render(<SkinChips view={{ key: 'v', label: 'V', table: 't', model: 'taak', type: 'calendar' } as unknown as View} model={m} size="M" onSize={() => undefined}
    away onAway={() => undefined} finished={false} onFinished={() => undefined} archived={false} onArchived={onArchived} />)
  const onArchived = vi.fn()

  it('shows on a dataset that archives, on any skin, and presses the choice', () => {
    chips(model)
    fireEvent.click(screen.getByRole('button', { name: 'Archief tonen' }))
    expect(onArchived).toHaveBeenCalledTimes(1)
  })

  it('is absent on a dataset that does not archive', () => {
    chips({ ...model, archive_after: undefined } as Model)
    expect(screen.queryByRole('button', { name: 'Archief tonen' })).toBeNull()
  })
})
