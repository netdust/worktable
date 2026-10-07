import { Database } from 'bun:sqlite'
import { chmodSync, existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join, resolve } from 'node:path'
import { parseArgs } from 'node:util'
import type { Subprocess } from 'bun'
import {
  addDays,
  addMinutes,
  batchOf,
  type Column,
  changedColumns,
  decode,
  expectedPlandag,
  type Revision,
  type Row,
  revisionProblems,
  rowDiff,
  scalarEdit,
  skipReason,
  speelreeksBody,
  undoOrder,
} from './edit-session.lib'

// Run on a copy only: bun scripts/shakeout/edit-session.ts --db <copy> --outbox <dir> [--port 4320]
// stdout carries step names, verdicts and counts; every value goes to the detail file.

const REPO = resolve(import.meta.dir, '../..')
const LIVE_DB = resolve(homedir(), 'laika-export/engine.db')
const EMAIL = 'shakeout@example.test'
const DOMAIN = '@worktable/theatre'
const DAY_LINE_HOUR = 5
const TAKEN_PORTS = new Set([4310, 5173])
const TEXT = 'shakeout-edit@example.test'

const { values: args } = parseArgs({
  options: {
    db: { type: 'string' },
    port: { type: 'string', default: '4320' },
    outbox: { type: 'string' },
    out: { type: 'string' },
  },
})

function refuseToRun(message: string): never {
  console.error(message)
  process.exit(2)
}

if (!args.db || !args.outbox)
  refuseToRun('usage: edit-session.ts --db <copy.db> --outbox <dir> [--port 4320] [--out <dir>]')
const DB = resolve(args.db)
const OUTBOX = resolve(args.outbox)
const OUT = resolve(args.out ?? join(homedir(), 'laika-export', 'shakeout'))
const PORT = Number(args.port)
if (DB === LIVE_DB) refuseToRun('refusing to write to the live engine.db: pass a copy')
// The detail file holds row values: it never lands in the checkout.
for (const path of [OUT, OUTBOX])
  if (`${path}/`.startsWith(`${REPO}/`)) refuseToRun(`refusing to write inside the repository: ${path}`)
if (TAKEN_PORTS.has(PORT)) refuseToRun(`port ${PORT} belongs to the running engine or grid`)
const BASE = `http://127.0.0.1:${PORT}`

interface Source {
  kind: 'dataset' | 'query'
  label: string
  title: string
  title_via?: string
  columns: Record<string, Column>
  writable: boolean
  deletable: boolean
}

interface Outcome {
  step: string
  label: string
  ok: boolean
  problems: string[]
  dutch?: boolean
  detail: Row
}

interface Done {
  label: string
  dataset: string
  id: number
  kind: 'update' | 'create'
  sent: Row
  before: Row | undefined
  after: Row
  changed: string[]
  batch: string | null
}

type Expect =
  | { accept: true; derived?: string[]; fields?: Row; title?: string; gone?: boolean }
  | { accept: false; status?: number; code?: string }

const outcomes: Outcome[] = []
const done: Done[] = []
const touched = new Set<string>()
const created = new Set<string>()
const used = new Set<string>()
const notes: string[] = []

// ---- the engine process -------------------------------------------------------------------------

let engine: Subprocess | null = null
let engineErrors: Promise<string> = Promise.resolve('')
let cookie = ''

const serveArgs = (extra: string[]): string[] => [
  'bun',
  'packages/engine/src/serve.ts',
  '--domain',
  DOMAIN,
  '--db',
  DB,
  '--port',
  String(PORT),
  '--outbox',
  OUTBOX,
  '--app-url',
  BASE,
  ...extra,
]

async function portAnswers(): Promise<boolean> {
  return fetch(`${BASE}/api/auth/me`).then(
    () => true,
    () => false,
  )
}

async function startEngine(): Promise<void> {
  if (await portAnswers()) throw new Error(`something already answers on port ${PORT}`)
  const proc = Bun.spawn(serveArgs([]), { cwd: REPO, stdout: 'ignore', stderr: 'pipe' })
  engine = proc
  engineErrors = new Response(proc.stderr).text()
  for (let tries = 0; tries < 200; tries++) {
    if (await portAnswers()) return
    await Bun.sleep(50)
  }
  throw new Error('the engine did not come up')
}

async function stopEngine(): Promise<void> {
  if (!engine) return
  engine.kill()
  await engine.exited
  engine = null
}

