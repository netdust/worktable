import { useMemo } from 'react'
import { columnsFor } from '../grid/columns'
import { useOpenRow } from '../grid/useOpenRow'
import { t } from '../i18n'
import type { Model, Row, View } from '../types'

const NONE = '\u0000'

/** Cards in a column per option of the board's column, in its order, "Geen" last; read-only, a card opens its row. */
export function Board({ view, model, models, rows, column }: { view: View; model: Model; models: Record<string, Model>; rows: Row[]; column: string }) {
  const [openRow, drawer] = useOpenRow(model, view, models)
  const field = model.fields[column]
  const options = Object.entries(field?.options ?? {})
  const shown = useMemo(() => columnsFor(model, view, false, models).filter((c) => c.id !== 'title' && c.id !== column).slice(0, 3), [model, view, models, column])
  const keyOf = (row: Row) => {
    const value = row.fields[column]
    return typeof value === 'string' && field?.options && value in field.options ? value : NONE
  }
  const lanes = [...options.map(([key, label]) => ({ key, label })), { key: NONE, label: t('noLane') }]
  return (
    <div className="nv-frame">
      <div className="nv-body">
        <div className="nv-board">
          {lanes.map((lane) => (
            <ul key={lane.key} className="nv-board__column" aria-label={lane.label}>
              <li className={`nv-board__head${field?.tones?.[lane.key] ? ` nv-pill--${field.tones[lane.key]}` : ''}`} aria-hidden="true">{lane.label}</li>
              {rows.filter((row) => keyOf(row) === lane.key).map((row) => (
                <li key={row.id}>
                  <button type="button" className="nv-board__card" onClick={() => openRow(row)}>
                    <b>{row.title}</b>
                    {shown.filter((c) => c.text(row) !== row.title).map((c) => <span key={c.id}>{c.text(row)}</span>)}
                  </button>
                </li>
              ))}
            </ul>
          ))}
        </div>
        {drawer}
      </div>
    </div>
  )
}
