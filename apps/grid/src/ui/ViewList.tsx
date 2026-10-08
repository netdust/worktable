import { Combine, Grid3x3, GripVertical, Lock, Table as TableIcon, UserRound, Users } from 'lucide-react'
import { type KeyboardEvent, useEffect, useRef, useState } from 'react'
import { usePress } from 'react-aria'
import { Button, DropIndicator, type DropTarget, GridList, GridListItem, type Key, useDragAndDrop } from 'react-aria-components'
import { t } from '../i18n'
import type { SavedView, View } from '../types'
import { type Action, MoreMenu } from './MoreMenu'
import type { Table } from './tables'
import { hint } from './hint'
import { type Edge, isSaved, lockOf, moved, stepped } from './views'

/** What a view's ⋯ can do; each is offered only where the user may do it. */
export interface ViewActions {
  rename: (view: SavedView, name: string) => void
  duplicate: (view: View) => void
  remove: (view: SavedView) => void
  share: (view: SavedView, shared: boolean) => void
  /** One source's views in this user's new order, by key. */
  order: (source: string, keys: string[]) => void
}

interface Props {
  table: Table
  active: string | undefined
  onSelect: (viewKey: string) => void
  /** Without them there is no ⋯ and no rename. */
  actions?: ViewActions
}

const editable = (view: View): view is SavedView => isSaved(view) && view.editable

/** A view's mark: a lock on a default, a pair of people on a colleague's, a person on one's own unshared view. */
function Mark({ view }: { view: View }) {
  const lock = lockOf(view)
  if (!lock && !(isSaved(view) && view.mine && !view.shared)) return null
  const word = t(lock === 'standard' ? 'readOnlyView' : lock === 'colleague' ? 'colleagueView' : 'mine')
  const Icon = lock === 'standard' ? Lock : lock === 'colleague' ? Users : UserRound
  return (
    <span className={lock ? 'nv-view__mark nv-view__lock' : 'nv-view__mark nv-view__own'} role="img" aria-label={word} title={word}>
      <Icon size={12} aria-hidden="true" />
    </span>
  )
}

/** A copy of any; rename, share, move and delete on one's own: the engine makes only the owner's views editable. */
function choices(view: View, block: string[], actions: ViewActions, rename: () => void, move: (step: -1 | 1) => void): Action[] {
  const own = editable(view) && view.mine ? view : null
  const at = block.indexOf(view.key)
  return [
    { label: t('duplicate'), run: () => actions.duplicate(view) },
    ...(editable(view) ? [{ label: t('renameView'), run: rename }] : []),
    ...(own ? [{ label: t(own.shared ? 'unshare' : 'share'), run: () => actions.share(own, !own.shared) }] : []),
    ...(own && at > 0 ? [{ label: t('moveUp'), run: () => move(-1) }] : []),
    ...(own && at < block.length - 1 ? [{ label: t('moveDown'), run: () => move(1) }] : []),
    ...(editable(view) ? [{ label: t('delete'), run: () => actions.remove(view) }] : []),
  ]
}

/** The name in place: Enter or leaving saves, Escape cancels; an unchanged or blank name renames nothing. */
export function RenameField({ value, label, max, onDone }: { value: string; label: string; max: number; onDone: (name: string | null) => void }) {
  const [name, setName] = useState(value)
  // Enter unmounts the field, and a browser may still send its blur.
  const done = useRef(false)
  const end = (result: string | null) => {
    if (done.current) return
    done.current = true
    onDone(result)
  }
  const wanted = name.trim()
  const finish = () => end(wanted === '' || wanted === value ? null : wanted)
  return (
    <input className="nv-view__rename" type="text" aria-label={label} value={name} maxLength={max} autoFocus
      onFocus={(event) => event.target.select()}
      onChange={(event) => setName(event.target.value)}
      onBlur={finish}
      onKeyDown={(event) => {
        if (event.key === 'Enter') finish()
        if (event.key === 'Escape') end(null)
      }} />
  )
}

const VIEW = 'application/x-worktable-view'

interface Spot {
  key: string
  edge: Edge
}

/**
 * Where a drop lands in the dragged view's block: beside one of the block's views, so the gap after its
 * last view counts even where the next group starts. Nowhere outside the block, nor where nothing would move.
 */
function landing(all: string[], block: string[], key: string, target: DropTarget): Spot | null {
  if (target.type !== 'item' || target.dropPosition === 'on') return null
  const gap = all.indexOf(String(target.key)) + (target.dropPosition === 'after' ? 1 : 0)
  const next = all[gap]
  const previous = all[gap - 1]
  const spot: Spot | null = next !== undefined && block.includes(next) ? { key: next, edge: 'before' }
    : previous !== undefined && block.includes(previous) ? { key: previous, edge: 'after' } : null
  return spot && moved(block, key, spot.key, spot.edge).join() !== block.join() ? spot : null
}

/** A view's own button: it opens the view. The row around it is the list's tab stop and carries the drag. */
function ViewButton({ view, active, onSelect, onRename }: { view: View; active: boolean; onSelect: () => void; onRename: () => void }) {
  const { pressProps } = usePress({ onPress: onSelect })
  const Icon = view.type === 'matrix' ? Grid3x3 : view.query ? Combine : TableIcon
  return (
    // A click focuses it: the grid must not take that focus to its first row.
    <button type="button" {...pressProps} className="nv-view__button" tabIndex={-1} aria-current={active ? 'page' : undefined} onDoubleClick={onRename}
      onFocus={(event) => event.stopPropagation()}>
      <span className="nv-view__icon" aria-hidden="true"><Icon size={18} /></span>
      <span className="nv-view__label">{view.label}</span>
    </button>
  )
}

