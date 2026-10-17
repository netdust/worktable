import { describe, expect, test } from 'bun:test'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const script = join(import.meta.dir, 'check-checks.ts')

type Spec = { title: string; tags: string[] }
const listing = (files: Record<string, Spec[]>) => ({
  suites: Object.entries(files).map(([file, specs]) => ({ title: file, file, specs, suites: [] })),
})
const spec = (title: string, tag = 'e2e'): Spec => ({ title: `${title} @${tag}`, tags: [tag] })

const row = (entry: string) => `| Surface | e2e | ${entry} | e2e/step-1.spec.ts | step-1 | abc 2026-10-17 |`
const entry = (file: string, grep: string) => `\`bunx playwright test ${file} --grep "${grep}"\``

async function run(rows: string[], files: Record<string, Spec[]>) {
  const dir = mkdtempSync(join(tmpdir(), 'wt-checks-'))
  const registry = join(dir, 'CHECKS.md')
  const list = join(dir, 'list.json')
  writeFileSync(registry, ['| surface | tier | entry |', '|---|---|---|', ...rows].join('\n'))
  writeFileSync(list, JSON.stringify(listing(files)))
  const proc = Bun.spawn(['bun', script, registry, list], { stdout: 'pipe', stderr: 'pipe' })
  const code = await proc.exited
  return { code, out: (await new Response(proc.stdout).text()) + (await new Response(proc.stderr).text()) }
}

const FILES = { 'step-1.spec.ts': [spec('apply-template'), spec('undo-changed-since')] }

describe('check-checks', () => {
  test('an entry that matches a test passes', async () => {
    const { code } = await run([row(entry('e2e/step-1.spec.ts', 'apply-template @e2e'))], FILES)
    expect(code).toBe(0)
  })

  test('an entry whose grep matches nothing is named', async () => {
    const { code, out } = await run([row(entry('e2e/step-1.spec.ts', 'apply-twice @e2e'))], FILES)
    expect(code).toBe(1)
    expect(out).toContain('apply-twice @e2e')
  })

  test('a grep that matches only in another file is named', async () => {
    const files = { ...FILES, 'step-2.spec.ts': [spec('apply-twice')] }
    const { code } = await run([row(entry('e2e/step-1.spec.ts', 'apply-twice @e2e'))], files)
    expect(code).toBe(1)
  })

  test('the old period-is-a-filter line is named once its test is gone', async () => {
    const { code, out } = await run([row(entry('e2e/step-1.spec.ts', 'period-is-a-filter @e2e'))], FILES)
    expect(code).toBe(1)
    expect(out).toContain('period-is-a-filter @e2e')
  })

  test('a leading \\s matches the space after the file path, as in Playwright', async () => {
    const { code } = await run([row(entry('e2e/step-1.spec.ts', '\\sundo-changed-since @e2e'))], FILES)
    expect(code).toBe(0)
  })

  test('the match is case-insensitive and honours /…/ literals', async () => {
    const upper = await run([row(entry('e2e/step-1.spec.ts', 'APPLY-TEMPLATE @E2E'))], FILES)
    expect(upper.code).toBe(0)
    const literal = await run([row(entry('e2e/step-1.spec.ts', '/APPLY-TEMPLATE/'))], FILES)
    expect(literal.code).toBe(1)
  })

  test('the tag is part of the matched title', async () => {
    const files = { 'smoke/step-1.spec.ts': [{ title: 'sign-in', tags: ['smoke'] }] }
    const { code } = await run([row(entry('e2e/smoke/step-1.spec.ts', 'sign-in @smoke'))], files)
    expect(code).toBe(0)
  })

  test('a row without an entry is skipped', async () => {
    expect((await run([row('—')], FILES)).code).toBe(0)
  })

  test('an entry that cannot be read is named', async () => {
    const { code, out } = await run([row('`bunx playwright test e2e/step-1.spec.ts`')], FILES)
    expect(code).toBe(1)
    expect(out).toContain('cannot be read')
  })
})
