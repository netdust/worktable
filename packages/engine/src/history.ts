import { inScope, readable, scopeOf, visibleSource } from './access'
import type { Actor, DatasetDecl } from './declare'
import { ApiError, MAX_LIMIT, parseRowsParams } from './params'
import type { Source } from './registry'
import { CHUNK, readIds, titlesOf, withLookups } from './rows'
import { SYSTEM_OWNER } from './views'
import { CREATED, type Store } from './writes'

type By = 'self' | 'account' | 'link' | 'system' | 'gone' | 'hidden'
type Raw = Record<string, unknown>

export interface HistoryEntry {
  batch: string
  at: string
  by: By
  actor: string | null
  undoable: boolean
  /** On an undoable entry: the other records its undo changes too, across the whole batch. */
  others: number
  batch_kind: string | null
  created: boolean
  record: { id: number; title: string }
  changes: { field: string; label: string; old: unknown; new: unknown }[]
}

// A dataset field as the source shows it: under the source's own column name and label.
interface Shown {
  field: string
  label: string
  relation?: string
}

interface Records {
  dataset: DatasetDecl
  shown: Map<string, Shown>
}

interface Pair {
  batch_id: string
  record_id: number
  last: number
}

const DEFAULT_ENTRIES = 50
const MAX_ENTRIES = 100
const UNDOABLE = new Set(['write', 'action', 'undo'])

function parseEntries(raw: string | undefined): number {
  if (raw === undefined) return DEFAULT_ENTRIES
  const entries = /^\d+$/.test(raw) ? Number(raw) : Number.NaN
  if (!(entries >= 1 && entries <= MAX_ENTRIES)) {
    throw new ApiError(400, 'bad_entries', `entries must be an integer from 1 to ${MAX_ENTRIES}`)
  }
  return entries
}

const chunks = <T>(all: T[]): T[][] =>
  Array.from({ length: Math.ceil(all.length / CHUNK) }, (_, i) => all.slice(i * CHUNK, (i + 1) * CHUNK))

const marks = (n: number): string => Array(n).fill('?').join(', ')

// A query's records are its `creates` dataset's, limited to the columns it writes there (threat 3).
function recordsOf(store: Store, source: Source, actor: Actor): Records | null {
  if (source.kind === 'dataset') {
    const shown = Object.entries(source.columns).map(([name, c]): [string, Shown] => [
      name,
      { field: name, label: c.label, relation: c.relation },
    ])
    return { dataset: source, shown: new Map(shown) }
  }
  const dataset = store.domain.datasets.find((d) => d.name === source.creates)
  if (!dataset || !readable(actor, dataset)) return null
  const shown = Object.entries(source.columns).flatMap(([name, c]): [string, Shown][] =>
    c.writes?.dataset === dataset.name
      ? [[c.writes.field, { field: name, label: c.label, relation: dataset.columns[c.writes.field]?.relation }]]
      : [],
  )
  return { dataset, shown: new Map(shown) }
}

// The ids `/rows` reads for the same filter and window; a query's must also be in the dataset's own scope.
function idsOf(store: Store, source: Source, dataset: DatasetDecl, query: Record<string, string>, actor: Actor) {
  const { filter, from, to } = query
  const params = { ...parseRowsParams(source, { filter, from, to }), limit: MAX_LIMIT }
  const ids = [...new Set(readIds(store.db, source, params, scopeOf(actor, source)))]
  const scope = scopeOf(actor, dataset)
  if (source.kind === 'dataset' || scope === 'all') return ids
  return chunks(ids).flatMap((chunk) => {
    const raws = store.sqlite
      .query(`SELECT * FROM "${dataset.name}" WHERE id IN (${marks(chunk.length)})`)
      .all(...chunk) as Raw[]
    return raws.filter((row) => inScope(scope, row)).map((row) => row.id as number)
  })
}

// The newest batches per record, counting only the revisions the source shows.
function latest(store: Store, { dataset, shown }: Records, ids: number[], cap: number): Pair[] {
  const fields = [CREATED, ...shown.keys()]
  const sql = `SELECT batch_id, record_id, MAX(id) AS last FROM revision
    WHERE entity = ? AND record_id IN (%ids) AND field IN (${marks(fields.length)})
    GROUP BY batch_id, record_id ORDER BY last DESC LIMIT ?`
  const found = chunks(ids).flatMap(
    (chunk) =>
      store.sqlite
        .query(sql.replace('%ids', marks(chunk.length)))
        .all(dataset.name, ...chunk, ...fields, cap) as Pair[],
  )
  return found.sort((a, b) => b.last - a.last).slice(0, cap)
}

function recordTitles(store: Store, source: Source, ids: number[]): Map<number, string> {
  if (ids.length === 0) return new Map()
  const raws = store.sqlite.query(`SELECT * FROM "${source.name}" WHERE id IN (${marks(ids.length)})`).all(...ids)
  const rows = withLookups(store.db, store.domain, source, raws as Raw[])
  return new Map(rows.reverse().map((row) => [row.id, row.title]))
}

