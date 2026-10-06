// The approved Laika → theatre mappings, re-derived from the spec and plan decisions without the exporter's code.

export const DAY_LINE_HOUR = 5
export const UNKNOWN_LAST_NAME = '(onbekend)'
export const PLACEHOLDER_PRODUCTIE = 0
export const MAYBE_NOTE = 'Laika: maybe'

const ACTIVITY_STATUS: Record<string, string> = { option: 'optie', confirmed: 'bevestigd', cancelled: 'geannuleerd' }
const ASSIGNMENT_STATE: Record<string, string> = {
  requested: 'uitgenodigd',
  confirmed: 'bevestigd',
  declined: 'geweigerd',
  maybe: 'uitgenodigd',
}
const KIND: Record<string, string> = {
  show: 'voorstelling',
  rehearsal: 'repetitie',
  build: 'opbouw',
  soundcheck: 'opbouw',
  strike: 'afbouw',
  travel: 'reis',
  overnight: 'overnachting',
  meal: 'maaltijd',
  free: 'andere',
  other: 'andere',
}
const PARTICLES = [
  ...['van den', 'van der', 'van de', 'van', 'de', 'den', 'der', 'ter', 'ten', 'te'],
  ...["'t", 'von', 'vom', 'zu', 'du', 'le', 'la'],
]
  .map((p) => p.split(' '))
  .sort((a, b) => b.length - a.length)

export type Value = string | number | boolean | null
export type Expected = Record<string, Value>

export const text = (value: unknown): string | null => {
  const trimmed = value == null ? '' : String(value).trim()
  return trimmed === '' ? null : trimmed
}

export const activityStatus = (status: string): string | null => ACTIVITY_STATUS[status] ?? null
export const assignmentState = (status: string): string | null => ASSIGNMENT_STATE[status] ?? null
export const kindSoort = (kind: string): string | null => KIND[kind] ?? null

