import { Database } from 'bun:sqlite'
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { parseArgs } from 'node:util'
import { createAccount, createEngine, type Domain, importExport, migrate } from '../packages/engine/src'

const PORT = 4310
const HOST = `127.0.0.1:${PORT}`
const EMAIL = 'parity@example.test'
const VIEWS = ['Planning', 'Toewijzingen', 'Afwezigheden']

type Row = Record<string, unknown>
type Counts = Record<string, number>
type Checks = Record<string, unknown>

const { values, positionals } = parseArgs({
  options: {
    out: { type: 'string', default: 'specs/step-0e/parity.md' },
    domain: { type: 'string', default: '@worktable/theatre' },
  },
  allowPositionals: true,
})

function fail(message: string): never {
  console.error(message)
  process.exit(1)
}

// Calendar date to ISO week: the Thursday of its week decides the year.
function isoWeek(day: string): string {
  const date = new Date(`${day}T00:00:00Z`)
  const weekday = date.getUTCDay() || 7
  date.setUTCDate(date.getUTCDate() + 4 - weekday)
  const year = date.getUTCFullYear()
  const week = Math.ceil(((date.getTime() - Date.UTC(year, 0, 1)) / 86_400_000 + 1) / 7)
  return `${year}-W${String(week).padStart(2, '0')}`
}

type Engine = ReturnType<typeof createEngine>

