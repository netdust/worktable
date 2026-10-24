import type { Database } from 'bun:sqlite'
import { drizzle } from 'drizzle-orm/bun-sqlite'
import { seededLayout } from './dashboard'
import type { DatasetDecl, Domain, SavedViewSeed } from './declare'
import { silentMailer } from './mailer'
import { keySeeded } from './migrate'
import { ApiError } from './params'
import { sourceOf } from './registry'
import { savedView, seedKey } from './saved-view'
import { SYSTEM, SYSTEM_OWNER } from './views'
import { contextOf, create, encodeAll, recordBatch, revise, type Store, valuesOf, writableOf } from './writes'

type Row = Record<string, unknown>
type Stored = Record<string, string | number | null>
type Change = [field: string, old: string | number | null, value: string | number | null]

export type DatasetOutcome = { inserted: number; present: number } | 'not config'

export interface SeedReport {
  datasets: Record<string, DatasetOutcome>
  views: { added: number; updated: number; present: number }
  // One line per system view it updated or left alone, and per view whose source is gone.
  named: string[]
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
  named: string[]
}

// The declared fields of a seeded view; name and source are what match it.
const DECLARED = ['source_type', 'skin', 'filters', 'sort', 'group_by', 'visible_fields', 'layout', 'shared']

function seedRows(domain: Domain): Map<string, Row[]> {
  const rows = new Map<string, Row[]>()
  domain.seed((dataset, more) => rows.set(dataset, [...(rows.get(dataset) ?? []), ...more]))
  return rows
}

// Deleted rows count: a planner's deletion is not undone by a seed.
const carries = (sqlite: Database, table: string, key: string, title: unknown): boolean =>
  sqlite.query(`SELECT 1 FROM "${table}" WHERE "${key}" = ? LIMIT 1`).get(title as string) !== null

function writeRow(run: Run, dataset: DatasetDecl, row: Row): void {
  const { store } = run
  const target = writableOf(store.domain, dataset.name, 'create', SYSTEM)
  const stored = encodeAll(
    dataset,
    valuesOf(store, target, 'create', row, contextOf(store, SYSTEM, null), 'all', { trusted: true }),
  )
  if (dataset.custom && row.custom !== undefined) stored.custom = JSON.stringify(row.custom)
  create(store.sqlite, dataset, stored, run.now, SYSTEM_OWNER, run.batch)
}

// A refusal names the dataset and the row's position, never a value.
function writeChecked(run: Run, dataset: DatasetDecl, row: Row, n: number): void {
  try {
    writeRow(run, dataset, row)
  } catch (err) {
    if (err instanceof ApiError) throw new SeedRefused(`${dataset.name} row ${n}: ${err.message}`)
    throw err
  }
}

function seedDataset(run: Run, name: string, rows: Row[]): DatasetOutcome {
  const dataset = run.store.domain.datasets.find((d) => d.name === name)
  if (!dataset) throw new SeedRefused(`${name} is not a declared dataset`)
  if (!dataset.config) return 'not config'
  const key = typeof dataset.title === 'string' ? dataset.title : dataset.title.else
  let inserted = 0
  rows.forEach((row, i) => {
    if (row[key] == null) throw new SeedRefused(`${name} row ${i + 1}: no ${key} to match it by`)
    if (carries(run.store.sqlite, name, key, row[key])) return
    writeChecked(run, dataset, row, i + 1)
    inserted++
  })
  run.written += inserted
  return { inserted, present: rows.length - inserted }
}

function storedView(run: Run, seed: SavedViewSeed, dropped: string[]): Stored {
  const json = JSON.stringify
  return {
    name: seed.name,
    source_type: seed.source_type ?? null,
    source: seed.source ?? null,
    skin: seed.skin,
    filters: json(seed.filters),
    sort: json(seed.sort),
    group_by: seed.group_by,
    visible_fields: json(seed.visible_fields),
    layout: seed.skin === 'dashboard' ? json(dashboardLayout(run, seed, dropped)) : null,
    shared: 1,
  }
}

function dashboardLayout(run: Run, seed: SavedViewSeed, dropped: string[]) {
  try {
    return seededLayout(run.store.sqlite, run.store.domain, seed, SYSTEM, dropped)
  } catch (err) {
    throw new SeedRefused((err as Error).message)
  }
}

const labelOf = (view: Stored): string => `view "${view.name}"${view.source === null ? '' : ` (${view.source})`}`