/**
 * A model's views, each by its own label. The group holds those buttons and each row's drag button;
 * each ⋯ sits outside it: the list is one grid, and the group and the menus lay their items over the same rows.
 */
export function ViewList({ table, active, onSelect, actions }: Props) {
  const [renaming, setRenaming] = useState<string | null>(null)
  const views = table.views
  // A view moves only among its own source's views: the table's own, or one query's.
  const sourceOf = (key: string) => views.find((view) => view.key === key)?.table
  const blockOf = (key: string) => views.filter((view) => view.table === sourceOf(key)).map((view) => view.key)
  const spotOf = (key: string, target: DropTarget) => landing(views.map((view) => view.key), blockOf(key), key, target)
  const rows = useRef(new Map<string, HTMLElement>())
  // A moved row keeps the keyboard: React may re-insert its element, and a re-inserted element loses focus.
  const refocus = useRef<string | null>(null)
  // Only this list's own drag may land in it.
  const dragging = useRef<string | null>(null)
  const order = (next: string[]) => {
    const source = next[0] === undefined ? undefined : sourceOf(next[0])
    if (source) actions?.order(source, next)
  }
  const reorder = (key: string, target: DropTarget) => {
    const spot = spotOf(key, target)
    if (spot) order(moved(blockOf(key), key, spot.key, spot.edge))
  }
  const { dragAndDropHooks } = useDragAndDrop({
    getItems: (keys) => [...keys].map((key) => ({ [VIEW]: String(key) })),
    acceptedDragTypes: [VIEW],
    onDragStart: (event) => (dragging.current = String([...event.keys][0])),
    onDragEnd: () => (dragging.current = null),
    getDropOperation: (target) => (dragging.current !== null && spotOf(dragging.current, target) ? 'move' : 'cancel'),
    onReorder: (event) => reorder(String([...event.keys][0]), event.target),
    renderDropIndicator: (target) => <DropIndicator target={target} className={dropClass(target)} style={{ gridRow: rowOf(target) }} />,
  })
  const rowOf = (target: DropTarget) => (target.type === 'item' ? views.findIndex((view) => view.key === target.key) + 1 : 1)
  const move = (key: string, step: -1 | 1) => {
    refocus.current = key
    order(stepped(blockOf(key), key, step))
  }
  const onKey = (event: KeyboardEvent<HTMLElement>) => {
    const key = (event.target as HTMLElement).closest<HTMLElement>('[data-view]')?.dataset.view
    if (!actions || !key || renaming === key || !event.altKey || (event.key !== 'ArrowUp' && event.key !== 'ArrowDown')) return
    event.preventDefault()
    event.stopPropagation()
    move(key, event.key === 'ArrowUp' ? -1 : 1)
  }
  useEffect(() => {
    const button = refocus.current ? rows.current.get(refocus.current)?.querySelector<HTMLElement>('.nv-view__button') : null
    refocus.current = null
    if (button && document.activeElement !== button) button.focus()
  })
  const renamed = (view: SavedView, name: string | null) => {
    setRenaming(null)
    if (name !== null) actions?.rename(view, name)
  }
  const rowRef = (key: string) => (element: HTMLElement | null) => {
    if (element) rows.current.set(key, element)
    else rows.current.delete(key)
    hint(actions ? t('dragToOrder') : null)(element)
  }
  return (
    <div className="nv-rail__types">
      <div className={actions ? 'nv-views nv-views--actions' : 'nv-views'}>
        <div className="nv-views__items" role="group" aria-label={t('viewType')} onKeyDownCapture={onKey}>
          <GridList aria-label={t('viewType')} className="nv-views__list" style={{ gridRow: `1 / span ${Math.max(1, views.length)}` }}
            keyboardNavigationBehavior="tab" disallowTypeAhead onAction={(key: Key) => onSelect(String(key))}
            dragAndDropHooks={actions ? dragAndDropHooks : undefined}>
            {views.map((view, at) => (
              <GridListItem key={view.key} id={view.key} textValue={view.label} className="nv-view" style={{ gridRow: at + 1 }} data-view={view.key}
                ref={rowRef(view.key)}>
                {renaming === view.key && editable(view) ? (
                  // The grid would pull the focus back to its row and end the rename: the field keeps it.
                  <span className="nv-view__renaming" onFocus={(event) => event.stopPropagation()}>
                    <RenameField value={view.label} label={t('rename')} max={80} onDone={(name) => renamed(view, name)} />
                  </span>
                ) : (
                  <>
                    <ViewButton view={view} active={view.key === active} onSelect={() => onSelect(view.key)} onRename={() => actions && editable(view) && setRenaming(view.key)} />
                    {actions && (
                      <Button slot="drag" className="nv-view__drag" aria-label={t('moveView', { name: view.label })}>
                        <GripVertical size={14} aria-hidden="true" />
                      </Button>
                    )}
                    <Mark view={view} />
                  </>
                )}
              </GridListItem>
            ))}
          </GridList>
        </div>
        {actions && (
          <div className="nv-views__menus">
            {views.map((view, at) => renaming !== view.key && (
              <div key={view.key} className={view.key === active ? 'nv-view__menu nv-view__menu--active' : 'nv-view__menu'} style={{ gridRow: at + 1 }}>
                <MoreMenu label={`${t('moreActions')}: ${view.label}`} hint={`${t('moreActionsShown')}: ${view.label}`} placement="bottom-start" actions={choices(view, blockOf(view.key), actions, () => setRenaming(view.key), (step) => move(view.key, step))} />
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

const dropClass = (target: DropTarget) => `nv-view__drop nv-view__drop--${target.type === 'item' && target.dropPosition === 'after' ? 'after' : 'before'}`
