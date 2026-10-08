import { cleanup, fireEvent, screen, within } from '@testing-library/react'
import { type ReactNode, useState } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { renderNl, typeKeys } from '../../test-setup'
import type { Row } from '../../types'
import { activity, calais, planning } from '../calais.test.data'
import { type Column, columnsFor } from '../columns'
import type { Editing } from '../keys'
import { DateEditor, DateTimeEditor } from './Date'
import type { EditorProps } from './props'

const dated = { ...activity, fields: { ...activity.fields, at: { type: 'datetime' as const, label: 'Start', required: false, fact: false }, due: { type: 'date' as const, label: 'Deadline', required: false, fact: false } } }
const columnOf = (id: string) => columnsFor(dated, { ...planning, columns: [id] }).find((c) => c.id === id)!
const row: Row = { ...calais[2], fields: { ...calais[2].fields, at: '2026-10-13T20:30', due: '2026-10-13' } }
const noop = () => {}

type Editor = (props: EditorProps) => ReactNode

/** Holds the draft the way the sheet does, so each typed segment builds on the last. */
function Held({ Editor, column, row, opened, onDraft }: { Editor: Editor; column: Column; row: Row; opened: Editing; onDraft: (value: string) => void }) {
  const [editing, setEditing] = useState(opened)
  const draft = (value: string) => {
    onDraft(value)
    setEditing((last) => ({ ...last, draft: value }))
  }
  return <Editor column={column} row={row} editing={editing} onDraft={draft} onCommit={noop} onLeave={noop} onPick={noop} onCancel={noop} onClose={noop} />
}

function editor(Editor: Editor, id: string, editing: Editing, onDraft = vi.fn()) {
  const view = renderNl(<Held Editor={Editor} column={columnOf(id)} row={row} opened={editing} onDraft={onDraft} />)
  return { ...view, onDraft }
}

const segments = () => screen.getAllByRole('spinbutton')
const read = () => segments().map((s) => s.textContent)

afterEach(cleanup)

describe('the date editors', () => {
  it('shows the stored date in Dutch order', () => {
    editor(DateEditor, 'due', { draft: '2026-10-13', mode: 'edit' })

    expect(read()).toEqual(['13', '10', '2026'])
    expect(segments().map((s) => s.dataset.type)).toEqual(['day', 'month', 'year'])
  })

  it('drafts the typed date as YYYY-MM-DD', () => {
    const { onDraft } = editor(DateEditor, 'due', { draft: '2026-10-13', mode: 'edit' })

    segments()[0].focus()
    typeKeys('02112026')
    expect(onDraft).toHaveBeenLastCalledWith('2026-11-02')
  })

  it('datetime shows 24-hour time', () => {
    editor(DateTimeEditor, 'at', { draft: '2026-10-13T20:30', mode: 'edit' })

    expect(segments().find((s) => s.dataset.type === 'hour')?.textContent).toBe('20')
    expect(segments().some((s) => s.dataset.type === 'dayPeriod')).toBe(false)
  })

  it('required never drafts empty', () => {
    const datum = columnsFor(activity, planning).find((c) => c.id === 'date')!
    const onDraft = vi.fn()
    renderNl(<Held Editor={DateEditor} column={datum} row={calais[0]} opened={{ draft: '2026-05-18', mode: 'edit' }} onDraft={onDraft} />)

    expect(datum.required).toBe(true)
    segments().at(-1)?.focus()
    // Until every segment is empty: clearing the last one drafts the stored day, which fills them again.
    for (let i = 0; i < 20 && onDraft.mock.lastCall?.[0] !== '2026-05-18'; i++) fireEvent.keyDown(document.activeElement!, { key: 'Backspace' })
    expect(onDraft).not.toHaveBeenCalledWith('')
    expect(onDraft).toHaveBeenLastCalledWith('2026-05-18')
  })

  it('opens on the stored date and types a digit that started it into the first segment', () => {
    const { onDraft } = editor(DateEditor, 'due', { draft: '2', mode: 'enter' })

    expect(onDraft).toHaveBeenCalledWith('2026-10-13')
    expect(document.activeElement).toBe(segments()[0])
    typeKeys('5')
    expect(onDraft).toHaveBeenLastCalledWith('2026-10-25')
  })

  it('opens on the stored moment when a letter started it', () => {
    const { onDraft } = editor(DateTimeEditor, 'at', { draft: 'a', mode: 'enter' })

    expect(onDraft).toHaveBeenCalledWith('2026-10-13T20:30')
    expect(read()).toEqual(['13', '10', '2026', '20', '30'])
  })

  it('the calendar starts on Monday', () => {
    editor(DateEditor, 'due', { draft: '2026-10-13', mode: 'edit' })

    fireEvent.click(screen.getByRole('button', { name: /kalender/i }))
    // React Aria hides the weekday row from assistive tech: each day's label names its weekday.
    const grid = screen.getByRole('grid')
    expect(within(grid).getAllByRole('columnheader', { hidden: true })[0].textContent).toBe('ma')
  })

  it('the editor root carries data-editor', () => {
    const { container } = editor(DateEditor, 'due', { draft: '2026-10-13', mode: 'edit' })

    expect(segments()[0].closest('[data-editor]')).not.toBeNull()
    expect(container.querySelector('[data-editor]')?.contains(screen.getByRole('button', { name: /kalender/i }))).toBe(true)
  })
})
