import { expect, test } from 'bun:test'
import { chmodSync, mkdtempSync, readFileSync, statSync, writeFileSync } from 'node:fs'
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

  expect(result.text).toMatch(/\b2 refused\b/)
  const refused = JSON.parse(readFileSync(report, 'utf8')).refused as { legacy_id: number }[]
  expect(refused.map((r) => r.legacy_id).sort()).toEqual([590, 592])
  const output = `${result.text}\n${readFileSync(report, 'utf8')}`
  const leaks = [...personalValues(data), 'Dubbel Verzonnen', 'Tweede notitie'].filter((v) => output.includes(v))
  expect(leaks).toEqual([])
  expect(output).not.toContain('example.test')
}, 20_000)

async function importInto(dir: string, report: string) {
  const file = join(dir, 'export.json')
  await Bun.write(file, JSON.stringify(invented))
  const db = join(dir, 'engine.db')
  await cli('--db', db, '--create-admin', 'boss@example.test')
  return cli('--db', db, '--import', file, '--as', 'boss@example.test', '--report', report)
}

test('the report is 0600 even when it overwrites a wider file', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'wt-cli-'))
  const report = join(dir, 'report.json')
  writeFileSync(report, '{}')
  chmodSync(report, 0o644)
  expect((await importInto(dir, report)).code).toBe(0)
  expect(statSync(report).mode & 0o777).toBe(0o600)
}, 20_000)

test('a refused import replaces an earlier report instead of leaving it as current', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'wt-cli-'))
  const report = join(dir, 'report.json')
  expect((await importInto(dir, report)).code).toBe(0)
  expect(JSON.parse(readFileSync(report, 'utf8')).committed).toBe(true)
  const again = await importInto(dir, report)
  expect(again.code).toBe(1)
  expect(JSON.parse(readFileSync(report, 'utf8'))).toEqual({
    committed: false,
    error: 'import_needs_empty_database',
  })
  expect(statSync(report).mode & 0o777).toBe(0o600)
}, 20_000)

test('--import with an account flag is refused, not silently skipped', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'wt-cli-'))
  const file = join(dir, 'export.json')
  await Bun.write(file, JSON.stringify(invented))
  const db = join(dir, 'engine.db')
  for (const flag of [
    ['--create-admin', 'boss@example.test'],
    ['--create-account', 'x@example.test', '--role', 'editor'],
    ['--disable-account', 'x@example.test'],
  ]) {
    const result = await cli('--db', db, ...flag, '--import', file, '--as', 'boss@example.test')
    expect(result.code).toBe(1)
    expect(result.text).toContain('--import cannot be combined')
  }
}, 20_000)
