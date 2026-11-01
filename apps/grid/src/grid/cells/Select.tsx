import { type FocusEvent, type KeyboardEvent, useCallback, useEffect, useRef, useState } from 'react'
import { ListBox, ListBoxItem } from 'react-aria-components'
import { t } from '../../i18n'
import { Pop } from '../../ui/Pop'
import type { Column } from '../columns'
import type { CellProps, EditorProps } from './props'
import { iconOf, type Tone, toneOf } from './tones'

export function SelectCell({ column, row }: CellProps) {
  const text = column.text(row)
  return text === '' ? null : <OptionMark column={column} option={column.edit(row)} text={text} />
}

/** A toned option is a tinted pill; one without a tone is plain text. */
export function ToneMark({ tone, text }: { tone: Tone | null; text: string }) {
  return tone ? <span className={`nv-pill nv-pill--${tone}`}>{text}</span> : <>{text}</>
}

/**
 * A kind reads as its icon and word; any other option as a pill in the tone its column declares, or as plain text without one.
 * The cell passes its own text, which an inherited column words for itself.
 */
export function OptionMark({ column, option, text = column.options?.[option] ?? option }: { column: Column; option: string; text?: string }) {
  const Icon = iconOf(option)
  if (Icon) return <span className="nv-kind"><Icon size={13} aria-hidden="true" />{text}</span>
  return <ToneMark tone={toneOf(option, column.tones)} text={text} />
}

function choices(options: Record<string, string>, required: boolean): [string, string][] {
  const listed = Object.entries(options)
  return required ? listed : [['', t('empty')], ...listed]
}

function firstStarting(list: [string, string][], typed: string): number {
  const lower = typed.toLowerCase()
  return list.findIndex(([, label]) => label.toLowerCase().startsWith(lower))
}

/** Typing a letter opens the list on the first option that starts with it, the way a spreadsheet's dropdown does. */
function startAt(list: [string, string][], editing: EditorProps['editing'], current: string): number {
  if (editing.mode === 'enter') {
    const hit = firstStarting(list, editing.draft)
    if (hit >= 0) return hit
  }
  return Math.max(0, list.findIndex(([key]) => key === current))
}

type KeyLike = { key: string; target: EventTarget | null; shiftKey: boolean; preventDefault(): void; stopPropagation(): void }

export function SelectEditor({ column, row, editing, onDraft, onCommit, onLeave }: EditorProps) {
  const [list] = useState(() => choices(column.options ?? {}, column.required))
  const current = column.edit(row)
  const [start] = useState(() => startAt(list, editing, current))
  const anchor = useRef<HTMLSpanElement>(null)
  const root = useRef<HTMLDivElement>(null)
  // React Aria renders its options a pass after the list, so the opening option takes focus as it arrives.
  const opening = useCallback((option: HTMLElement | null) => option?.focus(), [])

  const indexOf = (target: EventTarget | null) => {
    const at = target instanceof HTMLElement ? target.dataset.index : undefined
    return at === undefined ? null : Number(at)
  }

  const focus = (event: FocusEvent) => {
    const at = indexOf(event.target)
    if (at === null) return
    onDraft(list[at][0])
  }

  // A letter jumps to the first option starting with it, as the field's spec says; React Aria's typeahead would search on from the focused option and join letters.
  const jump = (event: KeyboardEvent) => {
    if (event.key.length !== 1 || event.ctrlKey || event.metaKey || event.altKey || !/\S/.test(event.key)) return
    event.preventDefault()
    event.stopPropagation()
    const hit = firstStarting(list, event.key)
    if (hit >= 0) root.current?.querySelector<HTMLElement>(`[data-index="${hit}"]`)?.focus()
  }

  const keysFirst = (event: KeyboardEvent) => {
    jump(event)
    commitKeys(event)
  }

  // Enter and Tab commit before React Aria presses the option; the sheet decides where they move.
  const commitKeys = (event: KeyLike) => {
    const at = indexOf(event.target)
    if (at === null || (event.key !== 'Enter' && event.key !== 'Tab')) return
    event.preventDefault()
    event.stopPropagation()
    onCommit(list[at][0], event.key === 'Enter' ? 'down' : event.shiftKey ? 'left' : 'right')
  }

  // The popover's focus scope moves Tab focus from a capture listener on the document; the window hears Tab first.
  useEffect(() => {
    const tab = (event: globalThis.KeyboardEvent) => {
      if (event.key === 'Tab' && root.current?.contains(event.target as Node)) commitKeys(event)
    }
    window.addEventListener('keydown', tab, true)
    return () => window.removeEventListener('keydown', tab, true)
  })

  // React Aria stops the ↑↓ it moves by; at the first or last option they come back out, and the sheet would move the cell.
  const clamp = (event: KeyboardEvent) => {
    if (event.key === 'ArrowUp' || event.key === 'ArrowDown') event.stopPropagation()
  }

  const blur = (event: FocusEvent) => {
    const next = event.relatedTarget
    if (next instanceof Element && next.closest('[data-editor]')) return
    onLeave()
  }

  return (
    <>
      <SelectCell column={column} row={row} />
      <span ref={anchor} className="nv-select__anchor" />
      <Pop triggerRef={anchor} isOpen placement="bottom start" className="nv-select">
        <div ref={root} data-editor onFocusCapture={focus} onKeyDownCapture={keysFirst} onKeyDown={clamp} onBlur={blur}>
          <ListBox aria-label={column.label} selectionMode="none" onAction={(at) => onCommit(list[Number(at)][0], 'stay')}>
            {list.map(([key, label], i) => (
              <ListBoxItem key={key} id={String(i)} textValue={label} data-index={i} data-current={key === current || undefined}
                ref={i === start ? opening : undefined} className="nv-pop__option">
                {key === '' ? label : <OptionMark column={column} option={key} />}
              </ListBoxItem>
            ))}
          </ListBox>
        </div>
      </Pop>
    </>
  )
}
