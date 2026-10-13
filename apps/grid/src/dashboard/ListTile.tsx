import { useEffect, useMemo, useState } from 'react'
import { rows as readRows, update } from '../api'
import { Display } from '../grid/cells'
import { type Column, columnsFor } from '../grid/columns'
import { errorText, t } from '../i18n'
import type { ApiError, Model, Row, SavedView, Scope, Tile } from '../types'
import { layoutOf } from '../ui/views'
import { iso } from '../ui/Window'
import { whenOf } from '../ui/when'
import { scopeFor } from './tiles'

type List = Extract<Tile, { kind: 'list' }>

const noToggle = () => undefined

/** A row as the prototype's list: its hours, its kind, the title with its context, a day at the end. */
function Line({ row, shown }: { row: Row; shown: Column[] }) {
  const hours = whenOf(row, shown.filter((c) => c.kind === 'datetime'))
  const kinds = shown.filter((c) => c.kind === 'select')
  const days = shown.filter((c) => c.kind === 'date')
  const rest = shown.filter((c) => !['datetime', 'select', 'date'].includes(c.kind))
  return (
    <>
      {hours.from && <span className="nv-time nv-list__time">{hours.from}{hours.to && <span className="nv-time__end">–{hours.to}</span>}</span>}
      {kinds.map((c) => <span key={c.id} className="nv-list__kind"><Display column={c} row={row} onToggle={noToggle} /></span>)}
      <span className="nv-list__title">{row.title}{rest.map((c) => c.text(row) && <span key={c.id} className="nv-list__cell">{c.text(row)}</span>)}</span>
      {days.map((c) => {
        const day = String(c.value(row) ?? '').slice(0, 10)
        const today = iso(new Date())
        const when = !day ? '' : day < today ? ' nv-list__day--late' : day === today ? ' nv-list__day--now' : ''
        return <span key={c.id} className={`nv-list__day${when}`}>{whenOf(row, [c]).day ?? c.text(row)}</span>
      })}
    </>
  )
}

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
    <section className="nv-tile nv-tile--panel nv-list" aria-label={view.label}>
      <header className="nv-tile__head">
        <button type="button" className="nv-tile__title" aria-label={found ? `${view.label} · ${found.total}` : view.label} onClick={onOpen}>
          {view.label}{found && <><span className="nv-sr"> · </span><span className="nv-tile__n">{found.total}</span></>}
        </button>
        <button type="button" className="nv-tile__more" onClick={onOpen}>{t('showAll')}</button>
      </header>
      {found && found.rows.length === 0 && <p className="nv-tile__note">{t('noRows')}</p>}
      <ul className="nv-list__rows">
        {found?.rows.map((row) => (
          <li key={row.id} className="nv-list__row">
            <Line row={row} shown={shown} />
            {set && (takes(row) ? <button type="button" className="nv-bar__button nv-list__act" onClick={() => run(row)}>{set.label}</button> : <span className="nv-list__act" />)}
          </li>
        ))}
      </ul>
      {refusal && <p className="nv-tile__refusal" role="alert">{refusal}</p>}
    </section>
  )
}
