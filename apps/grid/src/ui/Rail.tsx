import { ChevronRight, Combine, LayoutDashboard, Plus, Rows3 } from 'lucide-react'
import { type FocusEvent, type ReactNode, useEffect, useId, useRef, useState } from 'react'
import { t } from '../i18n'
import type { Schema, View, ViewType } from '../types'
import { ICONS, iconNamed } from './icons'
import { type Action, MoreMenu } from './MoreMenu'
import { RailFoot, type Signed } from './RailFoot'
import { type Table, sectionsOf, tableOf } from './tables'
import { RenameField, type ViewActions, ViewList } from './ViewList'

/** What a model's ⋯ offers beside folding. */
export interface ModelActions {
  /** Why naming and the icon are off for this account; absent when it may change them. */
  displayBlocked?: string
  rename: (table: Table, label: string) => void
  icon: (table: Table, icon: string) => void
  /** Exports the open view: only the ⋯ of the model holding it offers it. */
  exportOpen: { run: () => void; blocked?: string }
}

const MAX_LABEL = 60

interface Props {
  tables: Table[]
  /** The served sections; the tables none lists follow in one without a label. */
  sections?: Schema['sections']
  /** The active view's key. */
  active: string | undefined
  onSelect: (viewKey: string) => void
  /** A click on another model's name; without it, the model's first view opens. */
  onTable?: (table: Table) => void
  /** The space selector, when the site works inside one: it heads the rail. */
  space?: ReactNode
  /** A kind chosen from a model's `+`; without it there is no `+`. */
  onNewView?: (table: Table, type: ViewType) => void
  /** Each view's ⋯ and its rename in place. */
  actions?: ViewActions
  /** A model's ⋯ beyond folding: its name, its icon and the export. */
  modelActions?: ModelActions
  /** The signed-in account in the foot, with sign out. */
  signed?: Signed
  /** The dashboards the reader can open, in landing order; the tree's first group. */
  dashboards?: View[]
}

export function Rail({ tables, sections, active, onSelect, onTable = (table) => table.views[0] && onSelect(table.views[0].key), space, onNewView, actions, modelActions, signed, dashboards = [] }: Props) {
  const current = tableOf(tables, active)
  const [open, setOpen] = useOpenModels(current?.key)
  const fold = (table: Table) => setOpen(table.key, !open.has(table.key))
  const openModel = (table: Table) => {
    setOpen(table.key, true)
    if (table !== current) onTable(table)
  }
  return (
    <nav className="nv-rail" aria-label={t('views')}>
      {space}
      <div className="nv-tree" role="tree" aria-label={t('views')}>
        {dashboards.length > 0 && (
          <div className="nv-tree__section nv-tree__dashboards" role="group" aria-label={t('dashboard')}>
            {dashboards.map((view) => (
              <div key={view.key} role="treeitem" aria-selected={view.key === active} className="nv-view">
                <button type="button" className="nv-view__button" aria-current={view.key === active ? 'page' : undefined} onClick={() => onSelect(view.key)}>
                  <LayoutDashboard size={14} aria-hidden="true" />
                  <span>{view.label}</span>
                </button>
              </div>
            ))}
          </div>
        )}
        {sectionsOf(tables, sections).map((section) => (
          <div key={section.label ?? ''} className="nv-tree__section" role="group" aria-label={section.label ?? undefined}>
            {section.label && <p className="nv-tree__label" aria-hidden="true">{section.label}</p>}
            {section.tables.map((table) => (
              <ModelNode key={table.key} table={table} open={open.has(table.key)} onOpen={() => openModel(table)} onFold={() => fold(table)}
                onNew={onNewView && ((type) => onNewView(table, type))} actions={modelActions} holdsActive={table === current}>
                <ViewList table={table} active={active} onSelect={onSelect} actions={actions} />
              </ModelNode>
            ))}
          </div>
        ))}
      </div>
      <RailFoot signed={signed} />
    </nav>
  )
}

interface NodeProps {
  table: Table
  open: boolean
  onOpen: () => void
  onFold: () => void
  onNew?: (type: ViewType) => void
  actions?: ModelActions
  /** The open view is one of its own. */
  holdsActive: boolean
  /** Its views, shown while it is open. */
  children: ReactNode
}

/** The kinds `+` offers: those the model can be, then the ones still to come. */
function kinds(table: Table, onNew: (type: ViewType) => void): Action[] {
  return [
    { label: t('kindGrid'), run: () => onNew('grid') },
    ...(table.types.includes('matrix') ? [{ label: t('matrix'), run: () => onNew('matrix') }] : []),
    table.types.includes('calendar')
      ? { label: t('kindCalendar'), run: () => onNew('calendar') }
      : { label: t('kindCalendar'), run: () => undefined, blocked: t('later') },
    { label: t('kindBoard'), run: () => undefined, blocked: t('later') },
  ]
}

/**
 * A model and, while open, its views. The treeitem is named by its label alone. Its row carries
 * the open and fold handlers; the views sit beside the row, so a click on one never reaches them.
 */
