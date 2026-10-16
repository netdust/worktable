import { describe, expect, it, vi } from 'vitest'
import type { Change } from '../grid/store'
import type { Row } from '../types'
import { type Drop, dropOf, staleOf, writeDrop } from './drop'
import { byRank } from './rank'

const card = (id: number, position: string | null = null): Row => ({ id, title: `${id}`, status: '', fields: { position } })

function placed(drop: Drop): Extract<Drop, { kind: 'place' }> {
  if (drop.kind !== 'place') throw new Error(`expected a place, got ${drop.kind}`)
  return drop
}

/** The column as the server serves it after the writes: `rows` in their previous order, cleared and ranked by the drop. */
function after(rows: Row[], drop: Extract<Drop, { kind: 'place' }>, id?: number): number[] {
  const ranks = new Map<number, string | null>([...drop.clears.map((one) => [one, null] as const), ...drop.ranks.map((rank) => [rank.id, rank.position] as const)])
  if (id !== undefined) ranks.set(id, drop.position)
  const written = rows.map((row) => (ranks.has(row.id) ? { ...row, fields: { ...row.fields, position: ranks.get(row.id) } } : row))
  return written.toSorted(byRank).map((row) => row.id)
}

describe('dropOf', () => {
  it('ranks the unranked cards above the slot in their shown order, then the dropped card, so only it moves', () => {
    const five = [card(1), card(2), card(3), card(4), card(5)]

    const drop = placed(dropOf({ manual: true, from: 0, index: 2, cards: five.slice(1), value: 'todo' }))

    expect(drop.ranks.map((rank) => rank.id)).toEqual([2, 3])
    expect(drop.ranks[0].position < drop.ranks[1].position && drop.ranks[1].position < drop.position).toBe(true)
    expect(drop).not.toHaveProperty('value')
    expect(after(five, drop, 1)).toEqual([2, 3, 1, 4, 5])
  })

  it('on a manual column, a drop between two ranked cards writes only the dropped card', () => {
    const column = [card(10, 'B'), card(11, 'D'), card(12, 'F'), card(13), card(14)]

    const drop = placed(dropOf({ manual: true, from: null, index: 1, cards: column, value: 'todo' }))

    expect(drop.ranks).toEqual([])
    expect('B' < drop.position && drop.position < 'D').toBe(true)
    expect(drop).toMatchObject({ value: 'todo', manual: true })
  })

  it('on a manual column, a drop below the first unranked card ranks that card too', () => {
    const column = [card(10, 'B'), card(11, 'D'), card(12, 'F'), card(13), card(14)]

    const drop = placed(dropOf({ manual: true, from: null, index: 4, cards: column, value: 'todo' }))

    expect(drop.ranks.map((rank) => rank.id)).toEqual([13])
    expect('F' < drop.ranks[0].position && drop.ranks[0].position < drop.position).toBe(true)
    expect(after([...column, card(99)], drop, 99)).toEqual([10, 11, 12, 13, 99, 14])
  })

  it('on a sorted column whose shown neighbours run against their ranks, clears the one out of order and keeps the run', () => {
    const column = [card(50, 'X'), card(41, 'M'), card(7)]

    const drop = placed(dropOf({ manual: false, from: 3, index: 1, cards: column, value: 'todo' }))

    expect(drop.clears).toEqual([41])
    expect(drop.ranks).toEqual([])
    expect(after([...column, card(9, 'B')], drop, 9)).toEqual([50, 9, 41, 7])
    expect(drop.manual).toBe(false)
  })

  it('on a sorted board, regroups into another column and places within its own; on its own place it does nothing', () => {
    const column = [card(1), card(2), card(3)]

    expect(dropOf({ manual: false, from: null, index: 1, cards: column, value: 'done' })).toEqual({ kind: 'regroup', value: 'done' })
    expect(dropOf({ manual: false, from: 0, index: 2, cards: column, value: 'todo' })).toMatchObject({ kind: 'place', manual: false })
    expect(dropOf({ manual: true, from: 2, index: 2, cards: column, value: 'todo' })).toEqual({ kind: 'none' })
    expect(dropOf({ manual: false, from: 1, index: 1, cards: column, value: 'todo' })).toEqual({ kind: 'none' })
  })
})

