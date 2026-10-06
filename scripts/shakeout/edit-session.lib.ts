export type Row = Record<string, unknown>

export interface Column {
  type: 'text' | 'integer' | 'real' | 'boolean' | 'date' | 'datetime' | 'json'
  label: string
  nullable?: boolean
  default?: unknown
  options?: Record<string, string>
  relation?: string
  readonly?: boolean
}

export interface Revision {
  id: number
  entity: string
  record_id: number
  field: string
  old: string | null
  new: string | null
  actor_id: number
  batch_id: string
}

const pad = (n: number): string => String(n).padStart(2, '0')

export function addDays(day: string, days: number): string {
  const [y, m, d] = day.slice(0, 10).split('-').map(Number) as [number, number, number]
  const at = new Date(Date.UTC(y, m - 1, d + days))
  return `${at.getUTCFullYear()}-${pad(at.getUTCMonth() + 1)}-${pad(at.getUTCDate())}`
}

export function addMinutes(at: string, minutes: number): string {
  const [day = '', time = ''] = at.split('T')
  const [h, m] = time.split(':').map(Number) as [number, number]
  const total = h * 60 + m + minutes
  const days = Math.floor(total / 1440)
  const rest = total - days * 1440
  return `${addDays(day, days)}T${pad(Math.floor(rest / 60))}:${pad(rest % 60)}`
}

// Written apart from the theatre package on purpose: the shakeout checks the writer against its own reading of the rule.
export function expectedPlandag(startAt: string, dayLineHour: number): string {
  const day = startAt.slice(0, 10)
  return Number(startAt.slice(11, 13)) < dayLineHour ? addDays(day, -1) : day
}

export function decode(column: Column | undefined, raw: unknown): unknown {
  if (raw === null || raw === undefined) return null
  if (column?.type === 'boolean') return raw === 1 || raw === true
  if (column?.type === 'json') return typeof raw === 'string' ? JSON.parse(raw) : raw
  return raw
}

// A scalar edit that every free value passes: text carries an @ so an e-mail rule accepts it too.
export function scalarEdit(column: Column, current: unknown): unknown {
  if (column.options) return Object.keys(column.options).find((key) => key !== current) ?? null
  if (column.type === 'boolean') return !current
  if (column.type === 'text')
    return current === 'shakeout-edit@example.test' ? 'shakeout-edit2@example.test' : 'shakeout-edit@example.test'
  if (column.type === 'real') return typeof current === 'number' ? Math.round((current + 0.001) * 1e6) / 1e6 : 50.5
  if (column.type === 'integer') return typeof current === 'number' ? current + 1 : 1
  if (column.type === 'json') return { shakeout: true }
  if (column.type === 'date') return addDays(String(current), 1)
  return addMinutes(String(current), 60)
}

/** Declared columns whose stored value differs between two raw rows. */
export function changedColumns(
  columns: Record<string, Column>,
  before: Row | undefined,
  after: Row | undefined,
): string[] {
  return Object.keys(columns).filter((key) => !Bun.deepEquals(before?.[key] ?? null, after?.[key] ?? null))
}

/** Every key of the two rows that differs, besides the ones ignored. */
export function rowDiff(before: Row, after: Row, ignore: string[] = []): string[] {
  const keys = new Set([...Object.keys(before), ...Object.keys(after)])
  return [...keys].filter((key) => !ignore.includes(key) && !Bun.deepEquals(before[key] ?? null, after[key] ?? null))
}

/**
 * What is wrong with one write's revisions: each must name the record, share one batch and the actor,
 * and old/new must be the decoded before/after of exactly the changed fields.
 */
export function revisionProblems(
  revisions: Revision[],
  expect: {
    entity: string
    id: number
    actor: number
    columns: Record<string, Column>
    before: Row | undefined
    after: Row
    fields: string[]
  },
): string[] {
  const problems: string[] = []
  if (revisions.length === 0) return ['no revision recorded']
  if (new Set(revisions.map((r) => r.batch_id)).size !== 1) problems.push('revisions span more than one batch')
  if (revisions.some((r) => r.entity !== expect.entity || r.record_id !== expect.id))
    problems.push('a revision names another record')
  if (revisions.some((r) => r.actor_id !== expect.actor)) problems.push('a revision names another actor')
  const fields = revisions.map((r) => r.field).sort()
  // A create carries the engine's marker row: field id, old null, new the record's id.
  const expected = expect.before === undefined ? [...expect.fields, 'id'] : expect.fields
  if (!Bun.deepEquals(fields, [...expected].sort())) problems.push('revised fields differ from the changed fields')
  for (const r of revisions) {
    const column = expect.columns[r.field]
    const old = r.old === null ? null : JSON.parse(r.old)
    const value = r.new === null ? null : JSON.parse(r.new)
    if (!Bun.deepEquals(old, decode(column, expect.before?.[r.field])))
      problems.push(`revision old of ${r.field} is not the value before`)
    if (!Bun.deepEquals(value, decode(column, expect.after[r.field])))
      problems.push(`revision new of ${r.field} is not the value after`)
  }
  return problems
}