// An owner learns only its own and the system's changes; anyone else's is "hidden" (threat 4).
function whose(store: Store, actorId: number, caller: Actor): Pick<HistoryEntry, 'by' | 'actor'> {
  if (actorId === SYSTEM_OWNER) return { by: 'system', actor: null }
  if (actorId !== caller.id && caller.role === 'owner') return { by: 'hidden', actor: null }
  const sql = 'SELECT kind, COALESCE(email, name) AS label, subject_dataset, subject_id FROM account WHERE id = ?'
  const found = store.sqlite.query(sql).get(actorId) as AccountLabel | null
  // A link account has no address: it is named by its subject's title.
  if (found?.kind === 'link') return { by: 'link', actor: subjectTitle(store, found) }
  if (actorId === caller.id) return { by: 'self', actor: found?.label ?? null }
  return found ? { by: 'account', actor: found.label } : { by: 'gone', actor: null }
}

interface AccountLabel {
  kind: string
  label: string | null
  subject_dataset: string | null
  subject_id: number | null
}

function subjectTitle(store: Store, { subject_dataset, subject_id }: AccountLabel): string | null {
  if (subject_dataset === null || subject_id === null) return null
  return titlesOf(store.db, store.domain, subject_dataset, [subject_id]).get(subject_id) ?? null
}

interface BatchRow {
  actor_id: number
  kind: string
  undone_by: string | null
}

// As undoBatch would accept it from this caller (threat 5): its own, of an undoable kind, not undone, holding no delete.
function undoable(store: Store, key: string, batch: BatchRow | null, caller: Actor): boolean {
  if (!batch || batch.actor_id !== caller.id || !UNDOABLE.has(batch.kind) || batch.undone_by !== null) return false
  const sql = `SELECT 1 FROM revision WHERE batch_id = ? AND field = 'deleted_at' LIMIT 1`
  return store.sqlite.query(sql).get(key) === null
}

const parsed = (raw: unknown): unknown => (raw === null ? null : JSON.parse(String(raw)))

// A related record is named only to a caller who may read it (threat 3): an old value may point outside the scope.
function shownValue(store: Store, relation: string | undefined, value: unknown, caller: Actor): unknown {
  if (!relation || typeof value !== 'number') return value
  const target = store.domain.datasets.find((d) => d.name === relation)
  if (!target || !readable(caller, target)) return null
  const scope = scopeOf(caller, target)
  if (scope !== 'all') {
    const raw = store.sqlite.query(`SELECT * FROM "${target.name}" WHERE id = ?`).get(value) as Raw | null
    if (!raw || !inScope(scope, raw)) return null
  }
  return titlesOf(store.db, store.domain, relation, [value]).get(value) ?? null
}

// Only the caller's own batches are undoable, so the count names nothing outside its scope.
function othersIn(store: Store, key: string): number {
  const sql = `SELECT COUNT(DISTINCT entity || ':' || record_id) AS n FROM revision WHERE batch_id = ?`
  return ((store.sqlite.query(sql).get(key) as { n: number }).n ?? 1) - 1
}

// Per field the first old and the last new, as an undo would restore it.
function changesOf(store: Store, revisions: Raw[], shown: Map<string, Shown>, caller: Actor): HistoryEntry['changes'] {
  const fields = new Map<string, { old: unknown; new: unknown }>()
  for (const r of revisions) {
    if (!shown.has(r.field as string)) continue
    const first = fields.get(r.field as string)
    fields.set(r.field as string, { old: first ? first.old : parsed(r.old), new: parsed(r.new) })
  }
  return [...fields].map(([name, values]) => {
    const { field, label, relation } = shown.get(name) as Shown
    return {
      field,
      label,
      old: shownValue(store, relation, values.old, caller),
      new: shownValue(store, relation, values.new, caller),
    }
  })
}

function entryOf(store: Store, records: Records, pair: Pair, title: string, caller: Actor): HistoryEntry {
  const revisions = store.sqlite
    .query(
      'SELECT field, old, new, actor_id, at FROM revision WHERE batch_id = ? AND entity = ? AND record_id = ? ORDER BY id',
    )
    .all(pair.batch_id, records.dataset.name, pair.record_id) as Raw[]
  const batch = store.sqlite
    .query('SELECT actor_id, kind, undone_by FROM batch WHERE key = ?')
    .get(pair.batch_id) as BatchRow | null
  const last = revisions.at(-1) as Raw
  const canUndo = undoable(store, pair.batch_id, batch, caller)
  return {
    batch: pair.batch_id,
    at: last.at as string,
    ...whose(store, last.actor_id as number, caller),
    undoable: canUndo,
    others: canUndo ? othersIn(store, pair.batch_id) : 0,
    batch_kind: batch?.kind ?? null,
    created: revisions.some((r) => r.field === CREATED),
    record: { id: pair.record_id, title },
    changes: changesOf(store, revisions, records.shown, caller),
  }
}

export function readHistory(store: Store, name: string, query: Record<string, string>, actor: Actor): HistoryEntry[] {
  const source = visibleSource(store.domain, name, actor)
  const cap = parseEntries(query.entries)
  const records = recordsOf(store, source, actor)
  if (!records) return []
  const pairs = latest(store, records, idsOf(store, source, records.dataset, query, actor), cap)
  const titles = recordTitles(store, source, [...new Set(pairs.map((p) => p.record_id))])
  return pairs.map((pair) => entryOf(store, records, pair, titles.get(pair.record_id) ?? '', actor))
}
