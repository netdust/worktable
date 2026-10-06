import { describe, expect, test } from 'bun:test'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const script = join(import.meta.dir, 'check-export-terms.ts')
const TERMS: [string, string][] = [
  ['Ada Verzonnen', 'person name'],
  ['Gezelschap Fictief', 'organisation'],
  ['Voorbeeldproject', 'organisation'],
]

function repo(staged: Record<string, string>, opts: { list?: boolean; allow?: string } = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'wt-terms-'))
  const scan = mkdtempSync(join(tmpdir(), 'wt-scan-'))
  if (opts.list !== false) writeFileSync(join(scan, 'terms.json'), JSON.stringify(TERMS))
  if (opts.allow) writeFileSync(join(scan, 'allow.txt'), opts.allow)
  const git = (...args: string[]) => Bun.spawnSync(['git', '-C', dir, ...args])
  git('init', '-q')
  for (const [name, text] of Object.entries(staged)) {
    writeFileSync(join(dir, name), text)
    git('add', name)
  }
  const proc = Bun.spawnSync(['bun', script], { cwd: dir, env: { ...process.env, WT_EXPORT_SCAN: scan } })
  return { code: proc.exitCode, out: proc.stdout.toString() + proc.stderr.toString() }
}

describe('check-export-terms', () => {
  test('a staged line with a name from the list fails, naming the file and the kind, never the name', () => {
    const { code, out } = repo({ 'notes.ts': "const who = 'ada verzonnen'\n" })
    expect(code).toBe(1)
    expect(out).toContain('notes.ts: person name 1')
    expect(out.toLowerCase()).not.toContain('verzonnen')
  })

  test('a name inside a longer word is not a hit', () => {
    expect(repo({ 'a.ts': "const x = 'Voorbeeldprojecten'\n" }).code).toBe(0)
  })

  test('an allowed term passes', () => {
    expect(
      repo({ 'a.md': 'About Voorbeeldproject.\n' }, { allow: 'Voorbeeldproject\tthe project itself\n' }).code,
    ).toBe(0)
  })

  test('a file name from the list fails', () => {
    expect(repo({ 'Voorbeeldproject.txt': 'x\n' }).code).toBe(1)
  })

  test('without the list it says so and passes', () => {
    const { code, out } = repo({ 'a.ts': 'Ada Verzonnen\n' }, { list: false })
    expect(code).toBe(0)
    expect(out).toContain('skipped')
  })
})