function createAdmin(): void {
  const run = Bun.spawnSync(serveArgs(['--create-admin', EMAIL]), { cwd: REPO, stdout: 'ignore', stderr: 'pipe' })
  if (run.exitCode !== 0) throw new Error('creating the shakeout administrator failed')
}

function mails(): string[] {
  return existsSync(OUTBOX) ? readdirSync(OUTBOX).sort() : []
}

async function signIn(): Promise<void> {
  const before = mails()
  await http('POST', '/auth/request', { email: EMAIL })
  for (let tries = 0; tries < 200; tries++) {
    for (const file of mails().filter((f) => !before.includes(f))) {
      const text = readFileSync(join(OUTBOX, file), 'utf8')
      const token = text.startsWith(`To: ${EMAIL}\n`) ? /#\/auth\/([\w-]+)/.exec(text)?.[1] : undefined
      if (!token) continue
      const res = await fetch(`${BASE}/api/auth/consume`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'sec-fetch-site': 'same-origin' },
        body: JSON.stringify({ token }),
      })
      cookie = res.headers.get('set-cookie')?.split(';')[0] ?? ''
      if (!cookie) throw new Error('consuming the sign-in link gave no session')
      return
    }
    await Bun.sleep(25)
  }
  throw new Error('no sign-in link reached the outbox')
}

// ---- HTTP the way the grid sends it ---------------------------------------------------------------

interface Answer {
  status: number
  body: Row
}

