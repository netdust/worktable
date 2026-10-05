import { describe, expect, it } from 'vitest'
import { type Cell, type Effect, type Input, type KeyState, initial, reduce, type Sheet } from './keys'

// 3 rows × 4 columns: col 0 the title, col 1 required, col 2 optional, col 3 a read-only lookup; col 2 on row 2 a toggle.
const sheet: Sheet = {
  rows: 3,
  cols: 4,
  editable: (c) => c.col !== 3,
  required: (c) => c.col <= 1,
  toggles: (c) => c.row === 2 && c.col === 2,
  value: (c) => `r${c.row}c${c.col}`,
}

const at = (row: number, col: number): Cell => ({ row, col })
const on = (cell: Cell): KeyState => ({ ...initial, active: cell, selection: cell })
const key = (k: string, mods: Partial<Omit<Extract<Input, { type: 'key' }>, 'type' | 'key'>> = {}): Input => ({ type: 'key', key: k, ...mods })

function run(state: KeyState, ...inputs: Input[]) {
  let effect: Effect = { type: 'none' }
  for (const input of inputs) ({ state, effect } = reduce(state, input, sheet))
  return { state, effect }
}

describe('moving', () => {
  it('moves the active cell with the arrows and stops at every edge', () => {
    expect(run(on(at(1, 1)), key('ArrowDown')).state.active).toEqual(at(2, 1))
    expect(run(on(at(2, 1)), key('ArrowDown')).state.active).toEqual(at(2, 1))
    expect(run(on(at(0, 0)), key('ArrowUp')).state.active).toEqual(at(0, 0))
    expect(run(on(at(0, 0)), key('ArrowLeft')).state.active).toEqual(at(0, 0))
    expect(run(on(at(0, 3)), key('ArrowRight')).state.active).toEqual(at(0, 3))
    expect(run(on(at(0, 3)), key('ArrowRight')).effect).toEqual({ type: 'none' })
  })

  it('activates the first cell on the first arrow, and the selection follows the active cell', () => {
    expect(run(initial, key('ArrowDown')).state).toMatchObject({ active: at(0, 0), selection: at(0, 0) })
    expect(run(on(at(0, 0)), key('ArrowRight')).state.selection).toEqual(at(0, 1))
  })

  it('moves right on Tab and left on Shift+Tab', () => {
    expect(run(on(at(1, 1)), key('Tab')).state.active).toEqual(at(1, 2))
    expect(run(on(at(1, 1)), key('Tab', { shift: true })).state.active).toEqual(at(1, 0))
  })

  it('lets Tab leave the grid past the last column and Shift+Tab past the first', () => {
    expect(run(on(at(1, 3)), key('Tab'))).toEqual({ state: on(at(1, 3)), effect: { type: 'ignore' } })
    expect(run(on(at(1, 0)), key('Tab', { shift: true }))).toEqual({ state: on(at(1, 0)), effect: { type: 'ignore' } })
  })

  it('activates a clicked cell', () => {
    expect(run(initial, { type: 'click', cell: at(2, 3) }).state.active).toEqual(at(2, 3))
  })
})

