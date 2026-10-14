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
