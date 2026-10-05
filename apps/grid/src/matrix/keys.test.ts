import { describe, expect, it } from 'vitest'
import type { View } from '../types'
import { actionForKey, cycle } from './keys'

const view: View = {
  key: 'bezetting', label: 'Bezetting', table: 'planning', model: 'activity', type: 'matrix',
  join: {
    model: 'assignment', row_field: 'activity', column_field: 'person', name_field: 'name', cell_field: 'status', note_field: 'note',
    keys: { x: 'confirmed', '1': 'confirmed', '?': 'maybe', '-': 'declined', '0': 'declined' },
    marks: { confirmed: '✓', requested: '·', maybe: '?', declined: '✕' }, count: 'confirmed',
  },
}

const plain = { ctrl: false, shift: false }
const ctrl = { ctrl: true, shift: false }

describe('actionForKey', () => {
  it.each([
    ['x', { status: 'confirmed' }],
    ['X', { status: 'confirmed' }],
    ['1', { status: 'confirmed' }],
    ['?', { status: 'maybe' }],
    ['-', { status: 'declined' }],
    ['0', { status: 'declined' }],
    ['Delete', 'remove'],
    ['Backspace', 'remove'],
    [' ', 'cycle'],
    ['q', null],
    ['Enter', null],
  ])('reads %j from the declared keys as %j', (key, action) => {
    expect(actionForKey(view, key, plain)).toEqual(action)
  })

  it.each([
    ['d', 'fill'],
    ['c', 'copy'],
    ['v', 'paste'],
    ['z', 'undo'],
    ['Z', 'undo'],
    ['y', 'redo'],
    ['x', null],
  ])('reads Ctrl/Cmd+%s as %j', (key, action) => {
    expect(actionForKey(view, key, ctrl)).toEqual(action)
  })

  it('reads Ctrl/Cmd+Shift+Z as redo', () => {
    expect(actionForKey(view, 'z', { ctrl: true, shift: true })).toBe('redo')
    expect(actionForKey(view, 'Z', { ctrl: true, shift: true })).toBe('redo')
  })

  it.each(['constructor', 'toString', '__proto__'])('reads %j as no key, not an inherited name', (key) => {
    expect(actionForKey(view, key, plain)).toBeNull()
  })

  it('reads nothing without a join', () => {
    expect(actionForKey({ ...view, join: undefined }, 'x', plain)).toBeNull()
  })
})

describe('cycle', () => {
  const order = ['requested', 'confirmed', 'maybe', 'declined']

  it('steps through the declared order and wraps', () => {
    expect(cycle(order, '')).toBe('requested')
    expect(cycle(order, 'requested')).toBe('confirmed')
    expect(cycle(order, 'declined')).toBe('requested')
    expect(cycle(order, 'unknown')).toBe('requested')
  })
})
