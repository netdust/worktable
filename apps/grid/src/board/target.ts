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

/** Whether a pointer let go inside the board's box; a keyboard drop has no pointer and always is. */
export function within(box: Pick<DOMRect, 'left' | 'top' | 'right' | 'bottom'> | undefined, pointer: { x: number; y: number } | null): boolean {
  if (!pointer || !box) return true
  return pointer.x >= box.left && pointer.x <= box.right && pointer.y >= box.top && pointer.y <= box.bottom
}
