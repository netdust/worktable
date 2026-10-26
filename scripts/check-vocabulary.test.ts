import { describe, expect, test } from 'bun:test'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const script = join(import.meta.dir, 'check-vocabulary.ts')

function rootWith(files: Record<string, string>): string {
  const root = mkdtempSync(join(tmpdir(), 'wt-vocab-'))
  for (const [name, text] of Object.entries(files)) writeFileSync(join(root, name), text)
  return root
}

async function run(root: string, ...domains: string[]) {
  const args = ['bun', script, '--root', root, ...domains.flatMap((d) => ['--domain', d])]
  const proc = Bun.spawn(args, { stdout: 'pipe', stderr: 'pipe' })
  const code = await proc.exited
  return { code, out: (await new Response(proc.stdout).text()) + (await new Response(proc.stderr).text()) }
}

describe('check-vocabulary', () => {
  test('a domain word inside a camelCase identifier fails, naming the word and line', async () => {
    const { code, out } = await run(rootWith({ 'a.ts': 'const x = 0\nconst persoonId = 1\n' }))
    expect(code).toBe(1)
    expect(out).toContain('a.ts:2')
    expect(out).toContain('persoon')
  })

  test('a domain word in a comment fails', async () => {
    const { code, out } = await run(rootWith({ 'b.ts': '// the toewijzing case\n' }))
    expect(code).toBe(1)
    expect(out).toContain('toewijzing')
  })

  test('an allowlisted generic word passes', async () => {
    const { code, out } = await run(rootWith({ 'c.ts': "const status = 'ok'\n" }))
    expect(code).toBe(0)
    expect(out).toContain('holds no domain word')
  })

  test("a word from another domain's declarations fails without editing the script", async () => {
    const domain = join(rootWith({}), 'cargo.ts')
    writeFileSync(
      domain,
      "export default { datasets: [{ name: 'zending', columns: { koerier_id: {} } }], queries: [] }\n",
    )
    const { code, out } = await run(rootWith({ 'd.ts': 'const zendingen = []\nconst x = koerierId\n' }), domain)
    expect(code).toBe(1)
    expect(out).toContain('koerier')
  })

  test('an empty directory passes', async () => {
    expect((await run(rootWith({}))).code).toBe(0)
  })
})

describe('check-vocabulary over the grid', () => {
  const grid = (root: string) => [
    '--root',
    root,
    '--allow',
    join(import.meta.dir, 'vocabulary-allow-grid.txt'),
    '--skip-tests',
  ]
  async function runWith(args: string[]) {
    const proc = Bun.spawn(['bun', script, ...args], { stdout: 'pipe', stderr: 'pipe' })
    const code = await proc.exited
    return { code, out: (await new Response(proc.stdout).text()) + (await new Response(proc.stderr).text()) }
  }

  test("a domain's word planted in a grid source fails, as bun run check runs it", async () => {
    const { code, out } = await runWith(grid(rootWith({ 'Panel.tsx': "const onderhoud = 'x'\n" })))
    expect(code).toBe(1)
    expect(out).toContain('Panel.tsx:1  onderhoud')
  })

  test('tests and fixtures are not scanned: they hold the invented domains on purpose', async () => {
    const files = {
      'a.test.tsx': 'const persoon = 1\n',
      'b.test.data.ts': 'const persoon = 1\n',
      'c.fixture.json': '{"persoon": 1}\n',
      'test-setup.ts': '// persoon\n',
      'd.test-support.ts': '// persoon\n',
    }
    expect((await runWith(grid(rootWith(files)))).code).toBe(0)
    expect((await runWith(['--root', rootWith(files)])).code).toBe(1)
  })

  test("the grid's own allow list passes its generic words, the engine's list does not", async () => {
    const root = rootWith({ 'i18n.ts': "const label = 'Naam'\n" })
    expect((await runWith(grid(root))).code).toBe(0)
    expect((await runWith(['--root', root])).code).toBe(1)
  })

  test('apps/grid/src holds no domain word', async () => {
    const { code, out } = await runWith(grid(join(import.meta.dir, '..', 'apps', 'grid', 'src')))
    expect(out).toContain('holds no domain word')
    expect(code).toBe(0)
  })
})
