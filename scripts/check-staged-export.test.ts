import { describe, expect, test } from 'bun:test'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'

const script = join(import.meta.dir, 'check-staged-export.ts')

function git(cwd: string, ...args: string[]) {
  const r = Bun.spawnSync(['git', ...args], { cwd })
  if (r.exitCode !== 0) throw new Error(r.stderr.toString())
}

async function runWith(staged: Record<string, string>, after?: (cwd: string) => void) {
  const cwd = mkdtempSync(join(tmpdir(), 'wt-staged-'))
  git(cwd, 'init', '-q')
  for (const [name, text] of Object.entries(staged)) {
    mkdirSync(dirname(join(cwd, name)), { recursive: true })
    writeFileSync(join(cwd, name), text)
    git(cwd, 'add', '-f', name)
  }
  after?.(cwd)
  const proc = Bun.spawn(['bun', script], { cwd, stdout: 'pipe', stderr: 'pipe' })
  const code = await proc.exited
  return { code, out: (await new Response(proc.stdout).text()) + (await new Response(proc.stderr).text()) }
}

describe('check-staged-export', () => {
  test('a staged laika-planning-export.json fails', async () => {
    const { code, out } = await runWith({ 'laika-planning-export.json': '{}' })
    expect(code).toBe(1)
    expect(out).toContain('laika-planning-export.json')
  })

  test('a staged *.report.json fails', async () => {
    expect((await runWith({ 'import.report.json': '{}' })).code).toBe(1)
  })

  test('a staged notes.json with a top-level worktable_export key fails', async () => {
    const { code } = await runWith({ 'notes.json': '{"worktable_export":1,"rows":[]}' })
    expect(code).toBe(1)
  })

  test('a staged import.ts mentioning "worktable_export" passes', async () => {
    const { code } = await runWith({ 'import.ts': 'const key = "worktable_export"\n' })
    expect(code).toBe(0)
  })

  test('a json file without the key passes', async () => {
    expect((await runWith({ 'package.json': '{"name":"x"}' })).code).toBe(0)
  })

  test('an invented fixture under test/fixtures passes', async () => {
    const { code } = await runWith({ 'packages/x/test/fixtures/invented-export.json': '{"worktable_export":1}' })
    expect(code).toBe(0)
  })

  test('nothing staged passes', async () => {
    expect((await runWith({})).code).toBe(0)
  })

  test('the index is read, not the working copy: overwritten after staging still fails', async () => {
    const { code } = await runWith({ 'notes.json': '{"worktable_export":1}' }, (cwd) =>
      writeFileSync(join(cwd, 'notes.json'), '{}'),
    )
    expect(code).toBe(1)
  })

  test('the index is read, not the working copy: deleted after staging still fails', async () => {
    const { code } = await runWith({ 'notes.json': '{"worktable_export":1}' }, (cwd) => rmSync(join(cwd, 'notes.json')))
    expect(code).toBe(1)
  })

  test('names and extensions match case-insensitively', async () => {
    expect((await runWith({ 'LAIKA-planning-export.json': '{}' })).code).toBe(1)
    expect((await runWith({ 'Import.REPORT.JSON': '{}' })).code).toBe(1)
    expect((await runWith({ 'Export.JSON': '{"worktable_export":1}' })).code).toBe(1)
    expect((await runWith({ 'notes.Json': '{"worktable_export":1}' })).code).toBe(1)
  })

  test('a BOM-prefixed export fails', async () => {
    expect((await runWith({ 'notes.json': '\uFEFF{"worktable_export":1}' })).code).toBe(1)
  })

  test('a staged json that cannot be parsed fails closed, naming the file', async () => {
    const { code, out } = await runWith({ 'broken.json': '{not json' })
    expect(code).toBe(1)
    expect(out).toContain('broken.json')
  })

  test('an unparsable invented fixture is still exempt', async () => {
    expect((await runWith({ 'a/test/fixtures/invented-x.json': '{not json' })).code).toBe(0)
  })
})
