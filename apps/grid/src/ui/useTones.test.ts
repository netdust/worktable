import { renderHook, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Model, Row } from '../types'
import { useTones } from './useTones'

const api = vi.hoisted(() => ({ records: vi.fn() }))
vi.mock('../api', () => api)

const team = (tone?: string): Model => ({
  key: 'team', label: 'Teams', title_label: 'Naam', title_readonly: false, ...(tone ? { tone } : {}),
  fields: { colour: { type: 'select', label: 'Kleur', required: false, options: { violet: 'Paars', sky: 'Blauw' }, tones: { violet: 'violet', sky: 'sky' } } },
}) as unknown as Model
const row = (id: number, colour: string | null): Row => ({ id, title: `team ${id}`, status: '', fields: { colour } })

afterEach(() => vi.resetAllMocks())

describe("a dataset's tones", () => {
  it("maps each record's id to the tone of its option, once read; a record without one has none", async () => {
    api.records.mockResolvedValue({ rows: [row(1, 'violet'), row(2, 'sky'), row(3, null)], total: 3 })
    const { result } = renderHook(() => useTones({ team: team('colour') }, 'team'))

    await waitFor(() => expect(result.current).toBeInstanceOf(Map))
    expect([...(result.current ?? [])]).toEqual([[1, 'violet'], [2, 'sky']])
    expect(api.records).toHaveBeenCalledTimes(1)
    expect(api.records).toHaveBeenCalledWith('team', '')
  })

  it('is undefined while its first read is pending, so a skin can wait for the colours instead of repainting', async () => {
    let answer: (found: { rows: Row[]; total: number }) => void = () => undefined
    api.records.mockReturnValue(new Promise((done) => { answer = done }))
    const { result } = renderHook(() => useTones({ fresh: { ...team('colour'), key: 'fresh' } }, 'fresh'))

    expect(result.current).toBeUndefined()
    answer({ rows: [row(1, 'sky')], total: 1 })
    await waitFor(() => expect(result.current?.get(1)).toBe('sky'))
  })

  it('opened again shows what it read last at once, and reads again', async () => {
    const models = { team: team('colour') }
    api.records.mockResolvedValueOnce({ rows: [row(1, 'violet')], total: 1 })
    const first = renderHook(() => useTones(models, 'team'))
    await waitFor(() => expect(first.result.current?.get(1)).toBe('violet'))
    first.unmount()

    api.records.mockResolvedValueOnce({ rows: [row(1, 'sky')], total: 1 })
    const { result } = renderHook(() => useTones(models, 'team'))
    expect(result.current?.get(1)).toBe('violet')
    await waitFor(() => expect(result.current?.get(1)).toBe('sky'))
  })

  it('is null once the read is refused, as for a caller who cannot read the dataset, whatever it read before', async () => {
    const models = { team: team('colour') }
    api.records.mockResolvedValueOnce({ rows: [row(1, 'violet')], total: 1 })
    const first = renderHook(() => useTones(models, 'team'))
    await waitFor(() => expect(first.result.current).toBeInstanceOf(Map))
    first.unmount()

    api.records.mockRejectedValueOnce({ code: 'not_found', message: 'unknown source' })
    const { result } = renderHook(() => useTones(models, 'team'))
    await waitFor(() => expect(result.current).toBeNull())
    expect(api.records).toHaveBeenCalledTimes(2)
  })

  it('is null and reads nothing for a dataset without a tone, or none at all', () => {
    expect(renderHook(() => useTones({ team: team() }, 'team')).result.current).toBeNull()
    expect(renderHook(() => useTones({ team: team('colour') }, undefined)).result.current).toBeNull()
    expect(api.records).not.toHaveBeenCalled()
  })

  it('is null and reads nothing for a caller not served the tone column', () => {
    const unserved = { ...team('colour'), fields: {} } as unknown as Model
    expect(renderHook(() => useTones({ team: unserved }, 'team')).result.current).toBeNull()
    expect(api.records).not.toHaveBeenCalled()
  })
})
