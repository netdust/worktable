import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { SavedView } from '../types'
import { AUTOSAVE_DELAY, useSavedViews } from './useSavedViews'

const api = vi.hoisted(() => ({ recordCount: vi.fn(() => Promise.resolve(0)), recordHistory: vi.fn(() => Promise.resolve([])), rowsWhere: vi.fn(() => Promise.resolve({ rows: [], total: 0 })), 
  savedViews: vi.fn(), createView: vi.fn(), updateView: vi.fn(), deleteView: vi.fn(), restoreView: vi.fn(), savePrefs: vi.fn(), setDefault: vi.fn(),
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

describe('an unlocked seeded view', () => {
  const seeded: SavedView = { ...mine, key: '5', id: 5, label: 'Open', mine: false, owner: { id: -1, name: '' }, editable: true, shared: true }

  it("saves for everyone when an administrator changes it: it is a team view, not one's own", async () => {
    const { result } = hook()
    changeLocally('5', 'kind')
    act(() => result.current.changedLayout(seeded))
    await act(async () => vi.advanceTimersByTime(AUTOSAVE_DELAY))
    expect(api.updateView).toHaveBeenCalledTimes(1)
    expect(api.updateView).toHaveBeenCalledWith(seeded, { arrangement: expect.objectContaining({ group: 'kind' }) })
  })

  it("keeps an editor's change local, with the changed mark", async () => {
    const { result } = hook()
    changeLocally('5', 'kind')
    act(() => result.current.changedLayout({ ...seeded, editable: false } as SavedView))
    await act(async () => vi.advanceTimersByTime(AUTOSAVE_DELAY * 2))
    expect(api.updateView).not.toHaveBeenCalled()
  })
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

describe("a node's default", () => {
  const planning = { key: 'planning', label: 'Planning', model: 'activity', types: ['grid' as const] }
  const week: SavedView = { ...mine, key: '43', id: 43, label: 'Week', shared: true, default: true }
  const team: SavedView = { ...mine, key: '44', id: 44, label: 'Team', shared: true }
  const marks = (views: { key: string; default?: boolean }[]) => views.filter((v) => v.default).map((v) => v.key)

  it('marks the chosen view through the engine, and the list it reloads moves the mark', async () => {
    api.setDefault.mockResolvedValue(undefined)
    api.savedViews.mockResolvedValue([{ ...week, default: false }, { ...team, default: true }])
    const { result } = renderHook(() => useSavedViews({
      declared: [planning], starting: [], active: { current: '43' }, open: () => undefined, note: () => undefined, notify: () => undefined,
    }))
    act(() => result.current.load([week, team]))
    expect(marks(result.current.tables[0]!.views)).toEqual(['43'])

    await act(async () => result.current.markDefault(team, true))
    expect(api.setDefault).toHaveBeenCalledWith(44, true)
    expect(marks(result.current.tables[0]!.views)).toEqual(['44'])
  })

  it('says why the engine refused, and keeps the mark where it was', async () => {
    const note = vi.fn()
    api.setDefault.mockRejectedValue({ code: 'forbidden', message: 'Only an administrator marks a default' })
    const { result } = renderHook(() => useSavedViews({
      declared: [planning], starting: [], active: { current: '43' }, open: () => undefined, note, notify: () => undefined,
    }))
    act(() => result.current.load([week, team]))

    await act(async () => result.current.markDefault(week, false))
    expect(api.setDefault).toHaveBeenCalledWith(43, false)
    expect(note).toHaveBeenCalledWith(expect.any(String))
    expect(api.savedViews).not.toHaveBeenCalled()
    expect(marks(result.current.tables[0]!.views)).toEqual(['43'])
  })

  it('drops a view another user took away, and says so in the grid\'s words', async () => {
    const note = vi.fn()
    api.setDefault.mockRejectedValue({ code: 'unknown_view', message: 'unknown view 44', status: 404 })
    const { result } = renderHook(() => useSavedViews({
      declared: [planning], starting: [], active: { current: '43' }, open: () => undefined, note, notify: () => undefined,
    }))
    act(() => result.current.load([week, team]))

    await act(async () => result.current.markDefault(team, true))
    expect(result.current.tables[0]!.views.map((v) => v.key)).toEqual(['43'])
    expect(note).toHaveBeenCalledWith('Deze weergave bestaat niet meer')
  })
})
