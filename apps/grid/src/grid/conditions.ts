/**
 * A view's conditions as the filter builder holds them, and as the engine stores them.
 * The engine's filter language is the stored form: a condition maps to one of its keys and back.
 */

export type Op = 'in' | 'nin' | 'empty' | 'filled' | 'like' | 'nlike' | 'eq' | 'today' | 'week' | 'next_week' | 'month' | 'between'

export interface Filter {
  field: string
  op: Op
  /** Option keys or related ids for in/nin, one text for like/nlike/eq, two days for between, none otherwise. */
  values: string[]
}

/** How the conditions combine: all of them, or any. A period always narrows, whatever the join. */
export type Join = 'and' | 'or'

/** What a field is, for the operators it takes. */
export type Kind = 'choice' | 'text' | 'date' | 'datetime' | 'bool'

export interface Window {
  from: string
  to: string
}

const OPS: Op[] = ['in', 'nin', 'empty', 'filled', 'like', 'nlike', 'eq', 'today', 'week', 'next_week', 'month', 'between']
const PERIODS: Op[] = ['today', 'week', 'next_week', 'month']
const DATED: Op[] = [...PERIODS, 'between']
const NO_VALUE: Op[] = ['empty', 'filled', ...PERIODS]

export const isDate = (op: Op): boolean => DATED.includes(op)

/** An operator that takes a value: not a period, not empty or filled. */
export const valued = (op: Op): boolean => !NO_VALUE.includes(op)

/** The conditions a link carries, parsed, not cast: null when the text is not a list of conditions. */
export function readConditions(text: string): Filter[] | null {
  try {
    const raw: unknown = JSON.parse(text)
    const ok = Array.isArray(raw) && raw.every((f) => typeof f?.field === 'string' && OPS.includes(f.op)
      && Array.isArray(f.values) && f.values.every((v: unknown) => typeof v === 'string'))
    return ok ? (raw as Filter[]) : null
  } catch {
    return null
  }
}

/** A condition the engine can apply: one without its value is still being written. */
export function complete(f: Filter): boolean {
  if (!valued(f.op)) return true
  if (f.op === 'between') return f.values.length === 2 && f.values.every((v) => v !== '')
  return f.values.some((v) => v !== '')
}

/** The engine key a condition is stored under: one condition per key on a field. */
function keyOf(op: Op): string {
  if (PERIODS.includes(op)) return '$period'
  if (op === 'empty' || op === 'filled') return '$exists'
  return op
}

function engineOf(f: Filter, kind: Kind): Record<string, unknown> {
  switch (f.op) {
    case 'in':
      // A yes/no is a boolean column: "ja" is true, "nee" false.
      if (kind === 'bool') return { $eq: f.values[0] === '1' }
      return f.values.length === 1 ? { $eq: f.values[0] } : { $in: f.values }
    case 'nin':
      return { $nin: f.values }
    case 'empty':
      return { $exists: false }
    case 'filled':
      return { $exists: true }
    case 'like':
      return { $like: f.values[0] }
    case 'nlike':
      return { $nlike: f.values[0] }
    case 'eq':
      return { $eq: f.values[0] }
    case 'between':
      // A datetime on the last day is after that day's date: the range ends at its last second, as the away read does.
      return { $gte: f.values[0], $lte: kind === 'datetime' ? `${f.values[1]}T23:59:59` : f.values[1] }
    default:
      return { $period: f.op }
  }
}

/** The conditions the join applies to: a period stands outside it. */
export const joined = (filters: Filter[]): Filter[] => filters.filter((f) => complete(f) && !isDate(f.op))

/** An "or" over fewer than two conditions says nothing an "and" does not. */
export const joinOf = (filters: Filter[], join: Join | undefined): Join => (join === 'or' && joined(filters).length > 1 ? 'or' : 'and')

export function toEngine(filters: Filter[], kindOf: (field: string) => Kind, join?: Join): Record<string, unknown> {
  const stored: Record<string, Record<string, unknown>> = {}
  const any = joinOf(filters, join) === 'or'
  for (const f of filters.filter(complete)) {
    if (any && !isDate(f.op)) continue
    stored[f.field] = { ...stored[f.field], ...engineOf(f, kindOf(f.field)) }
  }
  if (!any) return stored
  return { ...stored, $or: joined(filters).map((f) => ({ [f.field]: engineOf(f, kindOf(f.field)) })) }
}

const isObject = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value)
const text = (value: unknown): string | null => {
  if (typeof value === 'boolean') return value ? '1' : '0'
  return typeof value === 'string' || typeof value === 'number' ? String(value) : null
}
const texts = (value: unknown): string[] | null => {
  if (!Array.isArray(value)) return null
  const all = value.map(text)
  return all.every((v) => v !== null) ? (all as string[]) : null
}
const day = (value: unknown): string | null => (typeof value === 'string' ? value.slice(0, 10) : null)

