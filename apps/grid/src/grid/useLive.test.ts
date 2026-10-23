import { act, cleanup, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Model, Row } from '../types'
import { useLive } from './useLive'

const model = { key: 'job', label: 'Job', lifecycle: 'state', live: ['busy', 'queued'], fields: {} } as unknown as Model
const at = (state: string): Row => ({ id: 1, title: 'Job', status: '', fields: { state } })
const tick = (ms: number) => act(async () => { await vi.advanceTimersByTimeAsync(ms) })

beforeEach(() => vi.useFakeTimers())
afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

describe('a live drawer', () => {
  it('polls every 3 s while the record is in a live state, and shows it busy', async () => {
    const reread = vi.fn(() => Promise.resolve(at('busy')))
    const { result } = renderHook(() => useLive(model, at('busy'), reread))
    expect(result.current.busy).toBe(true)
    await tick(2900)
    expect(reread).not.toHaveBeenCalled()
    await tick(200)
    expect(reread).toHaveBeenCalledTimes(1)
    await tick(3000)
    expect(reread).toHaveBeenCalledTimes(2)
  })

  it('does not poll a record that is not in a live state, nor a model that declares none', async () => {
    const reread = vi.fn(() => Promise.resolve(at('done')))
    const idle = renderHook(() => useLive(model, at('done'), reread))
    const none = renderHook(() => useLive({ ...model, live: undefined }, at('busy'), reread))
    await tick(10_000)
    expect(reread).not.toHaveBeenCalled()
    expect(idle.result.current.busy).toBe(false)
    expect(none.result.current.busy).toBe(false)
  })

  it('stops on close', async () => {
    const reread = vi.fn(() => Promise.resolve(at('busy')))
    const { unmount } = renderHook(() => useLive(model, at('busy'), reread))
    await tick(3100)
    expect(reread).toHaveBeenCalledTimes(1)
    unmount()
    await tick(30_000)
    expect(reread).toHaveBeenCalledTimes(1)
  })

  it('stops on leaving a live state, judged on the row it re-read', async () => {
    const reread = vi.fn().mockResolvedValueOnce(at('busy')).mockResolvedValue(at('done'))
    renderHook(() => useLive(model, at('busy'), reread))
    await tick(3100)
    await tick(3000)
    expect(reread).toHaveBeenCalledTimes(2)
    await tick(30_000)
    expect(reread).toHaveBeenCalledTimes(2)
  })

  it('stops when the record is gone or out of scope', async () => {
    const reread = vi.fn(() => Promise.resolve(null))
    renderHook(() => useLive(model, at('busy'), reread))
    await tick(3100)
    await tick(30_000)
    expect(reread).toHaveBeenCalledTimes(1)
  })

  it('stops following a row that leaves its live state from outside the hook', async () => {
    const reread = vi.fn(() => Promise.resolve(at('busy')))
    const { rerender } = renderHook(({ row }) => useLive(model, row, reread), { initialProps: { row: at('busy') } })
    rerender({ row: at('done') })
    await tick(30_000)
    expect(reread).not.toHaveBeenCalled()
  })

  it('backs off to 15 s after 3 errors', async () => {
    const reread = vi.fn(() => Promise.reject({ code: 'unknown', message: 'down' }))
    renderHook(() => useLive(model, at('busy'), reread))
    await tick(3100)
    await tick(3000)
    await tick(3000)
    expect(reread).toHaveBeenCalledTimes(3)
    await tick(14_000)
    expect(reread).toHaveBeenCalledTimes(3)
    await tick(1500)
    expect(reread).toHaveBeenCalledTimes(4)
  })

  it.each([401, 403, 404])('stops on a %i', async (status) => {
    const reread = vi.fn(() => Promise.reject({ code: 'refused', message: 'no', status }))
    renderHook(() => useLive(model, at('busy'), reread))
    await tick(3100)
    await tick(60_000)
    expect(reread).toHaveBeenCalledTimes(1)
  })

  it.each([
    ['the record is gone', () => Promise.resolve(null)],
    ['a refusal answers', () => Promise.reject({ code: 'forbidden', message: 'no', status: 403 })],
    ['the record left its live state', () => Promise.resolve(at('done'))],
  ])('drops the busy mark when polling stops because %s', async (_name, answer) => {
    const reread = vi.fn(answer)
    const { result } = renderHook(() => useLive(model, at('busy'), reread))
    expect(result.current.busy).toBe(true)
    await tick(3100)
    expect(result.current.busy).toBe(false)
  })
})
