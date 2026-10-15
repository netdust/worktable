import { Clock } from 'lucide-react'
import type { Size } from '../gallery/size'
import { t } from '../i18n'

const SIZES: Size[] = ['S', 'M', 'L']

/** A gallery's S M L, as the prototype's chips after the period. */
export function SizeChips({ size, onSize }: { size: Size; onSize: (size: Size) => void }) {
  return (
    <span className="nv-chips" role="radiogroup" aria-label={t('cardSize')}>
      {SIZES.map((s) => (
        <button key={s} type="button" role="radio" aria-checked={size === s} className="nv-chip" data-selected={size === s || undefined}
          title={t(`size.${s}`)} aria-label={t(`size.${s}`)} onClick={() => onSize(s)}>{s}</button>
      ))}
    </span>
  )
}

/** A matrix's Afwezigheden: the away days drawn over the cells, or left out. */
export function AwayChip({ on, onToggle }: { on: boolean; onToggle: () => void }) {
  return (
    <button type="button" className={on ? "nv-chip nv-chip--set" : "nv-chip"} aria-pressed={on} onClick={onToggle}>
      <Clock size={13} aria-hidden="true" />{t('awayLayer')}
    </button>
  )
}
