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

  it('keeps a step refused in_use, the planner can resolve it, and drops one it can never undo', async () => {
    const send = vi.fn<(batch: string) => Promise<string>>()
      .mockRejectedValueOnce({ code: 'in_use', message: 'in use' })
      .mockRejectedValueOnce({ code: 'unknown_record', message: 'gone' })
    const history = createHistory(send)
    history.push(step('b1'))

    await expect(history.undo()).rejects.toMatchObject({ code: 'in_use' })
    expect([history.canUndo(), history.canRedo()]).toEqual([true, false])
    await expect(history.undo()).rejects.toMatchObject({ code: 'unknown_record' })
    expect([history.canUndo(), history.canRedo()]).toEqual([false, false])
  })

  it('keeps a step whose undo never reached the server, so the next press tries it again', async () => {
    const send = vi.fn<(batch: string) => Promise<string>>().mockRejectedValueOnce({ code: 'unknown', message: 'Failed to fetch' }).mockResolvedValueOnce('u1')
    const history = createHistory(send)
    history.push(step('b1'))
    history.push(step('b2'))

    await expect(history.undo()).rejects.toMatchObject({ code: 'unknown' })
    expect([history.canUndo(), history.canRedo()]).toEqual([true, false])
    await history.undo()

    expect(send.mock.calls).toEqual([['b2'], ['b2']])
  })

  it.each(['changed_since', 'forbidden', 'unknown_source'])('drops a step refused %s, so the next undo reaches the older step', async (code) => {
    const send = vi.fn<(batch: string) => Promise<string>>().mockRejectedValueOnce({ code, message: 'no' }).mockResolvedValueOnce('u1')
    const history = createHistory(send)
    history.push(step('b1'))
    history.push(step('b2'))

    await expect(history.undo()).rejects.toMatchObject({ code })
    await history.undo()

    expect(send.mock.calls).toEqual([['b2'], ['b1']])
    expect([history.canUndo(), history.canRedo()]).toEqual([false, true])
  })

  it('undoes a step of several writes as one: its batch first, then the batches before it last-first; a redo undoes those undos in turn', async () => {
    const send = vi.fn<(batch: string) => Promise<string>>(async (batch) => `u-${batch}`)
    const history = createHistory(send)
    history.push({ ...step('b3'), before: [Promise.resolve('b1'), Promise.resolve(null), Promise.resolve('b2')] })

    await history.undo()
    expect(send.mock.calls).toEqual([['b3'], ['b2'], ['b1']])
    expect([history.canUndo(), history.canRedo()]).toEqual([false, true])
    await history.redo()

    expect(send.mock.calls.slice(3)).toEqual([['u-b1'], ['u-b2'], ['u-b3']])
    expect([history.canUndo(), history.canRedo()]).toEqual([true, false])
  })

  it('a step undone part-way keeps what went through as its redo, and a retry undoes only the rest', async () => {
    const send = vi.fn<(batch: string) => Promise<string>>(async (batch) => `u-${batch}`)
      .mockResolvedValueOnce('u-b3').mockRejectedValueOnce({ code: 'unknown', message: 'Failed to fetch' })
    const history = createHistory(send)
    const entry: Entry = { ...step('b3'), before: [Promise.resolve('b1'), Promise.resolve('b2')] }
    history.push(entry)

    await expect(history.undo()).rejects.toMatchObject({ code: 'unknown', undone: expect.objectContaining({ model: 'speelreeks', id: 1 }) })
    expect([history.canUndo(), history.canRedo()]).toEqual([true, true])
    await history.undo()
    expect(send.mock.calls).toEqual([['b3'], ['b2'], ['b2'], ['b1']])
    await history.redo()
    await history.redo()

    expect(send.mock.calls.slice(4)).toEqual([['u-b1'], ['u-b2'], ['u-b3']])
    expect([history.canUndo(), history.canRedo()]).toEqual([true, false])
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
