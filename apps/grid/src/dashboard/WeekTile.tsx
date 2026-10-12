import { useEffect, useState } from 'react'
import { rows as readRows } from '../api'
import { placeEvents } from '../calendar/layout'
import type { Row, SavedView, Scope } from '../types'
import { iso, parse, weekOf } from '../ui/Window'
import { layoutOf } from '../ui/views'
import { scopeFor } from './tiles'

const dayHead = (day: string) => {
  const date = parse(day) ?? new Date()
  return `${new Intl.DateTimeFormat(document.documentElement.lang || 'nl', { weekday: 'short' }).format(date)} ${date.getDate()}`
}

/** This week of a calendar view in seven days, today marked; an event opens its row. */
export function WeekTile({ view, scope, version, onOpen, onOpenRow }: {
  view: SavedView; scope: Scope | null; version: number; onOpen: () => void; onOpenRow: (row: Row) => void
}) {
  const week = weekOf(new Date())
  const [found, setFound] = useState<Row[]>([])
  useEffect(() => {
    let live = true
    readRows(view, week, scopeFor(view, scope), layoutOf(view)).then((r) => live && setFound(r.rows), () => live && setFound([]))
    return () => {
      live = false
    }
  }, [view.key, scope?.id, version, week.from])
  const today = iso(new Date())
  const { days, events } = view.calendar ? placeEvents(found, view.calendar, week, null) : { days: [], events: [] }
  return (
    <section className="nv-tile nv-week-tile" aria-label={view.label}>
      <button type="button" className="nv-tile__title" onClick={onOpen}>{view.label}</button>
      <div className="nv-week-tile__days">
        {days.map((day) => (
          <div key={day} role="group" aria-label={dayHead(day)} aria-current={day === today ? 'date' : undefined}
            className={`nv-week-tile__day${day === today ? ' nv-week-tile__day--today' : ''}`}>
            <span className="nv-week-tile__head">{dayHead(day)}</span>
            {events.filter((e) => e.day === day).map((e) => (
              <button key={e.row.id} type="button" className="nv-cal__event" onClick={() => onOpenRow(e.row)}>
                <span className="nv-cal__title">{e.row.title}</span>
              </button>
            ))}
          </div>
        ))}
      </div>
    </section>
  )
}
