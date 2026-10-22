import { Plus } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { columnsFor } from '../grid/columns'
import { Drawer } from '../grid/Drawer'
import { useReread } from '../grid/drawerWrite'
import { locale, t } from '../i18n'
import type { Account, Model, Row, SavedView, Scope, TableDef, Tile } from '../types'
import { ChipBar } from '../ui/ChipBar'
import type { Flags } from '../ui/useFlags'
import { Composer } from './Composer'
import { ProgressTile } from './ProgressTile'
import { QuickCreate } from './QuickCreate'
import { WeekTile } from './WeekTile'
import { ListTile } from './ListTile'
import { StatTile } from './StatTile'

interface Props {
  dashboard: SavedView
  /** The saved views the reader can list; a tile on any other says so. */
  views: SavedView[]
  models: Record<string, Model>
  /** The declared tables, for what a quick create fills in. */
  tables: TableDef[]
  /** The space switcher's choice, applied to each tile whose view the space scopes. */
  scope: Scope | null
  role: Account['role']
  onOpenView: (key: string) => void
  /** A composed dashboard was saved, in place or as a copy; it opens. */
  onSaved: (view: SavedView) => void
}

const viewsOf = (tile: Tile): number[] => (tile.kind === 'progress' ? [tile.done, tile.total] : [tile.view])

/** The page the grid opens on: sections of tiles over saved views, fresh on every return to the window. */
export function Dashboard({ dashboard, views, models, tables, scope, role, onOpenView, onSaved }: Props) {
  const [editing, setEditing] = useState(false)
  const [version, setVersion] = useState(0)
  // When its tiles were last read: on opening, and on every return to the window.
  const [read, setRead] = useState(() => new Date())
  const refresh = () => {
    setVersion((n) => n + 1)
    setRead(new Date())
  }
  useEffect(() => {
    window.addEventListener('focus', refresh)
    return () => window.removeEventListener('focus', refresh)
  }, [])
  const [opened, setOpened] = useState<{ row: Row; view: SavedView; flags?: Flags | null } | null>(null)
  const reread = useReread()
  const [creating, setCreating] = useState<{ create: string; label: string } | null>(null)
  const drawerColumns = useMemo(() => {
    const model = opened ? models[opened.view.model] : undefined
    return model && opened ? columnsFor(model, { ...opened.view, columns: undefined, lookups: undefined, rollups: undefined }, false, models) : []
  }, [opened, models])
  const openedNow = useRef(opened)
  openedNow.current = opened
  // A re-read lands only on the drawer it was made for. The tiles are read again only when the record's state moved: a press, an Undo, an outside change.
  const follow = (model: string) => (row: Row) => {
    const was = openedNow.current
    if (!was || was.view.model !== model || was.row.id !== row.id) return
    const column = models[model]?.lifecycle
    setOpened((now) => (now && now.view.model === model && now.row.id === row.id ? { ...now, row } : now))
    if (column !== undefined && row.fields[column] !== was.row.fields[column]) refresh()
  }
  const viewOf = (id: number) => views.find((v) => v.id === id)
  const tileOf = (tile: Tile, at: number) => {
    const missing = viewsOf(tile).some((id) => !viewOf(id))
    if (missing) return <section key={at} className="nv-tile nv-tile--none">{t('noAccess')}</section>
    if (tile.kind === 'stat') {
      const view = viewOf(tile.view) as SavedView
      return <StatTile key={at} tile={tile} view={view} model={models[view.model]} scope={scope} version={version} onOpen={() => onOpenView(view.key)} />
    }
    if (tile.kind === 'list') {
      const view = viewOf(tile.view) as SavedView
      return (
        <ListTile key={at} tile={tile} view={view} model={models[view.model]} models={models} scope={scope} version={version}
          onOpen={() => onOpenView(view.key)} onChanged={refresh} onOpenRow={(row) => setOpened({ row, view })} />
      )
    }
    if (tile.kind === 'week') {
      const view = viewOf(tile.view) as SavedView
      return (
        <WeekTile key={at} view={view} model={models[view.model]} scope={scope} version={version} onOpen={() => onOpenView(view.key)}
          onOpenRow={(row, flags) => setOpened({ row, view, flags })} />
      )
    }
    const done = viewOf(tile.done) as SavedView
    return (
      <ProgressTile key={at} label={tile.label} done={done} total={viewOf(tile.total) as SavedView} scope={scope} version={version}
        onOpen={() => onOpenView(done.key)} />
    )
  }
  const sections = dashboard.layout?.sections ?? []
  const actions = (dashboard.layout?.actions ?? []).filter((action) => models[action.create])
  return (
    <div className="nv-frame">
      <ChipBar actions={actions.map((action) => (
        <button key={action.create} type="button" className="nv-chip" onClick={() => setCreating(action)}><Plus size={14} aria-hidden="true" />{action.label}</button>
      ))} end={!editing && <>
        <span className="nv-bar__count nv-bar__updated">{t('updatedAt', { time: read.toLocaleTimeString(locale(), { hour: '2-digit', minute: '2-digit' }) })}</span>
        <button type="button" className="nv-bar__button nv-dash__edit" onClick={() => setEditing(true)}>{t('edit')}</button>
      </>} />
      <div className="nv-body">
        {editing ? (
          <div className="nv-dash"><Composer dashboard={dashboard} views={views} models={models} role={role} onDone={() => setEditing(false)} onSaved={onSaved} /></div>
        ) : (
        <div className="nv-dash">
          {sections.length === 0 && <p className="nv-tile__note">{t('dashboardEmpty')}</p>}
          {sections.map((section, s) => (
            <section key={s} className="nv-dash__section" aria-label={section.label}>
              <h2 className="nv-dash__heading">{section.label}</h2>
              <div className="nv-dash__tiles">{section.tiles.map(tileOf)}</div>
            </section>
          ))}
        </div>
        )}
        {opened && <Drawer row={opened.row} columns={drawerColumns} focusOnOpen={false} onClose={() => setOpened(null)} model={models[opened.view.model]} flags={opened.flags}
          onDone={reread(opened.view.model, opened.row.id, follow(opened.view.model))} />}
      </div>
      {creating && models[creating.create] && (
        <QuickCreate label={creating.label} model={models[creating.create]} tables={tables} scope={scope}
          onClose={() => setCreating(null)} onCreated={refresh} />
      )}
    </div>
  )
}