describe('editing', () => {
  it('opens the editor with the typed character on a printable key (replace-and-edit)', () => {
    const { state, effect } = run(on(at(1, 2)), key('7'))
    expect(state.editing).toEqual({ draft: '7', mode: 'enter' })
    expect(effect).toEqual({ type: 'none' })
  })

  it('opens the editor with the current value on Enter and on double-click', () => {
    expect(run(on(at(1, 2)), key('Enter')).state.editing).toEqual({ draft: 'r1c2', mode: 'edit' })
    expect(run(initial, { type: 'dblclick', cell: at(0, 1) }).state).toMatchObject({ active: at(0, 1), editing: { draft: 'r0c1', mode: 'edit' } })
  })

  it('opens nothing on a read-only cell', () => {
    expect(run(on(at(0, 3)), key('a')).state.editing).toBeNull()
    expect(run(on(at(0, 3)), key('Enter')).state.editing).toBeNull()
  })

  it('cancels on Escape without a write', () => {
    const { state, effect } = run(on(at(1, 2)), key('x'), key('Escape'))
    expect(state.editing).toBeNull()
    expect(state.active).toEqual(at(1, 2))
    expect(effect).toEqual({ type: 'cancel', cell: at(1, 2) })
  })

  it('commits the draft on Tab and moves right; Shift+Tab moves left', () => {
    const tab = run(on(at(1, 1)), key('x'), { type: 'draft', value: 'xyz' }, key('Tab'))
    expect(tab.effect).toEqual({ type: 'write', cell: at(1, 1), draft: 'xyz' })
    expect(tab.state).toMatchObject({ active: at(1, 2), editing: null })

    const back = run(on(at(1, 1)), key('x'), key('Tab', { shift: true }))
    expect(back.effect).toEqual({ type: 'write', cell: at(1, 1), draft: 'x' })
    expect(back.state.active).toEqual(at(1, 0))
  })

  it('commits on Enter and moves down, the spreadsheet way', () => {
    const { state, effect } = run(on(at(0, 2)), key('Enter'), { type: 'draft', value: 'new' }, key('Enter'))
    expect(effect).toEqual({ type: 'write', cell: at(0, 2), draft: 'new' })
    expect(state).toMatchObject({ active: at(1, 2), editing: null })
  })

  it('commits and moves on an arrow after replace-and-edit, but leaves arrows to the caret after Enter', () => {
    const typed = run(on(at(0, 2)), key('5'), key('ArrowDown'))
    expect(typed.effect).toEqual({ type: 'write', cell: at(0, 2), draft: '5' })
    expect(typed.state.active).toEqual(at(1, 2))

    const opened = run(on(at(0, 2)), key('Enter'), key('ArrowLeft'))
    expect(opened.effect).toEqual({ type: 'ignore' })
    expect(opened.state.editing).not.toBeNull()
  })

  it("leaves a key typed into the editor to the input", () => {
    expect(run(on(at(0, 2)), key('a'), key('b')).effect).toEqual({ type: 'ignore' })
  })

  it('commits what an editor picked, then moves as asked', () => {
    const { state, effect } = run(on(at(0, 1)), key('Enter'), { type: 'commit', value: 'meal', move: 'right' })
    expect(effect).toEqual({ type: 'write', cell: at(0, 1), draft: 'meal' })
    expect(state).toMatchObject({ active: at(0, 2), editing: null })
  })
})

describe('Delete', () => {
  it('empties an optional field', () => {
    expect(run(on(at(1, 2)), key('Delete')).effect).toEqual({ type: 'clear', cell: at(1, 2) })
    expect(run(on(at(1, 2)), key('Backspace')).effect).toEqual({ type: 'clear', cell: at(1, 2) })
  })

  it('is a no-op on a required field and on a read-only one', () => {
    expect(run(on(at(1, 1)), key('Delete')).effect).toEqual({ type: 'none' })
    expect(run(on(at(1, 0)), key('Delete')).effect).toEqual({ type: 'none' })
    expect(run(on(at(1, 3)), key('Delete')).effect).toEqual({ type: 'none' })
  })
})

describe('toggles', () => {
  it('flips a toggle on Enter or Space instead of opening an editor', () => {
    expect(run(on(at(2, 2)), key('Enter'))).toEqual({ state: on(at(2, 2)), effect: { type: 'toggle', cell: at(2, 2) } })
    expect(run(on(at(2, 2)), key(' ')).effect).toEqual({ type: 'toggle', cell: at(2, 2) })
  })
})

describe('undo and redo', () => {
  it('undoes on Ctrl+Z after a commit, redoes on Ctrl+Y, Cmd on a Mac, Shift+Cmd+Z too', () => {
    const committed = run(on(at(1, 2)), key('x'), key('Enter')).state
    expect(run(committed, key('z', { ctrl: true })).effect).toEqual({ type: 'undo' })
    expect(run(committed, key('z', { meta: true })).effect).toEqual({ type: 'undo' })
    expect(run(committed, key('y', { ctrl: true })).effect).toEqual({ type: 'redo' })
    expect(run(committed, key('z', { meta: true, shift: true })).effect).toEqual({ type: 'redo' })
  })

  it("leaves Ctrl+Z inside an open editor to the input's own undo", () => {
    expect(run(on(at(1, 2)), key('x'), key('z', { ctrl: true })).effect).toEqual({ type: 'ignore' })
  })
})

describe('clipboard', () => {
  it("leaves Ctrl+C and Ctrl+V to the browser so the copy and paste events fire", () => {
    expect(run(on(at(1, 2)), key('c', { ctrl: true })).effect).toEqual({ type: 'ignore' })
    expect(run(on(at(1, 2)), key('v', { meta: true })).effect).toEqual({ type: 'ignore' })
  })
})
