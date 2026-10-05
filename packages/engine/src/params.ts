import { z } from 'zod'
import type { FilterInput } from './filter-compile'
import type { Source } from './registry'

export class ApiError extends Error {
  constructor(
    readonly status: 400 | 403 | 404 | 405 | 409 | 413 | 415 | 422,
    readonly code: string,
    message: string,
    readonly details: Record<string, unknown> = {},
  ) {
    super(message)
    this.name = 'ApiError'
  }
}

export interface RowsParams {
  filter: FilterInput | null
  sort: { column: string; desc: boolean }[]
  group: string | null
  from: string | null
  to: string | null
  limit: number
}

export const MAX_LIMIT = 5000

const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/)
const shape = z.object({
  filter: z.string().optional(),
  sort: z.string().optional(),
  group: z.string().optional(),
  from: day.optional(),
  to: day.optional(),
  limit: z.string().optional(),
})

export function isRealDate(value: string): boolean {
  const [y, m, d] = value.split('-').map(Number) as [number, number, number]
  const date = new Date(Date.UTC(y, m - 1, d))
  return date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d
}

function parseLimit(raw: string | undefined): number {
  if (raw === undefined) return MAX_LIMIT
  const limit = /^\d+$/.test(raw) ? Number(raw) : Number.NaN
  if (!(limit >= 1 && limit <= MAX_LIMIT)) {
    throw new ApiError(400, 'bad_limit', `limit must be an integer from 1 to ${MAX_LIMIT}`)
  }
  return limit
}

const hasColumn = (source: Source, key: string): boolean =>
  Object.hasOwn(source.columns, key) || (source.kind === 'dataset' && key === 'id')

function parseFilter(raw: string | undefined): FilterInput | null {
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

function parseSort(raw: string | undefined, source: Source): RowsParams['sort'] {
  const keys = (raw ?? '').split(',').filter(Boolean)
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
  const { filter, sort, group, from, to, limit } = parsed.data
  for (const day of [from, to]) {
    if (day && !isRealDate(day)) throw new ApiError(400, 'bad_window', `"${day}" is not a calendar date`)
  }
  if ((from || to) && !source.date) throw new ApiError(400, 'no_date_column', `"${source.name}" has no date column`)
  return {
    filter: parseFilter(filter),
    sort: parseSort(sort, source),
    group: parseGroup(group, source),
    from: from ?? null,
    to: to ?? null,
    limit: parseLimit(limit),
  }
}
