import { rows } from '../api'
import { complete, isDate, windowOf } from '../grid/conditions'
import type { Layout } from '../grid/layout'
import type { DateWindow, Model, SavedView, Scope, Tile, Tone } from '../types'
import { layoutOf } from '../ui/views'
import { days, isMonth, shift, shiftMonth } from '../ui/Window'

type Stat = Extract<Tile, { kind: 'stat' }>

/** The period before a window: the calendar month before a month, else as many days back. */
export function previousWindow(window: DateWindow): DateWindow {
  return isMonth(window) ? shiftMonth(window, -1) : shift(window, -days(window))
}

/** A tile reads its view as the view reads itself; the space narrows only a view the space scopes. */
export const scopeFor = (view: SavedView, scope: Scope | null): Scope | null => (view.space === 'scoped' ? scope : null)

// The view's layout with its date condition moved one period back; null when it has none.
function previousLayout(view: SavedView, layout: Layout): Layout | null {
  const at = layout.filters.findIndex((f) => f.field === view.date_field && isDate(f.op) && complete(f))
  const window = at < 0 ? null : windowOf(layout.filters[at], new Date())
  if (!window) return null
  const back = previousWindow(window)
  const filters = [...layout.filters]
  filters[at] = { field: filters[at].field, op: 'between', values: [back.from, back.to] }
  return { ...layout, filters }
}

/** A stat's number: the view's row count, or one column's sum over its rows; null for a previous period it has none of. */
export async function statOf(view: SavedView, scope: Scope | null, measure: Stat['measure'], previous = false): Promise<number | null> {
  const current = layoutOf(view)
  const layout = previous ? previousLayout(view, current) : current
  if (!layout) return null
  const read = (limit?: number) => rows(view, {}, scopeFor(view, scope), layout, limit)
  if (measure === 'count') return (await read(1)).total
  const { rows: found } = await read()
  return found.reduce((sum, row) => sum + (Number(row.fields[measure.sum]) || 0), 0)
}

/** A stat's tone: its own threshold, else a summed column's declared badge above 0. */
export function toneOf(value: number, tile: Stat, model?: Model): Tone | null {
  if (tile.tone) return value > tile.tone.above ? tile.tone.tone : null
  const badge = typeof tile.measure === 'object' ? model?.fields[tile.measure.sum]?.badge : undefined
  return badge && value > 0 ? badge : null
}
