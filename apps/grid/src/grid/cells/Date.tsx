import { CalendarDays, ChevronLeft, ChevronRight } from 'lucide-react'
import { type FocusEvent, type KeyboardEvent, type MouseEvent, type ReactNode, type RefObject, useEffect, useRef, useState } from 'react'
import {
  Button, Calendar, CalendarCell, CalendarGrid, DateInput, DatePicker, type DateValue, DateSegment, Dialog, Group, Heading,
} from 'react-aria-components'
import { Pop } from '../../ui/Pop'
import { fromDate, fromMoment, toDate, toMoment } from './dates'
import type { CellProps, EditorProps } from './props'

export function DateCell({ column, row }: CellProps) {
  const value = column.kind === 'datetime' ? column.edit(row) : undefined
  const range = column.range?.(row)
  if (range) {
    return (
      <span className="nv-cell__tabular nv-time" data-value={value}>
        {range.start}
        {range.end && <span className="nv-time__end">{range.end}</span>}
      </span>
    )
  }
  if (column.blank && column.text(row) === '') return <span className="nv-blank">{column.blank}</span>
  return <span className="nv-cell__tabular" data-value={value}>{column.text(row)}</span>
}

/** The draft an editor opens on: a typed key cannot start a value, so it opens on the stored one. */
export function opening({ column, row, editing }: EditorProps, reads: (value: string) => unknown): string {
  return editing.draft === '' || reads(editing.draft) !== null ? editing.draft : column.edit(row)
}

/** A required column never clears, as Delete never does (keys.ts): cleared, it drafts the stored value again. */
export function drafts<T>({ column, row, onDraft }: EditorProps, write: (value: T | null) => string) {
  return (value: T | null) => onDraft(value === null && column.required ? column.edit(row) : write(value))
}

function segmentsOf(root: HTMLElement | null): HTMLElement[] {
  return root ? [...root.querySelectorAll<HTMLElement>('[data-type]:not([data-type="literal"])')] : []
}

/** Some segments empty, not all: React Aria drafts nothing for it, so the draft still holds the last whole value. */
function partial(root: HTMLElement | null): boolean {
  const segments = segmentsOf(root)
  const empty = segments.filter((segment) => segment.hasAttribute('data-placeholder')).length
  return empty > 0 && empty < segments.length
}

const stop = (event: MouseEvent) => event.stopPropagation()

// A press on the frame around the segments would move focus to the cell, which reads as leaving the editor.
const keepFocus = (event: MouseEvent) => {
  if (event.target === event.currentTarget) event.preventDefault()
}

function focusFirst(root: HTMLElement | null): HTMLElement | undefined {
  const first = segmentsOf(root)[0]
  first?.focus()
  return first
}

/** The frame of a segmented editor: its keys reach the key machine, its clicks stay in the cell, leaving it commits. */
export function SegmentShell({ props, shown, root, children }: { props: EditorProps; shown: string; root: RefObject<HTMLDivElement | null>; children: ReactNode }) {
  const { editing, onDraft, onCommit, onLeave } = props

  useEffect(() => {
    if (shown !== editing.draft) onDraft(shown)
    const first = focusFirst(root.current)
    // The key that opened the editor went to the cell; a digit belongs in the first segment.
    if (editing.mode === 'enter' && /^\d$/.test(editing.draft)) {
      first?.dispatchEvent(new InputEvent('beforeinput', { data: editing.draft, inputType: 'insertText', bubbles: true, cancelable: true }))
    }
  }, [])

  // React Aria's segments swallow Enter, so the editor commits it as the sheet would; a half-typed value waits.
  const keys = (event: KeyboardEvent) => {
    if (event.key !== 'Enter' || !segmentsOf(root.current).includes(event.target as HTMLElement)) return
    event.preventDefault()
    event.stopPropagation()
    if (!partial(root.current)) onCommit(editing.draft, 'down')
  }

  const blur = (event: FocusEvent) => {
    const next = event.relatedTarget
    if (next instanceof Element && next.closest('[data-editor]')) return
    onLeave()
  }

  return (
    <div ref={root} className="nv-datefield" data-editor onClick={stop} onDoubleClick={stop} onMouseDown={keepFocus} onKeyDownCapture={keys} onBlur={blur}>
      {children}
    </div>
  )
}

export function Segments() {
  return <DateInput className="nv-datefield__input">{(segment) => <DateSegment segment={segment} className="nv-datefield__segment" />}</DateInput>
}

export function Month() {
  return (
    <Calendar className="nv-calendar">
      <header className="nv-calendar__head">
        <Button slot="previous"><ChevronLeft size={14} aria-hidden="true" /></Button>
        <Heading />
        <Button slot="next"><ChevronRight size={14} aria-hidden="true" /></Button>
      </header>
      <CalendarGrid weekdayStyle="short">{(date) => <CalendarCell date={date} className="nv-calendar__day" />}</CalendarGrid>
    </Calendar>
  )
}

export function DateEditor(props: EditorProps) {
  return <PickerEditor {...props} reads={toDate} writes={fromDate} granularity="day" />
}

export function DateTimeEditor(props: EditorProps) {
  return <PickerEditor {...props} reads={toMoment} writes={fromMoment} granularity="minute" />
}

interface PickerProps<T extends DateValue> extends EditorProps {
  reads: (value: string) => T | null
  writes: (value: T | null) => string
  granularity: 'day' | 'minute'
}

function PickerEditor<T extends DateValue>({ reads, writes, granularity, ...props }: PickerProps<T>) {
  const root = useRef<HTMLDivElement>(null)
  const shown = opening(props, reads)
  const change = drafts(props, writes)
  const [open, setOpen] = useState(false)
  const wasOpen = useRef(false)

  // A picked day closes the calendar with focus on a day that is gone: back to the segments, where Enter commits.
  // Only on closing: on mount the shell has focused the segments, and a typed digit may have moved on already.
  useEffect(() => {
    if (wasOpen.current && !open) focusFirst(root.current)
    wasOpen.current = open
  }, [open])

  return (
    <SegmentShell props={props} shown={shown} root={root}>
      <DatePicker aria-label={props.column.label} value={reads(shown)} onChange={(value) => change(value as T | null)}
        granularity={granularity} hourCycle={24} shouldForceLeadingZeros isOpen={open} onOpenChange={setOpen}>
        <Group className="nv-datefield__group">
          <Segments />
          <Button className="nv-datefield__open"><CalendarDays size={14} aria-hidden="true" /></Button>
        </Group>
        <Pop placement="bottom start">
          {/* Focusable, so a press on the calendar's heading or padding keeps focus inside the editor. */}
          <Dialog className="nv-calendar__dialog">
            <Month />
          </Dialog>
        </Pop>
      </DatePicker>
    </SegmentShell>
  )
}
