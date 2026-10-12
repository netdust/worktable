import { useState } from 'react'
import { createView, updateView } from '../api'
import { errorText, t } from '../i18n'
import type { Account, ApiError, DashboardLayout, SavedView, Tile } from '../types'

type Kind = Tile['kind']
const KINDS: Kind[] = ['stat', 'list', 'week', 'progress']

const move = <T,>(list: T[], at: number, by: number): T[] => {
  const to = at + by
  if (to < 0 || to >= list.length) return list
  const next = [...list]
  ;[next[at], next[to]] = [next[to], next[at]]
  return next
}

function tileFor(kind: Kind, view: SavedView): Tile {
  if (kind === 'stat') return { kind, view: view.id, measure: 'count' }
  if (kind === 'list') return { kind, view: view.id, rows: 5 }
  if (kind === 'week') return { kind, view: view.id }
  return { kind, done: view.id, total: view.id, label: view.label }
}

const tileName = (tile: Tile, label: (id: number) => string) =>
  tile.kind === 'progress' ? `${t(`tile.${tile.kind}`)}: ${label(tile.done)} / ${label(tile.total)}` : `${t(`tile.${tile.kind}`)}: ${label(tile.view)}`

/** One section in edit mode: its name, its tiles in order, and a tile to add. */
function SectionEditor({ section, views, onChange, onMove, onRemove }: {
  section: DashboardLayout['sections'][number]; views: SavedView[]
  onChange: (next: DashboardLayout['sections'][number]) => void; onMove: (by: number) => void; onRemove: () => void
}) {
  const [kind, setKind] = useState<Kind>('stat')
  const offered = views.filter((v) => kind !== 'week' || v.type === 'calendar')
  const [pick, setPick] = useState<string>('')
  const label = (id: number) => views.find((v) => v.id === id)?.label ?? `#${id}`
  const tiles = section.tiles
  const add = () => {
    const view = offered.find((v) => String(v.id) === pick) ?? offered[0]
    if (view) onChange({ ...section, tiles: [...tiles, tileFor(kind, view)] })
  }
  return (
    <fieldset className="nv-compose__section" role="group" aria-label={t('sectionNamed', { name: section.label })}>
      <div className="nv-compose__row">
        <input aria-label={t('sectionName')} value={section.label} onChange={(e) => onChange({ ...section, label: e.target.value })} />
        <button type="button" className="nv-bar__button" aria-label={t('up')} onClick={() => onMove(-1)}>↑</button>
        <button type="button" className="nv-bar__button" aria-label={t('down')} onClick={() => onMove(1)}>↓</button>
        <button type="button" className="nv-bar__button" aria-label={t('removeSection')} onClick={onRemove}>✕</button>
      </div>
      <ol className="nv-compose__tiles">
        {tiles.map((tile, at) => (
          <li key={at} className="nv-compose__row">
            <span>{tileName(tile, label)}</span>
            <button type="button" className="nv-bar__button" aria-label={t('up')} onClick={() => onChange({ ...section, tiles: move(tiles, at, -1) })}>↑</button>
            <button type="button" className="nv-bar__button" aria-label={t('down')} onClick={() => onChange({ ...section, tiles: move(tiles, at, 1) })}>↓</button>
            <button type="button" className="nv-bar__button" aria-label={t('removeTile')} onClick={() => onChange({ ...section, tiles: tiles.filter((_, i) => i !== at) })}>✕</button>
          </li>
        ))}
      </ol>
      <div className="nv-compose__row">
        <select aria-label={t('tileKind')} value={kind} onChange={(e) => setKind(e.target.value as Kind)}>
          {KINDS.map((k) => <option key={k} value={k}>{t(`tile.${k}`)}</option>)}
        </select>
        <select aria-label={t('tileView')} value={pick} onChange={(e) => setPick(e.target.value)}>
          {offered.map((v) => <option key={v.id} value={v.id}>{v.label}</option>)}
        </select>
        <button type="button" className="nv-bar__button" onClick={add}>{t('addTile')}</button>
      </div>
    </fieldset>
  )
}

/**
 * A dashboard in edit mode. Its own dashboard saves in place; any other saves as a copy that then lands:
 * an administrator's copy is shared with everyone, anyone else's stays theirs.
 */
export function Composer({ dashboard, views, role, onDone, onSaved }: {
  dashboard: SavedView; views: SavedView[]; role: Account['role']; onDone: () => void; onSaved: (view: SavedView) => void
}) {
  const [layout, setLayout] = useState<DashboardLayout>(dashboard.layout ?? { sections: [], actions: [] })
  const [refusal, setRefusal] = useState<string | null>(null)
  const sections = layout.sections
  const setSections = (next: DashboardLayout['sections']) => setLayout({ ...layout, sections: next })
  const save = () => {
    setRefusal(null)
    const saved = dashboard.editable
      ? updateView(dashboard, { layout })
      : createView({ name: dashboard.label, table: dashboard.table, type: 'dashboard', field: null, shared: role === 'administrator', arrangement: dashboard.arrangement, layout })
    saved.then((view) => {
      onSaved(view)
      onDone()
    }, (error: ApiError) => setRefusal(errorText(error.code, error.message)))
  }
  return (
    <div className="nv-compose">
      {sections.map((section, at) => (
        <SectionEditor key={at} section={section} views={views}
          onChange={(next) => setSections(sections.map((s, i) => (i === at ? next : s)))}
          onMove={(by) => setSections(move(sections, at, by))} onRemove={() => setSections(sections.filter((_, i) => i !== at))} />
      ))}
      <button type="button" className="nv-bar__button" onClick={() => setSections([...sections, { label: t('newSection'), tiles: [] }])}>{t('addSection')}</button>
      {refusal && <p className="nv-tile__refusal" role="alert">{refusal}</p>}
      <div className="nv-dialog__actions">
        <button type="button" className="nv-bar__button" onClick={onDone}>{t('cancel')}</button>
        <button type="button" className="nv-button nv-button--primary nv-button--sm" onClick={save}>{t('save')}</button>
      </div>
    </div>
  )
}
