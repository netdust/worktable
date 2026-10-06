import { useEffect, useRef } from 'react'
import type { CellProps, EditorProps } from './props'

const ISO = /^\d{4}-\d{2}-\d{2}$/
const MOMENT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/

export function DateCell({ column, row }: CellProps) {
  return <span className="nv-cell__tabular" data-value={column.kind === 'datetime' ? column.edit(row) : undefined}>{column.text(row)}</span>
}

/** A typed character cannot start a date: the editor opens on the current day instead. */
export function DateEditor(props: EditorProps) {
  return <PickerEditor {...props} type="date" shape={ISO} />
}

export function DateTimeEditor(props: EditorProps) {
  return <PickerEditor {...props} type="datetime-local" shape={MOMENT} />
}

function PickerEditor({ column, row, editing, onDraft, onLeave, type, shape }: EditorProps & { type: 'date' | 'datetime-local'; shape: RegExp }) {
  const input = useRef<HTMLInputElement>(null)
  // A required column never clears, as Delete never does (keys.ts).
  const valid = (editing.draft === '' && !column.required) || shape.test(editing.draft)

  const take = (node: HTMLInputElement) => {
    // Half-typed segments read as '' with badInput: they stay on screen but commit as the stored value.
    if (node.value === '' && node.validity.badInput) return onDraft(column.edit(row))
    if (node.value === '' && column.required) node.value = column.edit(row)
    onDraft(node.value)
  }

  useEffect(() => {
    if (!valid) onDraft(column.edit(row))
    input.current?.focus()
  }, [])

  return (
    <input
      ref={input}
      type={type}
      className="nv-editor"
      data-editor
      aria-label={column.label}
      defaultValue={valid ? editing.draft : column.edit(row)}
      onChange={(event) => take(event.currentTarget)}
      // Chromium fires no input once the value is '': clearing the last segments shows only as a key.
      onKeyUp={(event) => take(event.currentTarget)}
      onBlur={onLeave}
    />
  )
}
