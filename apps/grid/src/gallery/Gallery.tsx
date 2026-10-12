import { useEffect, useState } from 'react'
import { filesOf, fileUrl } from '../api'
import { useOpenRow } from '../grid/useOpenRow'
import type { Model, Row, View } from '../types'

type Files = Record<number, { id: number; mime: string; name: string }>

/** A card per row with its newest image of the gallery's kind, read for the page at once; a click opens the row. */
export function Gallery({ view, model, models, rows, kind }: { view: View; model: Model; models: Record<string, Model>; rows: Row[]; kind: string }) {
  const [openRow, drawer] = useOpenRow(model, view, models)
  const [files, setFiles] = useState<Files>({})
  const ids = rows.slice(0, 200).map((row) => row.id)
  useEffect(() => {
    let live = true
    if (ids.length > 0) filesOf(view.model, ids, kind).then((found) => live && setFiles(found), () => live && setFiles({}))
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
