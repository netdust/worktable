import { type SQL, sql } from 'drizzle-orm'
import { categoriesColumnOf, type DatasetDecl } from './declare'
import { tableOf } from './tables'

// Finished rows older than `cutoff`; a stored value outside the options, or NULL, never matches.
export function archivedWhere(decl: DatasetDecl, cutoff: string): SQL | null {
  const column = categoriesColumnOf(decl)
  if (decl.archive_after === undefined || column === null) return null
  const categories = decl.columns[column]?.categories ?? {}
  const finished = Object.keys(categories).filter(
    (key) => categories[key] === 'done' || categories[key] === 'cancelled',
  )
  if (finished.length === 0) return null
  const table = tableOf(decl) as unknown as Record<string, unknown>
  const id = table.id
  const state = table[column]
  const created = table.created_at
  const keys = sql.join(
    finished.map((key) => sql`${key}`),
    sql`, `,
  )
  const since = sql`coalesce((SELECT MAX(at) FROM revision WHERE entity = ${decl.name} AND record_id = ${id} AND field = ${column}), ${created})`
  return sql`(${state} IS NOT NULL AND ${state} IN (${keys}) AND ${since} < ${cutoff})`
}
