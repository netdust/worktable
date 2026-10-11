import { z } from 'zod'
import type { FilterInput } from './filter-compile'
import { lookupOf } from './lookups'
import type { Source } from './registry'

export class ApiError extends Error {
  constructor(
    readonly status: 400 | 401 | 403 | 404 | 405 | 409 | 411 | 413 | 415 | 422 | 429 | 507,
    readonly code: string,
    message: string,
    readonly details: Record<string, unknown> = {},
  ) {
    super(message)
    this.name = 'ApiError'
  }
}

const MAX_EMAIL = 254

export function emailOf(value: unknown): string {
  const email = typeof value === 'string' ? value.trim() : ''
  if (email.length > MAX_EMAIL || !email.includes('@')) throw new ApiError(400, 'bad_email', 'Not an email address')
  return email
}

export interface RowsParams {
  filter: FilterInput | null
  /** A saved view's own filter, which the request's filter narrows. */
  stored?: FilterInput
  sort: { column: string; desc: boolean }[]
  group: string | null
  from: string | null
  to: string | null
  limit: number
  offset: number
  cells: boolean
}

export const MAX_LIMIT = 5000
export const MAX_KEYS = 16
const MAX_CELL_DAYS = 92

const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/)
const shape = z.object({
  filter: z.string().optional(),
  sort: z.string().optional(),
  group: z.string().optional(),
  from: day.optional(),
  to: day.optional(),
  limit: z.string().optional(),
  offset: z.string().optional(),
  cells: z.string().optional(),
})

export function isRealDate(value: string): boolean {
  const [y, m, d] = value.split('-').map(Number) as [number, number, number]
  const date = new Date(Date.UTC(y, m - 1, d))
  return date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d
}

const daysIn = (from: string, to: string): number => (Date.parse(to) - Date.parse(from)) / 86_400_000 + 1

function parseLimit(raw: string | undefined): number {
  if (raw === undefined) return MAX_LIMIT
  const limit = /^\d+$/.test(raw) ? Number(raw) : Number.NaN
  if (!(limit >= 1 && limit <= MAX_LIMIT)) {
    throw new ApiError(400, 'bad_limit', `limit must be an integer from 1 to ${MAX_LIMIT}`)
  }
  return limit
}

function parseOffset(raw: string | undefined): number {
  if (raw === undefined) return 0
  if (!/^\d+$/.test(raw) || !Number.isSafeInteger(Number(raw))) {
    throw new ApiError(400, 'bad_offset', 'offset must be an integer of 0 or more')
  }
  return Number(raw)
}

const hasColumn = (source: Source, key: string): boolean =>
  Object.hasOwn(source.columns, key) || (source.kind === 'dataset' && key === 'id') || !!lookupOf(source, key)

export function parseFilter(raw: string | undefined): FilterInput | null {
  if (raw === undefined || raw === '') return null
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    throw new ApiError(400, 'bad_filter', 'filter is not valid JSON')
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new ApiError(400, 'bad_filter', 'filter must be a JSON object')
  }
  return parsed as FilterInput
}

/** M1: a key list is short and names each column once. */
export function keysProblem(what: string, columns: string[], max = MAX_KEYS): string | null {
  if (columns.length > max) return `${what} takes at most ${max} keys`
  const twice = columns.find((column, i) => columns.indexOf(column) !== i)
  return twice === undefined ? null : `${what} names "${twice}" twice`
}

function parseSort(raw: string | undefined, source: Source): RowsParams['sort'] {
  const keys = (raw ?? '').split(',').filter(Boolean)
  const problem = keysProblem(
    'sort',
    keys.map((key) => key.replace(/^-/, '')),
  )
  if (problem) throw new ApiError(400, 'bad_sort', problem)
  return keys.map((key) => {
    const desc = key.startsWith('-')
    const column = desc ? key.slice(1) : key
    if (!hasColumn(source, column)) throw new ApiError(400, 'bad_sort', `cannot sort on "${column}"`)
    return { column, desc }
  })
}

function parseGroup(raw: string | undefined, source: Source): string | null {
  if (!raw) return null
  if (!hasColumn(source, raw)) throw new ApiError(400, 'bad_group', `cannot group on "${raw}"`)
  return raw
}

export function parseRowsParams(source: Source, query: Record<string, string | undefined>): RowsParams {
  const parsed = shape.safeParse(query)
  if (!parsed.success) throw new ApiError(400, 'bad_window', 'from and to must be YYYY-MM-DD')
  const { filter, sort, group, from, to, limit, offset, cells } = parsed.data
  for (const day of [from, to]) {
    if (day && !isRealDate(day)) throw new ApiError(400, 'bad_window', `"${day}" is not a calendar date`)
  }
  if ((from || to) && !source.date) throw new ApiError(400, 'no_date_column', `"${source.name}" has no date column`)
  if (cells === '1' && !(from && to)) {
    throw new ApiError(400, 'window_required', 'cells need both from and to')
  }
  if (cells === '1' && from && to && daysIn(from, to) > MAX_CELL_DAYS) {
    throw new ApiError(400, 'window_too_wide', `cells take a window of at most ${MAX_CELL_DAYS} days`)
  }
  return {
    filter: parseFilter(filter),
    sort: parseSort(sort, source),
    group: parseGroup(group, source),
    from: from ?? null,
    to: to ?? null,
    limit: parseLimit(limit),
    offset: parseOffset(offset),
    cells: cells === '1',
  }
}
