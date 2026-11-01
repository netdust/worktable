import { type FocusEvent, type KeyboardEvent, useCallback, useEffect, useRef } from 'react'
import { TextArea, TextField } from 'react-aria-components'
import { Pop } from '../../ui/Pop'
import type { CellProps, EditorProps } from './props'

export function TextCell({ column, row }: CellProps) {
  // A cell is one row: a long text's lines are kept apart by a comma, never run together.
  const text = column.kind === 'longtext' ? column.text(row).split('\n').map((line) => line.trim()).filter(Boolean).join(', ') : column.text(row)
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
export function LongTextEditor({ column, row, editing, onDraft, onCommit, onLeave }: EditorProps) {
  const anchor = useRef<HTMLSpanElement>(null)
  const root = useRef<HTMLDivElement>(null)
  // React Aria renders the popover's content a pass after the cell, so the textarea takes focus as it arrives.
  const opening = useCallback((el: HTMLTextAreaElement | null) => {
    el?.focus()
    el?.setSelectionRange(el.value.length, el.value.length)
  }, [])

  const keys = (event: KeyboardEvent) => {
    if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
      event.preventDefault()
      event.stopPropagation()
      onCommit(editing.draft, 'down')
      return
    }
    if (event.key === 'Enter' || event.key.startsWith('Arrow')) event.stopPropagation()
  }

  // The popover's focus scope moves Tab focus from a capture listener on the document; the window hears Tab first.
  useEffect(() => {
    const tab = (event: globalThis.KeyboardEvent) => {
      if (event.key !== 'Tab' || !root.current?.contains(event.target as Node)) return
      event.preventDefault()
      event.stopPropagation()
      onCommit(editing.draft, event.shiftKey ? 'left' : 'right')
    }
    window.addEventListener('keydown', tab, true)
    return () => window.removeEventListener('keydown', tab, true)
  })

  const blur = (event: FocusEvent) => {
    const next = event.relatedTarget
    if (next instanceof Element && next.closest('[data-editor]')) return
    onLeave()
  }

  return (
    <>
      <TextCell column={column} row={row} />
      <span ref={anchor} className="nv-longtext__anchor" />
      <Pop triggerRef={anchor} isOpen placement="bottom start" className="nv-pop--text">
        <div ref={root} data-editor onKeyDown={keys} onBlur={blur}>
          <TextField aria-label={column.label} value={editing.draft} onChange={onDraft}>
            <TextArea ref={opening} className="nv-textarea" rows={5} />
          </TextField>
        </div>
      </Pop>
    </>
  )
}
