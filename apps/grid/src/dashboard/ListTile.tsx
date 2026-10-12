import { useEffect, useMemo, useState } from 'react'
import { rows as readRows, update } from '../api'
import { columnsFor } from '../grid/columns'
import { errorText, t } from '../i18n'
import type { ApiError, Model, Row, SavedView, Scope, Tile } from '../types'
import { layoutOf } from '../ui/views'
import { scopeFor } from './tiles'

type List = Extract<Tile, { kind: 'list' }>

/** The first rows of a view, its total in the title, "Alles tonen", and the tile's one-click write on each row that takes it. */
export function ListTile({ tile, view, model, models, scope, version, onOpen, onChanged }: {
  tile: List; view: SavedView; model?: Model; models: Record<string, Model>; scope: Scope | null; version: number
  onOpen: () => void; onChanged: () => void
}) {
  const [found, setFound] = useState<{ rows: Row[]; total: number } | null>(null)
  const [refusal, setRefusal] = useState<string | null>(null)
  useEffect(() => {
    let live = true
    readRows(view, {}, scopeFor(view, scope), layoutOf(view), tile.rows).then(
      (r) => live && setFound({ rows: r.rows.slice(0, tile.rows), total: r.total }),
      () => live && setFound({ rows: [], total: 0 }),
    )
    return () => {
      live = false
    }
  }, [view.key, scope?.id, version])
  const columns = useMemo(() => (model ? columnsFor(model, view, false, models) : []), [model, view, models])
  const shown = (tile.columns ?? []).flatMap((id) => columns.filter((c) => c.id === id))
  const set = tile.set
  const writes = set ? model?.fields[set.column]?.writes : undefined
  // A query row writes only through its key; a row without one has nothing to write to.
  const takes = (row: Row) => Boolean(set) && (!writes || (row.fields[writes.key] !== null && row.fields[writes.key] !== undefined))
  const run = (row: Row) => {
    if (!set) return
    setRefusal(null)
    update(view.model, row.id, { [set.column]: set.value }, row).then(onChanged, (error: ApiError) => setRefusal(errorText(error.code, error.message)))
  }
  return (
    <section className="nv-tile nv-list" aria-label={view.label}>
      <button type="button" className="nv-tile__title" onClick={onOpen}>
        {found ? `${view.label} · ${found.total}` : view.label}
      </button>
      {found && found.rows.length === 0 && <p className="nv-tile__note">{t('noRows')}</p>}
      <ul className="nv-list__rows">
        {found?.rows.map((row) => (
          <li key={row.id} className="nv-list__row">
            <span className="nv-list__title">{row.title}</span>
            {shown.map((column) => <span key={column.id} className="nv-list__cell">{column.text(row)}</span>)}
            {set && takes(row) && (
              <button type="button" className="nv-bar__button" onClick={() => run(row)}>{set.label}</button>
            )}
          </li>
        ))}
      </ul>
      {refusal && <p className="nv-tile__refusal" role="alert">{refusal}</p>}
      <button type="button" className="nv-tile__more" onClick={onOpen}>{t('showAll')}</button>
    </section>
  )
}
