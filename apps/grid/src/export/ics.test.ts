import { describe, expect, it } from 'vitest'
import { columnsFor } from '../grid/columns'
import type { Model, Row, View } from '../types'
import { toIcs } from './ics'

const model: Model = {
  key: 'activiteit', label: 'Activiteit', title_label: 'Omschrijving', title_readonly: false,
  fields: {
    plandag: { type: 'date', label: 'Plandag', required: false, fact: false },
    start_at: { type: 'datetime', label: 'Start', required: false, fact: false },
    eind_at: { type: 'datetime', label: 'Einde', required: false, fact: false },
    soort: { type: 'select', label: 'Soort', required: false, fact: false, options: { opbouw: 'Opbouw' } },
    plaats: { type: 'text', label: 'Plaats', required: false, fact: false },
  },
}
const view: View = { key: 'dagplanning', label: 'Dagplanning', table: 'dagplanning', model: 'activiteit', date_field: 'plandag' }
const row = (id: number, title: string, fields: Row['fields']): Row => ({ id, title, status: 'publish', fields })
const now = new Date(Date.UTC(2026, 9, 8, 9, 30, 0))
const lines = (ics: string) => ics.split('\r\n')

describe('toIcs', () => {
  const columns = columnsFor(model, view)
  const rows = [
    row(1, 'Opbouw, zaal; podium', { plandag: '2026-10-12', start_at: '2026-10-12T08:00', eind_at: '2026-10-12T12:30', soort: 'opbouw', plaats: 'Gent' }),
    row(2, 'Reisdag', { plandag: '2026-10-13', start_at: null, eind_at: null, soort: null, plaats: null }),
  ]

  it('writes one event per dated row, CRLF, its title escaped', () => {
    const ics = toIcs(rows, view, columns, model, now)
    expect(ics.startsWith('BEGIN:VCALENDAR\r\nVERSION:2.0\r\n')).toBe(true)
    expect(ics.endsWith('END:VCALENDAR\r\n')).toBe(true)
    expect(lines(ics).filter((l) => l === 'BEGIN:VEVENT')).toHaveLength(2)
    expect(lines(ics)).toContain('SUMMARY:Opbouw\\, zaal\\; podium')
    expect(lines(ics)).toContain('DTSTAMP:20261008T093000Z')
    expect(lines(ics)).toContain('UID:dagplanning-1@worktable')
  })

  it('takes a timed row from its moment to the end declared after it, and an untimed one as the whole day', () => {
    const ics = lines(toIcs(rows, view, columns, model, now))
    expect(ics).toContain('DTSTART:20261012T080000')
    expect(ics).toContain('DTEND:20261012T123000')
    expect(ics).toContain('DTSTART;VALUE=DATE:20261013')
    expect(ics).toContain('DTEND;VALUE=DATE:20261014')
  })

  it("lists the view's other columns in the description, by label", () => {
    const ics = toIcs(rows, view, columns, model, now).replace(/\r\n /g, '')
    expect(ics).toContain('DESCRIPTION:Soort: Opbouw\\nPlaats: Gent')
  })

  it('folds a line longer than 75 octets, counting bytes, not characters', () => {
    const long = row(3, 'é'.repeat(60), { plandag: '2026-10-14' })
    const ics = toIcs([long], view, columns, model, now)
    for (const line of lines(ics)) expect(new TextEncoder().encode(line).length).toBeLessThanOrEqual(75)
    expect(ics.replace(/\r\n /g, '')).toContain(`SUMMARY:${'é'.repeat(60)}`)
  })

  it('lets no carriage return or other control character start a property of its own', () => {
    const forged = row(5, 'a\rATTENDEE:mailto:x@evil\u0000', { plandag: '2026-10-15', plaats: 'b\rURL:http://evil' })
    const ics = toIcs([forged], view, columns, model, now)
    expect(ics.split(/\r\n|\r|\n/).some((line) => /^(ATTENDEE|URL):/.test(line))).toBe(false)
    expect(ics).not.toContain('\u0000')
    expect(ics.replace(/\r\n /g, '')).toContain('SUMMARY:a\\nATTENDEE:mailto:x@evil')
  })

  it('leaves out a row without a day', () => {
    expect(lines(toIcs([row(4, 'Zonder dag', { plandag: null })], view, columns, model, now))).not.toContain('BEGIN:VEVENT')
  })
})
