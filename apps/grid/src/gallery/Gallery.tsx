import { type CSSProperties, type ReactNode, useEffect, useMemo, useState } from 'react'
import { filesOf, fileUrl } from '../api'
import { Display } from '../grid/cells'
import { type Column, columnsFor } from '../grid/columns'
import { useOpenRow } from '../grid/useOpenRow'
import type { Model, Row, View } from '../types'
import { ChipRow } from '../ui/ChipRow'
import type { Shown } from '../ui/Toolbar'
import { toneColor } from '../ui/tone'
import { whenOf } from '../ui/when'

type Files = Record<number, { id: number; mime: string; name: string }>

/** The engine's cap on one batched read. */
const BATCH = 200

const batchesOf = (ids: number[]): number[][] => Array.from({ length: Math.ceil(ids.length / BATCH) }, (_, at) => ids.slice(at * BATCH, (at + 1) * BATCH))

const noToggle = () => undefined

/** "Pr", what a card without a picture shows: its title's first letters. */
const mark = (title: string) => title.trim().slice(0, 2).replace(/^./, (c) => c.toLocaleUpperCase())

function Card({ row, file, columns, selected, onOpen }: { row: Row; file?: Files[number]; columns: Column[]; selected: boolean; onOpen: () => void }) {
  const kind = columns.find((c) => c.kind === 'select' && c.tones)
  const when = whenOf(row, columns.filter((c) => c.kind === 'date' || c.kind === 'datetime'))
  const of = columns.find((c) => c.kind === 'relation' && c.text(row) !== '')
  const tone = { '--s': toneColor(kind?.tones?.[String(kind.value(row) ?? '')]) } as CSSProperties
  return (
    <button type="button" className={selected ? 'nv-gallery__card nv-gallery__card--open' : 'nv-gallery__card'} aria-current={selected || undefined} onClick={onOpen}>
      <span className="nv-gallery__pic">
        {file?.mime.startsWith('image/') ? <img src={fileUrl(file.id)} alt={row.title} loading="lazy" />
          : <span className="nv-gallery__blank" style={tone} aria-hidden="true"><span className="nv-gallery__mark">{mark(row.title)}</span></span>}
      </span>
      <span className="nv-gallery__meta">
        <b className="nv-gallery__title">{row.title}</b>
        {(when.day || when.from) && (
          <span className="nv-gallery__line nv-gallery__when">
            {when.day}
            {when.from && <span className="nv-time">{when.from}{when.to && <span className="nv-time__end">–{when.to}</span>}</span>}
          </span>
        )}
        {(kind?.text(row) || of) && (
          <span className="nv-gallery__line">
            {kind?.text(row) && <Display column={kind} row={row} onToggle={noToggle} />}
            {of && <span className="nv-gallery__of">{of.text(row)}</span>}
          </span>
        )}
      </span>
    </button>
  )
}

/** A card per row with its newest image of the gallery's kind, read 200 rows a request; a click opens the row. */
export function Gallery({ view, model, models, rows, kind, scope = null, filters, onShown }: {
  view: View; model: Model; models: Record<string, Model>; rows: Row[]; kind: string
  /** The grid's chips for this view: the space and the filters. */
  scope?: string | null; filters?: ReactNode
  /** What the title line says it shows: the cards and how many have a picture. */
  onShown?: (shown: Shown) => void
}) {
  const [openRow, drawer, open] = useOpenRow(model, view, models)
  const [files, setFiles] = useState<Files>({})
  const columns = useMemo(() => columnsFor(model, view, false, models).filter((c) => c.id !== 'title'), [model, view, models])
  const ids = rows.map((row) => row.id)
  useEffect(() => {
    let live = true
    setFiles({})
    for (const batch of batchesOf(ids))
      filesOf(view.model, batch, kind).then((found) => live && setFiles((was) => ({ ...was, ...found })), () => undefined)
    return () => {
      live = false
    }
  }, [view.model, kind, ids.join(',')])
  const pictures = rows.filter((row) => files[row.id]?.mime.startsWith('image/')).length
  useEffect(() => onShown?.({ rows: rows.length, groups: null, cut: false, pictures }), [rows.length, pictures])
  return (
    <div className="nv-frame">
      <ChipRow scope={scope} filters={filters} count={rows.length} />
      <div className="nv-body">
        <div className="nv-gallery">
          {rows.map((row) => <Card key={row.id} row={row} file={files[row.id]} columns={columns} selected={open?.id === row.id} onOpen={() => openRow(row)} />)}
        </div>
        {drawer}
      </div>
    </div>
  )
}
