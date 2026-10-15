import { type KeyboardEvent, type ReactNode, useRef, useState } from 'react'
import { TextArea, TextField } from 'react-aria-components'

interface Props {
  text: string
  label: string
  /** What the line says while there is no text. */
  empty: ReactNode
  /** The line's look and its field's: the record drawer's block, the matrix cell's line. */
  className: string
  area: string
  rows: number
  disabled?: boolean
  onSave: (text: string) => void
}

/** A note as a line until pressed, then its field in its place: leaving or Cmd+Enter saves a change, Escape leaves it as it was. */
export function Note({ text, label, empty, className, area, rows, disabled = false, onSave }: Props) {
  const [draft, setDraft] = useState<string | null>(null)
  // The field may still report leaving as it closes after Cmd+Enter or Escape: only the first end counts.
  const editing = useRef(false)
  const refocus = useRef(false)

  const start = () => {
    editing.current = true
    setDraft(text)
  }
  const end = (value: string | null, back: boolean) => {
    if (!editing.current) return
    editing.current = false
    refocus.current = back
    setDraft(null)
    if (value !== null && value !== text) onSave(value)
  }
  // Escape is the drawer's too: here it only ends the edit.
  const keys = (event: KeyboardEvent) => {
    if (event.key === 'Escape') {
      event.stopPropagation()
      end(null, true)
    } else if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
      event.preventDefault()
      end(draft, true)
    }
  }
  const focused = (el: HTMLButtonElement | null) => {
    if (!el || !refocus.current) return
    refocus.current = false
    el.focus()
  }

  if (draft === null) {
    return <button ref={focused} type="button" className={className} disabled={disabled} onClick={start}>{text || empty}</button>
  }
  return (
    <TextField className="nv-field" aria-label={label} value={draft} isDisabled={disabled} onChange={setDraft} autoFocus onBlur={() => end(draft, false)}>
      <TextArea className={area} rows={rows} onKeyDown={keys} />
    </TextField>
  )
}
