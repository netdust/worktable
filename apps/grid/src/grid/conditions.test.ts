import { describe, expect, it } from 'vitest'
import { type Filter, fromEngine, put, toEngine, windowOf } from './conditions'

const kinds: Record<string, 'choice' | 'text' | 'date' | 'datetime' | 'bool'> = {
  status: 'choice', soort: 'choice', locatie: 'choice', omschrijving: 'text', plandag: 'date', start: 'datetime', klaar: 'bool',
}
const kindOf = (field: string) => kinds[field] ?? 'text'

describe('a condition on the wire', () => {
  const cases: [Filter, Record<string, unknown>][] = [
    [{ field: 'status', op: 'in', values: ['optie'] }, { status: { $eq: 'optie' } }],
    [{ field: 'status', op: 'in', values: ['optie', 'bevestigd'] }, { status: { $in: ['optie', 'bevestigd'] } }],
    [{ field: 'status', op: 'nin', values: ['geannuleerd'] }, { status: { $nin: ['geannuleerd'] } }],
    [{ field: 'locatie', op: 'empty', values: [] }, { locatie: { $exists: false } }],
    [{ field: 'locatie', op: 'filled', values: [] }, { locatie: { $exists: true } }],
    [{ field: 'omschrijving', op: 'like', values: ['zaal'] }, { omschrijving: { $like: 'zaal' } }],
    [{ field: 'omschrijving', op: 'nlike', values: ['zaal'] }, { omschrijving: { $nlike: 'zaal' } }],
    [{ field: 'omschrijving', op: 'eq', values: ['Lunch'] }, { omschrijving: { $eq: 'Lunch' } }],
    [{ field: 'plandag', op: 'week', values: [] }, { plandag: { $period: 'week' } }],
    [{ field: 'plandag', op: 'next_week', values: [] }, { plandag: { $period: 'next_week' } }],
    [{ field: 'plandag', op: 'month', values: [] }, { plandag: { $period: 'month' } }],
    [{ field: 'plandag', op: 'between', values: ['2026-10-12', '2026-10-18'] }, { plandag: { $gte: '2026-10-12', $lte: '2026-10-18' } }],
  ]
  it.each(cases)('maps %j to the engine and back', (condition, engine) => {
    expect(toEngine([condition], kindOf)).toEqual(engine)
    expect(fromEngine(engine, kindOf)).toEqual({ conditions: [condition], fixed: {}, join: 'and' })
  })

  it('ends "ligt tussen" on a datetime at the last day\'s 23:59:59, so a row at 09:00 that day stays', () => {
    expect(toEngine([{ field: 'start', op: 'between', values: ['2026-10-12', '2026-10-18'] }], kindOf))
      .toEqual({ start: { $gte: '2026-10-12', $lte: '2026-10-18T23:59:59' } })
    expect(fromEngine({ start: { $gte: '2026-10-12', $lte: '2026-10-18T23:59:59' } }, kindOf).conditions)
      .toEqual([{ field: 'start', op: 'between', values: ['2026-10-12', '2026-10-18'] }])
  })

  it('sends a yes/no as a boolean, "nee" as false, and reads both back', () => {
    expect(toEngine([{ field: 'klaar', op: 'in', values: ['1'] }], kindOf)).toEqual({ klaar: { $eq: true } })
    expect(toEngine([{ field: 'klaar', op: 'in', values: ['0'] }], kindOf)).toEqual({ klaar: { $eq: false } })
    expect(fromEngine({ klaar: { $eq: false } }, kindOf).conditions).toEqual([{ field: 'klaar', op: 'in', values: ['0'] }])
    expect(fromEngine({ klaar: false }, kindOf).conditions).toEqual([{ field: 'klaar', op: 'in', values: ['0'] }])
  })

  it('reads a stored bare value and a yes/no as an "is"', () => {
    expect(fromEngine({ status: 'optie', klaar: true }, kindOf).conditions).toEqual([
      { field: 'status', op: 'in', values: ['optie'] },
      { field: 'klaar', op: 'in', values: ['1'] },
    ])
  })

  it('keeps a custom field\'s filter fixed: the builder does not offer it', () => {
    expect(fromEngine({ 'custom.zaal': { $in: ['groot'] } }, kindOf)).toEqual({ conditions: [], fixed: { 'custom.zaal': { $in: ['groot'] } }, join: 'and' })
  })

  it('keeps as fixed what no condition says', () => {
    expect(fromEngine({ status: { $ne: 'optie' }, plandag: { $gt: '2026-01-01' } }, kindOf))
      .toEqual({ conditions: [], fixed: { status: { $ne: 'optie' }, plandag: { $gt: '2026-01-01' } }, join: 'and' })
  })

  it('sends no condition that is not complete: an empty value list, an empty text, a half range', () => {
    expect(toEngine([
      { field: 'status', op: 'in', values: [] },
      { field: 'omschrijving', op: 'like', values: [''] },
      { field: 'plandag', op: 'between', values: ['2026-10-12'] },
    ], kindOf)).toEqual({})
  })
})

