import { describe, expect, it, vi } from 'vitest'
import { createHistory, type Entry } from './history'

const step = (batch: string | null, model = 'speelreeks', id: number | null = 1): Entry => ({ batch: Promise.resolve(batch), model, id })

describe('the undo history', () => {
  it('undoes the last batch, and redoes it by undoing the undo batch', async () => {
    const send = vi.fn<(batch: string) => Promise<string>>().mockResolvedValueOnce('u1').mockResolvedValueOnce('r1')
    const history = createHistory(send)
    history.push(step('b1'))

    await history.undo()
    expect(history.canRedo()).toBe(true)
    await history.redo()

    expect(send.mock.calls).toEqual([['b1'], ['u1']])
    expect([history.canUndo(), history.canRedo()]).toEqual([true, false])
  })

  it('answers the entry undone, for the view to repaint its row', async () => {
    const history = createHistory(() => Promise.resolve('u1'))
    const entry = step('b1', 'activiteit', 7)
    history.push(entry)

    expect(await history.undo()).toBe(entry)
    expect(await createHistory(() => Promise.resolve('u')).undo()).toBeNull()
  })

  it('drops a step whose write was refused or changed nothing, without asking the server', async () => {
    const send = vi.fn<(batch: string) => Promise<string>>()
    const history = createHistory(send)
    history.push(step(null))

    expect(await history.undo()).toBeNull()

    expect(send).not.toHaveBeenCalled()
    expect([history.canUndo(), history.canRedo()]).toEqual([false, false])
  })

  it('keeps a step the server refused for now, and drops one it can never undo', async () => {
    const send = vi.fn<(batch: string) => Promise<string>>()
      .mockRejectedValueOnce({ code: 'changed_since', message: 'changed' })
      .mockRejectedValueOnce({ code: 'unknown_record', message: 'gone' })
    const history = createHistory(send)
    history.push(step('b1'))

    await expect(history.undo()).rejects.toMatchObject({ code: 'changed_since' })
    expect([history.canUndo(), history.canRedo()]).toEqual([true, false])
    await expect(history.undo()).rejects.toMatchObject({ code: 'unknown_record' })
    expect([history.canUndo(), history.canRedo()]).toEqual([false, false])
  })

  it("forgets a deleted row's steps, and tells its listeners", () => {
    const history = createHistory(() => Promise.resolve('u'))
    const listener = vi.fn()
    history.subscribe(listener)
    history.push(step('b1', 'activiteit', 7))
    history.push(step('b2', 'activiteit', 8))

    history.forget('activiteit', 8)

    expect(listener).toHaveBeenCalledTimes(3)
    expect(history.canUndo()).toBe(true)
    history.forget('activiteit', 7)
    expect(history.canUndo()).toBe(false)
  })
})
