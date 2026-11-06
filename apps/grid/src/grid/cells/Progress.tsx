import './progress.css'
import type { CellProps } from './props'

/** "1/2" with a thin bar; nothing for a row with nothing to count. */
export function ProgressCell({ row }: CellProps) {
  const progress = row.progress
  if (!progress || progress.total === 0) return null
  return (
    <span className="nv-progress">
      <span className="nv-cell__tabular">{progress.done}/{progress.total}</span>
      <span className="nv-progress__bar" aria-hidden="true"><i style={{ width: `${Math.round((progress.done / progress.total) * 100)}%` }} /></span>
    </span>
  )
}
