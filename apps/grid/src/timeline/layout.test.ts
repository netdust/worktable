import { describe, expect, it } from 'vitest'
import type { CalendarDef, Row } from '../types'
import { bars, timelineWindow } from './layout'

const today = new Date(2026, 9, 14)
const CAL: CalendarDef = { day: 'start_datum', start: null, end: 'eind_datum', lanes: ['productie_id'], spans: true }
const row = (id: number, from: string, to: string | null, lane?: [number, string]): Row => ({
  id, title: `r${id}`, status: '', fields: { start_datum: from, eind_datum: to, productie_id: lane?.[0] ?? null },
  lookups: lane ? { productie_id: { id: lane[0], title: lane[1], status: '', fields: {} } } : {},
})

describe('timelineWindow', () => {
  it('keeps a week, a month or up to 92 days; a longer range opens its first week; none, this week', () => {
    expect(timelineWindow(null, today)).toEqual({ from: '2026-10-12', to: '2026-10-18' })
    expect(timelineWindow({ from: '2026-10-01', to: '2026-10-31' }, today)).toEqual({ from: '2026-10-01', to: '2026-10-31' })
    expect(timelineWindow({ from: '2026-10-14', to: '2026-12-12' }, today)).toEqual({ from: '2026-10-14', to: '2026-12-12' })
    expect(timelineWindow({ from: '2026-10-14', to: '2027-02-10' }, today)).toEqual({ from: '2026-10-12', to: '2026-10-18' })
  })
})

describe('bars', () => {
  const week = { from: '2026-10-12', to: '2026-10-18' }
  it('places a span from its first to its last day, clipped to the window', () => {
    const { lanes } = bars([row(1, '2026-10-14', '2026-10-15'), row(2, '2026-10-01', '2026-11-30')], CAL, week, null)
    expect(lanes.map((l) => l.bars.map((b) => [b.row.id, b.start, b.length]))).toEqual([[[1, 2, 2]], [[2, 0, 7]]])
  })

  it('groups bars by lane, by title, and leaves out rows outside the window', () => {
    const rows = [row(1, '2026-10-12', '2026-10-13', [2, 'Nachtwacht']), row(2, '2026-10-16', '2026-10-17', [1, 'De Kersentuin']), row(3, '2026-11-01', '2026-11-02', [1, 'De Kersentuin'])]
    const { lanes } = bars(rows, CAL, week, 'productie_id')
    expect(lanes.map((l) => [l.title, l.bars.map((b) => b.row.id)])).toEqual([['De Kersentuin', [2]], ['Nachtwacht', [1]]])
  })
})
