import { useEffect, useRef } from 'react'
import type { CellProps, EditorProps } from './props'

const ISO = /^\d{4}-\d{2}-\d{2}$/

export function DateCell({ column, row }: CellProps) {
  return <span className="nv-cell__tabular">{column.text(row)}</span>
}

/** A typed character cannot start a date: the editor opens on the current day instead. */
export function DateEditor({ column, row, editing, onDraft, onLeave }: EditorProps) {
  const input = useRef<HTMLInputElement>(null)
  const valid = ISO.test(editing.draft)

  useEffect(() => {
    if (!valid) onDraft(column.edit(row))
    input.current?.focus()
  }, [])

  return (
    <input
      ref={input}
      type="date"
      className="nv-editor"
      data-editor
      aria-label={column.label}
      value={valid ? editing.draft : column.edit(row)}
      onChange={(event) => onDraft(event.target.value)}
      onBlur={onLeave}
    />
  )
}