describe('the join', () => {
  const soort: Filter = { field: 'soort', op: 'in', values: ['repetitie'] }
  const locatie: Filter = { field: 'locatie', op: 'empty', values: [] }
  const week: Filter = { field: 'plandag', op: 'week', values: [] }

  it('puts the conditions in $or when any may hold, the period beside it so it always narrows', () => {
    expect(toEngine([week, soort, locatie], kindOf, 'or')).toEqual({
      plandag: { $period: 'week' },
      $or: [{ soort: { $eq: 'repetitie' } }, { locatie: { $exists: false } }],
    })
  })

  it('needs two conditions for an $or: one alone is a plain key', () => {
    expect(toEngine([week, soort], kindOf, 'or')).toEqual({ plandag: { $period: 'week' }, soort: { $eq: 'repetitie' } })
  })

  it('reads an $or back as its conditions and the join', () => {
    expect(fromEngine({ plandag: { $period: 'week' }, $or: [{ soort: { $eq: 'repetitie' } }, { locatie: { $exists: false } }] }, kindOf))
      .toEqual({ conditions: [week, soort, locatie], fixed: {}, join: 'or' })
    expect(fromEngine({ soort: 'repetitie' }, kindOf).join).toBe('and')
  })

  it('keeps fixed an $or it cannot show: a branch of two keys, or a custom key', () => {
    const two = { $or: [{ soort: 'repetitie', locatie: { $exists: false } }, { status: 'optie' }] }
    expect(fromEngine(two, kindOf)).toEqual({ conditions: [], fixed: two, join: 'and' })
    const custom = { $or: [{ 'custom.zaal': 'groot' }, { status: 'optie' }] }
    expect(fromEngine(custom, kindOf)).toEqual({ conditions: [], fixed: custom, join: 'and' })
  })
})

describe('putting a condition', () => {
  it('replaces the one with the same engine key on that field', () => {
    const one: Filter[] = [{ field: 'locatie', op: 'empty', values: [] }]
    expect(put(one, { field: 'locatie', op: 'filled', values: [] })).toEqual([{ field: 'locatie', op: 'filled', values: [] }])
  })

  it('keeps one date condition per date field: a range replaces a period', () => {
    const one: Filter[] = [{ field: 'plandag', op: 'week', values: [] }, { field: 'status', op: 'in', values: ['optie'] }]
    expect(put(one, { field: 'plandag', op: 'between', values: ['2026-10-12', '2026-10-18'] }, kindOf)).toEqual([
      { field: 'plandag', op: 'between', values: ['2026-10-12', '2026-10-18'] },
      { field: 'status', op: 'in', values: ['optie'] },
    ])
  })
})

describe('the days a date condition spans', () => {
  const today = new Date(2026, 11, 31)
  it('reads week, next week and month from today, Monday to Sunday', () => {
    expect(windowOf({ field: 'plandag', op: 'week', values: [] }, today)).toEqual({ from: '2026-12-28', to: '2027-01-03' })
    expect(windowOf({ field: 'plandag', op: 'next_week', values: [] }, today)).toEqual({ from: '2027-01-04', to: '2027-01-10' })
    expect(windowOf({ field: 'plandag', op: 'month', values: [] }, today)).toEqual({ from: '2026-12-01', to: '2026-12-31' })
    expect(windowOf({ field: 'plandag', op: 'between', values: ['2026-10-12', '2026-10-18'] }, today)).toEqual({ from: '2026-10-12', to: '2026-10-18' })
    expect(windowOf(undefined, today)).toBeNull()
  })
})