describe('a switch to manual', () => {
  it('clears every ranked card past its column\'s first run of rising ranks: one out of the shown order, one after an unranked card', () => {
    const optie = [card(1, 'C'), card(2, 'a'), card(3, 'I'), card(4), card(5, 'z')]
    const bevestigd = [card(6, 'B'), card(7, 'B'), card(8)]
    const geannuleerd = [card(9), card(10, 'V')]

    expect(staleOf([optie, bevestigd, geannuleerd])).toEqual([3, 5, 7, 10])
  })

  it('clears nothing on an unranked board, or one whose ranks run as shown', () => {
    expect(staleOf([[card(1), card(2)], [card(3)], []])).toEqual([])
    expect(staleOf([[card(1, 'B'), card(2, 'D'), card(3)], [card(4, 'a')]])).toEqual([])
  })

  it('on the drop that switches, clears the stale ranks in every column, so only the dropped card moves', () => {
    // Shown sorted: Optie [3, 15, 17, 24], card 24 dragged to the top; Bevestigd untouched.
    const optie = [card(3, 'C'), card(15, 'a'), card(17, 'I')]
    const bevestigd = [card(19, 'V'), card(1, 'l'), card(13), card(10, 't')]

    const drop = placed(dropOf({ manual: false, from: 3, index: 0, cards: optie, value: 'optie', others: [bevestigd] }))

    expect(drop.clears).toEqual([17, 10])
    expect(drop.ranks).toEqual([])
    expect(after([...optie, card(24, '6')], drop, 24)).toEqual([24, 3, 15, 17])
    expect(after(bevestigd, drop)).toEqual([19, 1, 13, 10])
  })

  it('clears nothing on a board that is already manual', () => {
    const column = [card(1, 'C'), card(2, 'a'), card(3, 'I')]

    const drop = placed(dropOf({ manual: true, from: 0, index: 2, cards: column.slice(1), value: 'optie', others: [[card(4), card(5, 'B')]] }))

    expect(drop.clears).toEqual([])
  })

  it('a stale card the walk ranks above the slot gets its rank alone: the step names each record once', async () => {
    const shown = [card(1, 'B'), card(2, 'Z'), card(3, 'D'), card(4)]

    const drop = placed(dropOf({ manual: false, from: 0, index: 2, cards: shown.slice(1), value: 'optie', others: [[card(5), card(6, 'k')]] }))

    expect(drop.clears).toEqual([6])
    expect(drop.ranks.map((rank) => rank.id)).toEqual([3])
    expect(after(shown, drop, 1)).toEqual([2, 3, 1, 4])
    const store = { apply: vi.fn(() => Promise.resolve()), applyStep: vi.fn((_step: Change[]) => Promise.resolve(true)) }
    await writeDrop(store, 'status', drop, 1)
    const [step] = store.applyStep.mock.calls[0]
    expect(step.map((change) => change.id)).toEqual([6, 3, 1])
    expect(step[0]).toEqual({ id: 6, field: 'position', value: null })
  })
})

describe('writeDrop', () => {
  const store = () => ({ apply: vi.fn(() => Promise.resolve()), applyStep: vi.fn(() => Promise.resolve(true)) })

  it('writes a place as one step: the ranks, then the card, with its column in the same write when it changes', async () => {
    const within = store()
    await writeDrop(within, 'status', { kind: 'place', ranks: [{ id: 2, position: 'V' }], clears: [], position: 'k', manual: true }, 1)
    expect(within.applyStep).toHaveBeenCalledWith([{ id: 2, field: 'position', value: 'V' }, { id: 1, field: 'position', value: 'k' }])

    const across = store()
    await writeDrop(across, 'status', { kind: 'place', ranks: [], clears: [], position: 'V', value: 'done', manual: true }, 1)
    expect(across.applyStep).toHaveBeenCalledWith([{ id: 1, field: 'status', value: 'done', with: { position: 'V' } }])
  })

  it('writes a regroup as one edit of the column', async () => {
    const regroup = store()
    expect(await writeDrop(regroup, 'status', { kind: 'regroup', value: null }, 1)).toBe(true)
    expect(regroup.apply).toHaveBeenCalledWith({ id: 1, field: 'status', value: null })
    expect(regroup.applyStep).not.toHaveBeenCalled()
  })
})
