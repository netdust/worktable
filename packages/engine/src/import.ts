import type { Database } from 'bun:sqlite'
import { drizzle } from 'drizzle-orm/bun-sqlite'
import { forbid } from './access'
import type { Actor, DatasetDecl, Domain, Writer } from './declare'
import { ApiError } from './params'
import { writerOf } from './registry'
import { contextOf, create, encodeAll, type Store, valuesOf, WriteRefused } from './writes'

export interface Refusal {
  dataset: string
  legacy_id: unknown
  message: string
}

export interface ImportResult {
  counts: Record<string, number>
  refused: Refusal[]
  committed: boolean
}

type Row = Record<string, unknown>

interface Plan {
  dataset: DatasetDecl
  writer: Writer
  rows: Row[]
}

interface Run {
  store: Store
  actor: Actor
  now: string
  batch: string
  exported: Map<string, Set<unknown>>
  imported: Map<string, Map<unknown, number>>
}

// The one column the engine knows as an import target; a domain that declares it keeps its old ids there.
const LEGACY_COLUMN = 'legacy_post_id'
const FORMAT_KEYS = new Set(['worktable_export', 'source', 'datasets', 'checks'])

const bad = (path: string, message: string) => new ApiError(400, 'bad_import', `${path}: ${message}`)

const isObject = (value: unknown): value is Row => typeof value === 'object' && value !== null && !Array.isArray(value)

function datasetsOf(data: unknown): Row {
  if (!isObject(data)) throw bad('$', 'an export is a JSON object')
  for (const key of Object.keys(data)) if (!FORMAT_KEYS.has(key)) throw bad(key, 'is not part of the export format')
  if (data.worktable_export !== 1) throw bad('worktable_export', 'must be 1')
  if (data.source !== undefined && typeof data.source !== 'string') throw bad('source', 'must be text')
  if (!isObject(data.datasets)) throw bad('datasets', 'must be an object')
  return data.datasets
}

function checkKey(dataset: DatasetDecl, key: string, value: unknown, path: string): void {
  if (key === 'legacy_id') {
    if (!Number.isSafeInteger(value) || (value as number) < 0) throw bad(path, 'must be a non-negative integer')
    return
  }
  if (key === 'custom') {
    if (!dataset.custom) throw bad(path, `"${dataset.name}" has no custom fields`)
    if (!isObject(value)) throw bad(path, 'must be an object')
    return
  }
  const column = Object.hasOwn(dataset.columns, key) ? dataset.columns[key] : undefined
  if (!column) throw bad(path, 'is not a declared column')
  if (column.readonly) throw bad(path, 'is readonly: derived values come from the writer')
}

function checkRows(dataset: DatasetDecl, rows: unknown, path: string): Row[] {
  if (!Array.isArray(rows)) throw bad(path, 'must be a list of rows')
  const seen = new Set<unknown>()
  rows.forEach((row, i) => {
    const at = `${path}[${i}]`
    if (!isObject(row)) throw bad(at, 'must be an object')
    if (!Object.hasOwn(row, 'legacy_id')) throw bad(`${at}.legacy_id`, 'is required')
    for (const [key, value] of Object.entries(row)) checkKey(dataset, key, value, `${at}.${key}`)
    if (seen.has(row.legacy_id)) throw bad(`${at}.legacy_id`, 'repeats an earlier row')
    seen.add(row.legacy_id)
  })
  return rows
}

// Every name is checked against the declarations here, before any SQL is built from it.
function plansOf(domain: Domain, datasets: Row): Plan[] {
  return Object.entries(datasets).map(([name, rows]) => {
    const path = `datasets.${name}`
    const dataset = domain.datasets.find((d) => d.name === name)
    if (!dataset) throw bad(path, 'is not a declared dataset')
    const writer = writerOf(domain, name)
    if (!writer?.create) throw bad(path, 'does not accept create')
    return { dataset, writer, rows: checkRows(dataset, rows, path) }
  })
}

const targetsOf = (dataset: DatasetDecl): string[] =>
  Object.values(dataset.columns).flatMap((column) => (column.relation ? [column.relation] : []))

