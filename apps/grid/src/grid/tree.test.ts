import { renderHook, act } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Model, Row } from '../types'
import type { Group } from './group'

const remote = vi.hoisted(() => ({ rowsWhere: vi.fn() }))
vi.mock('../api', () => remote)
const { MAX_DEPTH, readWithTree, treeOrder, withAncestors } = await import('./tree')
const { useTree } = await import('./useTree')
const { rowsQuery, toRow, PROGRESS } = await import('../engine')
const { defaults } = await import('./layout')

afterEach(() => {
  remote.rowsWhere.mockReset()
  window.localStorage.clear()
})

const model = { key: 'taak', label: 'Taken', title_label: 'Titel', title_readonly: false, parent: 'parent_id', fields: {} } as unknown as Model
const row = (id: number, parent: number | null, title = `t${id}`): Row => ({ id, title, status: '', fields: { parent_id: parent === null ? null : [parent] } })
const none = { shut: new Set<string>(), muted: new Set<number>() }
const ids = (rows: Row[], opts = none) => treeOrder(rows, 'parent_id', opts).map((p) => `${p.depth}:${p.row.id}`)

describe('treeOrder', () => {
  it('puts children under their parent, indented, siblings in the order given', () => {
    const rows = [row(1, null), row(2, 1), row(3, null), row(4, 1), row(5, 2)]
    expect(ids(rows)).toEqual(['0:1', '1:2', '2:5', '1:4', '0:3'])
  })

  it('takes a parent held as a bare id as well as a list', () => {
    const bare = { ...row(2, null), fields: { parent_id: 1 } }
    expect(ids([row(1, null), bare])).toEqual(['0:1', '1:2'])
  })

  it('leaves out the children of a collapsed parent, keyed by the id as a string', () => {
    const rows = [row(1, null), row(2, 1), row(3, 2), row(4, null)]
    expect(ids(rows, { ...none, shut: new Set(['1']) })).toEqual(['0:1', '0:4'])
    expect(ids(rows, { ...none, shut: new Set(['2']) })).toEqual(['0:1', '1:2', '0:4'])
  })

  it('makes a root of a row whose parent is not among the rows', () => {
    expect(ids([row(2, 9)])).toEqual(['0:2'])
  })

  it('places each row of a loop once and never deeper than the cap', () => {
    const loop = [row(1, 2), row(2, 1)]
    expect(treeOrder(loop, 'parent_id', none).map((p) => p.row.id).sort()).toEqual([1, 2])
    const chain = Array.from({ length: 9 }, (_, i) => row(i + 1, i === 0 ? null : i))
    const placed = treeOrder(chain, 'parent_id', none)
    expect(placed).toHaveLength(9)
    expect(Math.max(...placed.map((p) => p.depth))).toBe(MAX_DEPTH)
  })

  it('marks the muted rows', () => {
    const placed = treeOrder([row(1, null), row(2, 1)], 'parent_id', { ...none, muted: new Set([1]) })
    expect(placed.map((p) => p.muted)).toEqual([true, false])
  })
})

describe('withAncestors', () => {
  it('adds the ancestor a filter dropped, muted, read with archived rows', async () => {
    remote.rowsWhere.mockResolvedValueOnce({ rows: [row(1, null)], total: 1 })
    const found = await withAncestors(model, [row(2, 1)])
    expect(found.rows.map((r) => r.id)).toEqual([2, 1])
    expect([...found.muted]).toEqual([1])
    expect(remote.rowsWhere).toHaveBeenCalledWith('taak', { id: { $in: [1] } }, [], 100, true)
  })

  it('reads nothing when every parent is there, or the model has no parent', async () => {
    await withAncestors(model, [row(1, null), row(2, 1)])
    await withAncestors({ ...model, parent: undefined }, [row(2, 1)])
    expect(remote.rowsWhere).not.toHaveBeenCalled()
  })

  it('stops at five levels on a chain that never ends', async () => {
    let next = 100
    remote.rowsWhere.mockImplementation(async () => ({ rows: [row(next--, next)], total: 1 }))
    const found = await withAncestors(model, [row(101, 100)])
    expect(remote.rowsWhere).toHaveBeenCalledTimes(MAX_DEPTH)
    expect(found.rows).toHaveLength(1 + MAX_DEPTH)
  })

  it('asks for at most 500 ancestors, a hundred to a read', async () => {
    remote.rowsWhere.mockResolvedValue({ rows: [], total: 0 })
    await withAncestors(model, Array.from({ length: 700 }, (_, i) => row(1000 + i, i + 1)))
    expect(remote.rowsWhere).toHaveBeenCalledTimes(5)
  })

  it('marks the added rows on the response, keeping the engine total', async () => {
    remote.rowsWhere.mockResolvedValueOnce({ rows: [row(1, null)], total: 1 })
    const read = await readWithTree(model, { rows: [row(2, 1)], total: 7 })
    expect(read.total).toBe(7)
    expect(read.rows.map((r) => r.muted)).toEqual([undefined, true])
  })
})

describe('the tree in a view', () => {
  const group = (key: string, rows: Row[]): Group => ({ key, label: key, rows, count: rows.length, facts: [], cut: false })

  it('applies inside each group, and a fold is remembered per view', () => {
    const groups = [group('a', [row(1, null), row(2, null), row(3, 1)]), group('b', [row(4, 2), row(5, null)])]
    const { result } = renderHook(() => useTree(model, 'v1', groups))
    expect(result.current.groups.map((g) => g.rows.map((r) => r.id))).toEqual([[1, 3, 2], [4, 5]])
    expect(result.current.places.get(3)).toMatchObject({ depth: 1, folds: false })
    expect(result.current.places.get(1)).toMatchObject({ folds: true, open: true })

    act(() => result.current.fold(1))
    expect(result.current.groups[0].rows.map((r) => r.id)).toEqual([1, 2])
    expect(window.localStorage.getItem('ntdst-views/folded/v1/v1/parent_id')).toBe('["1"]')
  })

  it('passes a model without a parent through untouched', () => {
    const groups = [group('a', [row(2, 1), row(1, null)])]
    const { result } = renderHook(() => useTree({ ...model, parent: undefined }, 'v1', groups))
    expect(result.current.groups).toBe(groups)
  })

  it('does not count a greyed ancestor as shown', () => {
    const groups = [group('a', [{ ...row(1, null), muted: true }, row(2, 1)])]
    const { result } = renderHook(() => useTree(model, 'v1', groups))
    expect([...result.current.places.values()].filter((p) => p.muted)).toHaveLength(1)
  })
})

describe('progress on a row', () => {
  it('rides on the row, not in its fields, and is never sent as a sort', () => {
    const made = toRow({ id: 1, custom: {}, lookups: {}, title: 'Alfa', progress: { done: 1, total: 3 } })
    expect(made.progress).toEqual({ done: 1, total: 3 })
    expect(made.fields.progress).toBeUndefined()
    const layout = { ...defaults({ key: 'v', table: 'taak', model: 'taak' } as never), sort: [{ id: PROGRESS, desc: true }, { id: 'prio', desc: false }] }
    expect(rowsQuery({ fixed: {} } as never, layout, {}, 'titel').sort).toBe('prio')
  })

  it('asks for the archive when it is shown', () => {
    const layout = defaults({ key: 'v', table: 'taak', model: 'taak' } as never)
    expect(rowsQuery({ fixed: {} } as never, layout, {}, 'titel', undefined, true).archived).toBe('1')
    expect(rowsQuery({ fixed: {} } as never, layout, {}, 'titel').archived).toBeUndefined()
  })
})
