import { act, cleanup, fireEvent, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { renderNl } from '../../test-setup'
import { activity, calais, planning } from '../calais.test.data'
import { columnsFor } from '../columns'
import type { EditorProps } from './props'
import { LongTextEditor, TextCell } from './Text'

const column = columnsFor(activity, { ...planning, columns: ['title', 'notes'] }).find((c) => c.id === 'notes')!

function setup(draft = 'Twee veggie') {
  const props: EditorProps = {
    column, row: { ...calais[1], fields: { ...calais[1].fields, notes: 'Twee veggie' } }, editing: { draft, mode: 'edit' },
    onDraft: vi.fn(), onCommit: vi.fn(), onLeave: vi.fn(), onPick: vi.fn(), onCancel: vi.fn(), onClose: vi.fn(),
  }
  renderNl(<table><tbody><tr><td><LongTextEditor {...props} /></td></tr></tbody></table>)
  return props
}
const area = () => screen.getByRole('textbox', { name: 'Notities' }) as HTMLTextAreaElement

afterEach(cleanup)

describe('the long text editor', () => {
  it('opens a textarea in a popover beside the cell, focused at the end of the text', () => {
    setup()

    expect(area().tagName).toBe('TEXTAREA')
    expect(area().closest('.nv-pop')?.classList.contains('nv-pop--text')).toBe(true)
    expect(document.activeElement).toBe(area())
    expect(area().selectionStart).toBe('Twee veggie'.length)
  })

  it('floats over the sheet anchored to the cell, which keeps its text', () => {
    setup()
    const td = document.querySelector('td')!

    expect(td.contains(area())).toBe(false)
    expect(td.textContent).toBe('Twee veggie')
    expect(td.querySelector('.nv-longtext__anchor')).not.toBeNull()
  })

  it('carries data-editor on the popover and its root, so its keys reach the sheet', () => {
    setup()

    expect(area().closest('[data-editor]')).not.toBeNull()
    expect(area().closest('.nv-pop')?.hasAttribute('data-editor')).toBe(true)
  })

  it('drafts what is typed, newlines kept', () => {
    const props = setup()

    fireEvent.change(area(), { target: { value: 'a\nb' } })

    expect(props.onDraft).toHaveBeenLastCalledWith('a\nb')
  })

  it('Cmd+Enter commits the draft and moves down', () => {
    const props = setup()

    fireEvent.keyDown(area(), { key: 'Enter', metaKey: true })

    expect(props.onCommit).toHaveBeenCalledTimes(1)
    expect(props.onCommit).toHaveBeenCalledWith('Twee veggie', 'down')
  })

  it('leaves when focus goes outside the editor', () => {
    const props = setup()
    const outside = document.body.appendChild(document.createElement('button'))

    act(() => outside.focus())

    expect(props.onLeave).toHaveBeenCalledTimes(1)
    outside.remove()
  })
})

describe('a long text in its cell', () => {
  it('shows its lines on one row, kept apart, so two lines never read as one', () => {
    const row = { ...calais[1], fields: { ...calais[1].fields, notes: 'beheer · 2026-10-20\nredactie · nooit' } }
    renderNl(<TextCell column={column} row={row} />)
    expect(document.querySelector('.nv-cell__text')?.textContent).toBe('beheer · 2026-10-20, redactie · nooit')
  })
})
