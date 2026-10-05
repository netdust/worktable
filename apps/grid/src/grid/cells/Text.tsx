import { Textarea } from '@sakaniui/react'
import { type KeyboardEvent, useEffect, useRef } from 'react'
import type { CellProps, EditorProps } from './props'

export function TextCell({ column, row }: CellProps) {
  const text = column.text(row)
  return <span className={column.kind === 'title' ? 'nv-cell__title' : 'nv-cell__text'}>{text}</span>
}

interface InputProps extends EditorProps {
  placeholder?: string
  inputMode?: 'text' | 'numeric' | 'decimal'
}

/** The one-line editor: the grid's key machine reads its draft for Enter, Tab and the arrows. */
export function InputEditor({ column, editing, onDraft, onLeave, placeholder, inputMode = 'text' }: InputProps) {
  const input = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const el = input.current
    if (!el) return
    el.focus()
    el.setSelectionRange(el.value.length, el.value.length)
  }, [])

  return (
    <input
      ref={input}
      className="nv-editor"
      data-editor
      aria-label={column.label}
      value={editing.draft}
      placeholder={placeholder}
      inputMode={inputMode}
      onChange={(event) => onDraft(event.target.value)}
      onBlur={onLeave}
    />
  )
}

/** Long text shows as one line in the sheet and opens in a textarea beside the cell: Enter is a new line there. */
export function LongTextEditor({ column, editing, onDraft, onCommit, onLeave }: EditorProps) {
  const area = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    const el = area.current
    if (!el) return
    el.focus()
    el.setSelectionRange(el.value.length, el.value.length)
  }, [])

  const keys = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
      event.preventDefault()
      event.stopPropagation()
      onCommit(editing.draft, 'down')
      return
    }
    if (event.key === 'Enter' || event.key.startsWith('Arrow')) event.stopPropagation()
  }

  return (
    <div className="nv-pop nv-pop--text" data-editor>
      <Textarea
        ref={area}
        aria-label={column.label}
        rows={5}
        value={editing.draft}
        onChange={(event) => onDraft(event.target.value)}
        onKeyDown={keys}
        onBlur={onLeave}
      />
    </div>
  )
}
