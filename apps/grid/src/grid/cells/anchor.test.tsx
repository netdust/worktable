import { cleanup, render } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const css = readFileSync(resolve(import.meta.dirname, '../../ui/app.css'), 'utf8')
const anchors = ['nv-select__anchor', 'nv-links__anchor', 'nv-longtext__anchor']
const rule = css.match(/\.nv-select__anchor,[^{]*\{[^}]*\}/)?.[0] ?? ''

let sheet: HTMLStyleElement
beforeEach(() => {
  sheet = document.head.appendChild(document.createElement('style'))
  sheet.textContent = rule
})
afterEach(() => {
  sheet.remove()
  cleanup()
})

// React Aria places "bottom" below the anchor and flips above it: an anchor the size of the cell keeps the popover off the cell either way.
describe('an editor popover anchor', () => {
  it.each(anchors)('%s spans the whole cell, invisible to the pointer', (name) => {
    expect(rule).toContain(`.${name}`)
    const { container } = render(<span className={name} />)
    const style = getComputedStyle(container.querySelector('span')!)

    expect([style.position, style.top, style.right, style.bottom, style.left]).toEqual(['absolute', '0px', '0px', '0px', '0px'])
    expect(style.height).toBe('100%')
    expect(style.pointerEvents).toBe('none')
  })
})
