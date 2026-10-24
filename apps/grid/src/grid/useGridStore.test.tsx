import { act, renderHook } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Row, View } from '../types'

const remote = vi.hoisted(() => ({ create: vi.fn(), update: vi.fn(), remove: vi.fn(), rowOf: vi.fn() }))
vi.mock('../api', () => remote)
const { useGridStore } = await import('./hooks')
const { createHistory } = await import('../ui/history')

const view = { key: 'jobs', label: 'Jobs', table: 'jobs', model: 'job', type: 'grid' } as unknown as View
const made: Row = { id: 9, title: 'Import', status: '', fields: { state: 'busy' } }

afterEach(() => remote.create.mockReset())

describe('the grid store’s create', () => {
  it('tells the created row, for a plain create and for a draft’s commit', async () => {
    remote.create.mockResolvedValue({ row: made, batch: 'b1' })
    const told = vi.fn()
    const history = createHistory(vi.fn())
    const { result } = renderHook(() => useGridStore(view, [], history, () => undefined, told))

    await act(async () => { await result.current[0]?.create({ title: 'Import' }) })

    expect(told).toHaveBeenCalledWith('job', made)
    expect(remote.create).toHaveBeenCalledWith('job', { title: 'Import' })
  })
})
