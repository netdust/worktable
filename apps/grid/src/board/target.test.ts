import { describe, expect, it } from 'vitest'
import { targetOf } from './target'

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
