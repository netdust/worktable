import { useEffect, useState } from 'react'
import { filesOf, fileUrl } from '../api'
import { useOpenRow } from '../grid/useOpenRow'
import type { Model, Row, View } from '../types'

type Files = Record<number, { id: number; mime: string; name: string }>

/** The engine's cap on one batched read. */
const BATCH = 200

const batchesOf = (ids: number[]): number[][] => Array.from({ length: Math.ceil(ids.length / BATCH) }, (_, at) => ids.slice(at * BATCH, (at + 1) * BATCH))

/** A card per row with its newest image of the gallery's kind, read 200 rows a request; a click opens the row. */
export function Gallery({ view, model, models, rows, kind }: { view: View; model: Model; models: Record<string, Model>; rows: Row[]; kind: string }) {
  const [openRow, drawer] = useOpenRow(model, view, models)
  const [files, setFiles] = useState<Files>({})
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
  return (
    <div className="nv-frame">
      <div className="nv-body">
        <div className="nv-gallery">
          {rows.map((row) => {
            const file = files[row.id]
            return (
              <button key={row.id} type="button" className="nv-gallery__card" onClick={() => openRow(row)}>
                {file?.mime.startsWith('image/') ? <img src={fileUrl(file.id)} alt={row.title} loading="lazy" /> : <span className="nv-gallery__blank" aria-hidden="true" />}
                <span className="nv-gallery__title">{row.title}</span>
              </button>
            )
          })}
        </div>
        {drawer}
      </div>
    </div>
  )
}
