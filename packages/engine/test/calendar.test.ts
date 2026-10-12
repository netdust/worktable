import { Database } from 'bun:sqlite'
import { beforeEach, describe, expect, test } from 'bun:test'
import {
  type CalendarDecl,
  type ColumnDecl,
  type DatasetDecl,
  type Domain,
  DomainError,
  defineDataset,
  migrate,
  seedDomain,
  validateDomain,
} from '../src'
import { send } from './fixture'
import { signIn, testEngine } from './sign-in'

const CAL: CalendarDecl = { day: 'day', start: 'begins', end: 'ends', lanes: ['room_id'] }

const room = defineDataset({
  name: 'room',
  label: 'Rooms',
  title: 'name',
  custom: false,
  columns: { name: { type: 'text', label: 'Name' } },
})

const eventOf = (calendar: CalendarDecl | undefined, extra: Record<string, ColumnDecl> = {}): DatasetDecl =>
  defineDataset({
    name: 'event',
    label: 'Events',
    title: 'name',
    date: 'day',
    custom: false,
    ...(calendar ? { calendar } : {}),
    columns: {
      name: { type: 'text', label: 'Name' },
      day: { type: 'date', label: 'Day' },
      begins: { type: 'datetime', label: 'Begins', nullable: true },
      ends: { type: 'datetime', label: 'Ends', nullable: true },
      room_id: { type: 'integer', label: 'Room', relation: 'room' },
      count: { type: 'integer', label: 'Count', default: 0, badge: 'bad' },
      ...extra,
    },
  })

const domainOf = (event: DatasetDecl): Domain => ({
  datasets: [room, event],
  queries: [],
  writers: { event: { create: (values) => values } },
  seed: (insert) => {
    insert('room', [{ name: 'Hall' }])
    insert('event', [{ name: 'Talk', day: '2026-10-12', begins: '2026-10-12T10:00', room_id: 1 }])
  },
  views: [],
})

function failure(d: Domain): DomainError {
  try {
    validateDomain(d)
  } catch (e) {
    if (e instanceof DomainError) return e
    throw e
  }
  throw new Error('expected DomainError')
}

describe('validateDomain: calendar and badge', () => {
  test('a valid calendar passes', () => expect(() => validateDomain(domainOf(eventOf(CAL)))).not.toThrow())

  test("refuses a calendar whose day is not the source's date", () => {
    expect(failure(domainOf(eventOf({ ...CAL, day: 'begins' }))).bad).toBe('begins')
  })

  test('refuses a start or end that is not a datetime', () => {
    expect(failure(domainOf(eventOf({ ...CAL, start: 'name' }))).bad).toBe('name')
    expect(failure(domainOf(eventOf({ ...CAL, end: 'day' }))).bad).toBe('day')
  })

  test('refuses a lane that is not a relation', () => {
    expect(failure(domainOf(eventOf({ ...CAL, lanes: ['name'] }))).bad).toBe('name')
  })

  test('refuses an empty lanes list', () => {
    expect(failure(domainOf(eventOf({ ...CAL, lanes: [] }))).message).toContain('lanes')
  })

  test('refuses badge on a text column', () => {
    const bad = eventOf(CAL, { label: { type: 'text', label: 'Label', nullable: true, badge: 'bad' } })
    expect(failure(domainOf(bad)).bad).toBe('label')
  })

  test('refuses a badge tone outside the palette', () => {
    const bad = eventOf(CAL, { extra: { type: 'integer', label: 'Extra', nullable: true, badge: 'purple' as never } })
    expect(failure(domainOf(bad)).bad).toBe('purple')
  })
})

describe('calendar views and /schema', () => {
  let admin: ReturnType<typeof send>
  let plain: ReturnType<typeof send>

  beforeEach(async () => {
    const make = async (d: Domain) => {
      const sqlite = new Database(':memory:')
      migrate(sqlite, d)
      seedDomain(sqlite, d)
      const app = testEngine(sqlite, d)
      return send(app, await signIn(app, 'administrator'))
    }
    admin = await make(domainOf(eventOf(CAL)))
    plain = await make(domainOf(eventOf(undefined)))
  })

  const view = (over: Record<string, unknown>) =>
    JSON.stringify({ name: 'Cal', source: 'event', skin: 'calendar', group_by: 'room_id', ...over })

  test('a view on the calendar skin saves with group_by a lane', async () => {
    const made = await admin('POST', '/api/views', { body: view({}) })
    expect(made.status).toBe(201)
    expect([made.body.skin, made.body.group_by]).toEqual(['calendar', 'room_id'])
    const none = await admin('POST', '/api/views', { body: view({ group_by: null }) })
    expect(none.status).toBe(201)
  })

  test('refuses a calendar view grouped on a non-lane', async () => {
    const res = await admin('POST', '/api/views', { body: view({ group_by: 'name' }) })
    expect([res.status, res.body.code]).toEqual([400, 'bad_view'])
    expect(res.body.message).toContain('name')
  })

  test('refuses skin calendar on a source without calendar', async () => {
    const res = await plain('POST', '/api/views', { body: view({}) })
    expect([res.status, res.body.code]).toEqual([400, 'bad_view'])
  })

  test('/schema serves calendar and badge', async () => {
    const { body } = await admin('GET', '/api/schema')
    expect(body.sources.event.calendar).toEqual(CAL)
    expect(body.sources.event.columns.count.badge).toBe('bad')
  })
})
