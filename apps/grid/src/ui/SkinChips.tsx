import type { Size } from '../gallery/size'
import { hidesFinished } from '../grid/categories'
import type { Model, View } from '../types'
import { ArchiveChip, FinishedChip } from './FinishedChip'
import { AwayChip, SizeChips } from './SizeChips'

interface Props {
  view: View
  model: Model
  size: Size
  onSize: (size: Size) => void
  away: boolean
  onAway: () => void
  finished: boolean
  onFinished: () => void
  archived: boolean
  onArchived: () => void
}

/** The skin's own chips after the period: a gallery's S M L, a matrix's Afwezigheden, Afgerond tonen where the skin hides finished rows, and Archief tonen on every skin of a dataset that archives. */
export function SkinChips({ view, model, size, onSize, away, onAway, finished, onFinished, archived, onArchived }: Props) {
  return (
    <>
      {view.type === 'gallery' && <SizeChips size={size} onSize={onSize} />}
      {view.type === 'matrix' && view.away && <AwayChip on={away} onToggle={onAway} />}
      {hidesFinished(model, view.type ?? 'grid') && <FinishedChip on={finished} onToggle={onFinished} />}
      {model.archive_after && <ArchiveChip on={archived} onToggle={onArchived} />}
    </>
  )
}
