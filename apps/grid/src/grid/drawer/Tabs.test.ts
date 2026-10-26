import { describe, expect, it } from 'vitest'
import { iconsFor } from './Tabs'

// The bar's widths: a 28px icon, a 1px line between icons, a 1px border each side; `…` is 24px after a 2px gap.
const group = (n: number) => n * 28 + (n - 1) + 2
const more = 26

describe('how many tab icons the head line holds', () => {
  it('shows every icon, up to three, with room to spare, and no … when none is left over', () => {
    expect(iconsFor(500, 2)).toBe(2)
    expect(iconsFor(500, 5)).toBe(3)
    expect(iconsFor(group(3), 3)).toBe(3)
  })

  it('counts the … button as soon as a pane is left over', () => {
    expect(iconsFor(group(3) + more, 4)).toBe(3)
    expect(iconsFor(group(3) + more - 1, 4)).toBe(2)
    expect(iconsFor(group(2) + more, 4)).toBe(2)
  })

  it('drops from three to two only where two and … fit, on a drawer of three panes', () => {
    expect(iconsFor(group(3) - 1, 3)).toBe(2)
    expect(iconsFor(group(2) + more - 1, 3)).toBe(1)
  })

  it('gives the last icon up for … alone, and shows nothing but … when even one does not fit', () => {
    expect(iconsFor(group(1) + more, 3)).toBe(1)
    expect(iconsFor(group(1) + more - 1, 3)).toBe(0)
    expect(iconsFor(0, 3)).toBe(0)
  })

  it('answers one width with one count, and never more icons for less room', () => {
    let was = 0
    for (let slack = 0; slack <= 200; slack++) {
      const n = iconsFor(slack, 6)
      expect(iconsFor(slack, 6)).toBe(n)
      expect(n).toBeGreaterThanOrEqual(was)
      was = n
    }
  })
})
