import { describe, expect, it } from 'vitest'
import { targetOf, within } from './target'

const four = [0, 108, 216, 324].map((top, i) => ({ id: i + 1, top, height: 100 }))

describe('targetOf', () => {
  it('answers the slot whose card the pointer has not passed the middle of', () => {
    expect(targetOf(four, 150, 99)).toBe(1)
    expect(targetOf(four, 170, 99)).toBe(2)
  })

  it('never steps back as the pointer moves down', () => {
    let last = 0
    for (let y = 0; y <= 500; y++) {
      const index = targetOf(four, y, 99)
      expect(index).toBeGreaterThanOrEqual(last)
      last = index
    }
    expect(last).toBe(4)
  })

  it('skips the dragged card', () => {
    expect(targetOf(four, 170, 2)).toBe(1)
    expect(targetOf(four, 500, 2)).toBe(3)
  })
})

describe('within', () => {
  const box = { left: 100, top: 50, right: 900, bottom: 600 }

  it("takes a pointer inside the board's box, its gutters too, and a keyboard drop without one", () => {
    expect(within(box, { x: 412, y: 300 })).toBe(true)
    expect(within(box, { x: 100, y: 600 })).toBe(true)
    expect(within(box, null)).toBe(true)
  })

  it("refuses a pointer let go outside the board's box", () => {
    expect(within(box, { x: 500, y: 26 })).toBe(false)
    expect(within(box, { x: 40, y: 300 })).toBe(false)
    expect(within(box, { x: 901, y: 300 })).toBe(false)
  })
})
