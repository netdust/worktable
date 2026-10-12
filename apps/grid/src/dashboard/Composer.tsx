import { useState } from 'react'
import { createView, updateView } from '../api'
import { errorText, t } from '../i18n'
import type { Account, ApiError, DashboardLayout, Model, SavedView, Tile } from '../types'

type Kind = Tile['kind']
type Section = DashboardLayout['sections'][number]
const KINDS: Kind[] = ['stat', 'list', 'week', 'progress']
const TONES = ['warn', 'bad'] as const

const move = <T,>(list: T[], at: number, by: number): T[] => {
  const to = at + by
  if (to < 0 || to >= list.length) return list
  const next = [...list]
  ;[next[at], next[to]] = [next[to], next[at]]
  return next
}

/** What a tile's form holds beside its kind and view; each kind reads its own. */
interface Options {
  label: string
  tone: '' | (typeof TONES)[number]
  above: number
  rows: number
  total: string
  column: string
  value: string
  setLabel: string
}
const NO_OPTIONS: Options = { label: '', tone: '', above: 0, rows: 5, total: '', column: '', value: '', setLabel: '' }

function tileFor(kind: Kind, view: SavedView, o: Options, total: SavedView): Tile {
  const label = o.label.trim()
  if (kind === 'stat')
    return { kind, view: view.id, measure: 'count', ...(label ? { label } : {}), ...(o.tone ? { tone: { above: o.above, tone: o.tone } } : {}) }
  if (kind === 'list') {
    const set = o.column && o.value ? { set: { column: o.column, value: o.value, label: o.setLabel.trim() || o.value } } : {}
    return { kind, view: view.id, rows: o.rows, ...set }
  }
  if (kind === 'week') return { kind, view: view.id }
  return { kind, done: view.id, total: total.id, label: label || view.label }
}

/** The columns a list's button may set on a view's rows: an option column that writes, with the options it writes. */
function settable(view: SavedView | undefined, models: Record<string, Model>): { key: string; label: string; options: Record<string, string> }[] {
  const fields = (view && models[view.model]?.fields) ?? {}
  return Object.entries(fields).flatMap(([key, field]) => {
    const target = field.writes ? models[field.writes.dataset]?.fields[field.writes.field] : field
    const options = field.options ?? target?.options
    if (!options || field.readonly || field.relation) return []
    return [{ key, label: field.label, options }]
  })
}

const tileName = (tile: Tile, label: (id: number) => string) =>
  tile.kind === 'progress' ? `${t(`tile.${tile.kind}`)}: ${label(tile.done)} / ${label(tile.total)}` : `${t(`tile.${tile.kind}`)}: ${label(tile.view)}`

/** One section in edit mode: its name, its tiles in order, and a tile to add. */
function SectionEditor({ section, views, models, onChange, onMove, onRemove }: {
  section: Section; views: SavedView[]; models: Record<string, Model>
  onChange: (next: Section) => void; onMove: (by: number) => void; onRemove: () => void
}) {
  const label = (id: number) => views.find((v) => v.id === id)?.label ?? `#${id}`
  const tiles = section.tiles
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
      <TileForm views={views} models={models} onAdd={(tile) => onChange({ ...section, tiles: [...tiles, tile] })} />
    </fieldset>
  )
}

/** A new tile: its kind, its view, then the options its kind takes. */
function TileForm({ views, models, onAdd }: { views: SavedView[]; models: Record<string, Model>; onAdd: (tile: Tile) => void }) {
  const [kind, setKind] = useState<Kind>('stat')
  const [pick, setPick] = useState('')
  const [o, setO] = useState<Options>(NO_OPTIONS)
  const offered = views.filter((v) => kind !== 'week' || v.type === 'calendar')
  const view = offered.find((v) => String(v.id) === pick) ?? offered[0]
  const columns = settable(view, models)
  const column = columns.find((c) => c.key === o.column)
  const set = (patch: Partial<Options>) => setO((was) => ({ ...was, ...patch }))
  const add = () => {
    if (!view) return
    onAdd(tileFor(kind, view, o, views.find((v) => String(v.id) === o.total) ?? view))
    setO(NO_OPTIONS)
  }
  const viewPicker = (name: string, value: string, onPick: (value: string) => void, from: SavedView[]) => (
    <select aria-label={name} value={value} onChange={(e) => onPick(e.target.value)}>
      {from.map((v) => <option key={v.id} value={v.id}>{v.label}</option>)}
    </select>
  )
  return (
    <div className="nv-compose__row nv-compose__new">
      <select aria-label={t('tileKind')} value={kind} onChange={(e) => setKind(e.target.value as Kind)}>
        {KINDS.map((k) => <option key={k} value={k}>{t(`tile.${k}`)}</option>)}
      </select>
      {viewPicker(t('tileView'), pick, (value) => { setPick(value); set({ column: '', value: '' }) }, offered)}
      {(kind === 'stat' || kind === 'progress') && (
        <input aria-label={t('tileLabel')} value={o.label} maxLength={80} onChange={(e) => set({ label: e.target.value })} />
      )}
      {kind === 'stat' && (
        <>
          <select aria-label={t('tileTone')} value={o.tone} onChange={(e) => set({ tone: e.target.value as Options['tone'] })}>
            <option value="">{t('tone.none')}</option>
            {TONES.map((tone) => <option key={tone} value={tone}>{t(`tone.${tone}`)}</option>)}
          </select>
          {o.tone && <input aria-label={t('tileAbove')} type="number" min={0} value={o.above} onChange={(e) => set({ above: Number(e.target.value) })} />}
        </>
      )}
      {kind === 'list' && (
        <>
          <input aria-label={t('tileRows')} type="number" min={1} max={50} value={o.rows} onChange={(e) => set({ rows: Number(e.target.value) })} />
          <select aria-label={t('tileSet')} value={o.column} onChange={(e) => set({ column: e.target.value, value: '' })}>
            <option value="">{t('noSet')}</option>
            {columns.map((c) => <option key={c.key} value={c.key}>{c.label}</option>)}
          </select>
          {column && (
            <>
              <select aria-label={t('tileSetValue')} value={o.value} onChange={(e) => set({ value: e.target.value })}>
                <option value="">–</option>
                {Object.entries(column.options).map(([key, name]) => <option key={key} value={key}>{name}</option>)}
              </select>
              <input aria-label={t('tileSetLabel')} value={o.setLabel} maxLength={80} onChange={(e) => set({ setLabel: e.target.value })} />
            </>
          )}
        </>
      )}
      {kind === 'progress' && viewPicker(t('tileTotal'), o.total, (total) => set({ total }), views)}
      <button type="button" className="nv-bar__button" onClick={add}>{t('addTile')}</button>
    </div>
  )
}

