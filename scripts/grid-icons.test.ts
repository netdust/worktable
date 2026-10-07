import { expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import { ICONS } from '../packages/engine/src/declare'

// The grid talks to the engine by REST only, so its icon map is read as text: every name the engine may serve must draw.
test("the grid's icon map covers every icon the engine serves", () => {
  const source = readFileSync(new URL('../apps/grid/src/ui/icons.ts', import.meta.url), 'utf8')
  const drawn = [...source.matchAll(/name: '(\w+)'/g)].map((match) => match[1])

  expect(drawn.sort()).toEqual([...ICONS].sort())
})
