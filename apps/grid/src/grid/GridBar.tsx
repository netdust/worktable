import { Checkbox, Popover, Select } from '@sakaniui/react'
import type { ReactNode } from 'react'
import { rowCount, t } from '../i18n'
import type { Model } from '../types'
import type { Column } from './columns'
import { group, hide, type Layout, orderOf, reorder, show } from './layout'

interface Props {
  model: Model
  columns: Column[]
  layout: Layout
  onLayout: (layout: Layout) => void
  count: number
  /** The filter chips and "+ Filter", after the columns. */
  filters?: ReactNode
}

const GROUPABLE = ['date', 'select', 'relation']

/** The sheet's arrangement, under the toolbar: what it is grouped and sorted by, which columns show, what it is filtered on. */
export function GridBar({ model, columns, layout, onLayout, count, filters }: Props) {
  const label = (id: string) => columns.find((c) => c.id === id)?.label ?? model.fields[id]?.label ?? id
  const options = [
    { value: '', label: t('none') },
    ...Object.entries(model.fields).filter(([, f]) => GROUPABLE.includes(f.type)).map(([key, f]) => ({ value: key, label: f.label })),
  ]

  return (
    <div className="nv-bar">
      <div className="nv-bar__group">
        <Select size="sm" label={t('groupBy')} options={options} value={layout.group ?? ''}
          onChange={(value) => onLayout(group(layout, value === '' ? null : value))} />
      </div>
      {layout.sort.length > 0 && (
        <span className="nv-bar__text">
          {t('sortedBy')} <b>{layout.sort.map((s) => label(s.id) + (s.desc ? ' ↓' : '')).join(', ')}</b>
        </span>
      )}
      <Popover trigger={<button type="button" className="nv-bar__button">{t('columns')}</button>} placement="bottom-start">
        <ColumnsMenu columns={columns} layout={layout} onLayout={onLayout} />
      </Popover>
      {filters}
      <span className="nv-bar__text nv-bar__count"><b>{rowCount(count)}</b></span>
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
