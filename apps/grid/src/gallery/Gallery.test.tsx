import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Field, Row } from '../types'

vi.mock('../api', () => ({ filesOf: vi.fn(), fileUrl: vi.fn() }))
const { sectionsOf } = await import('./Gallery')

const row = (id: number, fields: Record<string, unknown>): Row => ({ id, title: String(id), status: '', fields })
const ids = (sections: ReturnType<typeof sectionsOf>) => sections.map((s) => [s.label, s.rows.map((r) => r.id)])

beforeEach(() => {
  document.documentElement.lang = 'nl-BE'
})
afterEach(() => {
  document.documentElement.lang = ''
})

describe('a gallery\'s sections', () => {
  it('is one unnamed section without a group', () => {
    expect(ids(sectionsOf([row(1, {})], undefined, null))).toEqual([[null, [1]]])
  })

  it('orders an option field\'s sections as declared, its unknown values after, Geen last', () => {
    const soort = { type: 'select', label: 'Soort', required: false, fact: false, options: { b: 'Bee', a: 'Aa' } } as Field
    const rows = [row(1, { soort: 'a' }), row(2, {}), row(3, { soort: 'b' }), row(4, { soort: 'z' })]
    expect(ids(sectionsOf(rows, soort, 'soort'))).toEqual([['Bee', [3]], ['Aa', [1]], ['z', [4]], ['Geen', [2]]])
  })

  it('orders days ascending, a datetime by its day, each head its weekday with the day under it', () => {
    const start = { type: 'datetime', label: 'Start', required: false, fact: false } as Field
    const sections = sectionsOf([row(1, { start: '2026-10-14T10:00' }), row(2, { start: '2026-10-13T20:00' }), row(3, { start: '2026-10-14T08:00' })], start, 'start')
    expect(sections.map((s) => [s.label, s.sub, s.rows.map((r) => r.id)])).toEqual([['Dinsdag', '13 oktober', [2]], ['Woensdag', '14 oktober', [1, 3]]])
  })
})
