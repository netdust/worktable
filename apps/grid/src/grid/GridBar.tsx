import { Checkbox, Popover } from '@sakaniui/react'
import { ArrowUpDown, Columns3, Rows2, Tag } from 'lucide-react'
import type { ReactNode } from 'react'
import { rowCount, t } from '../i18n'
import type { Model } from '../types'
import type { Column } from './columns'
import { group, hide, type Layout, orderOf, reorder, show, sort } from './layout'

interface Props {
  model: Model
  columns: Column[]
  layout: Layout
  onLayout: (layout: Layout) => void
  count: number
  /** The read limit cut the rows: the count is what loaded. */
  cut?: boolean
  /** The filter chips and the Filter chip, after the columns. */
  filters?: ReactNode
  /** The selected space as the scope chip reads it: "Productie is Nachtwacht"; it cannot be removed. */
  scope?: string | null
}

const GROUPABLE = ['date', 'select', 'relation']
const ICON = 13

/** The sheet's arrangement, under the toolbar, as one row of chips: the scope, the group, the sort, the columns, the filters. */
export function GridBar({ model, columns, layout, onLayout, count, cut = false, filters, scope = null }: Props) {
  const label = (id: string) => columns.find((c) => c.id === id)?.label ?? model.fields[id]?.label ?? id
  const groupable = Object.entries(model.fields).filter(([, f]) => GROUPABLE.includes(f.type))
  const [first, ...rest] = layout.sort

  return (
    <div className="nv-bar">
      {scope && <span className="nv-chip nv-chip--set nv-chip--scope"><Tag size={ICON} aria-hidden="true" />{scope}</span>}
      <Popover placement="bottom-start" trigger={
        <button type="button" className={layout.group ? 'nv-chip nv-chip--set' : 'nv-chip'}>
          <Rows2 size={ICON} aria-hidden="true" />
          {layout.group ? t('groupOn', { field: label(layout.group).toLocaleLowerCase() }) : t('groupBy')}
        </button>
      }>
        <div className="nv-filters__menu" role="group" aria-label={t('groupBy')}>
          {[['', t('none')] as const, ...groupable.map(([key, f]) => [key, f.label] as const)].map(([key, word]) => (
            <button key={key} type="button" className="nv-filters__option" aria-pressed={(layout.group ?? '') === key}
              onClick={() => onLayout(group(layout, key === '' ? null : key))}>
              {word}
            </button>
          ))}
        </div>
      </Popover>
      {first && (
        <button type="button" className="nv-chip nv-chip--set" title={t('sortedBy')}
          onClick={() => onLayout(sort(layout, [{ ...first, desc: !first.desc }, ...rest]))}>
          <ArrowUpDown size={ICON} aria-hidden="true" />
          {[first, ...rest].map((s) => `${model.fields[s.id]?.label ?? label(s.id)} ${s.desc ? '↓' : '↑'}`).join(', ')}
        </button>
      )}
      <Popover trigger={<button type="button" className="nv-chip"><Columns3 size={ICON} aria-hidden="true" />{t('columns')}</button>} placement="bottom-start">
        <ColumnsMenu columns={columns} layout={layout} onLayout={onLayout} />
      </Popover>
      {filters}
      <span className="nv-bar__count">{rowCount(count, cut)}</span>
    </div>
  )
}

/** Show, hide and move each column; the title moves, and always shows. */
function ColumnsMenu({ columns, layout, onLayout }: Pick<Props, 'columns' | 'layout' | 'onLayout'>) {
  const ids = columns.map((c) => c.id)
  const stored = orderOf(layout, ids)
  const order = layout.order.includes('title') ? stored : ['title', ...stored.filter((id) => id !== 'title')]
  const byId = new Map(columns.map((c) => [c.id, c]))
  const move = (id: string, to: number) => onLayout(reorder({ ...layout, order }, id, to, ids))

  return (
    <div className="nv-bar__columns">
      {order.map((id, at) => {
        const c = byId.get(id)!
        return (
          <div key={id} className="nv-bar__column">
            <Checkbox label={c.label} checked={!layout.hidden.includes(id)} disabled={id === 'title'}
              onChange={(event) => onLayout(event.target.checked ? show(layout, id) : hide(layout, id))} />
            <button type="button" className="nv-bar__move" aria-label={`${c.label}: ${t('moveLeft').toLowerCase()}`}
              disabled={at === 0} onClick={() => move(id, at - 1)}>
              {t('moveLeft')}
            </button>
            <button type="button" className="nv-bar__move" aria-label={`${c.label}: ${t('moveRight').toLowerCase()}`}
              disabled={at === order.length - 1} onClick={() => move(id, at + 1)}>
              {t('moveRight')}
            </button>
          </div>
        )
      })}
    </div>
  )
}
