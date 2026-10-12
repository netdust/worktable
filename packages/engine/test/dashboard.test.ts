import { Database } from 'bun:sqlite'
import { beforeEach, describe, expect, test } from 'bun:test'
import {
  type DashboardLayout,
  type Domain,
  defineDataset,
  defineQuery,
  migrate,
  type SavedViewSeed,
  seedDomain,
} from '../src'
import { recordLinkFor } from '../src/record-link'
import { seedMissing } from '../src/seed-missing'
import { SYSTEM_OWNER } from '../src/views'
import { send } from './fixture'
import { signIn, TEST_LINK_SECRET, testEngine } from './sign-in'

const crew = defineDataset({
  name: 'crew',
  label: 'Crew',
  title: 'name',
  custom: false,
  owners: { owner: 'id' },
  record_link: {},
  columns: { name: { type: 'text', label: 'Name' } },
})

const slot = defineDataset({
  name: 'slot',
  label: 'Slots',
  title: 'label',
  date: 'day',
  calendar: { day: 'day', lanes: ['crew_id'] },
  custom: false,
  owners: { owner: 'crew_id' },
  columns: {
    label: { type: 'text', label: 'Label' },
    crew_id: { type: 'integer', label: 'Crew', relation: 'crew', nullable: true },
    day: { type: 'date', label: 'Day' },
    weight: { type: 'real', label: 'Weight', default: 0 },
    state: { type: 'text', label: 'State', options: { open: 'Open', done: 'Done' }, default: 'open' },
    stamp: { type: 'text', label: 'Stamp', options: { a: 'A' }, nullable: true, readonly: true },
  },
})

// A query column with writes takes its options from the column it writes.
const pickList = defineQuery({
  name: 'pick_list',
  label: 'Pick list',
  title: 'label',
  sql: 'SELECT id, label, state, state AS shown FROM slot WHERE deleted_at IS NULL',
  columns: {
    id: { type: 'integer', label: 'Id' },
    label: { type: 'text', label: 'Label' },
    state: { type: 'text', label: 'State', writes: { dataset: 'slot', field: 'state', key: 'id' } },
    shown: { type: 'text', label: 'Shown', options: { open: 'Open', done: 'Done' } },
  },
})

const plain = (name: string, source: string, skin: SavedViewSeed['skin'] = 'table'): SavedViewSeed => ({
  name,
  source_type: source === 'pick_list' ? 'query' : 'dataset',
  source,
  skin,
  filters: {},
  sort: [],
  group_by: null,
  visible_fields: [],
})

const SEEDED_LAYOUT: DashboardLayout = {
  sections: [
    {
      label: 'Now',
      tiles: [
        { kind: 'stat', view: 'All slots', measure: 'count', tone: { above: 0, tone: 'bad' } },
        { kind: 'list', view: 'Picks', rows: 5, set: { column: 'state', value: 'done', label: 'Done' } },
      ],
    },
    {
      label: 'This week',
      tiles: [
        { kind: 'week', view: 'Slot week' },
        { kind: 'progress', done: 'Picks', total: 'All slots', label: 'Picked' },
      ],
    },
  ],
  actions: [{ create: 'slot', label: 'New slot' }],
}

const overview = (layout: DashboardLayout = SEEDED_LAYOUT): SavedViewSeed => ({
  name: 'Overview',
  skin: 'dashboard',
  filters: {},
  sort: [],
  group_by: null,
  visible_fields: [],
  layout,
})

const domainWith = (views: SavedViewSeed[]): Domain => ({
  datasets: [crew, slot],
  queries: [pickList],
  writers: { slot: { create: (v) => v, update: (v) => v } },
  seed: (insert) => {
    insert('crew', [{ name: 'Ann' }, { name: 'Bob' }])
    insert('slot', [{ label: 'one', crew_id: 1, day: '2028-06-05' }])
  },
  views,
})

const VIEWS = [plain('All slots', 'slot'), plain('Slot week', 'slot', 'calendar'), plain('Picks', 'pick_list')]
const domain = domainWith([...VIEWS, overview()])
const ALL = 1
const WEEK = 2
const PICKS = 3
const OVERVIEW = 4

let sqlite: Database
let app: ReturnType<typeof testEngine>
let admin: ReturnType<typeof send>
let editor: ReturnType<typeof send>

function seeded(d: Domain = domain): Database {
  const db = new Database(':memory:')
  migrate(db, d)
  seedDomain(db, d)
  return db
}

beforeEach(async () => {
  sqlite = seeded()
  app = testEngine(sqlite, domain)
  admin = send(app, await signIn(app, 'administrator'))
  editor = send(app, await signIn(app, 'editor'))
})

