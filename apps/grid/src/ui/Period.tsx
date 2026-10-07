import { Popover } from '@sakaniui/react'
import { CalendarDays, ChevronLeft, ChevronRight } from 'lucide-react'
import { t } from '../i18n'
import type { DateWindow } from '../types'
import { days, formatWindow, iso, parse, shift, step, weekOf } from './Window'

/** The engine reads a matrix over at most this many days. */
const MATRIX_DAYS = 92
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

  const edit = (key: 'from' | 'to', value: string) => {
    if (!range || !parse(value)) return
    const next = { ...range, [key]: value }
    if (next.to < next.from || (!unbounded && days(next) > MATRIX_DAYS)) return
    onChange(next)
  }

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
              <input type="date" value={range?.from ?? current.from} onChange={(event) => edit('from', event.target.value)} />
            </label>
            <label className="nv-period__day">{t('periodTo')}
              <input type="date" value={range?.to ?? current.to} onChange={(event) => edit('to', event.target.value)} />
            </label>
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
