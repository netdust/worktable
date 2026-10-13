import { type CSSProperties, useEffect, useMemo, useRef } from 'react'
import { type Column, columnsFor } from '../grid/columns'
import { useOpenRow } from '../grid/useOpenRow'
import { locale, t } from '../i18n'
import type { CalendarDef, DateWindow, Model, Row, View } from '../types'
import type { Shown } from '../ui/Toolbar'
import { iso, isoWeek, parse } from '../ui/Window'
import { type Bar, bars } from './layout'

const MONTH = (date: Date) => new Intl.DateTimeFormat(locale(), { month: 'short' }).format(date).replace(/\./g, '')
const LETTER = (date: Date) => new Intl.DateTimeFormat(locale(), { weekday: 'narrow' }).format(date).toLocaleLowerCase(locale())

/** "14–16 okt", "30 okt – 8 nov": a bar's days. */
function spanOf(first: Date, last: Date): string {
  if (iso(first) === iso(last)) return `${first.getDate()} ${MONTH(first)}`
  if (first.getMonth() === last.getMonth()) return `${first.getDate()}–${last.getDate()} ${MONTH(last)}`
  return `${first.getDate()} ${MONTH(first)} – ${last.getDate()} ${MONTH(last)}`
}

/** The window's days by ISO week: the scale's upper row. */
function weeksOf(window: string[]): { label: string; span: string; days: number }[] {
  const out: { label: string; span: string; days: number; first: Date; last: Date }[] = []
  for (const day of window) {
    const date = parse(day) as Date
    const week = isoWeek(date)
    const at = out[out.length - 1]
    if (at && at.label === `${t('week')} ${week}`) {
      at.days += 1
      at.last = date
    } else out.push({ label: `${t('week')} ${week}`, span: '', days: 1, first: date, last: date })
  }
  return out.map((w) => ({ label: w.label, span: spanOf(w.first, w.last), days: w.days }))
}

/** Bars that overlap in a lane take rows of their own, first come first placed. */
function packed(lane: Bar[]): { bar: Bar; row: number }[] {
  const ends: number[] = []
  return [...lane].sort((a, b) => a.start - b.start).map((bar) => {
    let row = ends.findIndex((end) => end < bar.start)
    if (row < 0) row = ends.push(0) - 1
    ends[row] = bar.start + bar.length - 1
    return { bar, row }
  })
}


/** A day's width on the scale, as the prototype's week zoom. */
const DAY_PX = 44

const TONE_CLASS = { warn: 'nv-tl__bar--option', bad: 'nv-tl__bar--cancelled' } as const

