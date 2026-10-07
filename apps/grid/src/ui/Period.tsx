import { useEffect, useState } from 'react'
import { Popover } from '@sakaniui/react'
import { CalendarDays, ChevronLeft, ChevronRight } from 'lucide-react'
import { t } from '../i18n'
import type { DateWindow } from '../types'
import { days, formatWindow, iso, parse, shift, step, weekOf } from './Window'

/** The engine reads a matrix over at most this many days. */
export const MATRIX_DAYS = 92
const ICON = 13

interface Props {
  window: Partial<DateWindow>
  onChange: (window: Partial<DateWindow>) => void
  /** True only where the skin may read every day: Alles is offered, and Van–tot has no cap. */
  unbounded: boolean
}

function thisMonth(): DateWindow {
  const now = new Date()
  return { from: iso(new Date(now.getFullYear(), now.getMonth(), 1)), to: iso(new Date(now.getFullYear(), now.getMonth() + 1, 0)) }
}

/** The always-there "Periode" chip of the filter bar: ‹ the period ›, and a menu to pick another. */
export function Period({ window, onChange, unbounded }: Props) {
  const all = !window.from || !window.to
  const range = all ? null : { from: window.from as string, to: window.to as string }
  const current = weekOf(new Date())
  const choose = (next: Partial<DateWindow>) => () => onChange(next)

  const [draft, setDraft] = useState({ from: range?.from ?? current.from, to: range?.to ?? current.to })
  useEffect(() => setDraft({ from: window.from ?? current.from, to: window.to ?? current.to }), [window.from, window.to])
  const from = parse(draft.from)
  const to = parse(draft.to)
  const valid = from !== null && to !== null && draft.to >= draft.from && (unbounded || days(draft) <= MATRIX_DAYS)
  const editFrom = (value: string) => setDraft((was) => ({ from: value, to: parse(value) && value > was.to ? value : was.to }))

  return (
    <span className="nv-chip nv-chip--set nv-chip--period" role="group" aria-label={t('period')}>
      <CalendarDays size={ICON} aria-hidden="true" />
      {t('period')}{' '}
      {range && (
        <button type="button" className="nv-chip__step" aria-label={t('previousPeriod')} title={t('previousPeriod')} onClick={() => onChange(step(range, -1))}>
          <ChevronLeft size={ICON} aria-hidden="true" />
        </button>
      )}
      <Popover placement="bottom-start" trigger={<button type="button" className="nv-chip__value">{formatWindow(window)}</button>}>
        <div className="nv-filters__menu">
          <button type="button" className="nv-filters__option" onClick={choose(current)}>{t('thisWeek')}</button>
          <button type="button" className="nv-filters__option" onClick={choose(shift(current, 7))}>{t('nextWeek')}</button>
          <button type="button" className="nv-filters__option" onClick={choose(thisMonth())}>{t('thisMonth')}</button>
          <div className="nv-filters__field" role="group" aria-label={t('fromTo')}>
            <span className="nv-filters__label">{t('fromTo')}</span>
            <label className="nv-period__day">{t('periodFrom')}
              <input type="date" value={draft.from} onChange={(event) => editFrom(event.target.value)} />
            </label>
            <label className="nv-period__day">{t('periodTo')}
              <input type="date" value={draft.to} onChange={(event) => setDraft({ ...draft, to: event.target.value })} />
            </label>
            <button type="button" className="nv-filters__option" disabled={!valid} onClick={choose(draft)}>{t('apply')}</button>
            {!unbounded && <span className="nv-filters__label">{t('periodTooLong', { days: MATRIX_DAYS })}</span>}
          </div>
          {unbounded && <button type="button" className="nv-filters__option" onClick={choose({})}>{t('all')}</button>}
        </div>
      </Popover>
      {range && (
        <button type="button" className="nv-chip__step" aria-label={t('nextPeriod')} title={t('nextPeriod')} onClick={() => onChange(step(range, 1))}>
          <ChevronRight size={ICON} aria-hidden="true" />
        </button>
      )}
    </span>
  )
}
