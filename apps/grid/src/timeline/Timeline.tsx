import { ChevronLeft, ChevronRight } from 'lucide-react'
import { useMemo } from 'react'
import { useOpenRow } from '../grid/useOpenRow'
import { t } from '../i18n'
import type { CalendarDef, DateWindow, Model, Row, View } from '../types'
import { days, formatWindow, isMonth, shift, shiftMonth } from '../ui/Window'
import { bars } from './layout'

/** Rows as bars across the window's days, in lanes; read-only, a bar opens its row. */
export function Timeline({ view, model, models, rows, cal, shown, lane, onShown, filters }: {
  view: View; model: Model; models: Record<string, Model>; rows: Row[]; cal: CalendarDef; shown: DateWindow; lane: string | null
  onShown: (next: DateWindow) => void; filters?: React.ReactNode
}) {
  const [openRow, drawer] = useOpenRow(model, view, models)
  const laid = useMemo(() => bars(rows, cal, shown, lane), [rows, cal, shown.from, shown.to, lane])
  const step = (by: number) => onShown(isMonth(shown) ? shiftMonth(shown, by) : shift(shown, by * days(shown)))
  const pct = (n: number) => `${(n / laid.days) * 100}%`
  return (
    <div className="nv-frame">
      <div className="nv-bar nv-cal__bar">
        <b>{formatWindow(shown)}</b>
        <button type="button" className="nv-bar__button" aria-label={t('previousPeriod')} onClick={() => step(-1)}><ChevronLeft size={14} aria-hidden="true" /></button>
        <button type="button" className="nv-bar__button" aria-label={t('nextPeriod')} onClick={() => step(1)}><ChevronRight size={14} aria-hidden="true" /></button>
        {filters}
      </div>
      <div className="nv-body">
        <div className="nv-timeline" role="table" aria-label={view.label}>
          {laid.lanes.map((l) => (
            <div key={l.id ?? 'none'} role="row" aria-label={l.title || t('noLane')} className="nv-timeline__lane">
              <span role="rowheader" className="nv-timeline__name">{l.title || t('noLane')}</span>
              <div role="cell" className="nv-timeline__track">
                {l.bars.map((bar) => (
                  <button key={bar.row.id} type="button" className="nv-cal__event nv-timeline__bar" onClick={() => openRow(bar.row)}
                    style={{ position: 'absolute', left: pct(bar.start), width: pct(bar.length) }}>
                    <span className="nv-cal__title">{bar.row.title}</span>
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
        {drawer}
      </div>
    </div>
  )
}