/** The dashboard's quick creates: each removable, one more on any model that creates. */
function ActionsEditor({ actions, models, onChange }: {
  actions: DashboardLayout['actions']; models: Record<string, Model>; onChange: (next: DashboardLayout['actions']) => void
}) {
  const creatable = Object.values(models).filter((m) => !m.query)
  const [pick, setPick] = useState('')
  const model = creatable.find((m) => m.key === pick) ?? creatable[0]
  return (
    <fieldset className="nv-compose__section" role="group" aria-label={t('quickActions')}>
      <ol className="nv-compose__tiles">
        {actions.map((action, at) => (
          <li key={at} className="nv-compose__row">
            <span>{action.label}</span>
            <button type="button" className="nv-bar__button" aria-label={t('removeAction')} onClick={() => onChange(actions.filter((_, i) => i !== at))}>✕</button>
          </li>
        ))}
      </ol>
      <div className="nv-compose__row">
        <select aria-label={t('actionModel')} value={pick} onChange={(e) => setPick(e.target.value)}>
          {creatable.map((m) => <option key={m.key} value={m.key}>{m.label}</option>)}
        </select>
        <button type="button" className="nv-bar__button" disabled={!model}
          onClick={() => model && onChange([...actions, { create: model.key, label: model.new_label ?? t('newIn', { label: model.label }) }])}>
          {t('addAction')}
        </button>
      </div>
    </fieldset>
  )
}

/**
 * A dashboard in edit mode. One it may edit saves in place, as does an administrator's save of the system one
 * while the team has a shared copy; otherwise it saves as a copy that then lands: an administrator's shared, anyone else's theirs.
 */
export function Composer({ dashboard, views, models, role, onDone, onSaved }: {
  dashboard: SavedView; views: SavedView[]; models: Record<string, Model>; role: Account['role']; onDone: () => void; onSaved: (view: SavedView) => void
}) {
  const [layout, setLayout] = useState<DashboardLayout>(dashboard.layout ?? { sections: [], actions: [] })
  const [refusal, setRefusal] = useState<string | null>(null)
  const sections = layout.sections
  const setSections = (next: DashboardLayout['sections']) => setLayout({ ...layout, sections: next })
  const save = () => {
    setRefusal(null)
    const team = role === 'administrator' ? views.find((v) => v.type === 'dashboard' && v.shared && v.editable) : undefined
    const target = dashboard.editable ? dashboard : team
    const saved = target
      ? updateView(target, { layout })
      : createView({ name: dashboard.label, table: dashboard.table, type: 'dashboard', field: null, shared: role === 'administrator', arrangement: dashboard.arrangement, layout })
    saved.then((view) => {
      onSaved(view)
      onDone()
    }, (error: ApiError) => setRefusal(errorText(error.code, error.message)))
  }
  return (
    <div className="nv-compose">
      {sections.map((section, at) => (
        <SectionEditor key={at} section={section} views={views.filter((v) => v.type !== 'dashboard')} models={models}
          onChange={(next) => setSections(sections.map((s, i) => (i === at ? next : s)))}
          onMove={(by) => setSections(move(sections, at, by))} onRemove={() => setSections(sections.filter((_, i) => i !== at))} />
      ))}
      <button type="button" className="nv-bar__button" onClick={() => setSections([...sections, { label: t('newSection'), tiles: [] }])}>{t('addSection')}</button>
      <ActionsEditor actions={layout.actions} models={models} onChange={(actions) => setLayout({ ...layout, actions })} />
      {refusal && <p className="nv-tile__refusal" role="alert">{refusal}</p>}
      <div className="nv-dialog__actions">
        <button type="button" className="nv-bar__button" onClick={onDone}>{t('cancel')}</button>
        <button type="button" className="nv-button nv-button--primary nv-button--sm" onClick={save}>{t('save')}</button>
      </div>
    </div>
  )
}