const json = (value: unknown) => JSON.stringify(value)
const listed = async (as: ReturnType<typeof send>) =>
  ((await as('GET', '/api/views')).body.views as { id: number; skin: string }[]) ?? []
const dashboards = async (as: ReturnType<typeof send>) => (await listed(as)).filter((v) => v.skin === 'dashboard')
const stored = () => sqlite.query('SELECT * FROM saved_view ORDER BY id').all()

const layoutWith = (tiles: unknown[], actions: unknown[] = []) => ({ sections: [{ label: 'S', tiles }], actions })
const post = (body: Record<string, unknown>) =>
  admin('POST', '/api/views', { body: json({ name: 'Mine', skin: 'dashboard', ...body }) })

async function refused(body: Record<string, unknown>, mention?: string) {
  const before = stored()
  const res = await post(body)
  expect({ status: res.status, code: res.body.code }).toEqual({ status: 400, code: 'bad_view' })
  if (mention) expect(res.body.message).toContain(mention)
  expect(stored()).toEqual(before)
}

describe('who lists a dashboard (attack 1)', () => {
  test('an owner lists no dashboard; an editor and an administrator list the shared one', async () => {
    const owner = send(app, await signIn(app, 'owner', { dataset: 'crew', id: 1 }))
    const res = await owner('GET', '/api/views')
    expect(res.status).toBe(200)
    expect(res.body.views.map((v: { id: number }) => v.id)).toEqual([ALL, WEEK])
    expect((await dashboards(editor)).map((v) => v.id)).toEqual([OVERVIEW])
    expect((await dashboards(admin)).map((v) => v.id)).toEqual([OVERVIEW])
  })

  test('a link account lists no dashboard', async () => {
    // A forged row: a dashboard can never be set for owners through the API.
    sqlite.run('UPDATE saved_view SET for_owners = 1 WHERE id = ?', [OVERVIEW])
    const token = recordLinkFor(sqlite, TEST_LINK_SECRET, 'crew', 1)
    const asLink = async (path: string) => {
      const res = await app.request(path, { headers: { host: '127.0.0.1:4310', authorization: `RecordLink ${token}` } })
      return { status: res.status, body: (await res.json()) as { code?: string; views?: unknown[] } }
    }
    const views = await asLink('/api/views')
    expect({ status: views.status, code: views.body.code }).toEqual({ status: 403, code: 'forbidden' })
    expect((await asLink('/api/owner/views')).body.views).toEqual([])
  })
})

describe('a dashboard is never published (attack 2)', () => {
  test("an administrator's share-token and for-owners on a dashboard are 400 not_query", async () => {
    const before = stored()
    for (const path of [`/api/views/${OVERVIEW}/share-token`, `/api/views/${OVERVIEW}/for-owners`]) {
      const res = await admin('PUT', path, { body: '{}' })
      expect({ status: res.status, code: res.body.code }).toEqual({ status: 400, code: 'not_query' })
    }
    expect(stored()).toEqual(before)
  })
})

