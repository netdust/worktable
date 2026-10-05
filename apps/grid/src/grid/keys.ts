export interface Cell {
  row: number
  col: number
}

/** `enter`: opened by typing, arrows commit and move. `edit`: opened by Enter or a double-click, arrows move the caret. */
export interface Editing {
  draft: string
  mode: 'enter' | 'edit'
}

export interface KeyState {
  active: Cell | null
  editing: Editing | null
  /** One cell in this plan; ranges are views-matrix's. */
  selection: Cell | null
}

/** What the reducer may ask of the sheet it moves over. */
export interface Sheet {
  rows: number
  cols: number
  editable: (cell: Cell) => boolean
  required: (cell: Cell) => boolean
  toggles: (cell: Cell) => boolean
  value: (cell: Cell) => string
}

export type Move = 'down' | 'right' | 'left' | 'stay'

export type Input =
  | { type: 'key'; key: string; ctrl?: boolean; meta?: boolean; shift?: boolean }
  | { type: 'click'; cell: Cell }
  | { type: 'dblclick'; cell: Cell }
  | { type: 'draft'; value: string }
  | { type: 'commit'; value: string; move?: Move }

/** `ignore`: not ours, the browser keeps the key. `none`: ours, nothing to write. */
export type Effect =
  | { type: 'none' }
  | { type: 'ignore' }
  | { type: 'write'; cell: Cell; draft: string }
  | { type: 'clear'; cell: Cell }
  | { type: 'toggle'; cell: Cell }
  | { type: 'cancel'; cell: Cell }
  | { type: 'undo' }
  | { type: 'redo' }

export interface Result {
  state: KeyState
  effect: Effect
}

export const initial: KeyState = { active: null, editing: null, selection: null }

const NONE: Effect = { type: 'none' }
const IGNORE: Effect = { type: 'ignore' }

const ARROWS: Record<string, [number, number]> = {
  ArrowUp: [-1, 0],
  ArrowDown: [1, 0],
  ArrowLeft: [0, -1],
  ArrowRight: [0, 1],
}

const STEP: Record<Move, [number, number]> = { down: [1, 0], right: [0, 1], left: [0, -1], stay: [0, 0] }

function clamp(value: number, max: number): number {
  return Math.max(0, Math.min(max - 1, value))
}

function at(cell: Cell, [dr, dc]: [number, number], sheet: Sheet): KeyState {
  const next = { row: clamp(cell.row + dr, sheet.rows), col: clamp(cell.col + dc, sheet.cols) }
  return { active: next, editing: null, selection: next }
}

function focus(cell: Cell): KeyState {
  return { active: cell, editing: null, selection: cell }
}

function open(cell: Cell, sheet: Sheet): KeyState | null {
  return sheet.editable(cell) && !sheet.toggles(cell) ? { ...focus(cell), editing: { draft: sheet.value(cell), mode: 'edit' } } : null
}

function commit(cell: Cell, draft: string, move: Move, sheet: Sheet): Result {
  return { state: at(cell, STEP[move], sheet), effect: { type: 'write', cell, draft } }
}

function editingKey(state: KeyState, cell: Cell, editing: Editing, input: Extract<Input, { type: 'key' }>, sheet: Sheet): Result {
  switch (input.key) {
    case 'Escape':
      return { state: focus(cell), effect: { type: 'cancel', cell } }
    case 'Enter':
      return commit(cell, editing.draft, 'down', sheet)
    case 'Tab':
      return commit(cell, editing.draft, input.shift ? 'left' : 'right', sheet)
  }
  const arrow = ARROWS[input.key]
  if (arrow && editing.mode === 'enter') {
    return { state: at(cell, arrow, sheet), effect: { type: 'write', cell, draft: editing.draft } }
  }
  return { state, effect: IGNORE }
}

function idleKey(state: KeyState, cell: Cell, input: Extract<Input, { type: 'key' }>, sheet: Sheet): Result {
  const command = input.ctrl || input.meta
  const lower = input.key.toLowerCase()

  if (command && lower === 'z') return { state, effect: { type: input.shift ? 'redo' : 'undo' } }
  if (command && lower === 'y') return { state, effect: { type: 'redo' } }
  if (command) return { state, effect: IGNORE }

  const arrow = ARROWS[input.key]
  if (arrow) return { state: at(cell, arrow, sheet), effect: NONE }

  switch (input.key) {
    case 'Tab': {
      const edge = input.shift ? cell.col === 0 : cell.col === sheet.cols - 1
      return edge ? { state, effect: IGNORE } : { state: at(cell, STEP[input.shift ? 'left' : 'right'], sheet), effect: NONE }
    }
    case 'Enter':
    case ' ':
      if (sheet.editable(cell) && sheet.toggles(cell)) return { state, effect: { type: 'toggle', cell } }
      if (input.key === ' ') break
      return { state: open(cell, sheet) ?? state, effect: NONE }
    case 'Delete':
    case 'Backspace':
      return { state, effect: sheet.editable(cell) && !sheet.required(cell) ? { type: 'clear', cell } : NONE }
    case 'Escape':
      return { state, effect: IGNORE }
  }

  if (input.key.length === 1 && sheet.editable(cell) && !sheet.toggles(cell)) {
    return { state: { ...state, editing: { draft: input.key, mode: 'enter' } }, effect: NONE }
  }
  return { state, effect: input.key.length === 1 ? NONE : IGNORE }
}

export function reduce(state: KeyState, input: Input, sheet: Sheet): Result {
  switch (input.type) {
    case 'click':
      return { state: focus(input.cell), effect: NONE }
    case 'dblclick':
      return { state: open(input.cell, sheet) ?? focus(input.cell), effect: NONE }
    case 'draft':
      return { state: state.editing ? { ...state, editing: { ...state.editing, draft: input.value } } : state, effect: NONE }
    case 'commit':
      return state.active ? commit(state.active, input.value, input.move ?? 'stay', sheet) : { state, effect: NONE }
  }

  if (!state.active) {
    return ARROWS[input.key] || input.key === 'Tab' ? { state: focus({ row: 0, col: 0 }), effect: NONE } : { state, effect: IGNORE }
  }
  return state.editing ? editingKey(state, state.active, state.editing, input, sheet) : idleKey(state, state.active, input, sheet)
}
