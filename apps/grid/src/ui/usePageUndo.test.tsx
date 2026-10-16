import { cleanup, fireEvent, renderHook } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { usePageUndo } from './usePageUndo'

const saves = () => ({ undo: vi.fn(() => Promise.resolve()), redo: vi.fn(() => Promise.resolve()) })

afterEach(() => {
  cleanup()
  document.body.replaceChildren()
})

describe('⌘Z on the page', () => {
  it('⌘Z on the body undoes', () => {
    const page = saves()
    renderHook(() => usePageUndo(page))

    fireEvent.keyDown(document.body, { key: 'z', metaKey: true })

    expect(page.undo).toHaveBeenCalledOnce()
    expect(page.redo).not.toHaveBeenCalled()
  })

  it('⇧⌘Z redoes', () => {
    const page = saves()
    renderHook(() => usePageUndo(page))

    fireEvent.keyDown(document.body, { key: 'Z', metaKey: true, shiftKey: true })

    expect(page.redo).toHaveBeenCalledOnce()
    expect(page.undo).not.toHaveBeenCalled()
  })

  it('a dialog and a select keep the key', () => {
    const page = saves()
    renderHook(() => usePageUndo(page))
    const dialog = document.createElement('div')
    dialog.setAttribute('role', 'dialog')
    const button = document.createElement('button')
    dialog.append(button)
    const select = document.createElement('select')
    document.body.append(dialog, select)

    fireEvent.keyDown(button, { key: 'z', ctrlKey: true })
    fireEvent.keyDown(select, { key: 'z', ctrlKey: true })
    fireEvent.keyDown(select, { key: 'z', ctrlKey: true, shiftKey: true })

    expect(page.undo).not.toHaveBeenCalled()
    expect(page.redo).not.toHaveBeenCalled()
  })

  it('a key already handled is left alone', () => {
    const page = saves()
    renderHook(() => usePageUndo(page))
    const cell = document.createElement('div')
    cell.addEventListener('keydown', (event) => event.preventDefault())
    document.body.append(cell)

    fireEvent.keyDown(cell, { key: 'z', metaKey: true })

    expect(page.undo).not.toHaveBeenCalled()
  })
})
