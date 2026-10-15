import type { Row } from '../types'
import { rankBetween, rankOf } from './rank'

export type Drop =
  | { kind: 'none' }
  | { kind: 'regroup'; value: string | null }
  | { kind: 'place'; ranks: { id: number; position: string }[]; position: string; value?: string | null; manual: boolean }

interface Input {
  manual: boolean
  /** The dragged card's index in `cards` before it was taken out; null when it comes from another column. */
  from: number | null
  index: number
  /** The target column as shown, without the dragged card. */
  cards: Row[]
  /** The target column's key. */
  value: string | null
}

function between(rank: string | null, lo: string | null, hi: string | null): rank is string {
  return rank !== null && (lo === null || lo < rank) && (hi === null || rank < hi)
}

/**
 * What a drop at `index` writes. Every card above the slot whose rank does not already fall between its
 * shown neighbours gets one first, in the shown order, so nothing on the board moves but the dropped card.
 */
export function dropOf({ manual, from, index, cards, value }: Input): Drop {
  if (from === index) return { kind: 'none' }
  if (!manual && from === null) return { kind: 'regroup', value }
  const below = cards.slice(index).map(rankOf).filter((rank) => rank !== null)
  const hi = below.length > 0 ? below.reduce((min, rank) => (rank < min ? rank : min)) : null
  const ranks: { id: number; position: string }[] = []
  let lo: string | null = null
  for (const card of cards.slice(0, index)) {
    const rank = rankOf(card)
    if (between(rank, lo, hi)) lo = rank
    else {
      lo = rankBetween(lo, hi)
      ranks.push({ id: card.id, position: lo })
    }
  }
  return { kind: 'place', ranks, position: rankBetween(lo, hi), ...(from === null ? { value } : {}), manual }
}