/** A person touched a seeded view when a revision of it names an actor other than the system owner. */
export function touched(sqlite: Database, id: number): boolean {
  const sql = "SELECT 1 FROM revision WHERE entity = 'saved_view' AND record_id = ? AND actor_id IS NOT ? LIMIT 1"
  return sqlite.query(sql).get(id, SYSTEM_OWNER) !== null
}

function addView(run: Run, next: Stored, key: string): void {
  const { sqlite } = run.store
  const row = { ...next, owner_id: SYSTEM_OWNER, seed_key: key }
  const keys = Object.keys(row)
  const sql = `INSERT INTO saved_view (${keys.join(', ')}) VALUES (${keys.map(() => '?').join(', ')})`
  const id = Number(sqlite.query(sql).run(...Object.values(row)).lastInsertRowid)
  const raw = sqlite.query('SELECT * FROM saved_view WHERE id = ?').get(id) as Stored
  const changes = Object.keys(savedView.columns)
    .filter((column) => column !== 'seed_key')
    .map((column): Change => [column, null, raw[column] ?? null])
    .filter(([, , value]) => value !== null)
  revise(sqlite, savedView, id, changes, run.now, SYSTEM_OWNER, run.batch)
  run.written++
}

const isPublic = (view: Stored): boolean => view.public === 1 || view.share_token !== null

// What an administrator published, to anyone or to owners, stays as they published it.
function leftAlone(view: Stored): string | null {
  if (isPublic(view)) return 'is public'
  return view.for_owners === 1 ? 'is for owners' : null
}

// Answers whether the view changed; only the system owner's views are brought up to date, never a published one.
function updateView(run: Run, current: Stored, next: Stored): boolean {
  const label = labelOf(current)
  const published = leftAlone(current)
  if (published) {
    run.named.push(`${label} ${published}, left alone`)
    return false
  }
  const changes = DECLARED.map((key): Change => [key, current[key] ?? null, next[key] ?? null]).filter(
    ([, old, value]) => old !== value,
  )
  if (changes.length === 0) return false
  const sets = [...changes.map(([key]) => `"${key}" = ?`), 'updated_at = ?']
  const values = [...changes.map(([, , value]) => value), run.now, current.id as number]
  run.store.sqlite.query(`UPDATE saved_view SET ${sets.join(', ')} WHERE id = ?`).run(...values)
  revise(run.store.sqlite, savedView, current.id as number, changes, run.now, SYSTEM_OWNER, run.batch)
  run.written++
  run.named.push(`${label} updated`)
  return true
}

function restoreView(run: Run, view: Stored): void {
  const id = view.id as number
  run.store.sqlite.query('UPDATE saved_view SET deleted_at = NULL, updated_at = ? WHERE id = ?').run(run.now, id)
  revise(
    run.store.sqlite,
    savedView,
    id,
    [['deleted_at', view.deleted_at ?? null, null]],
    run.now,
    SYSTEM_OWNER,
    run.batch,
  )
  run.written++
}

type Outcome = 'added' | 'updated' | 'present'

// One seed against the system rows that carry its key, live or deleted.
function seedView(run: Run, seed: SavedViewSeed): Outcome {
  const { sqlite } = run.store
  const dropped: string[] = []
  const next = storedView(run, seed, dropped)
  const key = seedKey(seed.name, seed.source)
  const owned = sqlite
    .query('SELECT * FROM saved_view WHERE seed_key = ? AND owner_id = ? ORDER BY deleted_at IS NOT NULL, id')
    .all(key, SYSTEM_OWNER) as Stored[]
  const current = owned[0]
  const label = labelOf(next)
  const unlocked = seed.locked !== true
  if (!current) {
    // Another owner's shared view of the same name and source stands in for the seed, and is never adopted; a renamed seed does not.
    const sql =
      'SELECT 1 FROM saved_view WHERE name = ? AND source IS ? AND deleted_at IS NULL AND shared = 1 AND owner_id != ?'
    if (sqlite.query(sql).get(seed.name, seed.source ?? null, SYSTEM_OWNER)) return 'present'
    addView(run, next, key)
    noteDropped(run, seed, dropped)
    return 'added'
  }
  if (unlocked && touched(sqlite, current.id as number)) {
    run.named.push(`${label} ${current.deleted_at === null ? 'changed' : 'deleted'} by a person, left alone`)
    return 'present'
  }
  if (current.deleted_at !== null) restoreView(run, current)
  const restored = current.deleted_at !== null
  if (restored) run.named.push(`${label} restored`)
  const changed = updateView(run, { ...current, deleted_at: null }, next)
  if (changed) noteDropped(run, seed, dropped)
  return restored || changed ? 'updated' : 'present'
}

