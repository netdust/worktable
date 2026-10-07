import { ChevronRight, Combine, Plus, Rows3 } from 'lucide-react'
import { type FocusEvent, type ReactNode, useEffect, useId, useRef, useState } from 'react'
import { t } from '../i18n'
import type { Schema, ViewType } from '../types'
import { type Action, MoreMenu } from './MoreMenu'
import { RailFoot, type Signed } from './RailFoot'
import { type Table, sectionsOf, tableOf } from './tables'
import { type ViewActions, ViewList } from './ViewList'

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
  /** The signed-in account in the foot, with sign out. */
  signed?: Signed
}

export function Rail({ tables, sections, active, onSelect, onTable = (table) => table.views[0] && onSelect(table.views[0].key), space, onNewView, actions, signed }: Props) {
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
        {sectionsOf(tables, sections).map((section) => (
          <div key={section.label ?? ''} className="nv-tree__section" role="group" aria-label={section.label ?? undefined}>
            {section.label && <p className="nv-tree__label" aria-hidden="true">{section.label}</p>}
            {section.tables.map((table) => (
              <ModelNode key={table.key} table={table} open={open.has(table.key)} onOpen={() => openModel(table)} onFold={() => fold(table)}
                onNew={onNewView && ((type) => onNewView(table, type))}>
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
  /** Its views, shown while it is open. */
  children: ReactNode
}

/** The kinds `+` offers: those the model can be, then the ones still to come. */
function kinds(table: Table, onNew: (type: ViewType) => void): Action[] {
  return [
    { label: t('kindGrid'), run: () => onNew('grid') },
    ...(table.types.includes('matrix') ? [{ label: t('matrix'), run: () => onNew('matrix') }] : []),
    { label: t('kindCalendar'), run: () => undefined, blocked: t('later') },
    { label: t('kindBoard'), run: () => undefined, blocked: t('later') },
  ]
}

/**
 * A model and, while open, its views. The treeitem is named by its label alone. Its row carries
 * the open and fold handlers; the views sit beside the row, so a click on one never reaches them.
 */
function ModelNode({ table, open, onOpen, onFold, onNew, children }: NodeProps) {
  const label = useId()
  const [hot, setHot] = useState(false)
  const Icon = table.query ? Combine : Rows3
  const leave = (event: FocusEvent<HTMLDivElement>) => {
    if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setHot(false)
  }
  const more: Action[] = [{ label: t(open ? 'fold' : 'unfold'), run: onFold }]
  return (
    <div className="nv-node" role="treeitem" aria-expanded={open} aria-labelledby={label}>
      <div className="nv-model" data-hot={hot || undefined}
        onMouseEnter={() => setHot(true)} onMouseLeave={() => setHot(false)} onFocus={() => setHot(true)} onBlur={leave}>
        <button type="button" className="nv-model__lead" aria-label={t(open ? 'fold' : 'unfold')} onClick={onFold}>
          {hot ? <ChevronRight size={14} className="nv-model__chevron" aria-hidden="true" /> : <Icon size={15} aria-hidden="true" />}
        </button>
        <button type="button" className="nv-model__name" id={label} onClick={onOpen}>{table.label}</button>
        <span className="nv-model__tools">
          {onNew && <MoreMenu icon={Plus} label={t('addViewTo', { model: table.label })} menu={t('addViewTo', { model: table.label })} placement="bottom-start" actions={kinds(table, onNew)} />}
          <MoreMenu label={t('moreFor', { model: table.label })} menu={t('moreFor', { model: table.label })} placement="bottom-start" actions={more} />
        </span>
      </div>
      {open && children}
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
