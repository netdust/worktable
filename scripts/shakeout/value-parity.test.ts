import { describe, expect, test } from 'bun:test'
import {
  activityTimes,
  assignmentNote,
  assignmentState,
  canonical,
  compare,
  duplicateLosers,
  type Expected,
  kindSoort,
  organisationSoort,
  relationId,
  splitName,
  translationGroup,
} from './value-parity-rules'

describe('activityTimes', () => {
  test('no start: no times, plandag is datum, an end is dropped', () => {
    expect(activityTimes('2030-03-04', null, '18:00')).toEqual({
      datum: '2030-03-04',
      start_at: null,
      eind_at: null,
      plandag: '2030-03-04',
    })
  })

  test('an end before the start rolls to the next day, across a month', () => {
    expect(activityTimes('2030-01-31', '22:00', '01:30')).toMatchObject({
      start_at: '2030-01-31T22:00',
      eind_at: '2030-02-01T01:30',
      plandag: '2030-01-31',
    })
  })

  test('a start before 05:00 plans on the previous day', () => {
    expect(activityTimes('2030-01-01', '04:59', null).plandag).toBe('2029-12-31')
    expect(activityTimes('2030-01-01', '05:00', null).plandag).toBe('2030-01-01')
  })
})

describe('splitName', () => {
  test.each([
    ['Jan van der Berg', 'Jan', 'van der Berg', 'particle'],
    ['Els De Smet', 'Els', 'De Smet', 'particle'],
    ['Van Damme', 'Van', 'Damme', 'plain'],
    ['Jean-Luc d’Hondt', 'Jean-Luc', "d'Hondt", 'particle'],
    ['Anna Maria Peeters', 'Anna', 'Maria Peeters', 'plain'],
    ['Zorro', 'Zorro', '(onbekend)', 'single'],
  ])('%s', (title, voornaam, achternaam, kind) => {
    expect(splitName(title)).toEqual({ voornaam, achternaam, case: kind as 'plain' })
  })
})

test('maps: kinds, states and organisation roles', () => {
  expect(kindSoort('soundcheck')).toBe('opbouw')
  expect(kindSoort('free')).toBe('andere')
  expect(kindSoort('juggling')).toBeNull()
  expect(assignmentState('maybe')).toBe('uitgenodigd')
  expect(organisationSoort(['funder', 'presenter'], false)).toBe('partner')
  expect(organisationSoort(['funder'], false)).toBe('agentschap')
  expect(organisationSoort(['venue'], true)).toBe('eigen')
  expect(organisationSoort([], false)).toBe('partner')
})

test('maybe appends its note on a new line', () => {
  expect(assignmentNote(null, 'maybe')).toBe('Laika: maybe')
  expect(assignmentNote('bring a ladder', 'maybe')).toBe('bring a ladder\nLaika: maybe')
  expect(assignmentNote('bring a ladder', 'confirmed')).toBe('bring a ladder')
})

test('relations and translation groups parse from serialized PHP', () => {
  expect(relationId('a:1:{i:0;i:4711;}')).toBe(4711)
  expect(relationId('42')).toBe(42)
  expect(relationId('')).toBeNull()
  expect(relationId('a:0:{}')).toBeNull()
  expect(translationGroup('a:2:{s:2:"nl";i:9;s:2:"fr";i:12;}')).toEqual({ nl: 9, fr: 12 })
})

test('the oldest of a duplicate pair is kept; name-only rows never count', () => {
  const losers = duplicateLosers([
    { id: 30, persoon: 1, activiteit: 5 },
    { id: 10, persoon: 1, activiteit: 5 },
    { id: 20, persoon: null, activiteit: 5 },
    { id: 21, persoon: null, activiteit: 5 },
  ])
  expect([...losers]).toEqual([30])
})

test('canonical ignores key order in JSON', () => {
  expect(canonical(JSON.parse('{"b":1,"a":[2,1]}'))).toBe(canonical({ a: [2, 1], b: 1 }))
})

describe('compare', () => {
  const source = new Map<number, Expected>([
    [1, { naam: 'Alpha', state: 'bevestigd' }],
    [2, { naam: 'Beta', state: 'uitgenodigd' }],
    [3, { naam: 'Gamma', state: 'bevestigd' }],
    [4, { naam: 'Delta', state: 'bevestigd' }],
  ])
  const engine = new Map<number | null, Expected[]>([
    [1, [{ naam: 'Alpha', state: 'bevestigd' }]],
    [2, [{ naam: 'Beta', state: 'bevestigd' }]],
    [4, [{ naam: 'Delta', state: 'bevestigd' }]],
    [9, [{ naam: 'Omega', state: 'open' }]],
    [null, [{ naam: 'Nobody', state: 'open' }]],
  ])
  const tally = compare('toewijzing', ['naam', 'state'], source, engine, new Map([[4, 'duplicate']]))

  test('counts per column and keeps the values only in the detail', () => {
    expect(tally.compared).toBe(3)
    expect(tally.columns).toEqual({ naam: 0, state: 1 })
    expect(tally.detail).toEqual([
      { dataset: 'toewijzing', column: 'state', legacy_id: 2, source: 'uitgenodigd', engine: 'bevestigd' },
    ])
  })

  test('counts rows on one side only, with the reason', () => {
    expect(tally.sourceOnly).toEqual({ unexplained: 1 })
    expect(tally.engineOnly).toEqual({
      'present though dropped by rule: duplicate': 1,
      'legacy id not in source': 1,
      'no legacy id': 1,
    })
  })
})
