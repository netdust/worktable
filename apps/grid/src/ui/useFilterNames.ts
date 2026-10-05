import { useEffect, useState } from 'react'
import { records } from '../api'
import { byTitle, type FilterField } from '../grid/filter'
import type { Filter } from '../grid/layout'
import type { Model } from '../types'

/** A related model's titles by id; empty once its records could not be read, so its filters fall back to the loaded rows. */
type Titles = Record<string, Map<string, string>>

/**
 * The fields with a relation's options taken from its target's records, and the filters still waiting for them.
 * The loaded rows name only the records on the window or the page; each target is read once per model.
 * A waiting filter's chip is held back, never shown with the id.
 */
export function useFilterNames(model: Model | undefined, fields: FilterField[], active: Filter[]): [FilterField[], string[]] {
  const [titles, setTitles] = useState<Titles>({})
  const targetOf = (field: string) => model?.fields[field]?.relation?.model
  const wanted = [...new Set(fields.flatMap((f) => targetOf(f.field) ?? []))].filter((related) => !titles[related]).join(',')

  useEffect(() => {
    if (wanted === '') return
    for (const related of wanted.split(',')) {
      const keep = (named: Map<string, string>) => setTitles((known) => ({ ...known, [related]: named }))
      records(related, '').then((found) => keep(new Map(found.rows.map((row) => [String(row.id), row.title]))), () => keep(new Map()))
    }
  }, [wanted])

  const named = fields.map((field) => {
    const known = titles[targetOf(field.field) ?? '']
    return known && known.size > 0 ? { ...field, options: byTitle(known) } : field
  })
  const waiting = active.filter((filter) => {
    const related = targetOf(filter.field)
    const field = fields.find((f) => f.field === filter.field)
    return related && field && !titles[related] && !field.options.some(([value]) => value === filter.value)
  })
  return [named, waiting.map((filter) => filter.field)]
}