/** Rows as bars across the window's days, in lanes; read-only, a bar opens its row. */
export function Timeline({ view, model, models, rows, cal, shown, lane, onTitle }: {
  view: View; model: Model; models: Record<string, Model>; rows: Row[]; cal: CalendarDef; shown: DateWindow; lane: string | null
  /** What the title line says it shows: the bars and the lanes. */
  onTitle?: (shown: Shown) => void
}) {
  const [openRow, drawer, open] = useOpenRow(model, view, models)
  const laid = useMemo(() => bars(rows, cal, shown, lane), [rows, cal, shown.from, shown.to, lane])
  const columns = useMemo(() => columnsFor(model, view, false, models), [model, view, models])
  // A bar's second line: its place, the first relation that is not the lane; its tone: the first toned option, as optie is hatched.
  const place: Column | undefined = columns.find((c) => c.kind === 'relation' && c.id !== lane)
  const toned: Column | undefined = columns.find((c) => c.kind === 'select' && c.tones)
  const window = useMemo(() => Array.from({ length: laid.days }, (_, i) => iso(new Date((parse(shown.from) as Date).getTime() + i * 86_400_000 + 43_200_000))), [shown.from, laid.days])
  const today = iso(new Date())
  const pct = (n: number) => `${(n / laid.days) * 100}%`
  const field = lane ? model.fields[lane] : undefined
  useEffect(() => onTitle?.({ rows: rows.length, groups: lane ? laid.lanes.length : null, cut: false }), [rows.length, laid.lanes.length, lane])
  const weekend = (day: string) => [0, 6].includes((parse(day) as Date).getDay())
  const todayAt = window.indexOf(today)
  // A day keeps the prototype's 44px; the sheet scrolls sideways and opens two days before today.
  const frame = useRef<HTMLDivElement>(null)
  // A bar that starts left of the view keeps its label in sight, as the prototype pins it.
  const pin = () => {
    const at = frame.current
    if (!at) return
    for (const bar of at.querySelectorAll<HTMLElement>('.nv-tl__bar:not(.nv-tl__bar--narrow)')) {
      const hidden = at.scrollLeft - bar.offsetLeft
      bar.style.paddingLeft = `${Math.min(Math.max(10, hidden + 10), bar.offsetWidth - 60)}px`
    }
  }
  useEffect(() => {
    if (frame.current && todayAt > 2) frame.current.scrollLeft = (todayAt - 2) * DAY_PX
  }, [shown.from, todayAt])
  useEffect(pin, [shown.from, todayAt, rows])
  return (
    <div className="nv-frame">
      <div className="nv-body">
        <div className="nv-tl" role="table" aria-label={view.label} ref={frame} onScroll={pin} style={{ '--days': laid.days } as CSSProperties}>
          <div className="nv-tl__axis" role="row">
            <div className="nv-tl__corner" role="columnheader">{field?.label ?? view.label}{lane && <span className="nv-tl__count">{laid.lanes.length}</span>}</div>
            <div className="nv-tl__scale" aria-hidden="true">
              <div className="nv-tl__weeks">
                {weeksOf(window).map((w) => <div key={w.label} style={{ width: pct(w.days) }}>{w.label}<span>{w.span}</span></div>)}
              </div>
              <div className="nv-tl__days">
                {window.map((day) => {
                  const date = parse(day) as Date
                  return (
                    <div key={day} style={{ width: pct(1) }} className={[date.getDay() === 1 ? 'nv-tl__mon' : '', weekend(day) ? 'nv-tl__we' : '', day === today ? 'nv-tl__today' : ''].filter(Boolean).join(' ')}>
                      {day !== today && LETTER(date)}<b>{date.getDate()}</b>
                    </div>
                  )
                })}
              </div>
            </div>
          </div>
          <div className="nv-tl__body">
            {laid.lanes.map((l) => {
              const placed = packed(l.bars)
              const height = Math.max(1, ...placed.map((p) => p.row + 1))
              return (
                <div key={l.id ?? 'none'} role="row" aria-label={lane ? l.title || t('noLane') : view.label} className="nv-tl__lane">
                  <span role="rowheader" className="nv-tl__head">{lane && <strong>{l.title || t('noLane')}</strong>}<span className="nv-tl__count">{l.bars.length}</span></span>
                  <div role="cell" className="nv-tl__track" style={{ height: height * 48 + 16, '--day': pct(1) } as CSSProperties}>
                    {window.map((day, i) => weekend(day) && <span key={day} className="nv-tl__weekend" style={{ left: pct(i), width: pct(1) }} />)}
                    {placed.map(({ bar, row }) => {
                      const first = parse(window[bar.start]) as Date
                      const last = parse(window[bar.start + bar.length - 1]) as Date
                      const tone = toned?.tones?.[String(toned.value(bar.row) ?? '')]
                      const where = place?.text(bar.row) ?? ''
                      const tip = [bar.row.title, where, `${spanOf(first, last)}`, toned?.text(bar.row)].filter(Boolean).join(' · ')
                      const narrow = bar.length < 3
                      return (
                        <button key={bar.row.id} type="button" data-tip={tip}
                          className={['nv-tl__bar', tone && tone in TONE_CLASS ? TONE_CLASS[tone as keyof typeof TONE_CLASS] : '', open?.id === bar.row.id ? 'nv-tl__bar--open' : '', narrow ? 'nv-tl__bar--narrow' : ''].filter(Boolean).join(' ')}
                          style={{ left: `calc(${pct(bar.start)} + 2px)`, width: `calc(${pct(bar.length)} - 4px)`, top: 9 + row * 48 }}
                          onClick={() => openRow(bar.row)}>
                          <strong>{bar.row.title}</strong>
                          <span className="nv-tl__line2"><span className="nv-tl__span">{spanOf(first, last)}</span>{where && !narrow && <span className="nv-tl__where">{where}</span>}</span>
                        </button>
                      )
                    })}
                  </div>
                </div>
              )
            })}
            {todayAt >= 0 && <div className="nv-tl__now" style={{ left: `calc(232px + (100% - 232px) * ${(todayAt + 0.5) / laid.days})` }} aria-hidden="true" />}
          </div>
        </div>
        {drawer}
      </div>
    </div>
  )
}
