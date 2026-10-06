import { expect, test } from 'bun:test'
import pkg from '../package.json'

// Bun 1.3.8 can spin forever in a loader thread on zod's locale files, so a start hangs
// at random (about 1 in 50): serve.ts, the CLI children in these tests, the vocabulary check.
test('the engine runs on a Bun its engines field allows', () => {
  expect(pkg.engines.bun).toBe('>=1.3.9')
  expect(Bun.semver.satisfies(Bun.version, pkg.engines.bun)).toBe(true)
})
