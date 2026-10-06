import { describe, expect, test } from 'bun:test'
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const script = join(import.meta.dir, 'parity.ts')
const fixture = join(import.meta.dir, '../packages/theatre/test/fixtures/invented-export.json')
const SECRETS = [
  'Ada Voorbeeld',
  'Voorbeeld',
  'example.test',
  'Gezelschap Verzonnen',
  'Gastspeler',
  'Laika: maybe',
  'Verzonnenstraat',
]

type Checks = Record<string, Record<string, unknown>>

async function parity(edit?: (checks: Checks) => void) {
  const dir = mkdtempSync(join(tmpdir(), 'wt-parity-'))
  const data = JSON.parse(readFileSync(fixture, 'utf8'))
  edit?.(data.checks)
  const file = join(dir, 'export.json')
  writeFileSync(file, JSON.stringify(data))
  const out = join(dir, 'parity.md')
  const proc = Bun.spawn(['bun', script, file, '--out', out], { stdout: 'pipe', stderr: 'pipe' })
  const code = await proc.exited
  const text = (await new Response(proc.stdout).text()) + (await new Response(proc.stderr).text())
  return { code, text, md: readFileSync(out, 'utf8') }
}

describe('parity', () => {
  test('the invented export passes every check', async () => {
    const { code, md } = await parity()
    expect(code).toBe(0)
    expect(md).toMatch(/counts: pass, 6 compared, 0 mismatched keys/)
    expect(md).toMatch(/activities_per_week: pass, 4 compared, 0 mismatched keys/)
    expect(md).toMatch(/assignments_per_person: pass, 5 compared, 0 mismatched keys/)
    expect(md).toMatch(/absences_per_person: pass, 2 compared, 0 mismatched keys/)
    expect(md).toMatch(/plandag shifted: 1/)
    expect(md).toMatch(/Planning: \d+ rows/)
  }, 20_000)

  test('one bumped week value fails and names only the check', async () => {
    const { code, md, text } = await parity((c) => {
      ;(c.activities_per_week as Record<string, Record<string, number>>)['2026-W53'].bevestigd = 3
    })
    expect(code).toBe(1)
    expect(md).toMatch(/activities_per_week: fail, 4 compared, 1 mismatched key\b/)
    expect(md).toMatch(/counts: pass/)
    for (const out of [md, text]) expect(out).not.toMatch(/W53|W01/)
  }, 20_000)

  test('a missing key on the engine side counts as a mismatch', async () => {
    const { code, md } = await parity((c) => {
      ;(c.absences_per_person as Record<string, number>)['999'] = 2
    })
    expect(code).toBe(1)
    expect(md).toMatch(/absences_per_person: fail, 3 compared, 1 mismatched key\b/)
  }, 20_000)

  test('the output holds no fixture name, email or note', async () => {
    const { md, text } = await parity()
    for (const secret of SECRETS) {
      expect(md).not.toContain(secret)
      expect(text).not.toContain(secret)
    }
    expect(md).not.toMatch(/\b40[123]\b/)
  }, 20_000)
})
