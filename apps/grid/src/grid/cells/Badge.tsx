import { t } from '../../i18n'
import type { CellProps } from './props'

/** A count shown as a tinted badge above 0, and nothing at 0. */
export function BadgeCell({ column, row }: CellProps) {
  const count = Number(column.value(row))
  if (!(count > 0)) return null
  return (
    <span className={`nv-badge nv-badge--${column.badge}`} aria-label={t('badgeCount', { count: String(count), label: column.label })}>
      {count}
    </span>
  )
}