describe('a dashboard view (attack 6)', () => {
  test('a dashboard takes no source, every other skin needs one', async () => {
    await refused({ source: 'slot' }, 'no source')
    for (const skin of ['table', 'calendar', 'timeline']) {
      const res = await admin('POST', '/api/views', { body: json({ name: 'X', skin }) })
      expect({ status: res.status, code: res.body.code }).toEqual({ status: 400, code: 'bad_view' })
    }
    const created = await post({ layout: layoutWith([{ kind: 'stat', view: ALL, measure: 'count' }]) })
    expect(created.status).toBe(201)
    expect(created.body).toMatchObject({ source: null, source_type: null, skin: 'dashboard', filters: {}, sort: [] })
  })

  test('a dashboard keeps filters, sort, group and visible fields empty', async () => {
    await refused({ filters: { state: 'open' } })
    await refused({ sort: ['label'] })
    await refused({ group_by: 'state' })
    await refused({ visible_fields: ['label'] })
  })

  test('a layout on a grid view is refused', async () => {
    const before = stored()
    const res = await admin('POST', '/api/views', {
      body: json({ name: 'X', source: 'slot', layout: layoutWith([]) }),
    })
    expect({ status: res.status, code: res.body.code }).toEqual({ status: 400, code: 'bad_view' })
    expect(stored()).toEqual(before)
    const grid = await admin('POST', '/api/views', { body: json({ name: 'X', source: 'slot' }) })
    expect(grid.body.layout).toBeNull()
    const patch = await admin('PATCH', `/api/views/${grid.body.id}`, { body: json({ layout: layoutWith([]) }) })
    expect({ status: patch.status, code: patch.body.code }).toEqual({ status: 400, code: 'bad_view' })
  })

  test('a timeline grouped on a non-lane is 400', async () => {
    const res = await admin('POST', '/api/views', {
      body: json({ name: 'X', source: 'slot', skin: 'timeline', group_by: 'state' }),
    })
    expect({ status: res.status, code: res.body.code }).toEqual({ status: 400, code: 'bad_view' })
    const lane = await admin('POST', '/api/views', {
      body: json({ name: 'X', source: 'slot', skin: 'timeline', group_by: 'crew_id' }),
    })
    expect(lane.status).toBe(201)
    const noCalendar = await admin('POST', '/api/views', {
      body: json({ name: 'X', source: 'crew', skin: 'timeline' }),
    })
    expect(noCalendar.status).toBe(400)
  })

  test('caps: 7 sections / 13 tiles / 9 actions / an 81-character label are refused', async () => {
    const stat = { kind: 'stat', view: ALL, measure: 'count' }
    const section = { label: 'S', tiles: [stat] }
    const action = { create: 'slot', label: 'New' }
    await refused({ layout: { sections: Array(7).fill(section), actions: [] } }, 'sections')
    await refused({ layout: layoutWith(Array(13).fill(stat)) }, 'tiles')
    await refused({ layout: layoutWith([], Array(9).fill(action)) }, 'actions')
    await refused({ layout: { sections: [{ label: 'x'.repeat(81), tiles: [] }], actions: [] } }, 'label')
    await refused({ layout: layoutWith([{ ...stat, label: 'x'.repeat(81) }]) }, 'label')
    await refused({ layout: layoutWith([], [{ ...action, label: 'x'.repeat(81) }]) }, 'label')
    await refused({ layout: layoutWith([{ kind: 'list', view: PICKS, rows: 0 }]) }, 'rows')
    await refused({ layout: layoutWith([{ kind: 'list', view: PICKS, rows: 51 }]) }, 'rows')
    await refused({ layout: layoutWith([{ kind: 'chart', view: ALL }]) }, 'kind')
    await refused({ layout: layoutWith([{ ...stat, extra: 1 }]) }, 'extra')
    const fits = await post({
      layout: {
        sections: Array(6).fill({ label: 'x'.repeat(80), tiles: Array(12).fill(stat) }),
        actions: Array(8).fill(action),
      },
    })
    expect(fits.status).toBe(201)
  })

  test('a tile naming no view is refused, naming it', async () => {
    await refused({ layout: layoutWith([{ kind: 'stat', view: 999, measure: 'count' }]) }, '999')
    await refused({ layout: layoutWith([{ kind: 'stat', view: 'All slots', measure: 'count' }]) }, 'All slots')
    // Another account's private view is not one this actor can list.
    const mine = await editor('POST', '/api/views', { body: json({ name: 'Private', source: 'slot' }) })
    await refused({ layout: layoutWith([{ kind: 'week', view: mine.body.id }]) }, String(mine.body.id))
    sqlite.run("UPDATE saved_view SET deleted_at = '2026-10-01T00:00:00Z' WHERE id = ?", [WEEK])
    await refused({ layout: layoutWith([{ kind: 'week', view: WEEK }]) }, String(WEEK))
    await refused(
      { layout: layoutWith([{ kind: 'progress', done: OVERVIEW, total: ALL, label: 'P' }]) },
      String(OVERVIEW),
    )
  })

  test('sum on a text column, set on a column that does not write, set to a value outside the options, week on a non-calendar view, create on a dataset without a writer are each refused', async () => {
    await refused({ layout: layoutWith([{ kind: 'stat', view: ALL, measure: { sum: 'label' } }]) }, 'label')
    await refused({ layout: layoutWith([{ kind: 'stat', view: ALL, measure: { sum: 'nope' } }]) }, 'nope')
    const set = (view: number, column: string, value = 'done') => ({
      kind: 'list',
      view,
      rows: 5,
      set: { column, value, label: 'Do' },
    })
    await refused({ layout: layoutWith([set(PICKS, 'shown')]) }, 'shown')
    await refused({ layout: layoutWith([set(ALL, 'stamp', 'a')]) }, 'stamp')
    await refused({ layout: layoutWith([set(PICKS, 'label')]) }, 'label')
    await refused({ layout: layoutWith([set(ALL, 'state', 'gone')]) }, 'gone')
    await refused({ layout: layoutWith([{ kind: 'week', view: ALL }]) }, 'calendar')
    await refused({ layout: layoutWith([], [{ create: 'crew', label: 'New' }]) }, 'crew')
    await refused({ layout: layoutWith([], [{ create: 'pick_list', label: 'New' }]) }, 'pick_list')
    const sum = await post({
      layout: layoutWith([{ kind: 'stat', view: ALL, measure: { sum: 'weight' } }, set(ALL, 'state')]),
    })
    expect(sum.status).toBe(201)
  })

  test('a set on a query column that writes takes its target options', async () => {
    const res = await post({
      layout: layoutWith([
        { kind: 'list', view: PICKS, rows: 3, set: { column: 'state', value: 'done', label: 'Done' } },
      ]),
    })
    expect(res.status).toBe(201)
  })

  test('PATCH /views/:id composes: a new layout saves and reads back', async () => {
    const created = await post({ layout: layoutWith([]) })
    const layout = layoutWith([{ kind: 'week', view: WEEK }], [{ create: 'slot', label: 'New' }])
    const res = await admin('PATCH', `/api/views/${created.body.id}`, { body: json({ layout }) })
    expect(res.status).toBe(200)
    expect(res.body.layout).toEqual(layout)
    const read = (await listed(admin)).find((v) => v.id === created.body.id)
    expect(read).toMatchObject({ layout })
  })

  test('a PATCH rename of a dashboard keeps its layout', async () => {
    const layout = layoutWith([{ kind: 'stat', view: ALL, measure: 'count' }])
    const created = await post({ layout })
    const res = await admin('PATCH', `/api/views/${created.body.id}`, { body: json({ name: 'Renamed' }) })
    expect(res.status).toBe(200)
    expect(res.body).toMatchObject({ name: 'Renamed', layout })
  })

  test('a dashboard is created without a layout as an empty one', async () => {
    const res = await post({})
    expect(res.status).toBe(201)
    expect(res.body.layout).toEqual({ sections: [], actions: [] })
  })
})

