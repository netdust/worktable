import type { Database } from 'bun:sqlite'
import { drizzle } from 'drizzle-orm/bun-sqlite'
import type { Actor, DatasetDecl, Domain, SavedViewSeed } from './declare'
import { ApiError } from './params'
import { savedView } from './saved-view'
import { SYSTEM_OWNER } from './views'
import { contextOf, create, encodeAll, recordBatch, revise, type Store, valuesOf, writableOf } from './writes'

type Row = Record<string, unknown>
type Stored = Record<string, string | number | null>
type Change = [field: string, old: string | number | null, value: string | number | null]

export type DatasetOutcome = number | 'not config' | 'has rows'

export interface SeedReport {
  datasets: Record<string, DatasetOutcome>
  views: { added: number; updated: number; present: number }
  batch: string | null
}

export class SeedRefused extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'SeedRefused'
  }
}

interface Run {
  store: Store
  now: string
  batch: string
  written: number
}

const SYSTEM: Actor = { id: SYSTEM_OWNER, role: 'administrator', subject: null }
// The declared fields of a seeded view; name and source are what match it.
const DECLARED = ['source_type', 'skin', 'filters', 'sort', 'group_by', 'visible_fields', 'shared']

function seedRows(domain: Domain): Map<string, Row[]> {
  const rows = new Map<string, Row[]>()
  domain.seed((dataset, more) => rows.set(dataset, [...(rows.get(dataset) ?? []), ...more]))
  return rows
}

const hasRows = (sqlite: Database, table: string): boolean =>
  sqlite.query(`SELECT 1 FROM "${table}" LIMIT 1`).get() !== null

function writeRow(run: Run, dataset: DatasetDecl, row: Row): void {
  const { store } = run
  const target = writableOf(store.domain, dataset.name, 'create', SYSTEM)
  const stored = encodeAll(dataset, valuesOf(store, target, 'create', row, contextOf(store, SYSTEM, null), 'all'))
  if (dataset.custom && row.custom !== undefined) stored.custom = JSON.stringify(row.custom)
  create(store.sqlite, dataset, stored, run.now, SYSTEM_OWNER, run.batch)
}

// A refusal names the dataset and the row's position, never a value.
function writeRows(run: Run, dataset: DatasetDecl, rows: Row[]): number {
  rows.forEach((row, i) => {
    try {
      writeRow(run, dataset, row)
    } catch (err) {
      if (err instanceof ApiError) throw new SeedRefused(`${dataset.name} row ${i + 1}: ${err.message}`)
      throw err
    }
  })
  run.written += rows.length
  return rows.length
}

function seedDataset(run: Run, name: string, rows: Row[]): DatasetOutcome {
  const dataset = run.store.domain.datasets.find((d) => d.name === name)
  if (!dataset) throw new SeedRefused(`${name} is not a declared dataset`)
  if (!dataset.config) return 'not config'
  if (hasRows(run.store.sqlite, name)) return 'has rows'
  return writeRows(run, dataset, rows)
}

function storedView(seed: SavedViewSeed): Stored {
  const json = JSON.stringify
  return {
    name: seed.name,
    source_type: seed.source_type,
    source: seed.source,
    skin: seed.skin,
    filters: json(seed.filters),
    sort: json(seed.sort),
    group_by: seed.group_by,
    visible_fields: json(seed.visible_fields),
    shared: 1,
  }
}

function addView(run: Run, next: Stored): void {
  const { sqlite } = run.store
  const row = { ...next, owner_id: SYSTEM_OWNER }
  const keys = Object.keys(row)
  const sql = `INSERT INTO saved_view (${keys.join(', ')}) VALUES (${keys.map(() => '?').join(', ')})`
  const id = Number(sqlite.query(sql).run(...Object.values(row)).lastInsertRowid)
  const raw = sqlite.query('SELECT * FROM saved_view WHERE id = ?').get(id) as Stored
  const changes = Object.keys(savedView.columns)
    .map((key): Change => [key, null, raw[key] ?? null])
    .filter(([, , value]) => value !== null)
  revise(sqlite, savedView, id, changes, run.now, SYSTEM_OWNER, run.batch)
  run.written++
}

// Answers whether the view changed; only the system owner's views are brought up to date.
function updateView(run: Run, current: Stored, next: Stored): boolean {
  const changes = DECLARED.map((key): Change => [key, current[key] ?? null, next[key] ?? null]).filter(
    ([, old, value]) => old !== value,
  )
  if (changes.length === 0) return false
  const sets = [...changes.map(([key]) => `"${key}" = ?`), 'updated_at = ?']
  const values = [...changes.map(([, , value]) => value), run.now, current.id as number]
  run.store.sqlite.query(`UPDATE saved_view SET ${sets.join(', ')} WHERE id = ?`).run(...values)
  revise(run.store.sqlite, savedView, current.id as number, changes, run.now, SYSTEM_OWNER, run.batch)
  run.written++
  return true
}

function seedViews(run: Run): SeedReport['views'] {
  const counts = { added: 0, updated: 0, present: 0 }
  const sql = 'SELECT * FROM saved_view WHERE name = ? AND source = ? AND deleted_at IS NULL ORDER BY id'
  for (const seed of run.store.domain.views) {
    const next = storedView(seed)
    const live = run.store.sqlite.query(sql).all(seed.name, seed.source) as Stored[]
    const system = live.find((view) => view.owner_id === SYSTEM_OWNER)
    if (live.length === 0) {
      addView(run, next)
      counts.added++
    } else if (system && updateView(run, system, next)) counts.updated++
    else counts.present++
  }
  return counts
}

// One transaction under one seed batch; a second run finds everything present and records nothing.
export function seedMissing(sqlite: Database, domain: Domain): SeedReport {
  const run: Run = {
    store: { sqlite, db: drizzle(sqlite), domain },
    now: new Date().toISOString(),
    batch: crypto.randomUUID(),
    written: 0,
  }
  return sqlite
    .transaction((): SeedReport => {
      const datasets: Record<string, DatasetOutcome> = {}
      for (const [name, rows] of seedRows(domain)) datasets[name] = seedDataset(run, name, rows)
      const views = seedViews(run)
      if (run.written === 0) return { datasets, views, batch: null }
      recordBatch(sqlite, run.batch, SYSTEM_OWNER, 'seed', run.now)
      return { datasets, views, batch: run.batch }
    })
    .immediate()
}

// Counts only: no row value reaches the log.
export function seedLines(report: SeedReport): string[] {
  const lines = Object.entries(report.datasets).map(([name, outcome]) => {
    if (typeof outcome !== 'number') return `${name} skipped (${outcome})`
    return `${name} ${outcome} ${outcome === 1 ? 'row' : 'rows'}`
  })
  const { added, updated, present } = report.views
  lines.push(`views ${added} added, ${updated} updated, ${present} present`)
  return lines.map((line) => `seed-missing: ${line}`)
}
