import { Database } from 'bun:sqlite'
import { beforeEach, describe, expect, test } from 'bun:test'
import {
  type CalendarDecl,
  type DatasetDecl,
  type Domain,
  DomainError,
  defineDataset,
  defineQuery,
  migrate,
  type QueryDecl,
  seedDomain,
  validateDomain,
} from '../src'
import { send } from './fixture'
import { domain as fileDomain, freshDb as freshFileDb } from './fixtures/attachment-domain'
import { signIn, testEngine } from './sign-in'

describe('the batched attachments read', () => {
  let sqlite: Database
  let app: ReturnType<typeof testEngine>
  let editor: ReturnType<typeof send>

  const file = (entity: string, record: number, kind: string, name: string): number => {
    sqlite.run(
      `INSERT INTO attachment (entity, record_id, kind, name, mime, size, sha256, uploaded_by)
       VALUES (?, ?, ?, ?, 'image/png', 1, 'x', 1)`,
      [entity, record, kind, name],
    )
    return (sqlite.query('SELECT last_insert_rowid() AS id').get() as { id: number }).id
  }

  beforeEach(async () => {
    sqlite = freshFileDb()
    app = testEngine(sqlite, fileDomain)
    editor = send(app, await signIn(app))
  })

  test('the batched read answers each readable id’s newest file of the kind, and none of another kind', async () => {
    file('box', 1, 'photo', 'old.png')
    const newest = file('box', 1, 'photo', 'new.png')
    file('box', 1, 'doc', 'plan.pdf')
    const second = file('box', 2, 'photo', 'two.png')
    const gone = file('box', 2, 'photo', 'gone.png')
    sqlite.run('UPDATE attachment SET deleted_at = ? WHERE id = ?', [new Date().toISOString(), gone])
    const res = await editor('GET', '/api/attachments/box?ids=1,2,3&kind=photo')
    expect(res.status).toBe(200)
    expect(res.body).toEqual({
      files: {
        '1': { id: newest, mime: 'image/png', name: 'new.png' },
        '2': { id: second, mime: 'image/png', name: 'two.png' },
      },
    })
    const docs = await editor('GET', '/api/attachments/box?ids=2&kind=doc')
    expect(docs.body).toEqual({ files: {} })
  })

  test('the batched read leaves out an id the owner cannot read', async () => {
    file('box', 1, 'photo', 'theirs.png')
    const own = file('box', 2, 'photo', 'mine.png')
    const owner = send(app, await signIn(app, 'owner', { dataset: 'box', id: 2 }))
    const res = await owner('GET', '/api/attachments/box?ids=1,2&kind=photo')
    expect(res.status).toBe(200)
    expect(res.body).toEqual({ files: { '2': { id: own, mime: 'image/png', name: 'mine.png' } } })
  })

  test('an owner on a dataset without owner_visible gets 404, as the single read', async () => {
    file('shelf', 1, 'doc', 'a.pdf')
    const owner = send(app, await signIn(app, 'owner', { dataset: 'shelf', id: 1 }))
    const single = await owner('GET', '/api/attachments/shelf/1')
    const batched = await owner('GET', '/api/attachments/shelf?ids=1&kind=doc')
    expect([batched.status, batched.body.code]).toEqual([404, 'unknown_source'])
    expect(batched.body).toEqual(single.body)
  })

  test('201 ids are 400', async () => {
    const ids = Array.from({ length: 201 }, (_, i) => i + 1).join(',')
    const res = await editor('GET', `/api/attachments/box?ids=${ids}&kind=photo`)
    expect([res.status, res.body.code]).toEqual([400, 'bad_ids'])
    const ok = Array.from({ length: 200 }, (_, i) => i + 1).join(',')
    expect((await editor('GET', `/api/attachments/box?ids=${ok}&kind=photo`)).status).toBe(200)
  })

  test('ids that are not positive integers are 400', async () => {
    for (const ids of ['', '0', '1,,2', '-1', '1.5', 'a', '1;2']) {
      const res = await editor('GET', `/api/attachments/box?ids=${encodeURIComponent(ids)}&kind=photo`)
      expect([res.status, res.body.code], ids).toEqual([400, 'bad_ids'])
    }
    expect((await editor('GET', '/api/attachments/box?kind=photo')).status).toBe(400)
  })

  test('an unknown kind is 400', async () => {
    const res = await editor('GET', '/api/attachments/box?ids=1&kind=sketch')
    expect([res.status, res.body.code]).toEqual([400, 'bad_kind'])
    expect((await editor('GET', '/api/attachments/box?ids=1')).status).toBe(400)
  })

  test('an unknown dataset is 404', async () => {
    const res = await editor('GET', '/api/attachments/nothing?ids=1&kind=doc')
    expect([res.status, res.body.code]).toEqual([404, 'unknown_source'])
  })
})

const CAL: CalendarDecl = { day: 'day', end: 'until', lanes: ['place_id'], spans: true }

const place = defineDataset({
  name: 'place',
  label: 'Places',
  title: 'name',
  custom: false,
  columns: { name: { type: 'text', label: 'Name' } },
})

