import { describe, expect, it } from 'vitest'
import type { MatrixColumn, Row, View } from '../types'
import { absentOn } from './away'

const view: View = {
  key: '4', label: 'Toewijzingen per activiteit', table: 'activiteit', model: 'activiteit', type: 'matrix', date_field: 'plandag',
  away: { table: 'beschikbaarheid', model: 'beschikbaarheid', column_field: 'persoon_id', label_field: 'reden', date_field: 'start_at', end_field: 'eind_at' },
}
const lotte: MatrixColumn = { key: 'record:1', kind: 'record', id: 1, title: 'Lotte Verhaegen' }
const studiedag: Row = { id: 3, title: 'Lotte Verhaegen', status: '', fields: { persoon_id: 1, start_at: '2026-10-09T09:00', eind_at: '2026-10-12T12:00', reden: 'Studiedag' } }

describe('absentOn', () => {
  it('a period that started before the window marks the days it still covers, by day', () => {
    expect(absentOn([studiedag], view, lotte, '2026-10-12')?.id).toBe(3)
    expect(absentOn([studiedag], view, lotte, '2026-10-09')?.id).toBe(3)
    expect(absentOn([studiedag], view, lotte, '2026-10-12T19:30')?.id).toBe(3)
    expect(absentOn([studiedag], view, lotte, '2026-10-13')).toBeUndefined()
  })

  it('marks only its own person', () => {
    expect(absentOn([studiedag], view, { ...lotte, key: 'record:2', id: 2 }, '2026-10-12')).toBeUndefined()
  })
})
