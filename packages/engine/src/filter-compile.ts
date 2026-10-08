export type Operator =
  | '$eq'
  | '$ne'
  | '$in'
  | '$nin'
  | '$gt'
  | '$gte'
  | '$lt'
  | '$lte'
  | '$exists'
  | '$contains'
  | '$like'
  | '$nlike'
  | '$period'

export const PERIODS = ['week', 'next_week', 'month'] as const
export type Period = (typeof PERIODS)[number]

/** Max number of values in a `$contains` array — bounds the EXISTS subquery fan-out (DoS guard). */
const CONTAINS_MAX_VALUES = 100

/**
 * Max number of top-level clauses (keys) in one filter. CONTAINS_MAX_VALUES caps
 * fan-out PER clause; without a clause cap an attacker stacks unbounded keys
 * ({k0..k499:{$contains:[100 vals]}}) → 50k EXISTS subqueries in one query →
 * CPU DoS. This caps the product.
 */
const MAX_FILTER_CLAUSES = 50

/** Max number of values in `$in` / `$nin` — bounds the IN list (DoS guard). */
const IN_MAX_VALUES = 100

export type JsonValue = string | number | boolean | null | JsonValue[] | { [k: string]: JsonValue }

export type FilterAST =
  | { kind: 'and'; clauses: FilterAST[] }
  | { kind: 'or'; clauses: FilterAST[] }
  | { kind: 'cmp'; key: string; op: Operator; value: JsonValue }

export type FilterInput = Record<string, JsonValue | Partial<Record<Operator, JsonValue>>>

/** Any of its filters may hold; beside the plain keys, which all hold. One level deep. */
const OR = '$or'

export class FilterCompileError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'FilterCompileError'
  }
}

const OPERATORS = new Set<Operator>([
  '$eq',
  '$ne',
  '$in',
  '$nin',
  '$gt',
  '$gte',
  '$lt',
  '$lte',
  '$exists',
  '$contains',
  '$like',
  '$nlike',
  '$period',
])

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

export function filterCompile(input: FilterInput): FilterAST {
  const any = input[OR]
  const keys = Object.keys(input).filter((key) => key !== OR)
  if (
    any !== undefined &&
    (!Array.isArray(any) ||
      any.length === 0 ||
      !any.every((branch) => isPlainObject(branch) && Object.keys(branch).length > 0))
  ) {
    throw new FilterCompileError(`${OR} requires a non-empty list of filters`)
  }
  const branches = (any ?? []) as FilterInput[]
  if (branches.some((branch) => OR in branch)) throw new FilterCompileError(`${OR} cannot hold another ${OR}`)
  // The cap counts every key, those inside $or included: nesting must not multiply past it.
  const total = keys.length + branches.reduce((n, branch) => n + Object.keys(branch).length, 0)
  if (total > MAX_FILTER_CLAUSES) {
    throw new FilterCompileError(`filter accepts at most ${MAX_FILTER_CLAUSES} keys (got ${total})`)
  }
  const plain = keyClauses(Object.fromEntries(keys.map((key) => [key, input[key] as JsonValue])))
  if (branches.length === 0) return { kind: 'and', clauses: plain }
  return {
    kind: 'and',
    clauses: [
      ...plain,
      { kind: 'or', clauses: branches.map((branch) => ({ kind: 'and', clauses: keyClauses(branch) })) },
    ],
  }
}

function keyClauses(input: FilterInput): FilterAST[] {
  const clauses: FilterAST[] = []
  for (const [key, raw] of Object.entries(input)) {
    if (raw === null || !isPlainObject(raw)) {
      clauses.push({ kind: 'cmp', key, op: '$eq', value: raw as JsonValue })
      continue
    }
    const entries = Object.entries(raw)
    if (entries.length === 0) {
      throw new FilterCompileError(`empty operator object for key "${key}"`)
    }
    for (const [opKey, value] of entries) {
      if (!OPERATORS.has(opKey as Operator)) {
        throw new FilterCompileError(`unknown operator "${opKey}" for key "${key}"`)
      }
      const op = opKey as Operator
      if ((op === '$in' || op === '$nin') && !Array.isArray(value)) {
        throw new FilterCompileError(`${op} requires an array for key "${key}"`)
      }
      if ((op === '$in' || op === '$nin') && (value as unknown[]).length > IN_MAX_VALUES) {
        throw new FilterCompileError(`${op} accepts at most ${IN_MAX_VALUES} values for key "${key}"`)
      }
      if (op === '$exists' && typeof value !== 'boolean') {
        throw new FilterCompileError(`$exists requires a boolean for key "${key}"`)
      }
      if ((op === '$like' || op === '$nlike') && typeof value !== 'string') {
        throw new FilterCompileError(`${op} requires a string for key "${key}"`)
      }
      if (op === '$period' && !PERIODS.includes(value as Period)) {
        throw new FilterCompileError(`$period takes ${PERIODS.join(', ')} for key "${key}"`)
      }
      if (op === '$contains') {
        const values = Array.isArray(value) ? value : [value]
        if (values.length === 0) {
          throw new FilterCompileError(`$contains requires at least one value for key "${key}"`)
        }
        if (values.length > CONTAINS_MAX_VALUES) {
          throw new FilterCompileError(`$contains accepts at most ${CONTAINS_MAX_VALUES} values for key "${key}"`)
        }
        if (!values.every((v) => typeof v === 'string')) {
          throw new FilterCompileError(`$contains requires a string or an array of strings for key "${key}"`)
        }
      }
      clauses.push({ kind: 'cmp', key, op, value: value as JsonValue })
    }
  }
  return clauses
}
