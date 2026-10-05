import { z } from 'zod'
import type { FilterInput } from './filter-compile'
import type { Source } from './registry'

export class ApiError extends Error {
  constructor(
    readonly status: 400 | 404,
    readonly code: string,
    message: string,
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
}

const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/)
const shape = z.object({
  filter: z.string().optional(),
  sort: z.string().optional(),
  group: z.string().optional(),
  from: day.optional(),
  to: day.optional(),
})

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
  const { filter, sort, group, from, to } = parsed.data
  if ((from || to) && !source.date) throw new ApiError(400, 'no_date_column', `"${source.name}" has no date column`)
  return {
    filter: parseFilter(filter),
    sort: parseSort(sort, source),
    group: parseGroup(group, source),
    from: from ?? null,
    to: to ?? null,
  }
}
