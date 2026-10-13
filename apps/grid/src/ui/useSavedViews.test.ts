import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { SavedView } from '../types'
import { AUTOSAVE_DELAY, useSavedViews } from './useSavedViews'

const api = vi.hoisted(() => ({
  savedViews: vi.fn(), createView: vi.fn(), updateView: vi.fn(), deleteView: vi.fn(), restoreView: vi.fn(), savePrefs: vi.fn(),
}))
vi.mock('../api', () => api)

const empty = { hidden: [], order: [], widths: [], sort: [], filters: [], group: null, picked: [] }
const mine: SavedView = {
  key: '42', id: 42, label: 'Mijn week', table: 'planning', table_label: 'Planning', model: 'activity', type: 'grid',
  starting: false, arrangement: empty, shared: false, owner: { id: 1, name: 'Hester' }, mine: true, editable: true,
}
const changeLocally = (key: string, group: string) =>
  window.localStorage.setItem(`ntdst-views/layout/v2/${key}`, JSON.stringify({ hidden: [], order: [], widths: {}, sort: [], filters: [], group }))

function hook() {
  return renderHook(() => useSavedViews({
    declared: [], starting: [], active: { current: '42' }, open: () => undefined, note: () => undefined, notify: () => undefined,
  }))
}

beforeEach(() => {
  vi.useFakeTimers()
  window.localStorage.clear()
  api.updateView.mockImplementation((view: SavedView) => Promise.resolve(view))
})
afterEach(() => {
  vi.useRealTimers()
  vi.resetAllMocks()
})

describe('a view saves itself', () => {
  it("sends one's own view once, after the delay, whatever the number of changes in it", async () => {
    const { result } = hook()
    changeLocally('42', 'kind')
    act(() => result.current.changedLayout(mine))
    act(() => result.current.changedLayout(mine))
    expect(api.updateView).not.toHaveBeenCalled()
    await act(async () => vi.advanceTimersByTime(AUTOSAVE_DELAY))
    expect(api.updateView).toHaveBeenCalledTimes(1)
    expect(api.updateView).toHaveBeenCalledWith(mine, { arrangement: expect.objectContaining({ group: 'kind' }) })
  })

  it('keeps a change local on a view one cannot write: a starting one, a colleague\'s, a public one', async () => {
    const { result } = hook()
    for (const view of [
      { ...mine, mine: false, editable: false },
      { ...mine, editable: false },
      { ...mine, public: true },
    ]) {
      changeLocally('42', 'kind')
      act(() => result.current.changedLayout(view))
    }
    await act(async () => vi.advanceTimersByTime(AUTOSAVE_DELAY * 2))
    expect(api.updateView).not.toHaveBeenCalled()
  })

  it('sends a change made while a save is in flight once that save has answered', async () => {
    let answer: (view: SavedView) => void = () => undefined
    api.updateView.mockImplementationOnce(() => new Promise((resolve) => { answer = resolve }))
    const { result } = hook()
    changeLocally('42', 'kind')
    act(() => result.current.changedLayout(mine))
    await act(async () => vi.advanceTimersByTime(AUTOSAVE_DELAY))
    changeLocally('42', 'status')
    act(() => result.current.changedLayout(mine))
    await act(async () => vi.advanceTimersByTime(AUTOSAVE_DELAY))
    expect(api.updateView).toHaveBeenCalledTimes(1)
    await act(async () => answer(mine))
    expect(api.updateView).toHaveBeenCalledTimes(2)
    expect(api.updateView).toHaveBeenLastCalledWith(mine, { arrangement: expect.objectContaining({ group: 'status' }) })
  })

  it('copies the change kept in this browser with Kopie maken', async () => {
    api.createView.mockImplementation((made: { name: string }) => Promise.resolve({ ...mine, key: '43', id: 43, label: made.name }))
    const { result } = hook()
    changeLocally('42', 'kind')
    await act(async () => result.current.actions.duplicate({ ...mine, mine: false, editable: false } as SavedView))
    expect(api.createView).toHaveBeenCalledWith(expect.objectContaining({ arrangement: expect.objectContaining({ group: 'kind' }) }))
  })
})

describe('a new timeline view', () => {
  it('reads this month on its dated column, in lanes by the first lane the table declares', async () => {
    api.savedViews.mockResolvedValue([])
    api.createView.mockImplementation((made: { name: string }) => Promise.resolve({ ...mine, key: '44', id: 44, label: made.name, type: 'timeline' }))
    const activiteiten = { key: 'activiteit', label: 'Activiteiten', model: 'activiteit', types: ['grid' as const, 'timeline' as const], calendar: { day: 'plandag', start: 'start_at', end: 'eind_at', lanes: ['productie_id', 'speelreeks_id'] } }
    const { result } = renderHook(() => useSavedViews({
      declared: [activiteiten], starting: [], active: { current: '42' }, open: () => undefined, note: () => undefined, notify: () => undefined,
    }))
    await act(async () => result.current.create('activiteit', 'Tijdlijn activiteiten', 'timeline', false))
    expect(api.createView).toHaveBeenCalledWith(expect.objectContaining({
      arrangement: expect.objectContaining({ filters: [{ field: 'plandag', op: 'month', values: [] }], group: 'productie_id' }),
    }))
  })
})
