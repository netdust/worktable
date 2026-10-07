import { act, cleanup, fireEvent, render, renderHook, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { Toast, useNotice } from './Toast'

const idle = { save: 'saved' as const, canUndo: false, canRedo: false }

afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

describe('the notice', () => {
  it('says what happened and runs its one action', () => {
    const run = vi.fn()
    render(<Toast notice={{ message: 'Weergave verwijderd', action: { label: 'Ongedaan maken', run } }} />)

    expect(screen.getByRole('status').textContent).toContain('Weergave verwijderd')
    fireEvent.click(screen.getByRole('button', { name: 'Ongedaan maken' }))
    expect(run).toHaveBeenCalledOnce()
  })

  it('shows whatever the save state is, and without one', () => {
    render(<Toast state={idle} onUndo={() => undefined} onRedo={() => undefined} notice={{ message: 'Weergave verwijderd' }} />)

    expect(screen.getByRole('status').textContent).toBe('Weergave verwijderd')
    expect(screen.queryByRole('button')).toBeNull()
  })

  it('is kept for six seconds, then gone', () => {
    vi.useFakeTimers()
    const { result } = renderHook(() => useNotice())

    act(() => result.current[1]({ message: 'Weergave verwijderd' }))
    act(() => vi.advanceTimersByTime(5900))
    expect(result.current[0]?.message).toBe('Weergave verwijderd')
    act(() => vi.advanceTimersByTime(200))
    expect(result.current[0]).toBeNull()
  })

  it('a choice of its action ends it at once', () => {
    const run = vi.fn()
    const { result } = renderHook(() => useNotice())

    act(() => result.current[1]({ message: 'Weergave verwijderd', action: { label: 'Undo', run } }))
    act(() => result.current[0]!.action!.run())

    expect(run).toHaveBeenCalledOnce()
    expect(result.current[0]).toBeNull()
  })

  it('says when it went without its action: on its time, or when another takes its place; never after the action', () => {
    vi.useFakeTimers()
    const first = vi.fn()
    const second = vi.fn()
    const third = vi.fn()
    const { result } = renderHook(() => useNotice())

    act(() => result.current[1]({ message: 'Weergave verwijderd', action: { label: 'Undo', run: () => undefined }, expired: first }))
    act(() => result.current[1]({ message: 'Weergave verwijderd', action: { label: 'Undo', run: () => undefined }, expired: second }))
    expect(first).toHaveBeenCalledOnce()
    act(() => vi.advanceTimersByTime(6100))
    expect(second).toHaveBeenCalledOnce()

    act(() => result.current[1]({ message: 'Weergave verwijderd', action: { label: 'Undo', run: () => undefined }, expired: third }))
    act(() => result.current[0]!.action!.run())
    act(() => vi.advanceTimersByTime(6100))
    expect(third).not.toHaveBeenCalled()
  })
})