describe('a seeded dashboard', () => {
  const RESOLVED = {
    sections: [
      {
        label: 'Now',
        tiles: [
          { kind: 'stat', view: ALL, measure: 'count', tone: { above: 0, tone: 'bad' } },
          { kind: 'list', view: PICKS, rows: 5, set: { column: 'state', value: 'done', label: 'Done' } },
        ],
      },
      {
        label: 'This week',
        tiles: [
          { kind: 'week', view: WEEK },
          { kind: 'progress', done: PICKS, total: ALL, label: 'Picked' },
        ],
      },
    ],
    actions: [{ create: 'slot', label: 'New slot' }],
  }
  const systemDashboards = (db: Database) =>
    db
      .query("SELECT * FROM saved_view WHERE skin = 'dashboard' AND owner_id = ? AND deleted_at IS NULL")
      .all(SYSTEM_OWNER) as { layout: string; source: string | null }[]

  test("a seeded dashboard's tiles resolve to the seeded views' ids, fresh and by --seed-missing; an unknown name fails seeding, naming it", () => {
    const [fresh] = systemDashboards(sqlite)
    expect(fresh?.source).toBeNull()
    expect(JSON.parse(fresh?.layout ?? 'null')).toEqual(RESOLVED)

    const db = new Database(':memory:')
    migrate(db, domain)
    seedMissing(db, domain)
    const [missing] = systemDashboards(db)
    expect(JSON.parse(missing?.layout ?? 'null')).toEqual(RESOLVED)

    const unknown = overview(layoutWith([{ kind: 'week', view: 'Nowhere' }]) as DashboardLayout)
    const bad = domainWith([...VIEWS, unknown])
    const empty = new Database(':memory:')
    migrate(empty, bad)
    expect(() => seedDomain(empty, bad)).toThrow('Nowhere')
    expect(() => seedMissing(empty, bad)).toThrow('Nowhere')
  })

  test('a layout naming a view two seeds share fails seeding', () => {
    const twice = domainWith([...VIEWS, plain('Picks', 'slot'), overview()])
    const db = new Database(':memory:')
    migrate(db, twice)
    expect(() => seedDomain(db, twice)).toThrow('Picks')
  })

  test('--seed-missing twice leaves exactly one live system dashboard, with its layout', () => {
    seedMissing(sqlite, domain)
    seedMissing(sqlite, domain)
    const live = systemDashboards(sqlite)
    expect(live).toHaveLength(1)
    expect(JSON.parse(live[0]?.layout ?? 'null')).toEqual(RESOLVED)
  })

  test('a changed seed layout is brought up to date by --seed-missing', () => {
    const changed = domainWith([
      ...VIEWS,
      overview(layoutWith([{ kind: 'week', view: 'Slot week' }]) as DashboardLayout),
    ])
    const report = seedMissing(sqlite, changed)
    expect(report.views.updated).toBe(1)
    expect(JSON.parse(systemDashboards(sqlite)[0]?.layout ?? 'null')).toEqual(
      layoutWith([{ kind: 'week', view: WEEK }]),
    )
    expect(report.named.some((line) => line.includes('null'))).toBe(false)
  })
})
