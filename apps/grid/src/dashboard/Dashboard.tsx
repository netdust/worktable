import { Plus } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { columnsFor } from '../grid/columns'
import { Drawer } from '../grid/Drawer'
import { t } from '../i18n'
import type { Account, Model, Row, SavedView, Scope, TableDef, Tile } from '../types'
import { ChipBar } from '../ui/ChipBar'
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
  const refresh = () => setVersion((n) => n + 1)
  useEffect(() => {
    window.addEventListener('focus', refresh)
    return () => window.removeEventListener('focus', refresh)
  }, [])
  const [opened, setOpened] = useState<{ row: Row; view: SavedView } | null>(null)
  const [creating, setCreating] = useState<{ create: string; label: string } | null>(null)
  const drawerColumns = useMemo(() => {
    const model = opened ? models[opened.view.model] : undefined
    return model && opened ? columnsFor(model, { ...opened.view, columns: undefined, lookups: undefined, rollups: undefined }, false, models) : []
  }, [opened, models])
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
          onOpen={() => onOpenView(view.key)} onChanged={refresh} />
      )
    }
    if (tile.kind === 'week') {
      const view = viewOf(tile.view) as SavedView
      return (
        <WeekTile key={at} view={view} model={models[view.model]} scope={scope} version={version} onOpen={() => onOpenView(view.key)}
          onOpenRow={(row) => setOpened({ row, view })} />
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
      ))} end={!editing && <button type="button" className="nv-bar__button nv-dash__edit" onClick={() => setEditing(true)}>{t('edit')}</button>} />
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
        {opened && <Drawer row={opened.row} columns={drawerColumns} focusOnOpen={false} onClose={() => setOpened(null)} />}
      </div>
      {creating && models[creating.create] && (
        <QuickCreate label={creating.label} model={models[creating.create]} tables={tables} scope={scope}
          onClose={() => setCreating(null)} onCreated={refresh} />
      )}
    </div>
  )
}
