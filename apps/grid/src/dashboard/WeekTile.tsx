import { CalendarDays } from 'lucide-react'
import { type CSSProperties, useContext, useEffect, useState } from 'react'
import { rows as readRows } from '../api'
import { Day } from '../calendar/Day'
import { placeEvents } from '../calendar/layout'
import { SchemaContext } from '../grid/drawer/context'
import type { Model, Row, SavedView, Scope } from '../types'
import { FlagMark } from '../ui/Flag'
import { toneColor } from '../ui/tone'
import { type Flags, useFlags } from '../ui/useFlags'
import { formatWindow, iso, parse, weekOf } from '../ui/Window'
import { knownFor, layoutOf } from '../ui/views'
import { scopeFor } from './tiles'

const weekday = (date: Date) => new Intl.DateTimeFormat(document.documentElement.lang || 'nl', { weekday: 'short' }).format(date)

const dayHead = (day: string) => {
  const date = parse(day) ?? new Date()
  return `${weekday(date)} ${date.getDate()}`
}

/** A day of the strip holds this many lines, the "+N meer" one included; every day has room for them, so a full day
 * keeps the tile as tall as a quiet week. Fixed, not measured: the tile has no height of its own to share. */
export const TILE_FIT = 5

const hhmm = (minutes: number) => `${String(Math.floor(minutes / 60) % 24).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`

/** This week of a calendar view in seven days, today marked; an event opens its row. */
export function WeekTile({ view, model, models, scope, version, onOpen, onOpenRow }: {
  view: SavedView; model?: Model; models: Record<string, Model>; scope: Scope | null; version: number; onOpen: () => void; onOpenRow: (row: Row, flags: Flags | null) => void
}) {
  const week = weekOf(new Date())
  const [found, setFound] = useState<Row[]>([])
  useEffect(() => {
    let live = true
    readRows(view, week, scopeFor(view, scope), layoutOf(view, knownFor(view, models))).then((r) => live && setFound(r.rows), () => live && setFound([]))
    return () => {
      live = false
    }
  }, [view.key, scope?.id, version, week.from])
  const flags = useFlags(useContext(SchemaContext), scope, week, view.model, version)
  const today = iso(new Date())
  const { days, events } = view.calendar ? placeEvents(found, view.calendar, week, null) : { days: [], events: [] }
  // A bar takes the tone of its row's first toned option, as the calendar does without a lane.
  const toned = Object.entries(model?.fields ?? {}).find(([, field]) => field.type === 'select' && field.tones)
  const toneOf = (row: Row) => ({ '--c': toneColor(toned?.[1].tones?.[String(row.fields[toned[0]] ?? '')]) }) as CSSProperties
  const [number, span] = formatWindow(week).split(' · ')
  return (
    <section className="nv-tile nv-tile--panel nv-week-tile" aria-label={view.label}>
      <header className="nv-tile__head">
        <CalendarDays size={15} aria-hidden="true" />
        <b>{number}</b>
        <span className="nv-tile__muted">{span}</span>
        <button type="button" className="nv-tile__title nv-tile__link" onClick={onOpen}>{view.label}</button>
      </header>
      <div className="nv-week-tile__days" style={{ '--fit': TILE_FIT } as CSSProperties}>
        {days.map((day) => {
          const date = parse(day) ?? new Date()
          return (
            <div key={day} role="group" aria-label={dayHead(day)} aria-current={day === today ? 'date' : undefined}
              className={`nv-week-tile__day${day === today ? ' nv-week-tile__day--today' : ''}`}>
              <span className="nv-week-tile__head"><span className="nv-week-tile__dn">{weekday(date)}</span><span className="nv-week-tile__num">{date.getDate()}</span></span>
              <Day day={day} events={events.filter((e) => e.day === day)} fit={TILE_FIT} onOpen={(row) => onOpenRow(row, flags)}
                line={(e, open) => (
                  <button key={e.row.id} type="button" className="nv-week-tile__bar" style={toneOf(e.row)} title={e.row.title} onClick={() => open(e.row)}>
                    <FlagMark flags={flags?.marksOf(view.model, e.row.id) ?? []} bare />
                    {!e.allDay && <span className="nv-week-tile__time">{hhmm(e.from)}</span>}
                    <span className="nv-week-tile__title">{e.row.title}</span>
                  </button>
                )} />
            </div>
          )
        })}
      </div>
    </section>
  )
}
