import { useEffect, useState } from 'react'
import { isDate, windowOf } from '../grid/conditions'
import { t } from '../i18n'
import type { Model, SavedView, Scope, Tile } from '../types'
import { isMonth, isWeek } from '../ui/Window'
import { statOf, toneOf } from './tiles'

type Stat = Extract<Tile, { kind: 'stat' }>

// "vorige week", "vorige maand" or "vorige periode", after the view's own date condition.
function periodWord(view: SavedView): string {
  const condition = view.arrangement.filters.find((f) => f.field === view.date_field && isDate(f.op))
  const window = condition ? windowOf(condition, new Date()) : null
  if (window && isWeek(window)) return t('previousWeek')
  if (window && isMonth(window)) return t('previousMonth')
  return t('previousSpan')
}

/** One number from a view, toned, with its change against the previous period; its title opens the view. */
export function StatTile({ tile, view, model, scope, version, onOpen }: {
  tile: Stat; view: SavedView; model?: Model; scope: Scope | null; version: number; onOpen: () => void
}) {
  const [value, setValue] = useState<number | null>(null)
  const [before, setBefore] = useState<number | null>(null)
  useEffect(() => {
    let live = true
    Promise.all([statOf(view, scope, tile.measure), statOf(view, scope, tile.measure, true)]).then(
      ([now, then]) => {
        if (!live) return
        setValue(now)
        setBefore(then)
      },
      () => live && setValue(null),
    )
    return () => {
      live = false
    }
  }, [view.key, scope?.id, version])
  const tone = value === null ? null : toneOf(value, tile, model)
  const change = value !== null && before !== null ? value - before : null
  return (
    <section className={`nv-tile nv-stat${tone ? ` nv-stat--${tone}` : ''}`} aria-label={tile.label ?? view.label}>
      <button type="button" className="nv-tile__title" onClick={onOpen}>{tile.label ?? view.label}</button>
      <b className="nv-stat__value" data-testid="stat-value">{value ?? '–'}</b>
      {change !== null && change !== 0 && (
        <span className="nv-stat__change">{t('changeSince', { change: `${change > 0 ? '+' : ''}${change}`, period: periodWord(view) })}</span>
      )}
    </section>
  )
}