// Targets come before the rows that point at them; a self or circular relation cannot be ordered.
function ordered(plans: Plan[]): Plan[] {
  const present = new Set(plans.map((p) => p.dataset.name))
  const done = new Set<string>()
  const out: Plan[] = []
  let pending = plans
  while (pending.length > 0) {
    const ready = pending.filter((p) => targetsOf(p.dataset).every((t) => !present.has(t) || done.has(t)))
    if (ready.length === 0) throw bad('datasets', `relations form a cycle among ${pending.map((p) => p.dataset.name)}`)
    for (const p of ready) done.add(p.dataset.name)
    out.push(...ready)
    pending = pending.filter((p) => !done.has(p.dataset.name))
  }
  return out
}

function checkEmpty(sqlite: Database, plans: Plan[]): void {
  for (const { dataset } of plans) {
    if (sqlite.query(`SELECT 1 FROM "${dataset.name}" LIMIT 1`).get() !== null) {
      throw new ApiError(409, 'import_needs_empty_database', `"${dataset.name}" is not empty`)
    }
  }
}

// Legacy id 0 is a real id: lookups go through has() and undefined, never truthiness.
function newIdOf(run: Run, key: string, target: string, legacy: unknown): number {
  if (!Number.isSafeInteger(legacy)) throw new WriteRefused(`"${key}" must be a legacy id`)
  const id = run.imported.get(target)?.get(legacy)
  if (id !== undefined) return id
  if (run.exported.get(target)?.has(legacy))
    throw new WriteRefused(`"${key}" names legacy id ${legacy}, which was refused`)
  throw new WriteRefused(`"${key}" names legacy id ${legacy}, absent from the export`)
}

function bodyOf(run: Run, dataset: DatasetDecl, row: Row): Row {
  const body: Row = {}
  for (const [key, value] of Object.entries(row)) {
    if (key === 'legacy_id' || key === 'custom') continue
    const target = dataset.columns[key]?.relation
    body[key] = target && value !== null ? newIdOf(run, key, target, value) : value
  }
  return body
}

function importRow(run: Run, plan: Plan, row: Row): number {
  const { store, actor } = run
  const values = valuesOf(store, plan, 'create', bodyOf(run, plan.dataset, row), contextOf(store, actor, null), 'all')
  const stored = encodeAll(plan.dataset, values)
  if (Object.hasOwn(plan.dataset.columns, LEGACY_COLUMN)) stored[LEGACY_COLUMN] = row.legacy_id as number
  if (row.custom !== undefined) stored.custom = JSON.stringify(row.custom)
  return create(store.sqlite, plan.dataset, stored, run.now, actor.id, run.batch)
}

// A refusal names the row by its legacy id and carries the pipeline's message, never a column value.
function importAll(run: Run, plans: Plan[]): Omit<ImportResult, 'committed'> {
  const counts: Record<string, number> = {}
  const refused: Refusal[] = []
  for (const plan of plans) {
    const made = new Map<unknown, number>()
    run.imported.set(plan.dataset.name, made)
    for (const row of plan.rows) {
      try {
        made.set(row.legacy_id, importRow(run, plan, row))
      } catch (err) {
        if (!(err instanceof ApiError)) throw err
        refused.push({ dataset: plan.dataset.name, legacy_id: row.legacy_id, message: err.message })
      }
    }
    counts[plan.dataset.name] = made.size
  }
  return { counts, refused }
}

class Rollback extends Error {
  constructor(readonly result: ImportResult) {
    super('import rolled back')
  }
}

export function importExport(
  sqlite: Database,
  domain: Domain,
  data: unknown,
  actor: Actor,
  opts: { acceptReport: boolean },
): ImportResult {
  if (actor.role !== 'administrator') forbid('only an administrator imports')
  const plans = ordered(plansOf(domain, datasetsOf(data)))
  const run: Run = {
    store: { sqlite, db: drizzle(sqlite), domain },
    actor,
    now: new Date().toISOString(),
    batch: crypto.randomUUID(),
    exported: new Map(plans.map((p) => [p.dataset.name, new Set(p.rows.map((r) => r.legacy_id))])),
    imported: new Map(),
  }
  try {
    return sqlite
      .transaction(() => {
        checkEmpty(sqlite, plans)
        const done = importAll(run, plans)
        const result = { ...done, committed: done.refused.length === 0 || opts.acceptReport }
        if (!result.committed) throw new Rollback(result)
        return result
      })
      .immediate()
  } catch (err) {
    if (err instanceof Rollback) return err.result
    throw err
  }
}