async function http(method: string, path: string, body?: Row): Promise<Answer> {
  const headers: Record<string, string> = { 'sec-fetch-site': 'same-origin' }
  if (cookie) headers.cookie = cookie
  if (body !== undefined) headers['content-type'] = 'application/json'
  const res = await fetch(`${BASE}/api${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  return { status: res.status, body: (await res.json().catch(() => ({}))) as Row }
}

async function servedRow(dataset: string, id: number): Promise<Row | null> {
  const filter = encodeURIComponent(JSON.stringify({ id }))
  const res = await http('GET', `/rows/${dataset}?filter=${filter}`)
  if (res.status !== 200) throw new Error(`reading ${dataset} answered ${res.status}`)
  return ((res.body.rows as Row[])[0] as Row | undefined) ?? null
}

// ---- the database, read only ----------------------------------------------------------------------

const ro = new Database(DB, { readonly: true })
let datasets: Record<string, Source> = {}
let adminId = 0

type Snapshot = Map<string, Row>

function snapshot(): Snapshot {
  const all: Snapshot = new Map()
  for (const name of Object.keys(datasets)) {
    for (const row of ro.query(`SELECT * FROM "${name}"`).all() as Row[]) all.set(`${name}:${row.id}`, row)
  }
  return all
}

function snapshotDiff(a: Snapshot, b: Snapshot): string[] {
  const keys = new Set([...a.keys(), ...b.keys()])
  return [...keys].filter((key) => !Bun.deepEquals(a.get(key), b.get(key)))
}

const lastRevision = (): number =>
  (ro.query('SELECT COALESCE(MAX(id), 0) AS id FROM revision').get() as { id: number }).id

const revisionsSince = (id: number): Revision[] =>
  ro.query('SELECT * FROM revision WHERE id > ? ORDER BY id').all(id) as Revision[]

const live = (snap: Snapshot, dataset: string): Row[] =>
  [...snap.entries()]
    .filter(([key, row]) => key.startsWith(`${dataset}:`) && row.deleted_at === null)
    .map(([, row]) => row)

// ---- one write, checked ---------------------------------------------------------------------------

function record(step: string, label: string, problems: string[], detail: Row, dutch?: boolean): void {
  outcomes.push({ step, label, ok: problems.length === 0, problems, detail, ...(dutch === undefined ? {} : { dutch }) })
}

function refusalProblems(
  res: Answer,
  expect: { status?: number; code?: string },
  revisions: Revision[],
  changed: string[],
) {
  const problems: string[] = []
  if (res.status < 400) problems.push(`accepted with ${res.status} where a refusal was expected`)
  if (expect.status && res.status !== expect.status) problems.push(`answered ${res.status}, expected ${expect.status}`)
  if (expect.code && res.body.code !== expect.code)
    problems.push(`code ${String(res.body.code)}, expected ${expect.code}`)
  if (revisions.length > 0) problems.push(`a refusal recorded ${revisions.length} revision(s)`)
  if (changed.length > 0) problems.push(`a refusal changed ${changed.length} row(s)`)
  return problems
}

function servedProblems(columns: Record<string, Column>, served: Row | null, stored: Row, gone: boolean): string[] {
  if (gone) return served ? ['a deleted row is still served'] : []
  if (!served) return ['the row is not served after the write']
  const differs = Object.entries(columns).filter(([key, column]) => {
    const want = column.type === 'boolean' ? decode(column, stored[key]) : (stored[key] ?? null)
    return !Bun.deepEquals(served[key] ?? null, want)
  })
  return differs.map(([key]) => `served ${key} differs from the stored value`)
}

function expectedProblems(columns: Record<string, Column>, after: Row, fields: Row = {}): string[] {
  return Object.entries(fields)
    .filter(([key, want]) => !Bun.deepEquals(decode(columns[key], after[key]), want))
    .map(([key]) => `${key} is not the expected value`)
}

async function attempt(
  step: string,
  label: string,
  op: { method: 'POST' | 'PATCH' | 'DELETE'; dataset: string; id: number | null; body?: Row },
  expect: Expect,
): Promise<Done | null> {
  const { method, dataset, id, body } = op
  const source = datasets[dataset] as Source
  const before = snapshot()
  const since = lastRevision()
  const res = await http(
    method,
    `/rows/${dataset}${id === null ? '' : `/${id}`}`,
    method === 'DELETE' ? undefined : body,
  )
  const after = snapshot()
  const revisions = revisionsSince(since)
  const changed = snapshotDiff(before, after)
  const detail: Row = { method, dataset, id, sent: body ?? null, status: res.status, response: res.body, revisions }
  if (!expect.accept) {
    const problems = refusalProblems(res, expect, revisions, changed)
    record(step, label, problems, detail, res.body.code === 'refused' || res.body.code === 'in_use')
    return null
  }
  if (res.status >= 400) {
    record(step, label, [`refused with ${res.status} ${String(res.body.code)}`], detail)
    return null
  }
  const recordId = id ?? (res.body.id as number)
  const key = `${dataset}:${recordId}`
  touched.add(key)
  if (id === null) created.add(key)
  const was = before.get(key)
  const now = after.get(key) as Row
  const columns = changedColumns(source.columns, was, now)
  const fields = id === null ? columns.filter((c) => now[c] !== null) : [...columns]
  if (method === 'DELETE' && was?.deleted_at !== now.deleted_at) fields.push('deleted_at')
  const allowed = new Set([...Object.keys(body ?? {}), ...(expect.derived ?? [])])
  const served = await servedRow(dataset, recordId)
  const problems = [
    ...(changed.length === 1 && changed[0] === key ? [] : [`${changed.length} rows changed, expected only the target`]),
    ...(id === null ? [] : columns.filter((c) => !allowed.has(c)).map((c) => `unexpected column ${c} changed`)),
    ...(method === 'PATCH' ? Object.keys(body ?? {}).filter((c) => !columns.includes(c)) : []).map(
      (c) => `sent column ${c} did not change`,
    ),
    ...revisionProblems(revisions, {
      entity: dataset,
      id: recordId,
      actor: adminId,
      columns: source.columns,
      before: was,
      after: now,
      fields,
    }),
    ...expectedProblems(source.columns, now, expect.fields),
    ...servedProblems(source.columns, served, now, expect.gone === true),
    ...(expect.title !== undefined && served?.title !== expect.title
      ? ['the served title is not the expected one']
      : []),
  ]
  record(step, label, problems, { ...detail, before: was ?? null, after: now, served })
  return {
    label,
    dataset,
    id: recordId,
    kind: id === null ? 'create' : 'update',
    sent: body ?? {},
    before: was,
    after: now,
    changed: columns,
    batch: batchOf(res.body),
  }
}

// ---- picking real rows ----------------------------------------------------------------------------

function pick(snap: Snapshot, dataset: string, ok: (row: Row) => boolean = () => true): Row | undefined {
  // A small dataset runs out of fresh rows: an edit then shares a row, and the undo walks back in order.
  const rows = live(snap, dataset).filter(ok)
  const row = rows.find((r) => !used.has(`${dataset}:${r.id}`)) ?? rows[0]
  if (row) used.add(`${dataset}:${row.id}`)
  return row
}

const hour = (at: unknown): number => Number(String(at).slice(11, 13))
const timed = (r: Row): boolean => typeof r.start_at === 'string'

function assigned(snap: Snapshot, persoon: unknown, activiteit: unknown): boolean {
  return live(snap, 'toewijzing').some((t) => t.persoon_id === persoon && t.activiteit_id === activiteit)
}

interface Plan {
  row: Row
  value: unknown
  derived?: string[]
  fields?: Row
}

function relationPlan(snap: Snapshot, dataset: string, column: string, target: string): Plan | null {
  if (dataset === 'toewijzing' && column === 'persoon_id') {
    const row = pick(snap, dataset, (r) => r.persoon_id !== null)
    const other =
      row && live(snap, target).find((p) => p.id !== row.persoon_id && !assigned(snap, p.id, row.activiteit_id))
    return row && other ? { row, value: other.id } : null
  }
  if (dataset === 'toewijzing' && column === 'activiteit_id') {
    const row = pick(snap, dataset, (r) => r.persoon_id !== null)
    const other =
      row && live(snap, target).find((a) => a.id !== row.activiteit_id && !assigned(snap, row.persoon_id, a.id))
    return row && other ? { row, value: other.id } : null
  }
  const row = pick(snap, dataset)
  const other = row && live(snap, target).find((t) => t.id !== row[column])
  return row && other ? { row, value: other.id } : null
}

// The theatre writers' own rules decide which real row an edit can land on; everything else is generic.
function domainPlan(snap: Snapshot, dataset: string, column: string): Plan | null | undefined {
  const key = `${dataset}.${column}`
  if (key === 'activiteit.datum') {
    const row = pick(snap, dataset, (r) => !timed(r) && r.eind_at === null)
    const day = row && addDays(String(row.datum), 1)
    return row ? { row, value: day, derived: ['plandag'], fields: { datum: day, plandag: day } } : null
  }
  if (key === 'activiteit.start_at') {
    const row = pick(
      snap,
      dataset,
      (r) => timed(r) && r.eind_at === null && hour(r.start_at) >= 6 && hour(r.start_at) <= 21,
    )
    if (!row) return null
    const value = addMinutes(String(row.start_at), hour(row.start_at) >= 12 ? -60 : 60)
    const fields = { start_at: value, datum: value.slice(0, 10), plandag: expectedPlandag(value, DAY_LINE_HOUR) }
    return { row, value, derived: ['datum', 'plandag'], fields }
  }
  if (key === 'activiteit.eind_at') {
    const row = pick(snap, dataset, timed)
    const value =
      row && addMinutes(String(row.start_at), row.eind_at === addMinutes(String(row.start_at), 150) ? 180 : 150)
    return row ? { row, value } : null
  }
  if (key === 'beschikbaarheid.start_at' || key === 'beschikbaarheid.eind_at') {
    const row = pick(snap, dataset)
    return row ? { row, value: addMinutes(String(row[column]), column === 'start_at' ? -60 : 60) } : null
  }
  if (key === 'toewijzing.naam') {
    const row = pick(snap, dataset, (r) => r.persoon_id === null)
    return row ? { row, value: scalarEdit({ type: 'text', label: '' }, row.naam) } : null
  }
  if (key === 'persoon.voornaam' || key === 'persoon.achternaam') {
    const row = pick(snap, dataset)
    if (!row) return null
    const value = scalarEdit({ type: 'text', label: '' }, row[column])
    const name = { ...row, [column]: value }
    return { row, value, derived: ['weergavenaam'], fields: { weergavenaam: `${name.voornaam} ${name.achternaam}` } }
  }
  return undefined
}

function planEdit(snap: Snapshot, dataset: string, column: string, decl: Column): Plan | null {
  const special = domainPlan(snap, dataset, column)
  if (special !== undefined) return special
  if (decl.relation) return relationPlan(snap, dataset, column, decl.relation)
  const row = pick(snap, dataset)
  return row ? { row, value: scalarEdit(decl, decode(decl, row[column])) } : null
}

const editable = (source: Source): [string, Column][] =>
  Object.entries(source.columns).filter(([, column]) => !column.readonly)

// ---- step 0: a speelreeks, so activiteit.speelreeks_id has a real target ---------------------------

async function stepSpeelreeks(): Promise<void> {
  const step = '0 speelreeks'
  const label = 'create a speelreeks'
  const snap = snapshot()
  const dated = live(snap, 'activiteit').find((a) => typeof a.datum === 'string')
  const day = String(dated?.datum ?? new Date().toISOString().slice(0, 10))
  const body = speelreeksBody(live(snap, 'productie'), live(snap, 'organisatie'), day)
  if (!datasets.speelreeks || !body) return record(step, label, ['no writable speelreeks or no productie'], {})
  const op = { method: 'POST' as const, dataset: 'speelreeks', id: null, body }
  const ok = await attempt(step, label, op, { accept: true, fields: body })
  if (!ok) return
  // First in done, so the undo walks back to it last, after every write that points at it.
  done.push(ok)
  notes.push(`speelreeks ${ok.id} was created first for activiteit.speelreeks_id to point at; step 5 undoes it last`)
}

// ---- step 1: every editable column ----------------------------------------------------------------

async function stepColumns(): Promise<void> {
  const step = '1 columns'
  for (const [dataset, source] of Object.entries(datasets)) {
    const skipped = skipReason(live(snapshot(), dataset).length)
    if (skipped) {
      record(step, `${dataset} ${skipped}`, [], {})
      continue
    }
    for (const [column, decl] of editable(source)) {
      const label = `${dataset}.${column} edit`
      const plan = planEdit(snapshot(), dataset, column, decl)
      if (!plan) {
        record(step, label, ['no real row fits this edit'], {})
        continue
      }
      const body = { [column]: plan.value }
      const fields = plan.fields ?? { [column]: plan.value }
      const op = { method: 'PATCH' as const, dataset, id: plan.row.id as number, body }
      const ok = await attempt(step, label, op, { accept: true, derived: plan.derived, fields })
      if (ok) done.push(ok)
    }
    await clearOne(step, dataset, source)
    await refusals(step, dataset, source)
  }
}

async function clearOne(step: string, dataset: string, source: Source): Promise<void> {
  const label = `${dataset} clear a nullable column`
  const snap = snapshot()
  const columns = editable(source).filter(
    ([key, c]) => c.nullable && c.type === 'text' && !c.options && key !== source.title,
  )
  for (const [column] of columns) {
    const row = pick(snap, dataset, (r) => r[column] !== null)
    if (!row) continue
    const op = { method: 'PATCH' as const, dataset, id: row.id as number, body: { [column]: null } }
    const ok = await attempt(step, `${label} (${column})`, op, { accept: true, fields: { [column]: null } })
    if (ok) done.push(ok)
    return
  }
  notes.push(`${dataset}: no nullable text column holds a value, so no clear was driven`)
}

const BOGUS = 'shakeout-geen-optie'

function refusalCases(source: Source, row: Row): [label: string, body: Row][] {
  const cases: [string, Row][] = []
  for (const [column, c] of editable(source)) {
    if (c.options) cases.push([`${column} not an option`, { [column]: BOGUS }])
    if (c.type === 'text' && !c.nullable && !c.options && c.default === undefined)
      cases.push([`${column} empty`, { [column]: '' }])
    if (!c.nullable && c.default === undefined) cases.push([`${column} null`, { [column]: null }])
  }
  if (typeof row.start_at === 'string' && Object.hasOwn(source.columns, 'eind_at')) {
    cases.push(['eind before start', { eind_at: addMinutes(row.start_at, -30) }])
  }
  return cases
}

async function refusals(step: string, dataset: string, source: Source): Promise<void> {
  const row = pick(snapshot(), dataset, (r) => dataset !== 'activiteit' || timed(r))
  if (!row) return
  for (const [what, body] of refusalCases(source, row)) {
    const op = { method: 'PATCH' as const, dataset, id: row.id as number, body }
    await attempt(step, `${dataset} refused: ${what}`, op, { accept: false })
  }
  used.delete(`${dataset}:${row.id}`)
}

// ---- step 2: the day line -------------------------------------------------------------------------

async function stepDayLine(): Promise<void> {
  const step = '2 day line'
  const snap = snapshot()
  const row = pick(snap, 'activiteit', (r) => timed(r) && r.eind_at === null)
  if (!row) return record(step, 'day-line move', ['no timed activity without an end'], {})
  const day = String(row.datum)
  const late = `${day}T23:30`
  const early = `${addDays(day, 1)}T01:30`
  const moves: [string, string, Row][] = [
    ['move to 23:30 on its day', late, { datum: day, plandag: day }],
    ['move across midnight to 01:30', early, { datum: addDays(day, 1), plandag: day }],
  ]
  for (const [label, at, fields] of moves) {
    const op = { method: 'PATCH' as const, dataset: 'activiteit', id: row.id as number, body: { start_at: at } }
    const ok = await attempt(step, label, op, {
      accept: true,
      derived: ['datum', 'plandag'],
      fields: { start_at: at, ...fields },
    })
    if (ok) done.push(ok)
  }
  await untimedGainsTime(step, snap)
  await createDisagreeing(step, snap)
}

async function untimedGainsTime(step: string, snap: Snapshot): Promise<void> {
  const alone = pick(snap, 'activiteit', (r) => !timed(r) && r.eind_at === null)
  const withDatum = pick(snap, 'activiteit', (r) => !timed(r) && r.eind_at === null)
  if (!alone || !withDatum) return record(step, 'untimed gains a time', ['no untimed activity'], {})
  const at = `${addDays(String(alone.datum), 2)}T10:00`
  const fields = { start_at: at, datum: at.slice(0, 10), plandag: at.slice(0, 10) }
  const op = { method: 'PATCH' as const, dataset: 'activiteit', id: alone.id as number, body: { start_at: at } }
  const ok = await attempt(step, 'untimed gains a time on another day (start only)', op, {
    accept: true,
    derived: ['datum', 'plandag'],
    fields,
  })
  if (ok) done.push(ok)
  const body = { start_at: `${addDays(String(withDatum.datum), 2)}T10:00`, datum: withDatum.datum }
  const refused = { method: 'PATCH' as const, dataset: 'activiteit', id: withDatum.id as number, body }
  await attempt(step, 'untimed gains a time on another day, its old datum sent along', refused, {
    accept: false,
    status: 422,
    code: 'refused',
  })
}

async function createDisagreeing(step: string, snap: Snapshot): Promise<void> {
  const productie = live(snap, 'productie')[0]
  const any = live(snap, 'activiteit')[0]
  if (!productie || !any) return record(step, 'create', ['no productie or activiteit'], {})
  const datum = String(any.datum)
  const at = `${addDays(datum, 3)}T01:30`
  const body = { productie_id: productie.id, soort: 'repetitie', omschrijving: TEXT, datum, start_at: at }
  const fields = { datum: addDays(datum, 3), plandag: addDays(datum, 2), start_at: at }
  const op = { method: 'POST' as const, dataset: 'activiteit', id: null, body }
  const ok = await attempt(step, 'create whose datum disagrees with start (start wins)', op, { accept: true, fields })
  if (ok) done.push(ok)
  const missing = {
    method: 'POST' as const,
    dataset: 'activiteit',
    id: null,
    body: { productie_id: productie.id, soort: 'repetitie' },
  }
  await attempt(step, 'create without datum or start', missing, { accept: false, status: 422, code: 'refused' })
}

// ---- step 3: person to name and back --------------------------------------------------------------

async function stepPersonName(): Promise<void> {
  const step = '3 person to name'
  const snap = snapshot()
  const row = pick(snap, 'toewijzing', (r) => r.persoon_id !== null)
  const persoon = row && snap.get(`persoon:${row.persoon_id}`)
  if (!row || !persoon) return record(step, 'switch', ['no toewijzing with a persoon'], {})
  const id = row.id as number
  const naam = 'shakeout-extern'
  const toName = await attempt(
    step,
    'persoon to a free name',
    { method: 'PATCH', dataset: 'toewijzing', id, body: { naam } },
    { accept: true, derived: ['persoon_id'], fields: { naam, persoon_id: null }, title: naam },
  )
  if (toName) done.push(toName)
  const back = await attempt(
    step,
    'free name back to the persoon',
    { method: 'PATCH', dataset: 'toewijzing', id, body: { persoon_id: row.persoon_id } },
    {
      accept: true,
      derived: ['naam'],
      fields: { naam: null, persoon_id: row.persoon_id },
      title: String(persoon.weergavenaam),
    },
  )
  if (back) done.push(back)
}

// ---- step 4: deletes ------------------------------------------------------------------------------

function referenced(snap: Snapshot, target: string): Row | undefined {
  const pointers = Object.entries(datasets).flatMap(([name, s]) =>
    Object.entries(s.columns)
      .filter(([, c]) => c.relation === target)
      .map(([column]) => [name, column] as const),
  )
  const ids = new Set(pointers.flatMap(([name, column]) => live(snap, name).map((r) => r[column])))
  return live(snap, target).find((r) => ids.has(r.id))
}

async function stepDeletes(): Promise<void> {
  const step = '4 deletes'
  const snap = snapshot()
  const targets = new Set(
    Object.values(datasets).flatMap((s) => Object.values(s.columns).flatMap((c) => c.relation ?? [])),
  )
  for (const target of targets) {
    const row = referenced(snap, target)
    if (!row) continue
    const op = { method: 'DELETE' as const, dataset: target, id: row.id as number }
    await attempt(step, `${target} still referenced`, op, { accept: false, status: 409, code: 'in_use' })
    const by = outcomes.at(-1)?.detail.response as Row
    if (!Array.isArray(by?.by) || by.by.length === 0) outcomes.at(-1)?.problems.push('in_use names no referrers')
  }
  const fresh = await attempt(
    step,
    'create an unreferenced organisatie',
    { method: 'POST', dataset: 'organisatie', id: null, body: { naam: TEXT, soort: 'partner' } },
    { accept: true },
  )
  if (!fresh) return
  await attempt(
    step,
    'delete the unreferenced organisatie',
    { method: 'DELETE', dataset: 'organisatie', id: fresh.id },
    {
      accept: true,
      gone: true,
    },
  )
}

// ---- step 5: undo ---------------------------------------------------------------------------------

function restoredProblems(edit: Done, now: Row): string[] {
  if (edit.kind === 'create') return now.deleted_at === null ? ['the created row is still live'] : []
  return rowDiff(edit.before ?? {}, now, ['updated_at']).map((k) => `${k} is not back to its value before`)
}

// The grid's undo: the write's batch undone on the server, which restores derived columns too.
async function undoOne(step: string, edit: Done): Promise<void> {
  const label = `undo ${edit.label}`
  const before = snapshot()
  const since = lastRevision()
  const res = await http('POST', `/batches/${edit.batch}/undo`, {})
  const after = snapshot()
  const revisions = revisionsSince(since)
  const key = `${edit.dataset}:${edit.id}`
  const now = after.get(key) ?? {}
  const changed = snapshotDiff(before, after)
  const problems = [
    ...(res.status === 200 ? [] : [`answered ${res.status} ${String(res.body.code)}`]),
    ...(changed.length === 1 && changed[0] === key ? [] : [`${changed.length} rows changed, expected only the target`]),
    ...(revisions.every((r) => r.batch_id === res.body.batch_id) ? [] : ['the undo spans more than one batch']),
    ...restoredProblems(edit, now),
  ]
  record(step, label, problems, { batch: edit.batch, status: res.status, response: res.body, revisions })
}

async function stepUndo(): Promise<void> {
  const step = '5 undo'
  for (const edit of undoOrder(done)) await undoOne(step, edit)
}

// ---- step 6: reload and compare -------------------------------------------------------------------

async function stepReload(start: Snapshot): Promise<void> {
  const step = '6 reload'
  await stopEngine()
  await startEngine()
  const me = await http('GET', '/auth/me')
  record(step, 'session survives an engine restart', me.status === 200 ? [] : [`auth/me answered ${me.status}`], {})
  const now = snapshot()
  for (const key of touched) {
    const [dataset = '', id = ''] = key.split(':')
    const was = start.get(key)
    const row = now.get(key) as Row
    const served = await servedRow(dataset, Number(id))
    if (created.has(key)) {
      const problems = [
        ...(row.deleted_at === null ? ['a row the session created is still live'] : []),
        ...(served ? ['still served'] : []),
      ]
      record(step, `${dataset} created row is gone`, problems, { key })
      continue
    }
    const differs = rowDiff(was ?? {}, row, ['updated_at'])
    const problems = [
      ...differs.map((k) => `${k} differs from the pre-session row`),
      ...servedProblems((datasets[dataset] as Source).columns, served, row, false),
    ]
    record(step, `${dataset} row equals its pre-session snapshot`, problems, {
      key,
      before: was ?? null,
      now: row,
      differs,
    })
  }
  const untouched = [...start.keys()].filter((key) => !touched.has(key))
  const strays = untouched.filter((key) => !Bun.deepEquals(start.get(key), now.get(key)))
  record(step, 'no untouched row changed', strays.length ? [`${strays.length} untouched rows changed`] : [], { strays })
  const stamped = [...touched].filter(
    (key) => !created.has(key) && start.get(key)?.updated_at !== now.get(key)?.updated_at,
  )
  notes.push(`${stamped.length} restored rows keep a new updated_at (expected: every write stamps it)`)
}

// ---- report ---------------------------------------------------------------------------------------

function writePrivate(file: string, text: string): void {
  writeFileSync(file, text, { mode: 0o600 })
  chmodSync(file, 0o600)
}

function counts(step: string) {
  const mine = outcomes.filter((o) => o.step === step)
  return { total: mine.length, pass: mine.filter((o) => o.ok).length, fail: mine.filter((o) => !o.ok).length }
}

function summary(steps: string[], englishRefusals: Outcome[]): string {
  const lines = [
    '# Edit session shakeout',
    '',
    `Run ${new Date().toISOString()} on a copy, engine on port ${PORT}.`,
    '',
  ]
  lines.push('| Step | Cases | Pass | Fail |', '|-|-|-|-|')
  for (const step of steps) {
    const c = counts(step)
    lines.push(`| ${step} | ${c.total} | ${c.pass} | ${c.fail} |`)
  }
  lines.push('', '## Failures', '')
  const failed = outcomes.filter((o) => !o.ok)
  if (failed.length === 0) lines.push('None.')
  for (const o of failed) lines.push(`- **${o.step}** ${o.label}: ${o.problems.join('; ')}`)
  lines.push('', '## Refusals not in the writer’s Dutch', '')
  if (englishRefusals.length === 0) lines.push('None.')
  for (const o of englishRefusals)
    lines.push(`- ${o.label}: answered ${String(o.detail.status)} ${String((o.detail.response as Row)?.code)}`)
  lines.push('', '## Notes', '', ...notes.map((n) => `- ${n}`), '')
  return lines.join('\n')
}

function report(): number {
  const steps = [...new Set(outcomes.map((o) => o.step))]
  for (const step of steps) {
    const c = counts(step)
    console.log(`${c.fail === 0 ? 'PASS' : 'FAIL'}  step ${step}: ${c.pass}/${c.total} cases pass`)
    for (const o of outcomes.filter((x) => x.step === step && !x.ok))
      console.log(`      fail  ${o.label}: ${o.problems.join('; ')}`)
  }
  const englishRefusals = outcomes.filter((o) => o.dutch === false)
  console.log(
    `refusals: ${outcomes.filter((o) => o.dutch === true).length} from a domain writer, ${englishRefusals.length} from the engine backstop`,
  )
  for (const o of englishRefusals)
    console.log(`      backstop  ${o.label}: ${String(o.detail.status)} ${String((o.detail.response as Row)?.code)}`)
  for (const note of notes) console.log(`note: ${note}`)
  mkdirSync(OUT, { recursive: true, mode: 0o700 })
  writePrivate(join(OUT, 'edit-session.detail.json'), `${JSON.stringify({ port: PORT, notes, outcomes }, null, 2)}\n`)
  writePrivate(join(OUT, 'edit-session.md'), summary(steps, englishRefusals))
  console.log(`wrote edit-session.detail.json and edit-session.md to ${OUT}`)
  return outcomes.some((o) => !o.ok) ? 1 : 0
}

async function main(): Promise<number> {
  notes.push('undo is done as the grid does it: the batch of each write, newest first, through POST /batches/:id/undo')
  notes.push('clearing a Start segment by segment is a grid concern and is not driven here')
  createAdmin()
  adminId = (ro.query('SELECT id FROM account WHERE email = ? COLLATE NOCASE').get(EMAIL) as { id: number }).id
  await startEngine()
  try {
    await signIn()
    const schema = await http('GET', '/schema')
    const sources = schema.body.sources as Record<string, Source>
    datasets = Object.fromEntries(Object.entries(sources).filter(([, s]) => s.kind === 'dataset' && s.writable))
    const start = snapshot()
    console.log(`signed in; ${Object.keys(datasets).length} writable datasets, ${start.size} rows`)
    await stepSpeelreeks()
    await stepColumns()
    await stepDayLine()
    await stepPersonName()
    await stepDeletes()
    await stepUndo()
    await stepReload(start)
  } finally {
    await stopEngine()
    const errors = await engineErrors
    if (errors.trim())
      notes.push(`the engine wrote ${errors.trim().split('\n').length} stderr line(s); see the detail file`)
    outcomes.push({
      step: 'engine',
      label: 'stderr',
      ok: errors.trim() === '',
      problems: [],
      detail: { stderr: errors },
    })
  }
  return report()
}

process.exit(await main())
