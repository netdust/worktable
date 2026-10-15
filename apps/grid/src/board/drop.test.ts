import { describe, expect, it } from 'vitest'
import type { Row } from '../types'
import { type Drop, dropOf } from './drop'
import { byRank } from './rank'

const card = (id: number, position: string | null = null): Row => ({ id, title: `${id}`, status: '', fields: { position } })

function placed(drop: Drop): Extract<Drop, { kind: 'place' }> {
  if (drop.kind !== 'place') throw new Error(`expected a place, got ${drop.kind}`)
  return drop
}

/** The column as the server serves it after the writes: `rows` in their previous order, ranked by the drop. */
function after(rows: Row[], drop: Extract<Drop, { kind: 'place' }>, id: number): number[] {
  const ranks = new Map([...drop.ranks.map((rank) => [rank.id, rank.position] as const), [id, drop.position]])
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

  it('on a sorted column whose shown neighbours run against their ranks, re-ranks the prefix below the next rank', () => {
    const column = [card(50, 'X'), card(41, 'M'), card(7)]

    const drop = placed(dropOf({ manual: false, from: 3, index: 1, cards: column, value: 'todo' }))

    expect(drop.ranks.map((rank) => rank.id)).toEqual([50])
    expect(drop.ranks.every((rank) => rank.position < 'M')).toBe(true)
    expect(drop.ranks[0].position < drop.position && drop.position < 'M').toBe(true)
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
