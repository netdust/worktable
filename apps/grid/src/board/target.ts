export interface Measured {
  id: number
  /** From the top of its column's list, taken when the drag began, so a slot drawn since never moves the hit test. */
  top: number
  height: number
}

/** The slot in a column for content coordinate `y`: before the first card whose middle the pointer has not passed. */
export function targetOf(cards: Measured[], y: number, dragged: number): number {
  let index = 0
  for (const card of cards) {
    if (card.id === dragged) continue
    if (y < card.top + card.height / 2) return index
    index++
  }
  return index
}