// A serialized PHP relation (`a:1:{i:0;i:42;}`) or a bare id; 0 and empty are no relation.
export function relationId(raw: unknown): number | null {
  const s = raw == null ? '' : String(raw).trim()
  const id = /^\d+$/.test(s) ? Number(s) : Number(/^a:\d+:\{i:0;i:(\d+);/.exec(s)?.[1] ?? 0)
  return id > 0 ? id : null
}

// Polylang's post_translations description: a serialized language → post id map.
export function translationGroup(description: string): Record<string, number> {
  const group: Record<string, number> = {}
  for (const m of description.matchAll(/s:\d+:"([^"]+)";i:(\d+);/g)) group[m[1] as string] = Number(m[2])
  return group
}

const pad = (n: number): string => String(n).padStart(2, '0')

export function shiftDay(date: string, days: number): string {
  const [y, m, d] = date.split('-').map(Number) as [number, number, number]
  const day = new Date(Date.UTC(y, m - 1, d + days))
  return `${day.getUTCFullYear()}-${pad(day.getUTCMonth() + 1)}-${pad(day.getUTCDate())}`
}

const isTime = (t: string | null): t is string => t !== null && /^([01]\d|2[0-3]):[0-5]\d$/.test(t)

// datum is the WP date; no start means no times at all (an end without a start is dropped).
export function activityTimes(date: string, start: string | null, end: string | null): Expected {
  if (!isTime(start)) return { datum: date, start_at: null, eind_at: null, plandag: date }
  const eind = isTime(end) ? `${end < start ? shiftDay(date, 1) : date}T${end}` : null
  const plandag = Number(start.slice(0, 2)) < DAY_LINE_HOUR ? shiftDay(date, -1) : date
  return { datum: date, start_at: `${date}T${start}`, eind_at: eind, plandag }
}

export type NameCase = 'particle' | 'single' | 'plain'

export function splitName(title: string): { voornaam: string; achternaam: string; case: NameCase } {
  const tokens = title.replace(/[‘’]/g, "'").trim().split(/\s+/).filter(Boolean)
  if (tokens.length < 2)
    return { voornaam: tokens[0] ?? UNKNOWN_LAST_NAME, achternaam: UNKNOWN_LAST_NAME, case: 'single' }
  const lower = tokens.map((t) => t.toLowerCase())
  const glued = (t: string) => t.length > 2 && t.startsWith("d'")
  const particleAt = (i: number) =>
    glued(lower[i] as string) ||
    PARTICLES.some((p) => i + p.length < tokens.length && p.every((w, k) => lower[i + k] === w))
  const at = lower.findIndex((_, i) => i > 0 && particleAt(i))
  const cut = at === -1 ? 1 : at
  return {
    voornaam: tokens.slice(0, cut).join(' '),
    achternaam: tokens.slice(cut).join(' '),
    case: at === -1 ? 'plain' : 'particle',
  }
}

export function organisationSoort(roles: string[], own: boolean): string {
  if (own) return 'eigen'
  if (roles.includes('venue')) return 'venue'
  if (roles.includes('coproducer') || roles.includes('presenter')) return 'partner'
  if (roles.includes('funder')) return 'agentschap'
  return 'partner'
}

export function assignmentNote(note: string | null, status: string): string | null {
  if (status !== 'maybe') return note
  return note === null ? MAYBE_NOTE : `${note}\n${MAYBE_NOTE}`
}

// Of each (persoon, activiteit) pair the oldest post id is kept; returns the ids of the rest.
export function duplicateLosers(
  rows: { id: number; persoon: number | null; activiteit: number | null }[],
): Set<number> {
  const oldest = new Map<string, number>()
  for (const r of rows) {
    if (r.persoon === null) continue
    const key = `${r.persoon}:${r.activiteit}`
    oldest.set(key, Math.min(oldest.get(key) ?? Number.POSITIVE_INFINITY, r.id))
  }
  return new Set(
    rows.filter((r) => r.persoon !== null && oldest.get(`${r.persoon}:${r.activiteit}`) !== r.id).map((r) => r.id),
  )
}

// Key order never matters for a JSON object; arrays keep theirs.
export function canonical(value: unknown): Value {
  if (value === undefined) return null
  if (value === null || typeof value !== 'object') return value as Value
  const sort = (v: unknown): unknown =>
    Array.isArray(v)
      ? v.map(sort)
      : v && typeof v === 'object'
        ? Object.fromEntries(
            Object.entries(v)
              .sort(([a], [b]) => a.localeCompare(b))
              .map(([k, x]) => [k, sort(x)]),
          )
        : v
  return JSON.stringify(sort(value))
}

export type Mismatch = { dataset: string; column: string; legacy_id: number; source: Value; engine: Value }

export interface Tally {
  compared: number
  sourceOnly: Record<string, number>
  engineOnly: Record<string, number>
  columns: Record<string, number>
  detail: Mismatch[]
  presence: { side: 'source' | 'engine'; legacy_id: number | null; reason: string }[]
}

export const emptyTally = (): Tally => ({
  compared: 0,
  sourceOnly: {},
  engineOnly: {},
  columns: {},
  detail: [],
  presence: [],
})

const bump = (counts: Record<string, number>, key: string): void => {
  counts[key] = (counts[key] ?? 0) + 1
}

// Joins on legacy id; `drops` names the source rows a rule keeps out of the engine, with the rule.
export function compare(
  dataset: string,
  columns: string[],
  source: Map<number, Expected>,
  engine: Map<number | null, Expected[]>,
  drops: Map<number, string> = new Map(),
): Tally {
  const tally = emptyTally()
  for (const column of columns) tally.columns[column] = 0
  for (const [legacyId, expected] of source) {
    const rows = engine.get(legacyId)
    if (!rows || rows.length === 0) {
      const reason = drops.get(legacyId) ?? 'unexplained'
      bump(tally.sourceOnly, reason)
      tally.presence.push({ side: 'source', legacy_id: legacyId, reason })
      continue
    }
    if (rows.length > 1) bump(tally.engineOnly, 'duplicate legacy id (extra rows)')
    const dropped = drops.get(legacyId)
    if (dropped) bump(tally.engineOnly, `present though dropped by rule: ${dropped}`)
    const actual = rows[0] as Expected
    tally.compared++
    for (const column of columns) {
      const want = canonical(expected[column])
      const got = canonical(actual[column])
      if (want === got) continue
      bump(tally.columns, column)
      tally.detail.push({ dataset, column, legacy_id: legacyId, source: want, engine: got })
    }
  }
  for (const [legacyId, rows] of engine) {
    if (legacyId !== null && source.has(legacyId)) continue
    const reason = legacyId === null ? 'no legacy id' : 'legacy id not in source'
    for (const _ of rows) {
      bump(tally.engineOnly, reason)
      tally.presence.push({ side: 'engine', legacy_id: legacyId, reason })
    }
  }
  return tally
}
