import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Model, SavedView } from '../types'

const api = vi.hoisted(() => ({ recordHistory: vi.fn(() => Promise.resolve([])), rowsWhere: vi.fn(() => Promise.resolve({ rows: [], total: 0 })),  rows: vi.fn() }))
vi.mock('../api', () => api)
const { previousWindow, statOf, toneOf } = await import('./tiles')

const view = (filters: unknown[] = [], extra: Partial<SavedView> = {}): SavedView =>
  ({
    key: '9', id: 9, label: 'Conflicten', model: 'conflicten', table: 'conflicten', type: 'grid', date_field: 'plandag',
    arrangement: { hidden: [], order: [], widths: [], sort: [], filters, group: null, picked: [] },
    shared: true, owner: { id: -1, name: '' }, mine: false, editable: false, ...extra,
  }) as unknown as SavedView

beforeEach(() => api.rows.mockReset())

describe('statOf', () => {
  it('counts from the total with a one-row read', async () => {
    api.rows.mockResolvedValue({ rows: [{ id: 1, fields: {} }], total: 7 })
    expect(await statOf(view(), null, 'count')).toBe(7)
    expect(api.rows.mock.calls[0][4]).toBe(1)
  })

  it('sums a column over every row', async () => {
    api.rows.mockResolvedValue({ rows: [{ id: 1, fields: { n: 2 } }, { id: 2, fields: { n: 3.5 } }, { id: 3, fields: { n: null } }], total: 3 })
    expect(await statOf(view(), null, { sum: 'n' })).toBe(5.5)
  })

  it('reads the previous period with the date condition moved back, and none without one', async () => {
    api.rows.mockResolvedValue({ rows: [], total: 4 })
    const week = view([{ field: 'plandag', op: 'between', values: ['2026-10-12', '2026-10-18'] }])
    expect(await statOf(week, null, 'count', true)).toBe(4)
    const sent = api.rows.mock.calls[0][3].filters
    expect(sent).toEqual([{ field: 'plandag', op: 'between', values: ['2026-10-05', '2026-10-11'] }])
    expect(await statOf(view(), null, 'count', true)).toBeNull()
  })

  it('passes the space only to a scoped view', async () => {
    api.rows.mockResolvedValue({ rows: [], total: 0 })
    const scope = { field: 'productie_id', id: 2 }
    await statOf(view([], { space: 'scoped' }), scope, 'count')
    await statOf(view([], { space: 'global' }), scope, 'count')
    expect(api.rows.mock.calls.map((c) => c[2])).toEqual([scope, null])
  })
})

describe('previousWindow', () => {
  it('moves a week back a week and a month back a calendar month', () => {
    expect(previousWindow({ from: '2026-10-12', to: '2026-10-18' })).toEqual({ from: '2026-10-05', to: '2026-10-11' })
    expect(previousWindow({ from: '2026-03-01', to: '2026-03-31' })).toEqual({ from: '2026-02-01', to: '2026-02-28' })
  })
})

describe('toneOf', () => {
  const model = { key: 'm', label: 'm', title_label: 't', title_readonly: true, fields: { n: { type: 'int', label: 'N', required: false, fact: false, badge: 'warn' } } } as unknown as Model
  it('tones above a threshold, from a badge column on a sum, and nothing at or below', () => {
    expect(toneOf(1, { kind: 'stat', view: 1, measure: 'count', tone: { above: 0, tone: 'bad' } })).toBe('bad')
    expect(toneOf(0, { kind: 'stat', view: 1, measure: 'count', tone: { above: 0, tone: 'bad' } })).toBeNull()
    expect(toneOf(3, { kind: 'stat', view: 1, measure: { sum: 'n' } }, model)).toBe('warn')
    expect(toneOf(0, { kind: 'stat', view: 1, measure: { sum: 'n' } }, model)).toBeNull()
  })
})
