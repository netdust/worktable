import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { expect, it } from 'vitest'

const read = (file: string) => readFileSync(join(__dirname, '..', file), 'utf8')

it('the row tree sheet styles no class the rail uses: the rail tree once took the row tree\'s layout', () => {
  const styled = new Set([...read('grid/tree.css').replace(/\/\*[\s\S]*?\*\//g, '').matchAll(/\.(nv-[\w-]+)/g)].map((m) => m[1]))
  const railed = [...read('ui/Rail.tsx').matchAll(/className="(nv-[\w-]+)/g)].map((m) => m[1])
  expect(railed.filter((name) => styled.has(name))).toEqual([])
})

it('the row tree wrapper sits on the cell middle: left on the baseline its 16px chevron button lifted the title off the other cells', () => {
  const rule = read('grid/tree.css').match(/\.nv-rowtree\s*\{([^}]*)\}/)?.[1] ?? ''
  expect(rule).toMatch(/vertical-align:\s*middle/)
})
