import { X } from 'lucide-react'
import { createContext, type MouseEvent, useContext, useState } from 'react'
import { t } from '../../i18n'
import type { Link, LinkItem, Row } from '../../types'
import { linksOf } from '../columns'
import type { CellProps, EditorProps } from './props'
import { RelationPicker } from './RelationPicker'
import { toneOf } from './tones'

/** What a links cell asks of the page: create or delete one linked row, then repaint its row. */
export interface LinkActions {
  add: (field: string, row: Row, target: number) => Promise<void>
  remove: (field: string, row: Row, item: LinkItem) => Promise<void>
}

export const LinksContext = createContext<LinkActions | null>(null)

// Keeps focus in the picker's search: a blur there closes the editor.
const keepFocus = (event: MouseEvent) => event.preventDefault()

function pillOf(item: LinkItem, link: Link | undefined): string {
  if (item.target === null) return 'nv-pill nv-pill--muted'
  const tone = item.state === null ? null : toneOf(item.state, link?.state?.tones)
  return tone ? `nv-pill nv-pill--${tone}` : 'nv-pill'
}

function Tags({ items, link, onRemove }: { items: LinkItem[]; link?: Link; onRemove?: (item: LinkItem) => void }) {
  return (
    <ul className="nv-tags">
      {items.map((item) => (
        <li key={item.id} className={pillOf(item, link)} aria-label={item.title}>
          {item.title}
          {onRemove && item.target !== null && (
            <button type="button" className="nv-tags__remove" aria-label={t('removeItem', { name: item.title })}
              onMouseDown={keepFocus} onClick={() => onRemove(item)}>
              <X size={11} aria-hidden="true" />
            </button>
          )}
        </li>
      ))}
    </ul>
  )
}

export function LinksCell({ column, row }: CellProps) {
  return <Tags items={linksOf(row, column.field ?? column.id)} link={column.link} />
}

export function LinksEditor({ column, row, editing, onCancel, onClose }: EditorProps) {
  const actions = useContext(LinksContext)
  const [asking, setAsking] = useState<LinkItem | null>(null)
  const { link } = column
  const key = column.field ?? column.id
  const items = linksOf(row, key)
  if (!actions || !link) return <LinksCell column={column} row={row} />

  // A link moved on from its first state (confirmed, declined) is asked about: adding it again starts it over.
  const drop = (item: LinkItem) => {
    if (link.state && item.state !== null && item.state !== link.state.default) setAsking(item)
    else void actions.remove(key, row, item)
  }
  const linked = (target: number) => items.find((item) => item.target === target)

  // The chosen ones sit atop the search, inside the popup: the cell's own tags stay as they are, under it.
  // A click in here would reach the cell, and selecting the cell ends the edit.
  return (
    <>
      <LinksCell column={column} row={row} />
      <div className="nv-pop nv-links-pop" data-editor onClick={(event) => event.stopPropagation()}>
      <Tags items={items} link={link} onRemove={drop} />
      {asking && (
        <div className="nv-pop nv-confirm" role="alertdialog" aria-label={t('removeLinkAsk', { item: link.item, name: asking.title })} onMouseDown={keepFocus}>
          <p>{t('removeLinkAsk', { item: link.item, name: asking.title })}</p>
          <div className="nv-confirm__actions">
            <button type="button" className="nv-btn" onClick={() => setAsking(null)}>{t('cancel')}</button>
            <button type="button" className="nv-btn nv-btn--danger" onClick={() => {
              setAsking(null)
              void actions.remove(key, row, asking)
            }}>{t('delete')}</button>
          </div>
        </div>
      )}
      <RelationPicker
        model={link.target_dataset}
        label={column.label}
        query={editing.mode === 'enter' ? editing.draft : ''}
        checked={(record) => linked(record.id) !== undefined}
        onPick={(record) => {
          const had = linked(record.id)
          if (had) drop(had)
          else void actions.add(key, row, record.id)
        }}
        onCancel={onCancel}
        onClose={onClose}
      />
      </div>
    </>
  )
}
