import type { Row } from '../../types'
import type { Pick } from './RelationPicker'
import type { Column } from '../columns'
import type { Editing, Move } from '../keys'

export interface CellProps {
  column: Column
  row: Row
}

export interface EditorProps extends CellProps {
  editing: Editing
  onDraft: (value: string) => void
  /** For editors that own Enter or Tab themselves (a listbox, a textarea). */
  onCommit: (value: string, move: Move) => void
  /** Focus left the editor for somewhere else on the page. */
  onLeave: () => void
  /** A record picked for a relation cell. */
  onPick: (row: Row, how: Pick) => void
  /** Leave without a write, as Escape does. */
  onCancel: () => void
  /** Close the editor without a write and without undoing anything: focus went elsewhere. */
  onClose: () => void
}
