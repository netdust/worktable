import { useEffect, useState } from 'react'
import { records } from '../api'
import type { FilterField } from '../grid/filter'
import type { Filter } from '../grid/layout'
import type { Model } from '../types'

/** A related model's titles by id; empty once its records could not be read, so its filters fall back to the id. */
type Titles = Record<string, Map<string, string>>

/**
 * The fields with a name for every active relation filter, and the filters still waiting for theirs.
 * The rows name only the records on the window; one no row holds is named from its model's records,
 * read once per model. A waiting filter's chip is held back, never shown with the id.
 */
export function useFilterNames(model: Model | undefined, fields: FilterField[], active: Filter[]): [FilterField[], string[]] {
  const [titles, setTitles] = useState<Titles>({})
  const unnamed = active.flatMap((filter) => {
    const related = model?.fields[filter.field]?.relation?.model
    const field = fields.find((f) => f.field === filter.field)
    return related && field && !field.options.some(([value]) => value === filter.value) ? [{ filter, related }] : []
  })
  const wanted = [...new Set(unnamed.map((u) => u.related))].filter((related) => !titles[related]).join(',')

  useEffect(() => {
    if (wanted === '') return
    for (const related of wanted.split(',')) {
      const keep = (named: Map<string, string>) => setTitles((known) => ({ ...known, [related]: named }))
      records(related, '').then((found) => keep(new Map(found.rows.map((row) => [String(row.id), row.title]))), () => keep(new Map()))
    }
  }, [wanted])

  const named = fields.map((field) => {
    const missing = unnamed.find((u) => u.filter.field === field.field)
    const title = missing && titles[missing.related]?.get(missing.filter.value)
    return title ? { ...field, options: [...field.options, [missing.filter.value, title] as [string, string]] } : field
  })
  return [named, unnamed.filter((u) => !titles[u.related]).map((u) => u.filter.field)]
}
