import type { Column } from '../grid/columns'
import { type Layout, orderOf } from '../grid/layout'

/** What a card or a bar shows below its title: the skin's columns in the layout's order, less the ones Kolommen hides. */
export function factsOf(columns: Column[], layout: Layout): Column[] {
  const byId = new Map(columns.map((c) => [c.id, c]))
  return orderOf(layout, columns.map((c) => c.id))
    .filter((id) => id !== 'title' && !layout.hidden.includes(id))
    .map((id) => byId.get(id) as Column)
}

/** The place line of an event or a bar: the first fact naming another record, not the lane it already sits in. */
export const placeOf = (facts: Column[], lanes: (string | null)[]): Column | undefined =>
  facts.find((c) => (c.kind === 'relation' || c.kind === 'lookup') && !lanes.includes(c.id))