const itemOf = (over: Partial<DatasetDecl> = {}): DatasetDecl =>
  defineDataset({
    name: 'item',
    label: 'Items',
    title: 'name',
    date: 'day',
    custom: false,
    board: { column: 'state' },
    gallery: { kind: 'picture' },
    calendar: CAL,
    attachments: { kinds: { picture: 'Picture', paper: 'Paper' } },
    columns: {
      name: { type: 'text', label: 'Name' },
      state: { type: 'text', label: 'State', options: { open: 'Open', closed: 'Closed' }, default: 'open' },
      day: { type: 'date', label: 'Day' },
      until: { type: 'date', label: 'Until', nullable: true },
      at: { type: 'datetime', label: 'At', nullable: true },
      place_id: { type: 'integer', label: 'Place', relation: 'place', nullable: true },
    },
    ...over,
  })

const listOf = (over: Partial<QueryDecl> = {}): QueryDecl =>
  defineQuery({
    name: 'item_list',
    label: 'Item list',
    title: 'name',
    sql: 'SELECT id, name, state FROM item',
    board: { column: 'state' },
    columns: {
      id: { type: 'integer', label: 'Id' },
      name: { type: 'text', label: 'Name' },
      state: { type: 'text', label: 'State', options: { open: 'Open', closed: 'Closed' } },
    },
    ...over,
  })

const domainOf = (item: DatasetDecl, list: QueryDecl = listOf()): Domain => ({
  datasets: [place, item],
  queries: [list],
  writers: { item: { create: (values) => values } },
  seed: (insert) => {
    insert('place', [{ name: 'Hall' }])
    insert('item', [{ name: 'One', day: '2026-10-12', until: '2026-10-14', place_id: 1 }])
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

describe('validateDomain: board, gallery and spans', () => {
  test('a valid board, gallery and spanning calendar pass', () => {
    expect(() => validateDomain(domainOf(itemOf()))).not.toThrow()
  })

  test('refuses a board on a column without options, or undeclared', () => {
    expect(failure(domainOf(itemOf({ board: { column: 'name' } }))).bad).toBe('name')
    expect(failure(domainOf(itemOf({ board: { column: 'nope' } }))).bad).toBe('nope')
    expect(failure(domainOf(itemOf(), listOf({ board: { column: 'name' } }))).bad).toBe('name')
  })

  test('refuses a gallery kind the attachments do not declare, or a gallery without attachments', () => {
    expect(failure(domainOf(itemOf({ gallery: { kind: 'sketch' } }))).bad).toBe('sketch')
    expect(failure(domainOf(itemOf({ attachments: undefined }))).bad).toBe('picture')
  })

  test('refuses a gallery declared on a query', () => {
    const list = { ...listOf(), gallery: { kind: 'picture' } } as QueryDecl
    expect(failure(domainOf(itemOf(), list)).bad).toBe('gallery')
  })

  test('with spans, end may be a date; without spans it stays a datetime', () => {
    expect(() => validateDomain(domainOf(itemOf({ calendar: { ...CAL, end: 'at' } })))).not.toThrow()
    expect(failure(domainOf(itemOf({ calendar: { ...CAL, spans: undefined } }))).bad).toBe('until')
    expect(failure(domainOf(itemOf({ calendar: { ...CAL, end: 'name' } }))).bad).toBe('name')
  })

  test("with spans, day stays the source's date", () => {
    expect(failure(domainOf(itemOf({ calendar: { ...CAL, day: 'until' } }))).bad).toBe('until')
  })
})

describe('board, timeline and gallery views and /schema', () => {
  let admin: ReturnType<typeof send>
  let plain: ReturnType<typeof send>

  const make = async (d: Domain) => {
    const sqlite = new Database(':memory:')
    migrate(sqlite, d)
    seedDomain(sqlite, d)
    const app = testEngine(sqlite, d)
    return send(app, await signIn(app, 'administrator'))
  }

  beforeEach(async () => {
    admin = await make(domainOf(itemOf()))
    plain = await make(
      domainOf(itemOf({ board: undefined, gallery: undefined, calendar: undefined }), listOf({ board: undefined })),
    )
  })

  const view = (skin: string, over: Record<string, unknown> = {}) =>
    JSON.stringify({ name: skin, source: 'item', skin, filters: {}, sort: [], group_by: null, ...over })

  test('a timeline view saves where the source declares calendar', async () => {
    const made = await admin('POST', '/api/views', { body: view('timeline', { group_by: 'place_id' }) })
    expect([made.status, made.body.skin, made.body.group_by]).toEqual([201, 'timeline', 'place_id'])
    const refused = await plain('POST', '/api/views', { body: view('timeline') })
    expect([refused.status, refused.body.code]).toEqual([400, 'bad_view'])
  })

  test('a board and a gallery view save where the source declares them, and are refused where not', async () => {
    for (const skin of ['board', 'gallery']) {
      expect((await admin('POST', '/api/views', { body: view(skin) })).status, skin).toBe(201)
      const refused = await plain('POST', '/api/views', { body: view(skin) })
      expect([refused.status, refused.body.code], skin).toEqual([400, 'bad_view'])
    }
    const board = await admin('POST', '/api/views', { body: view('board', { source: 'item_list' }) })
    expect(board.status).toBe(201)
  })

  test('/schema serves board, gallery and calendar spans as declared', async () => {
    const { body } = await admin('GET', '/api/schema')
    expect(body.sources.item.board).toEqual({ column: 'state' })
    expect(body.sources.item.gallery).toEqual({ kind: 'picture' })
    expect(body.sources.item.calendar).toEqual(CAL)
    expect(body.sources.item_list.board).toEqual({ column: 'state' })
    const bare = await plain('GET', '/api/schema')
    expect(bare.body.sources.item.board).toBeUndefined()
    expect(bare.body.sources.item.gallery).toBeUndefined()
  })
})
