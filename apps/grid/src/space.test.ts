import { act, renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const api = vi.hoisted(() => ({ recordCount: vi.fn(() => Promise.resolve(0)), recordHistory: vi.fn(() => Promise.resolve([])), rowsWhere: vi.fn(() => Promise.resolve({ rows: [], total: 0 })),  records: vi.fn() }))
vi.mock('./api', () => api)
const { store, stored, useSpace } = await import('./space')

const space = { model: 'season', field: 'season_id' }
const seasons = [
  { id: 3, title: 'Lente', status: '', fields: {} },
  { id: 4, title: 'Zomer', status: '', fields: {} },
]
const key = () => `ntdst-views:${window.location.host}:season`

beforeEach(() => api.records.mockResolvedValue({ rows: seasons, total: 2 }))
afterEach(() => {
  window.localStorage.clear()
  vi.resetAllMocks()
})

describe('stored and store', () => {
  it('reads every record when nothing is stored', () => {
    expect(stored('season')).toBe('all')
  })

  it('round-trips an id and the every-record sentinel', () => {
    store('season', 4)
    expect(stored('season')).toBe(4)

    store('season', 'all')
    expect(window.localStorage.getItem(key())).toBe('all')
    expect(stored('season')).toBe('all')
  })
})

describe('useSpace', () => {
  it('starts on every record, never the first one: no selection and no scope', async () => {
    const { result } = renderHook(() => useSpace(space))

    await waitFor(() => expect(result.current[0].status).toBe('ready'))
    expect(result.current[0]).toEqual({ status: 'ready', records: seasons, selected: null, scope: null })
  })

  it('remembers a choice, and scopes by it', async () => {
    const { result } = renderHook(() => useSpace(space))
    await waitFor(() => expect(result.current[0].status).toBe('ready'))

    act(() => result.current[1](4))

    expect(result.current[0]).toMatchObject({ selected: seasons[1], scope: { field: 'season_id', id: 4 } })
    expect(stored('season')).toBe(4)
    const again = renderHook(() => useSpace(space))
    await waitFor(() => expect(again.result.current[0]).toMatchObject({ selected: seasons[1] }))
  })

  it('falls back to every record when the stored one is gone', async () => {
    store('season', 99)
    const { result } = renderHook(() => useSpace(space))

    await waitFor(() => expect(result.current[0].status).toBe('ready'))
    expect(result.current[0]).toMatchObject({ selected: null, scope: null })
  })

  it('is none without a space', () => {
    expect(renderHook(() => useSpace(undefined)).result.current[0]).toEqual({ status: 'none' })
  })
})