function ModelNode({ table, open, onOpen, onFold, onNew, actions, holdsActive, children }: NodeProps) {
  const label = useId()
  const [hot, setHot] = useState(false)
  const [renaming, setRenaming] = useState(false)
  const [picking, setPicking] = useState(false)
  const Icon = iconNamed(table.icon) ?? (table.query ? Combine : Rows3)
  const leave = (event: FocusEvent<HTMLDivElement>) => {
    if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setHot(false)
  }
  const renamed = (name: string | null) => {
    setRenaming(false)
    if (name !== null) actions?.rename(table, name)
  }
  const fold = { label: t(open ? 'fold' : 'unfold'), run: onFold }
  const more: Action[] = actions ? [
    { label: t('renameModel'), run: () => setRenaming(true), blocked: actions.displayBlocked },
    { label: t('changeIcon'), run: () => setPicking(true), blocked: actions.displayBlocked },
    { label: t('exportModel'), ...(holdsActive ? actions.exportOpen : { run: () => undefined, blocked: t('exportOpenView') }) },
    fold,
  ] : [fold]
  return (
    <div className="nv-node" role="treeitem" aria-expanded={open} aria-labelledby={label}>
      <div className="nv-model" data-hot={hot || undefined}
        onMouseEnter={() => setHot(true)} onMouseLeave={() => setHot(false)} onFocus={() => setHot(true)} onBlur={leave}>
        <button type="button" className="nv-model__lead" aria-label={t(open ? 'fold' : 'unfold')} onClick={onFold}>
          {hot ? <ChevronRight size={14} className="nv-model__chevron" aria-hidden="true" /> : <Icon size={15} aria-hidden="true" />}
        </button>
        {renaming
          ? <RenameField value={table.label} label={t('modelName', { model: table.label })} max={MAX_LABEL} onDone={renamed} />
          : <button type="button" className="nv-model__name" id={label} onClick={onOpen}>{table.label}</button>}
        {!renaming && (
          <span className="nv-model__tools">
            <MoreMenu label={t('moreFor', { model: table.label })} menu={t('moreFor', { model: table.label })} placement="bottom-start" actions={more} />
            {onNew && <MoreMenu icon={Plus} label={t('addViewTo', { model: table.label })} menu={t('addViewTo', { model: table.label })} placement="bottom-start" actions={kinds(table, onNew)} />}
          </span>
        )}
      </div>
      {picking && actions && (
        <IconPicker label={t('iconFor', { model: table.label })} current={table.icon} onClose={() => setPicking(false)} onPick={(icon) => {
          setPicking(false)
          if (icon !== table.icon) actions.icon(table, icon)
        }} />
      )}
      {open && children}
    </div>
  )
}

/** The icon set as a small grid: a click picks, Escape or leaving it closes. */
function IconPicker({ label, current, onPick, onClose }: { label: string; current: string | undefined; onPick: (icon: string) => void; onClose: () => void }) {
  const grid = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const pick = (selector: string) => grid.current?.querySelector<HTMLButtonElement>(selector)
    const first = pick('[aria-pressed="true"]') ?? pick('button')
    first?.focus()
  }, [])
  return (
    <div ref={grid} className="nv-icons" role="group" aria-label={label}
      onKeyDown={(event) => event.key === 'Escape' && onClose()}
      onBlur={(event) => !event.currentTarget.contains(event.relatedTarget as Node | null) && onClose()}>
      {ICONS.map(({ name, icon: Icon, label: named }) => (
        <button key={name} type="button" className="nv-icons__pick" aria-label={named} title={named} aria-pressed={name === current} onClick={() => onPick(name)}>
          <Icon size={16} aria-hidden="true" />
        </button>
      ))}
    </div>
  )
}

const OPEN_KEY = `ntdst-views:${window.location.host}:open-models`

function storedOpen(): string[] | null {
  try {
    const value: unknown = JSON.parse(window.localStorage.getItem(OPEN_KEY) ?? 'null')
    return Array.isArray(value) ? value.filter((key): key is string => typeof key === 'string') : null
  } catch {
    return null
  }
}

/**
 * The open models, kept in this browser. A model whose view becomes the active one opens; on a
 * first visit that is the landing view's, after that what was stored stays as it was left.
 */
function useOpenModels(current: string | undefined): [Set<string>, (key: string, open: boolean) => void] {
  const [open, setAll] = useState(() => new Set(storedOpen() ?? []))
  const seen = useRef<string | undefined>(undefined)
  const set = (key: string, wanted: boolean) => setAll((was) => {
    if (was.has(key) === wanted) return was
    const next = new Set(was)
    if (wanted) next.add(key)
    else next.delete(key)
    try {
      window.localStorage.setItem(OPEN_KEY, JSON.stringify([...next]))
    } catch {
      // Blocked storage: the tree stays as it is for this visit.
    }
    return next
  })
  useEffect(() => {
    if (!current || current === seen.current) return
    const landing = seen.current === undefined && storedOpen() !== null
    seen.current = current
    if (!landing) set(current, true)
  }, [current])
  return [open, set]
}
