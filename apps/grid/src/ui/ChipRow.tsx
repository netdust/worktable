import { Rows2, Tag } from 'lucide-react'
import type { ReactNode } from 'react'
import { rowCount, t } from '../i18n'

interface Props {
  /** The space's chip ("Productie is Nachtwacht"); null where the view is not narrowed. */
  scope?: string | null
  /** The filter chips and their Filter button, as App builds them. */
  filters?: ReactNode
  /** The column a skin groups on, shown as the grid's Groep chip; it chooses nothing. */
  group?: string
  /** What a skin adds after the chips: its period steps, its views. */
  children?: ReactNode
  count?: number
  cut?: boolean
}

/** The grid's chip row for a skin without the grid's own bar: the same chips, in the same order, the count at the end. */
export function ChipRow({ scope, filters, group, children, count, cut = false }: Props) {
  return (
    <div className="nv-bar">
      {scope && <span className="nv-chip nv-chip--set nv-chip--scope"><Tag size={14} aria-hidden="true" />{scope}</span>}
      {filters}
      {group && <span className="nv-chip nv-chip--set"><Rows2 size={14} aria-hidden="true" />{t('groupOn', { field: group.toLocaleLowerCase() })}</span>}
      {children}
      {count !== undefined && <span className="nv-bar__end"><span className="nv-bar__count">{rowCount(count, cut)}</span></span>}
    </div>
  )
}
