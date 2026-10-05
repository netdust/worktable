import { type KeyboardEvent, useEffect, useRef, useState } from 'react'
import { t } from '../../i18n'
import type { CellProps, EditorProps } from './props'
import { iconOf, toneOf } from './tones'

/** A kind reads as its icon and word; any other option as a pill toned by what it means. */
export function SelectCell({ column, row }: CellProps) {
  const text = column.text(row)
  if (text === '') return null
  const option = column.edit(row)
  const Icon = iconOf(option)
  if (Icon) return <span className="nv-kind"><Icon size={13} aria-hidden="true" />{text}</span>
  const tone = toneOf(option)
  return <span className={tone ? `nv-pill nv-pill--${tone}` : 'nv-pill'}>{text}</span>
}

function choices(options: Record<string, string>, required: boolean): [string, string][] {
  const listed = Object.entries(options)
  return required ? listed : [['', t('empty')], ...listed]
}

/** Typing a letter opens the list on the first option that starts with it, the way a spreadsheet's dropdown does. */
function startAt(list: [string, string][], editing: EditorProps['editing'], current: string): number {
  if (editing.mode === 'enter') {
    const typed = editing.draft.toLowerCase()
    const hit = list.findIndex(([, label]) => label.toLowerCase().startsWith(typed))
    if (hit >= 0) return hit
  }
  return Math.max(0, list.findIndex(([key]) => key === current))
}

export function SelectEditor({ column, row, editing, onDraft, onCommit }: EditorProps) {
  const list = choices(column.options ?? {}, column.required)
  const [index, setIndex] = useState(() => startAt(list, editing, column.edit(row)))
  const box = useRef<HTMLDivElement>(null)

  useEffect(() => {
    box.current?.focus()
  }, [])
  useEffect(() => {
    onDraft(list[index]?.[0] ?? '')
  }, [index])

  const keys = (event: KeyboardEvent<HTMLDivElement>) => {
    const pick = list[index]?.[0] ?? ''
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      setIndex((i) => Math.max(0, Math.min(list.length - 1, i + (event.key === 'ArrowDown' ? 1 : -1))))
    } else if (event.key === 'Enter' || event.key === 'Tab') {
      onCommit(pick, event.key === 'Enter' ? 'down' : event.shiftKey ? 'left' : 'right')
    } else if (event.key.length === 1 && !event.ctrlKey && !event.metaKey) {
      const hit = list.findIndex(([, label]) => label.toLowerCase().startsWith(event.key.toLowerCase()))
      if (hit >= 0) setIndex(hit)
    } else {
      return
    }
    event.preventDefault()
    event.stopPropagation()
  }

  return (
    <>
      <SelectCell column={column} row={row} />
      <div
        ref={box}
        className="nv-pop"
        data-editor
        role="listbox"
        aria-label={column.label}
        aria-activedescendant={`nv-opt-${index}`}
        tabIndex={0}
        onKeyDown={keys}
      >
        {list.map(([key, label], i) => (
          <div
            key={key}
            id={`nv-opt-${i}`}
            role="option"
            aria-selected={i === index}
            className="nv-pop__option"
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => onCommit(key, 'stay')}
          >
            {label}
          </div>
        ))}
      </div>
    </>
  )
}
