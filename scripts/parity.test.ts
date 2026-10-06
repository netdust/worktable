import { describe, expect, test } from 'bun:test'
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
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

const theatre = Bun.resolveSync('@worktable/theatre', import.meta.dir)

interface Options {
  edit?: (checks: Checks) => void
  raw?: string
  views?: string
}

// A domain module that wraps theatre, changing its views to inject a failure.
function domainWith(dir: string, views: string): string {
  const file = join(dir, 'domain.ts')
  writeFileSync(file, `import theatre from '${theatre}'\nexport default { ...theatre, views: ${views} }\n`)
  return file
}

async function parity(opts: Options | ((checks: Checks) => void) = {}) {
  const { edit, raw, views } = typeof opts === 'function' ? { edit: opts } : opts
  const dir = mkdtempSync(join(tmpdir(), 'wt-parity-test-'))
  const temp = join(dir, 'tmp')
  mkdirSync(temp)
  const data = JSON.parse(readFileSync(fixture, 'utf8'))
  edit?.(data.checks)
  const file = join(dir, 'export.json')
  writeFileSync(file, raw ?? JSON.stringify(data))
  const out = join(dir, 'parity.md')
  const args = views ? ['--domain', domainWith(dir, views)] : []
  const proc = Bun.spawn(['bun', script, file, '--out', out, ...args], {
    stdout: 'pipe',
    stderr: 'pipe',
    env: { ...process.env, TMPDIR: temp },
  })
  const code = await proc.exited
  const text = (await new Response(proc.stdout).text()) + (await new Response(proc.stderr).text())
  return { code, text, md: existsSync(out) ? readFileSync(out, 'utf8') : '', leftover: readdirSync(temp) }
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
    expect(md).toMatch(/Planning: pass, 2 rows, expected 2 \(activiteit where status = bevestigd\)/)
    expect(md).toMatch(/Toewijzingen: pass, 7 rows, expected 7 \(toewijzing, no filter\)/)
    expect(md).toMatch(/Afwezigheden: pass, 2 rows, expected 2 \(beschikbaarheid, no filter\)/)
  }, 20_000)

  test("a view whose rows differ from the export's own count fails, naming its filter", async () => {
    const { code, md } = await parity((c) => {
      const week = c.activities_per_week as Record<string, Record<string, number>>
      week['2026-W53'] = { ...week['2026-W53'], bevestigd: 3 }
    })
    expect(code).toBe(1)
    expect(md).toMatch(/Planning: fail, 2 rows, expected 3 \(activiteit where status = bevestigd\)/)
  }, 20_000)

  test("a view filter the export's checks cannot count fails as not comparable", async () => {
    const { code, md } = await parity({
      views: "theatre.views.map((v) => v.name === 'Planning' ? { ...v, filters: { soort: 'voorstelling' } } : v)",
    })
    expect(code).toBe(1)
    expect(md).toMatch(
      /Planning: fail, \d+ rows, filter not comparable with the export's checks \(activiteit where soort = voorstelling\)/,
    )
  }, 20_000)

  test('a missing check block fails as missing from the export, not as 0 compared', async () => {
    const { code, md } = await parity((c) => {
      delete c.absences_per_person
    })
    expect(code).toBe(1)
    expect(md).toMatch(/absences_per_person: fail, missing from the export/)
  }, 20_000)

  test('a theatre view missing from the domain fails parity', async () => {
    const { code, text } = await parity({ views: "theatre.views.filter((v) => v.name !== 'Afwezigheden')" })
    expect(code).toBe(1)
    expect(text).toContain('Afwezigheden')
  }, 20_000)

  test('a read failure leaves no temp directory with imported data', async () => {
    const views = "theatre.views.map((v) => (v.name === 'Planning' ? { ...v, source: 'bogus' } : v))"
    const { code, text, leftover } = await parity({ views })
    expect(code).toBe(1)
    expect(text).toMatch(/answered/)
    expect(leftover).toEqual([])
  }, 20_000)

  test('a malformed export is named, never quoted', async () => {
    const { code, text, leftover } = await parity({ raw: '{"worktable_export": 1, SECRET_TOKEN_123 }' })
    expect(code).toBe(1)
    expect(text).toContain('is not valid JSON')
    expect(text).not.toContain('SECRET_TOKEN_123')
    expect(leftover).toEqual([])
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