const noteDropped = (run: Run, seed: SavedViewSeed, dropped: string[]): void => {
  for (const view of new Set(dropped))
    run.named.push(`dashboard "${seed.name}": tile on deleted view "${view}" dropped`)
}

function seedViews(run: Run): SeedReport['views'] {
  const counts = { added: 0, updated: 0, present: 0 }
  // A dashboard's tiles name seeded views, so every other view is in place first.
  const views = run.store.domain.views
  const ordered = [...views.filter((v) => v.skin !== 'dashboard'), ...views.filter((v) => v.skin === 'dashboard')]
  for (const seed of ordered) counts[seedView(run, seed)]++
  removeUndeclared(run)
  nameOrphans(run)
  return counts
}

// A system view whose seed is no longer declared is removed, unless a person touched it or an administrator published it.
function removeUndeclared(run: Run): void {
  const declared = new Set(run.store.domain.views.map((seed) => seedKey(seed.name, seed.source)))
  const sql = 'SELECT * FROM saved_view WHERE owner_id = ? AND deleted_at IS NULL ORDER BY id'
  for (const view of run.store.sqlite.query(sql).all(SYSTEM_OWNER) as Stored[]) {
    if (declared.has(view.seed_key as string)) continue
    const label = labelOf(view)
    const published = leftAlone(view)
    if (published) {
      run.named.push(`${label} ${published}, left alone`)
      continue
    }
    if (touched(run.store.sqlite, view.id as number)) {
      run.named.push(`${label} changed by a person, left alone`)
      continue
    }
    run.store.sqlite
      .query('UPDATE saved_view SET deleted_at = ?, updated_at = ? WHERE id = ?')
      .run(run.now, run.now, view.id as number)
    revise(
      run.store.sqlite,
      savedView,
      view.id as number,
      [['deleted_at', null, run.now]],
      run.now,
      SYSTEM_OWNER,
      run.batch,
    )
    run.written++
    run.named.push(`${label} removed, no longer declared`)
  }
}

// A person's view on a source the domain no longer declares is theirs to keep; system views were handled above.
// A dashboard has no source to lose.
function nameOrphans(run: Run): void {
  const sql =
    'SELECT name, source FROM saved_view WHERE owner_id != ? AND source IS NOT NULL AND deleted_at IS NULL ORDER BY id'
  for (const view of run.store.sqlite.query(sql).all(SYSTEM_OWNER) as Stored[]) {
    if (sourceOf(run.store.domain, String(view.source))) continue
    run.named.push(`view "${view.name}" (${view.source}) has no source any more, left alone`)
  }
}

// One transaction under one seed batch; a second run finds everything present and records nothing.
export function seedMissing(sqlite: Database, domain: Domain): SeedReport {
  const run: Run = {
    store: { sqlite, db: drizzle(sqlite), domain, mailer: silentMailer, appUrl: '' },
    now: new Date().toISOString(),
    batch: crypto.randomUUID(),
    written: 0,
    named: [],
  }
  return sqlite
    .transaction((): SeedReport => {
      const datasets: Record<string, DatasetOutcome> = {}
      for (const [name, rows] of seedRows(domain)) datasets[name] = seedDataset(run, name, rows)
      keySeeded(sqlite, domain)
      const views = seedViews(run)
      if (run.written === 0) return { datasets, views, named: run.named, batch: null }
      recordBatch(sqlite, run.batch, SYSTEM_OWNER, 'seed', run.now)
      return { datasets, views, named: run.named, batch: run.batch }
    })
    .immediate()
}

// Counts and declared view names only: no row value reaches the log.
export function seedLines(report: SeedReport): string[] {
  const lines = Object.entries(report.datasets).map(([name, outcome]) => {
    if (outcome === 'not config') return `${name} skipped (${outcome})`
    return `${name} ${outcome.inserted} inserted, ${outcome.present} present`
  })
  const { added, updated, present } = report.views
  lines.push(...report.named, `views ${added} added, ${updated} updated, ${present} present`)
  return lines.map((line) => `seed-missing: ${line}`)
}