/** The conditions a stored filter says; what no condition says stays fixed, as the view stores it. */
export function fromEngine(stored: Record<string, unknown>, kindOf: (field: string) => Kind): { conditions: Filter[]; fixed: Record<string, unknown>; join: Join } {
  const { $or: any, ...plain } = stored
  const { conditions, fixed } = plainConditions(plain, kindOf)
  if (any === undefined) return { conditions, fixed, join: 'and' }
  // An $or shows only when each of its filters is one condition the builder can show.
  const branches = Array.isArray(any) ? any.map((branch) => (isObject(branch) && Object.keys(branch).length === 1 ? plainConditions(branch, kindOf) : null)) : []
  const shown = branches.length > 0 && branches.every((b) => b !== null && b.conditions.length === 1 && Object.keys(b.fixed).length === 0)
  if (!shown) return { conditions, fixed: { ...fixed, $or: any }, join: 'and' }
  return { conditions: [...conditions, ...branches.flatMap((b) => b?.conditions ?? [])], fixed, join: 'or' }
}

function plainConditions(stored: Record<string, unknown>, kindOf: (field: string) => Kind): { conditions: Filter[]; fixed: Record<string, unknown> } {
  const conditions: Filter[] = []
  const fixed: Record<string, unknown> = {}
  for (const [field, raw] of Object.entries(stored)) {
    // A custom field is not offered in the builder: its filter stays as the view stores it.
    if (field.startsWith('custom.')) {
      fixed[field] = raw
      continue
    }
    const rest: Record<string, unknown> = { ...(isObject(raw) ? raw : { $eq: raw }) }
    const take = (op: Op, values: string[], ...keys: string[]) => {
      conditions.push({ field, op, values })
      for (const key of keys) delete rest[key]
    }
    const eq = text(rest.$eq)
    if (eq !== null) take(kindOf(field) === 'text' ? 'eq' : 'in', [eq], '$eq')
    const many = texts(rest.$in)
    if (many) take('in', many, '$in')
    const none = texts(rest.$nin)
    if (none) take('nin', none, '$nin')
    if (typeof rest.$exists === 'boolean') take(rest.$exists ? 'filled' : 'empty', [], '$exists')
    if (typeof rest.$like === 'string') take('like', [rest.$like], '$like')
    if (typeof rest.$nlike === 'string') take('nlike', [rest.$nlike], '$nlike')
    if (typeof rest.$period === 'string' && PERIODS.includes(rest.$period as Op)) take(rest.$period as Op, [], '$period')
    const from = day(rest.$gte), to = day(rest.$lte)
    if (from && to) take('between', [from, to], '$gte', '$lte')
    if (Object.keys(rest).length > 0) fixed[field] = rest
  }
  return { conditions, fixed }
}

/**
 * A condition in the list: it replaces the one under the same engine key on its field.
 * A date field holds one date condition, so a period and a range never stand side by side.
 */
export function put(filters: Filter[], next: Filter, kindOf?: (field: string) => Kind): Filter[] {
  const dated = kindOf ? ['date', 'datetime'].includes(kindOf(next.field)) && isDate(next.op) : false
  const clashes = (f: Filter) => f.field === next.field && (keyOf(f.op) === keyOf(next.op) || (dated && isDate(f.op)))
  const at = filters.findIndex(clashes)
  if (at < 0) return [...filters, next]
  return [...filters.slice(0, at), next, ...filters.slice(at + 1).filter((f) => !clashes(f))]
}

const pad = (n: number) => String(n).padStart(2, '0')
const iso = (date: Date) => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
const plus = (date: Date, days: number) => new Date(date.getFullYear(), date.getMonth(), date.getDate() + days)

/** The days a date condition spans, as the engine resolves it: today, Monday to Sunday, or the calendar month. */
export function windowOf(f: Filter | undefined, today: Date): Window | null {
  if (!f || !complete(f)) return null
  const monday = plus(today, -((today.getDay() + 6) % 7))
  switch (f.op) {
    case 'today':
      return { from: iso(today), to: iso(today) }
    case 'week':
      return { from: iso(monday), to: iso(plus(monday, 6)) }
    case 'next_week':
      return { from: iso(plus(monday, 7)), to: iso(plus(monday, 13)) }
    case 'month':
      return { from: iso(new Date(today.getFullYear(), today.getMonth(), 1)), to: iso(new Date(today.getFullYear(), today.getMonth() + 1, 0)) }
    case 'between':
      return { from: f.values[0] as string, to: f.values[1] as string }
    default:
      return null
  }
}
