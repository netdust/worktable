import { Check, Columns3, Rows2, Tag } from 'lucide-react'
import { type ReactNode, useContext, useRef } from 'react'
import { useInteractOutside } from 'react-aria'
import { Button, Checkbox, CheckboxGroup, Dialog, DialogTrigger, OverlayTriggerStateContext, Popover } from 'react-aria-components'
import { rowCount, t } from '../i18n'
import { hint } from '../ui/hint'
import type { Model } from '../types'
import type { Column } from './columns'
import { group, hide, type Layout, orderOf, reorder, show } from './layout'

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

/** A panel under its trigger. Like the bar's panels always were, it is non-modal: the page keeps scrolling, and a press outside, on another trigger too, closes it and still reaches its target. */
function Panel({ trigger, placement, label, children }: { trigger: ReactNode; placement: 'bottom start' | 'bottom end'; label: string; children: ReactNode }) {
  return (
    <DialogTrigger>
      {trigger}
      <Popover isNonModal className="nv-bar__panel" placement={placement} offset={8}>
        <PanelBody label={label}>{children}</PanelBody>
      </Popover>
    </DialogTrigger>
  )
}

function PanelBody({ label, children }: { label: string; children: ReactNode }) {
  const state = useContext(OverlayTriggerStateContext)
  const body = useRef<HTMLElement>(null)
  useInteractOutside({ ref: body, onInteractOutside: () => state?.close() })
  return <Dialog ref={body} className="nv-bar__dialog" aria-label={label}>{children}</Dialog>
}

/** The sheet's arrangement, under the toolbar: the scope, the group and the filters as chips; the count and Kolommen at the end. The sort shows in its column header. */
export function GridBar({ model, columns, layout, onLayout, count, cut = false, filters, scope = null }: Props) {
  const label = (id: string) => columns.find((c) => c.id === id)?.label ?? model.fields[id]?.label ?? id
  const groupable = Object.entries(model.fields).filter(([, f]) => GROUPABLE.includes(f.type))

  return (
    <div className="nv-bar">
      {scope && <span className="nv-chip nv-chip--set nv-chip--scope"><Tag size={ICON} aria-hidden="true" />{scope}</span>}
      <Panel placement="bottom start" label={t('groupBy')} trigger={
        <Button className={layout.group ? 'nv-chip nv-chip--set' : 'nv-chip'}>
          <Rows2 size={ICON} aria-hidden="true" />
          {layout.group ? t('groupOn', { field: label(layout.group).toLocaleLowerCase() }) : t('groupBy')}
        </Button>
      }>
        <div className="nv-filters__menu" role="group" aria-label={t('groupBy')}>
          {[['', t('none')] as const, ...groupable.map(([key, f]) => [key, f.label] as const)].map(([key, word]) => (
            <button key={key} type="button" className="nv-filters__option" aria-pressed={(layout.group ?? '') === key}
              onClick={() => onLayout(group(layout, key === '' ? null : key))}>
              {word}
            </button>
          ))}
        </div>
      </Panel>
      {filters}
      <span className="nv-bar__end">
        <span className="nv-bar__count">{rowCount(count, cut)}</span>
        <Panel placement="bottom end" label={t('columns')} trigger={
          <Button ref={hint(t('columns'))} className="nv-bar__icon" aria-label={t('columns')}><Columns3 size={ICON + 1} aria-hidden="true" /></Button>
        }>
          <ColumnsMenu columns={columns} layout={layout} onLayout={onLayout} />
        </Panel>
      </span>
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

  const shown = order.filter((id) => !layout.hidden.includes(id))
  const toggle = (next: string[]) => {
    const changed = order.find((id) => next.includes(id) !== shown.includes(id))
    if (changed) onLayout(next.includes(changed) ? show(layout, changed) : hide(layout, changed))
  }

  return (
    <CheckboxGroup className="nv-bar__columns" aria-label={t('columns')} value={shown} onChange={toggle}>
      {order.map((id, at) => {
        const c = byId.get(id)!
        return (
          <div key={id} className="nv-bar__column">
            <Checkbox value={id} isDisabled={id === 'title'} className="nv-check">
              <span className="nv-check__box" aria-hidden="true"><Check size={12} strokeWidth={3} /></span>
              {c.label}
            </Checkbox>
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
    </CheckboxGroup>
  )
}