async function signIn(engine: Engine, outbox: string): Promise<string> {
  const post = (path: string, body: unknown) =>
    engine.fetch(
      new Request(`http://${HOST}${path}`, {
        method: 'POST',
        headers: { host: HOST, 'content-type': 'application/json', 'sec-fetch-site': 'same-origin' },
        body: JSON.stringify(body),
      }),
    )
  const log = console.log
  console.log = () => {}
  try {
    await post('/api/auth/request', { email: EMAIL })
    await Bun.sleep(0)
    for (let tries = 0; tries < 200; tries++) {
      const file = readdirSync(outbox)[0]
      const token = file && readFileSync(join(outbox, file), 'utf8').match(/#\/auth\/([\w-]+)/)?.[1]
      if (token) {
        const res = await post('/api/auth/consume', { token })
        const cookie = res.headers.get('set-cookie')?.split(';')[0]
        if (!cookie) fail('sign-in failed')
        return cookie
      }
      await Bun.sleep(5)
    }
  } finally {
    console.log = log
  }
  return fail('no sign-in link reached the outbox')
}

function reader(engine: Engine, cookie: string) {
  return async (source: string, filter?: unknown): Promise<{ rows: Row[]; total: number }> => {
    const rows: Row[] = []
    let total = 0
    do {
      const query = new URLSearchParams({ limit: '5000', offset: String(rows.length) })
      if (filter && Object.keys(filter).length > 0) query.set('filter', JSON.stringify(filter))
      const res = await engine.fetch(
        new Request(`http://${HOST}/api/rows/${source}?${query}`, { headers: { host: HOST, cookie } }),
      )
      if (res.status !== 200) fail(`reading ${source} answered ${res.status}`)
      const page = (await res.json()) as { rows: Row[]; total: number }
      total = page.total
      rows.push(...page.rows)
      if (page.rows.length === 0) break
    } while (rows.length < total)
    return { rows, total }
  }
}

const bump = (counts: Record<string, Counts>, outer: string, inner: string) => {
  counts[outer] ??= {}
  counts[outer][inner] = (counts[outer][inner] ?? 0) + 1
}

function flatten(value: unknown): Counts {
  const flat: Counts = {}
  const walk = (node: unknown, path: string[]) => {
    if (typeof node === 'number') flat[path.join('/')] = node
    else if (node && typeof node === 'object') for (const [k, v] of Object.entries(node)) walk(v, [...path, k])
  }
  walk(value, [])
  return flat
}

interface Outcome {
  name: string
  pass: boolean
  compared: number
  mismatched: number
}

function compare(name: string, expected: unknown, actual: unknown): Outcome {
  const want = flatten(expected)
  const got = flatten(actual)
  const keys = new Set([...Object.keys(want), ...Object.keys(got)])
  const mismatched = [...keys].filter((k) => (want[k] ?? 0) !== (got[k] ?? 0)).length
  const present = expected !== undefined
  return { name, pass: present && mismatched === 0, compared: keys.size, mismatched }
}

async function measure(read: ReturnType<typeof reader>, domain: Domain) {
  const counts: Counts = {}
  const rowsOf: Record<string, Row[]> = {}
  for (const dataset of domain.datasets) {
    const { rows, total } = await read(dataset.name)
    counts[dataset.name] = total
    rowsOf[dataset.name] = rows
  }
  const legacyOf = new Map((rowsOf.persoon ?? []).map((p) => [p.id, p.legacy_post_id]))
  const activities: Record<string, Counts> = {}
  for (const row of rowsOf.activiteit ?? []) {
    bump(activities, isoWeek(String(row.start_at).slice(0, 10)), String(row.status))
  }
  const assignments: Record<string, Counts> = {}
  for (const row of rowsOf.toewijzing ?? []) {
    bump(assignments, row.persoon_id == null ? 'naam' : String(legacyOf.get(row.persoon_id) ?? '?'), String(row.state))
  }
  const absences: Counts = {}
  for (const row of rowsOf.beschikbaarheid ?? []) {
    const key = String(legacyOf.get(row.persoon_id) ?? '?')
    absences[key] = (absences[key] ?? 0) + 1
  }
  const shifted = (rowsOf.activiteit ?? []).filter((r) => r.plandag !== String(r.start_at).slice(0, 10)).length
  return { counts, activities, assignments, absences, shifted }
}

async function viewCounts(read: ReturnType<typeof reader>, domain: Domain): Promise<Counts> {
  const result: Counts = {}
  for (const view of domain.views.filter((v) => VIEWS.includes(v.name))) {
    result[view.name] = (await read(view.source, view.filters)).total
  }
  return result
}

function markdown(outcomes: Outcome[], measured: Awaited<ReturnType<typeof measure>>, views: Counts): string {
  const plural = (n: number) => `${n} mismatched key${n === 1 ? '' : 's'}`
  const lines = ['# Parity', '', '## Checks', '']
  for (const o of outcomes)
    lines.push(`- ${o.name}: ${o.pass ? 'pass' : 'fail'}, ${o.compared} compared, ${plural(o.mismatched)}`)
  lines.push('', '## Counts per dataset', '')
  for (const [name, n] of Object.entries(measured.counts)) lines.push(`- ${name}: ${n}`)
  lines.push('', '## Views', '')
  for (const [name, n] of Object.entries(views)) lines.push(`- ${name}: ${n} rows`)
  lines.push(
    '',
    '## Informational',
    '',
    `- plandag shifted: ${measured.shifted} (the day line moves these to the previous day; never a failure)`,
    '',
  )
  return lines.join('\n')
}

async function run(file: string): Promise<number> {
  const data = JSON.parse(readFileSync(file, 'utf8')) as { checks?: Checks }
  const domain = (await import(Bun.resolveSync(values.domain as string, process.cwd()))).default as Domain
  const dir = mkdtempSync(join(tmpdir(), 'wt-parity-'))
  const sqlite = new Database(join(dir, 'parity.db'), { create: true })
  try {
    migrate(sqlite, domain)
    const id = createAccount(sqlite, domain, EMAIL, 'administrator')
    const imported = importExport(
      sqlite,
      domain,
      data,
      { id, role: 'administrator', subject: null },
      { acceptReport: false },
    )
    if (!imported.committed) {
      console.error(`import refused ${imported.refused.length} rows; run the import itself for the report`)
      return 1
    }
    const outbox = join(dir, 'outbox')
    mkdirSync(outbox, { recursive: true })
    const engine = createEngine(sqlite, domain, { port: PORT, outbox, clientIp: () => '127.0.0.1' })
    const read = reader(engine, await signIn(engine, outbox))
    const measured = await measure(read, domain)
    const checks = data.checks ?? {}
    const outcomes = [
      compare('counts', checks.counts, measured.counts),
      compare('activities_per_week', checks.activities_per_week, measured.activities),
      compare('assignments_per_person', checks.assignments_per_person, measured.assignments),
      compare('absences_per_person', checks.absences_per_person, measured.absences),
    ]
    const report = markdown(outcomes, measured, await viewCounts(read, domain))
    mkdirSync(dirname(values.out as string), { recursive: true })
    writeFileSync(values.out as string, report)
    console.log(report)
    return outcomes.every((o) => o.pass) ? 0 : 1
  } finally {
    sqlite.close()
    rmSync(dir, { recursive: true, force: true })
  }
}

const file = positionals[0]
if (!file)
  fail('usage: bun scripts/parity.ts <export.json> [--out specs/step-0e/parity.md] [--domain @worktable/theatre]')
process.exit(await run(file))
