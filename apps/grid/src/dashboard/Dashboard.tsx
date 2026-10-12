import { useEffect, useState } from 'react'
import { t } from '../i18n'
import type { Model, SavedView, Scope, Tile } from '../types'
import { ListTile } from './ListTile'
import { StatTile } from './StatTile'

interface Props {
  dashboard: SavedView
  /** The saved views the reader can list; a tile on any other says so. */
  views: SavedView[]
  models: Record<string, Model>
  /** The space switcher's choice, applied to each tile whose view the space scopes. */
  scope: Scope | null
  onOpenView: (key: string) => void
}

const viewsOf = (tile: Tile): number[] => (tile.kind === 'progress' ? [tile.done, tile.total] : [tile.view])

/** The page the grid opens on: sections of tiles over saved views, fresh on every return to the window. */
export function Dashboard({ dashboard, views, models, scope, onOpenView }: Props) {
  const [version, setVersion] = useState(0)
  const refresh = () => setVersion((n) => n + 1)
  useEffect(() => {
    window.addEventListener('focus', refresh)
    return () => window.removeEventListener('focus', refresh)
  }, [])
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
    return null
  }
  const sections = dashboard.layout?.sections ?? []
  return (
    <div className="nv-frame nv-dash">
      {sections.length === 0 && <p className="nv-tile__note">{t('dashboardEmpty')}</p>}
      {sections.map((section, s) => (
        <section key={s} className="nv-dash__section" aria-label={section.label}>
          <h2 className="nv-dash__heading">{section.label}</h2>
          <div className="nv-dash__tiles">{section.tiles.map(tileOf)}</div>
        </section>
      ))}
    </div>
  )
}
