import { describe, expect, it } from 'vitest'
import type { Model } from '../types'
import { lifecycleOf, reachable } from './reachable'

const options = { type: 'select', label: 'Status', required: true, fact: false, options: { open: 'Open', klaar: 'Klaar', weg: 'Weg' } }
const unit = (extra: object = {}) =>
  ({ key: 'unit', label: 'Units', title_label: 'Naam', title_readonly: false, fields: { status: options, soort: options }, ...extra }) as unknown as Model
const transitions = [
  { from: ['open'], to: 'klaar' },
  { from: '*' as const, to: 'weg' },
]
const life = { model: unit({ lifecycle: 'status', lifecycle_transitions: transitions }), column: 'status' }

describe('reachable', () => {
  it('reaches every lane on a column without a lifecycle', () => {
    expect(reachable(null, 'open', 'klaar')).toBe(true)
    expect(reachable(null, 'open', null)).toBe(true)
  })

  it('reaches a lane a transition from any state leads to', () => {
    expect(reachable(life, 'klaar', 'weg')).toBe(true)
    expect(reachable(life, null, 'weg')).toBe(true)
  })

  it('reaches a lane a transition from the card’s state leads to, and no other', () => {
    expect(reachable(life, 'open', 'klaar')).toBe(true)
    expect(reachable(life, 'weg', 'klaar')).toBe(false)
    expect(reachable(life, 'klaar', 'open')).toBe(false)
  })

  it('never reaches the lane of no state', () => {
    expect(reachable(life, 'open', null)).toBe(false)
  })

  it('reaches the card’s own lane: staying is a reorder, not a transition', () => {
    expect(reachable(life, 'klaar', 'klaar')).toBe(true)
  })

  it('reaches no other lane when no transitions are served', () => {
    const none = { model: unit({ lifecycle: 'status' }), column: 'status' }
    expect(reachable(none, 'open', 'klaar')).toBe(false)
    expect(reachable(none, 'open', 'open')).toBe(true)
  })
})

describe('lifecycleOf', () => {
  const target = unit({ key: 'taak', lifecycle: 'status', lifecycle_transitions: transitions })
  const writing = (field: string) =>
    unit({ key: 'overzicht', query: true, fields: { status: { ...options, writes: { dataset: 'taak', field, key: 'taak_id' } } } })

  it('is the dataset itself on its lifecycle column, and nothing on another column', () => {
    const model = unit({ lifecycle: 'status' })
    expect(lifecycleOf(model, 'status', {})).toEqual({ model, column: 'status' })
    expect(lifecycleOf(model, 'soort', {})).toBeNull()
  })

  it('is the target’s lifecycle on a query column that writes it', () => {
    expect(lifecycleOf(writing('status'), 'status', { taak: target })).toEqual({ model: target, column: 'status' })
  })

  it('is nothing on a query column that writes another column of the target', () => {
    expect(lifecycleOf(writing('soort'), 'status', { taak: target })).toBeNull()
  })

  it('is nothing when the target is not served', () => {
    expect(lifecycleOf(writing('status'), 'status', {})).toBeNull()
  })
})
