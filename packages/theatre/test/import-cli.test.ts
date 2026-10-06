import { expect, test } from 'bun:test'
import { mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import invented from './fixtures/invented-export.json'

const serve = join(import.meta.dir, '../../engine/src/serve.ts')
const ROOT = join(import.meta.dir, '../../..')

async function cli(...args: string[]) {
  const proc = Bun.spawn(['bun', serve, '--domain', '@worktable/theatre', ...args], {
    cwd: ROOT,
    stdout: 'pipe',
    stderr: 'pipe',
  })
  const code = await proc.exited
  return { code, text: (await new Response(proc.stdout).text()) + (await new Response(proc.stderr).text()) }
}

const PERSONAL_KEYS = [
  'naam',
  'voornaam',
  'achternaam',
  'email',
  'notitie',
  'omschrijving',
  'adres',
  'contact',
  'reden',
]

function personalValues(data: typeof invented): string[] {
  const found = new Set<string>()
  for (const rows of Object.values(data.datasets)) {
    for (const row of rows as Record<string, unknown>[]) {
      for (const key of PERSONAL_KEYS) if (typeof row[key] === 'string') found.add(row[key] as string)
    }
  }
  return [...found]
}

test('a refusing import leaks no fixture name, email or note into the report, stdout or stderr', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'wt-cli-'))
  const data = structuredClone(invented) as typeof invented
  const rows = data.datasets.toewijzing as Record<string, unknown>[]
  rows.push({ legacy_id: 590, activiteit_id: 301, persoon_id: 401, naam: 'Dubbel Verzonnen', state: 'bevestigd' })
  rows.push({ legacy_id: 591, activiteit_id: 304, persoon_id: 402, state: 'bevestigd', notitie: 'Eerste notitie' })
  rows.push({ legacy_id: 592, activiteit_id: 304, persoon_id: 402, state: 'bevestigd', notitie: 'Tweede notitie' })
  const file = join(dir, 'export.json')
  await Bun.write(file, JSON.stringify(data))
  const db = join(dir, 'engine.db')
  const report = join(dir, 'report.json')

  await cli('--db', db, '--create-admin', 'boss@example.test')
  const result = await cli(
    '--db',
    db,
    '--import',
    file,
    '--as',
    'boss@example.test',
    '--report',
    report,
    '--accept-report',
  )

  expect(result.text).toMatch(/refused/)
  const output = `${result.text}\n${readFileSync(report, 'utf8')}`
  const leaks = [...personalValues(data), 'Dubbel Verzonnen', 'Tweede notitie'].filter((v) => output.includes(v))
  expect(leaks).toEqual([])
  expect(output).not.toContain('example.test')
}, 20_000)
