import { SidebarItem } from '@sakaniui/react'
import { Grid3x3, Lock, Table as TableIcon, UserRound } from 'lucide-react'
import { type KeyboardEvent, useEffect, useRef, useState } from 'react'
import { t } from '../i18n'
import type { SavedView, View } from '../types'
import { type Action, MoreMenu } from './MoreMenu'
import type { Table } from './tables'
import { useDragOrder } from './useDragOrder'
import { isSaved, stepped } from './views'

/** What a view's ⋯ can do; each is offered only where the user may do it. */
export interface ViewActions {
  rename: (view: SavedView, name: string) => void
  duplicate: (view: View) => void
  remove: (view: SavedView) => void
  share: (view: SavedView, shared: boolean) => void
  /** The table's views in this user's new order, by key. */
  order: (table: string, keys: string[]) => void
}

interface Props {
  table: Table
  active: string | undefined
  onSelect: (viewKey: string) => void
  /** Without them there is no ⋯ and no rename. */
  actions?: ViewActions
}

const editable = (view: View): view is SavedView => isSaved(view) && view.editable

/** A view's mark: a lock on one this user can only copy, a person on one's own unshared view. */
function Mark({ view }: { view: View }) {
  const locked = !editable(view)
  if (!locked && !(view.mine && !view.shared)) return null
  const word = t(locked ? 'readOnlyView' : 'mine')
  return (
    <span className={locked ? 'nv-view__mark nv-view__lock' : 'nv-view__mark nv-view__own'} role="img" aria-label={word} title={word}>
      {locked ? <Lock size={12} aria-hidden="true" /> : <UserRound size={12} aria-hidden="true" />}
    </span>
  )
}

/** A copy of any; rename, share, move and delete on one's own: the engine makes only the owner's views editable. */
function choices(view: View, at: number, count: number, actions: ViewActions, rename: () => void, move: (step: -1 | 1) => void): Action[] {
  const own = editable(view) && view.mine ? view : null
  return [
    { label: t('duplicate'), run: () => actions.duplicate(view) },
    ...(editable(view) ? [{ label: t('renameView'), run: rename }] : []),
    ...(own ? [{ label: t(own.shared ? 'unshare' : 'share'), run: () => actions.share(own, !own.shared) }] : []),
    ...(own && at > 0 ? [{ label: t('moveUp'), run: () => move(-1) }] : []),
    ...(own && at < count - 1 ? [{ label: t('moveDown'), run: () => move(1) }] : []),
    ...(editable(view) ? [{ label: t('delete'), run: () => actions.remove(view) }] : []),
  ]
}

/** The name in place: Enter or leaving saves, Escape cancels; an unchanged or blank name renames nothing. */
function RenameField({ view, onDone }: { view: SavedView; onDone: (name: string | null) => void }) {
  const [name, setName] = useState(view.label)
  // Enter unmounts the field, and a browser may still send its blur.
  const done = useRef(false)
  const end = (result: string | null) => {
    if (done.current) return
    done.current = true
    onDone(result)
  }
  const wanted = name.trim()
  const finish = () => end(wanted === '' || wanted === view.label ? null : wanted)
  return (
    <input className="nv-view__rename" type="text" aria-label={t('rename')} value={name} maxLength={80} autoFocus
      onFocus={(event) => event.target.select()}
      onChange={(event) => setName(event.target.value)}
      onBlur={finish}
      onKeyDown={(event) => {
        if (event.key === 'Enter') finish()
        if (event.key === 'Escape') end(null)
      }} />
  )
}

/**
 * A model's views, each by its own label. The group holds exactly those buttons — the e2e counts
 * them — so each ⋯ sits outside it: the list is one grid, and the group and the menus lay their
 * items over the same rows.
 */
export function ViewList({ table, active, onSelect, actions }: Props) {
  const [renaming, setRenaming] = useState<string | null>(null)
  const views = table.views
  const keys = views.map((view) => view.key)
  const rows = useRef(new Map<string, HTMLElement>())
  // A moved row keeps the keyboard: React may re-insert its element, and a re-inserted element loses focus.
  const refocus = useRef<string | null>(null)
  const order = (next: string[]) => actions?.order(table.key, next)
  const drag = useDragOrder(keys, rows, order)
  const move = (key: string, step: -1 | 1) => {
    refocus.current = key
    order(stepped(keys, key, step))
  }
  const onKey = (key: string, event: KeyboardEvent) => {
    if (!actions || renaming === key || !event.altKey || (event.key !== 'ArrowUp' && event.key !== 'ArrowDown')) return
    event.preventDefault()
    move(key, event.key === 'ArrowUp' ? -1 : 1)
  }
  useEffect(() => {
    const button = refocus.current ? rows.current.get(refocus.current)?.querySelector('button') : null
    refocus.current = null
    if (button && document.activeElement !== button) button.focus()
  })
  const renamed = (view: SavedView, name: string | null) => {
    setRenaming(null)
    if (name !== null) actions?.rename(view, name)
  }
  const rowClass = (key: string) => [
    'nv-view',
    drag.dragging === key && 'nv-view--dragging',
    drag.drop?.key === key && `nv-view--drop-${drag.drop.edge}`,
  ].filter(Boolean).join(' ')
  return (
    <div className="nv-rail__types">
      <div className={actions ? 'nv-views nv-views--actions' : 'nv-views'}>
        <div className="nv-views__items" role="group" aria-label={t('viewType')} onClickCapture={drag.clickCapture}>
          {views.map((view, at) => (
            <div key={view.key} className={rowClass(view.key)} style={{ gridRow: at + 1 }} title={actions ? t('dragToOrder') : undefined}
              ref={(element) => {
                if (element) rows.current.set(view.key, element)
                else rows.current.delete(view.key)
              }}
              onPointerDown={actions && renaming !== view.key ? (event) => drag.press(view.key, event) : undefined}
              onKeyDown={(event) => onKey(view.key, event)}
              onDoubleClick={() => actions && editable(view) && setRenaming(view.key)}>
              {renaming === view.key && editable(view) ? <RenameField view={view} onDone={(name) => renamed(view, name)} /> : (
                <>
                  <SidebarItem
                    icon={view.type === 'matrix' ? Grid3x3 : TableIcon}
                    label={view.label}
                    active={view.key === active}
                    activeIndicator={false}
                    onClick={() => onSelect(view.key)}
                  />
                  <Mark view={view} />
                </>
              )}
            </div>
          ))}
        </div>
        {actions && (
          <div className="nv-views__menus">
            {views.map((view, at) => renaming !== view.key && (
              <div key={view.key} className={view.key === active ? 'nv-view__menu nv-view__menu--active' : 'nv-view__menu'} style={{ gridRow: at + 1 }}>
                <MoreMenu label={`${t('moreActions')}: ${view.label}`} placement="bottom-start" actions={choices(view, at, views.length, actions, () => setRenaming(view.key), (step) => move(view.key, step))} />
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
