import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Model, View } from '../types'

const remote = vi.hoisted(() => ({ rows: vi.fn(), spanRows: vi.fn(), rowsWhere: vi.fn() }))
vi.mock('../api', () => remote)
const { readView, rereadsOf } = await import('./readView')

afterEach(() => {
  for (const fn of Object.values(remote)) fn.mockReset()
})

const view = { key: 'v', label: 'V', table: 't', model: 'taak', type: 'grid' } as unknown as View
const model = { key: 'taak', parent: 'parent_id', fields: { status: { categories: { todo: 'open' } } } } as unknown as Model

describe('readView', () => {
  it('reads as before when the archive is not shown, and asks for it when it is', async () => {
    remote.rows.mockResolvedValue({ rows: [], total: 0 })
    await readView(view, {}, null, null, false)
    expect(remote.rows).toHaveBeenLastCalledWith(view, {}, null, null)
    await readView(view, {}, null, null, true)
    expect(remote.rows).toHaveBeenLastCalledWith(view, {}, null, null, undefined, true)
  })

  it('reads a spanning calendar by overlap, archive flag included', async () => {
    remote.spanRows.mockResolvedValue({ rows: [], total: 0 })
    const calendar = { ...view, type: 'calendar', calendar: { day: 'd', lanes: [], spans: true } } as unknown as View
    await readView(calendar, {}, null, null, true)
    expect(remote.spanRows).toHaveBeenCalledWith(calendar, {}, null, null, true)
  })

  it('adds the ancestors a filter dropped when the model has a parent', async () => {
    remote.rows.mockResolvedValue({ rows: [{ id: 2, title: 'b', status: '', fields: { parent_id: [1] } }], total: 1 })
    remote.rowsWhere.mockResolvedValue({ rows: [{ id: 1, title: 'a', status: '', fields: { parent_id: null } }], total: 1 })
    const read = await readView(view, {}, null, null, false, model)
    expect(read.rows.map((r) => [r.id, r.muted])).toEqual([[2, undefined], [1, true]])
  })

  it('adds no ancestors on a board, calendar, gallery or timeline, only on the grid', async () => {
    remote.rows.mockResolvedValue({ rows: [{ id: 2, title: 'b', status: '', fields: { parent_id: [1] } }], total: 1 })
    remote.spanRows.mockResolvedValue({ rows: [{ id: 2, title: 'b', status: '', fields: { parent_id: [1] } }], total: 1 })
    for (const type of ['board', 'calendar', 'gallery', 'timeline']) {
      remote.rowsWhere.mockReset()
      const other = { ...view, type } as unknown as View
      const read = await readView(other, {}, null, null, false, model)
      expect(remote.rowsWhere, type).not.toHaveBeenCalled()
      expect(read.rows.map((r) => r.id), type).toEqual([2])
    }
    remote.rowsWhere.mockResolvedValue({ rows: [], total: 0 })
    await readView({ ...view, type: undefined } as unknown as View, {}, null, null, false, model)
    expect(remote.rowsWhere).toHaveBeenCalled()
  })
})

describe('rereadsOf', () => {
  it('names the parent and the status column, and nothing for a dataset without a parent', () => {
    expect(rereadsOf(model)).toEqual(['parent_id', 'status'])
    expect(rereadsOf({ ...model, parent: undefined } as Model)).toBeUndefined()
    expect(rereadsOf(undefined)).toBeUndefined()
  })
})
