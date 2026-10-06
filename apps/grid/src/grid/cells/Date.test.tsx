import { cleanup, fireEvent, render } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Row } from '../../types'
import { activity, calais, planning } from '../calais.test.data'
import { columnsFor } from '../columns'
import type { Editing } from '../keys'
import { DateEditor, DateTimeEditor } from './Date'

const when = { ...activity, fields: { ...activity.fields, at: { type: 'datetime' as const, label: 'Start', required: false, fact: false } } }
const column = columnsFor(when, { ...planning, columns: ['at'] }).find((c) => c.id === 'at')!
const row: Row = { ...calais[2], fields: { ...calais[2].fields, at: '2026-10-13T20:30' } }
const noop = () => {}

function editor(editing: Editing, onDraft = vi.fn()) {
  const props = { column, row, onDraft, onCommit: noop, onLeave: noop, onPick: noop, onCancel: noop, onClose: noop }
  const view = render(<DateTimeEditor {...props} editing={editing} />)
  return {
    input: view.container.querySelector('input') as HTMLInputElement,
    rerender: (next: Editing) => view.rerender(<DateTimeEditor {...props} editing={next} />),
    onDraft,
  }
}

afterEach(cleanup)

describe('the datetime picker editor', () => {
  it('clears to empty: the draft becomes empty and the input shows nothing, not the stored time', () => {
    const { input, rerender, onDraft } = editor({ draft: '2026-10-13T20:30', mode: 'edit' })

    fireEvent.change(input, { target: { value: '' } })
    expect(onDraft).toHaveBeenLastCalledWith('')
    rerender({ draft: '', mode: 'edit' })
    expect(input.value).toBe('')
  })

  // Chromium reports '' with validity.badInput while some segments are cleared and others not.
  it('reverts a half-typed value to the stored moment instead of drafting no time', () => {
    const { input, onDraft } = editor({ draft: '2026-10-14T09:00', mode: 'edit' })

    Object.defineProperty(input, 'validity', { value: { badInput: true }, configurable: true })
    fireEvent.change(input, { target: { value: '' } })
    expect(onDraft).not.toHaveBeenCalledWith('')
    expect(onDraft).toHaveBeenLastCalledWith('2026-10-13T20:30')
  })

  it('opens on the stored moment when a typed character started it', () => {
    const { input, onDraft } = editor({ draft: 'a', mode: 'enter' })

    expect(onDraft).toHaveBeenCalledWith('2026-10-13T20:30')
    expect(input.value).toBe('2026-10-13T20:30')
  })

  it('keeps the stored day when a required date is cleared, so nothing empty is ever committed', () => {
    const datum = columnsFor(activity, planning).find((c) => c.id === 'date')!
    const onDraft = vi.fn()
    const onCommit = vi.fn()
    const props = { column: datum, row: calais[0], onDraft, onCommit, onLeave: noop, onPick: noop, onCancel: noop, onClose: noop }
    const view = render(<DateEditor {...props} editing={{ draft: '2026-05-18', mode: 'edit' }} />)
    const input = view.container.querySelector('input') as HTMLInputElement

    expect(datum.required).toBe(true)
    fireEvent.change(input, { target: { value: '' } })
    expect(onDraft).not.toHaveBeenCalledWith('')
    expect(onDraft).toHaveBeenLastCalledWith('2026-05-18')
    view.rerender(<DateEditor {...props} editing={{ draft: '2026-05-18', mode: 'edit' }} />)
    expect(input.value).toBe('2026-05-18')
    expect(onCommit).not.toHaveBeenCalled()
  })
})
