import { X } from 'lucide-react'
import { Button } from '@sakaniui/react'
import { createContext, type KeyboardEvent, type RefObject, useContext, useEffect, useRef, useState } from 'react'
import { Button as AriaButton, ComboBoxStateContext, ComboBoxValue, Dialog, type Key, Tag, TagGroup, TagList } from 'react-aria-components'
import { t } from '../../i18n'
import type { Link, LinkItem, Row } from '../../types'
import { Pop } from '../../ui/Pop'
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

function pillOf(item: LinkItem, link: Link | undefined): string {
  if (item.target === null) return 'nv-pill nv-pill--muted'
  const tone = item.state === null ? null : toneOf(item.state, link?.state?.tones)
  return tone ? `nv-pill nv-pill--${tone}` : 'nv-pill'
}

/** The names on one line, each in its state's colour; what does not fit ends in an ellipsis, and the title holds them all. */
export function LinksCell({ column, row }: CellProps) {
  const items = linksOf(row, column.field ?? column.id)
  const all = items.map((item) => item.title).join(', ')
  return (
    <span className="nv-names" title={all || undefined}>
      {items.map((item, i) => (
        <span key={item.id}>
          {i > 0 && ', '}
          <span className={pillOf(item, column.link)}>{item.title}</span>
        </span>
      ))}
    </span>
  )
}

type ChosenProps = { label: string; items: LinkItem[]; link: Link; onRemove: (item: LinkItem) => void }

function Chips({ label, items, link, onRemove }: ChosenProps) {
  const remove = (keys: Set<Key>) => {
    const item = items.find((i) => keys.has(i.id))
    if (item && item.target !== null) onRemove(item)
  }
  return (
    <TagGroup aria-label={label} className="nv-chosen" onRemove={remove}>
      <TagList items={items} className="nv-chosen__list">
        {(item) => (
          <Tag id={item.id} textValue={item.title} className={pillOf(item, link)}>
            {item.title}
            {item.target !== null && (
              // Our own name for it: React Aria's slot would label it "Verwijderen <name>".
              <AriaButton slot={null} className="nv-chosen__remove" aria-label={t('removeItem', { name: item.title })}
                preventFocusOnPress onPress={() => onRemove(item)}>
                <X size={11} aria-hidden="true" />
              </AriaButton>
            )}
          </Tag>
        )}
      </TagList>
    </TagGroup>
  )
}

// Enter on a chip would reach the sheet, which commits the cell's draft as a value; a links cell is never written as one.
const keepEnter = (event: KeyboardEvent) => {
  if (event.key === 'Enter') event.stopPropagation()
}

/**
 * The chips inside the picker's ComboBox. ComboBoxValue sits out the pass that collects the options, which would take the tags for options.
 * A chip taking focus blurs the search, and React Aria closes the list on that blur; the list belongs to the whole box, so it opens again.
 */
function Chosen(props: ChosenProps) {
  const combo = useContext(ComboBoxStateContext)
  return (
    <ComboBoxValue className="nv-chosen__value">
      <span className="nv-chosen__focus" onFocus={() => combo?.open(null, 'manual')} onKeyDown={keepEnter}>
        <Chips {...props} />
      </span>
    </ComboBoxValue>
  )
}

/** Asked before a removal: no key reaches the grid behind it; Tab moves between the two answers and Escape keeps the person. */
function Question({ anchor, text, onCancel, onConfirm }: { anchor: RefObject<HTMLElement | null>; text: string; onCancel: () => void; onConfirm: () => void }) {
  const cancel = useRef<HTMLButtonElement>(null)
  const confirm = useRef<HTMLButtonElement>(null)
  const root = useRef<HTMLDivElement>(null)
  useEffect(() => cancel.current?.focus(), [])

  // The popover's focus scope moves Tab focus from a capture listener on the document; the window hears Tab first.
  useEffect(() => {
    const tab = (event: globalThis.KeyboardEvent) => {
      if (event.key !== 'Tab' || !root.current?.contains(event.target as Node)) return
      event.preventDefault()
      event.stopPropagation()
      ;(document.activeElement === cancel.current ? confirm : cancel).current?.focus()
    }
    window.addEventListener('keydown', tab, true)
    return () => window.removeEventListener('keydown', tab, true)
  }, [])

  const keys = (event: KeyboardEvent) => {
    event.stopPropagation()
    if (event.key !== 'Escape') return
    event.preventDefault()
    onCancel()
  }

  return (
    <Pop triggerRef={anchor} isOpen placement="bottom start" className="nv-confirm">
      <Dialog role="alertdialog" aria-label={text}>
        <div ref={root} onKeyDown={keys}>
          <p>{text}</p>
          <div className="nv-confirm__actions">
            <Button ref={cancel} variant="secondary" size="sm" onClick={onCancel}>{t('cancel')}</Button>
            <Button ref={confirm} variant="destructive" size="sm" onClick={onConfirm}>{t('delete')}</Button>
          </div>
        </div>
      </Dialog>
    </Pop>
  )
}

/** One box: the chosen names, each removable, then a search whose list offers only the others. */
export function LinksEditor({ column, row, editing, onCancel, onClose }: EditorProps) {
  const actions = useContext(LinksContext)
  const [asking, setAsking] = useState<LinkItem | null>(null)
  // A second click on a name, before the first add answered, would be refused as a duplicate.
  const adding = useRef(new Set<number>())
  const anchor = useRef<HTMLSpanElement>(null)
  const { link } = column
  const key = column.field ?? column.id
  const items = linksOf(row, key)
  if (!actions || !link) return <LinksCell column={column} row={row} />

  // A link moved on from its first state (confirmed, declined) is asked about: adding it again starts it over.
  const drop = (item: LinkItem) => {
    if (link.state && item.state !== null && item.state !== link.state.default) setAsking(item)
    else void actions.remove(key, row, item)
  }
  const removable = items.filter((item) => item.target !== null)

  // A click in here would reach the cell, and selecting the cell ends the edit.
  return (
    <div data-editor onClick={(event) => event.stopPropagation()}>
      <LinksCell column={column} row={row} />
      <span ref={anchor} className="nv-links__anchor" />
      {asking ? (
        <Question
          anchor={anchor}
          text={t('removeLinkAsk', { item: link.item, name: asking.title })}
          onCancel={() => setAsking(null)}
          onConfirm={() => {
            setAsking(null)
            void actions.remove(key, row, asking)
          }}
        />
      ) : (
        <RelationPicker
          model={link.target_dataset}
          label={column.label}
          query={editing.mode === 'enter' ? editing.draft : ''}
          before={<Chosen label={column.label} items={items} link={link} onRemove={drop} />}
          hide={(record) => items.some((item) => item.target === record.id)}
          clearOnPick
          onPick={(record) => {
            if (adding.current.has(record.id)) return
            adding.current.add(record.id)
            void actions.add(key, row, record.id).finally(() => adding.current.delete(record.id))
          }}
          onClear={() => {
            const last = removable[removable.length - 1]
            if (last) drop(last)
          }}
          onCancel={onCancel}
          onClose={onClose}
        />
      )}
    </div>
  )
}
