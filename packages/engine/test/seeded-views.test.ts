import { Database } from 'bun:sqlite'
import { beforeEach, describe, expect, test } from 'bun:test'
import { type DashboardLayout, type Domain, migrate, type SavedViewSeed, seedDomain } from '../src'
import { createService } from '../src/auth'
import { keySeeded } from '../src/migrate'
import { recordLinkFor } from '../src/record-link'
import { seedLines, seedMissing } from '../src/seed-missing'
import { domain as base, contents, send } from './fixture'
import { signIn, TEST_LINK_SECRET, testEngine } from './sign-in'

const OPEN = 1
const VAST = 2
const RAPPORT = 3
const OVERZICHT = 4

const table = (name: string, source: string, extra: Partial<SavedViewSeed> = {}): SavedViewSeed => ({
  name,
  source_type: source === 'taak' ? 'dataset' : 'query',
  source,
  skin: 'table',
  filters: {},
  sort: [],
  group_by: null,
  visible_fields: source === 'taak' ? ['description'] : ['name', 'day'],
  ...extra,
})

const tiles = (...views: string[]): DashboardLayout => ({
  sections: [{ label: 'Nu', tiles: views.map((view) => ({ kind: 'stat', view, measure: 'count' })) }],
  actions: [],
})

const overzicht = (...views: string[]): SavedViewSeed => ({
  name: 'Overzicht',
  skin: 'dashboard',
  filters: {},
  sort: [],
  group_by: null,
  visible_fields: [],
  layout: tiles(...views),
})

const seeds = (): SavedViewSeed[] => [
  table('Open', 'taak'),
  table('Vast', 'per_project', { locked: true }),
  table('Rapport', 'per_project'),
  overzicht('Open', 'Vast'),
]

const declared = (views: SavedViewSeed[] = seeds()): Domain => ({ ...base, views })
const sorted = (name: string, sort: string[]) => seeds().map((v) => (v.name === name ? { ...v, sort } : v))

let sqlite: Database
let app: ReturnType<typeof testEngine>
let admin: ReturnType<typeof send>
let editor: ReturnType<typeof send>
let dom: Domain

function fresh(d: Domain = declared()): Database {
  const db = new Database(':memory:')
  migrate(db, d)
  seedDomain(db, d)
  return db
}

beforeEach(async () => {
  dom = declared()
  sqlite = fresh(dom)
  app = testEngine(sqlite, dom)
  admin = send(app, await signIn(app, 'administrator'))
  editor = send(app, await signIn(app, 'editor'))
})

const json = (value: unknown) => JSON.stringify(value)
const row = (id: number) => sqlite.query('SELECT * FROM saved_view WHERE id = ?').get(id) as Record<string, unknown>
const rows = () => sqlite.query('SELECT * FROM saved_view ORDER BY id').all()
const patch = (as: typeof admin, id: number, body: Record<string, unknown>) =>
  as('PATCH', `/api/views/${id}`, { body: json(body) })
const code = (res: { status: number; body: Record<string, unknown> }) => ({ status: res.status, code: res.body.code })
const listed = async (as: typeof admin) => (await as('GET', '/api/views')).body.views as Record<string, unknown>[]
const find = (views: Record<string, unknown>[], id: number) => views.find((v) => v.id === id)
const layoutOf = (id: number) => JSON.parse(row(id).layout as string) as DashboardLayout
const tileViews = (layout: DashboardLayout) =>
  layout.sections.flatMap((s) => s.tiles.map((t) => (t as { view: number }).view))

describe('seed_key and locked on a fresh database', () => {
  test("a --fresh database's seeded views carry seed_key, a locked seed stores no locked column, and a following seedMissing adds nothing", () => {
    const keys = sqlite.query('SELECT name, seed_key FROM saved_view ORDER BY id').all()
    expect(keys).toEqual([
      { name: 'Open', seed_key: json(['Open', 'taak']) },
      { name: 'Vast', seed_key: json(['Vast', 'per_project']) },
      { name: 'Rapport', seed_key: json(['Rapport', 'per_project']) },
      { name: 'Overzicht', seed_key: json(['Overzicht', null]) },
    ])
    expect(Object.keys(row(VAST))).not.toContain('locked')
    const before = rows()
    const report = seedMissing(sqlite, dom)
    expect(report.views).toEqual({ added: 0, updated: 0, present: 4 })
    expect(report.batch).toBeNull()
    expect(rows()).toEqual(before)
  })
})

describe('a human administrator and an unlocked seeded view', () => {
  test('renames, re-sorts, deletes and restores it; editable follows who asks', async () => {
    const renamed = await patch(admin, OPEN, { name: 'Alle open' })
    expect({ status: renamed.status, name: renamed.body.name, owner: renamed.body.owner_id }).toEqual({
      status: 200,
      name: 'Alle open',
      owner: -1,
    })
    expect((await patch(admin, OPEN, { sort: ['status'] })).status).toBe(200)
    expect(row(OPEN)).toMatchObject({ name: 'Alle open', sort: '["status"]' })
    expect((await admin('DELETE', `/api/views/${OPEN}`)).status).toBe(200)
    expect(row(OPEN).deleted_at).not.toBeNull()
    expect((await admin('POST', `/api/views/${OPEN}/restore`, { body: '{}' })).status).toBe(200)
    expect(row(OPEN).deleted_at).toBeNull()

    expect(find(await listed(admin), OPEN)).toMatchObject({ editable: true })
    expect(find(await listed(editor), OPEN)).toMatchObject({ editable: false })
    expect(find(await listed(admin), VAST)).toMatchObject({ editable: false })
    expect(find(await listed(editor), RAPPORT)).toMatchObject({ editable: false })
  })
})

describe('denials: who may change a seeded view', () => {
  const bearer = (token: string) => ({ authorization: `Bearer ${token}`, host: '127.0.0.1:4310' })
  async function viaHeaders(headers: Record<string, string>, method: string, path: string, body?: unknown) {
    const res = await app.request(path, {
      method,
      headers: { 'content-type': 'application/json', ...headers },
      body: body === undefined ? undefined : json(body),
    })
    return { status: res.status, body: (await res.json()) as Record<string, unknown> }
  }

  test("an editor's and a service's PATCH, DELETE and restore of an unlocked seeded view are 403 read_only_view; a link account's are 403 forbidden", async () => {
    const service = createService(sqlite, 'bot', 'administrator')
    const link = {
      authorization: `RecordLink ${recordLinkFor(sqlite, TEST_LINK_SECRET, 'project', 1)}`,
      host: '127.0.0.1:4310',
    }
    const gone = await admin('DELETE', `/api/views/${RAPPORT}`)
    expect(gone.status).toBe(200)
    const before = rows()
    const callers: [
      string,
      (m: string, p: string, b?: unknown) => Promise<{ status: number; body: Record<string, unknown> }>,
      string,
    ][] = [
      ['editor', (m, p, b) => editor(m, p, { body: b === undefined ? undefined : json(b) }), 'read_only_view'],
      ['service', (m, p, b) => viaHeaders(bearer(service), m, p, b), 'read_only_view'],
      ['link', (m, p, b) => viaHeaders(link, m, p, b), 'forbidden'],
    ]
    for (const [who, call, expected] of callers) {
      const calls = [
        await call('PATCH', `/api/views/${OPEN}`, { name: 'x' }),
        await call('DELETE', `/api/views/${OPEN}`),
        await call('POST', `/api/views/${RAPPORT}/restore`, {}),
      ]
      expect(calls.map(code), who).toEqual(calls.map(() => ({ status: 403, code: expected })))
    }
    expect(rows()).toEqual(before)
  })

  test("a human administrator's PATCH of a locked seed is 403 read_only_view", async () => {
    const before = rows()
    expect(code(await patch(admin, VAST, { name: 'x' }))).toEqual({ status: 403, code: 'read_only_view' })
    expect(code(await admin('DELETE', `/api/views/${VAST}`))).toEqual({ status: 403, code: 'read_only_view' })
    expect(rows()).toEqual(before)
  })

  test('a system view with no seed_key, and one whose seed is no longer declared, are 403 to a human administrator', async () => {
    sqlite.run('UPDATE saved_view SET seed_key = NULL WHERE id = ?', [OPEN])
    const withoutKey = await patch(admin, OPEN, { name: 'x' })
    expect(code(withoutKey)).toEqual({ status: 403, code: 'read_only_view' })
    expect(find(await listed(admin), OPEN)).toMatchObject({ editable: false })

    const fewer = declared(seeds().filter((v) => v.name !== 'Rapport' && v.skin !== 'dashboard'))
    const other = testEngine(sqlite, fewer)
    const asAdmin = send(other, await signIn(other, 'administrator'))
    const before = rows()
    expect(code(await patch(asAdmin, RAPPORT, { name: 'x' }))).toEqual({ status: 403, code: 'read_only_view' })
    expect(code(await asAdmin('DELETE', `/api/views/${RAPPORT}`))).toEqual({ status: 403, code: 'read_only_view' })
    expect(rows()).toEqual(before)
  })

  test('a PATCH or POST carrying seed_key leaves it unchanged, and a person cannot adopt a view into a seed', async () => {
    const key = row(OPEN).seed_key
    const forged = await patch(admin, OPEN, { seed_key: 'x', name: 'Nieuw' })
    expect(forged.status).toBe(200)
    expect(row(OPEN)).toMatchObject({ seed_key: key, name: 'Nieuw' })

    const made = await editor('POST', '/api/views', {
      body: json({
        name: 'Mijn',
        source: 'taak',
        visible_fields: ['description'],
        seed_key: json(['Rapport', 'per_project']),
      }),
    })
    expect(made.status).toBe(201)
    expect(row(made.body.id).seed_key).toBeNull()
    expect((await patch(editor, made.body.id, { seed_key: json(['Open', 'taak']), shared: true })).status).toBe(200)
    expect(row(made.body.id).seed_key).toBeNull()
  })

  test('a PATCH of shared on a seeded view is 400, an editor still gets 403 first', async () => {
    const before = rows()
    expect(code(await patch(admin, OPEN, { shared: false }))).toEqual({ status: 400, code: 'bad_view' })
    expect(code(await patch(admin, OPEN, { shared: true }))).toEqual({ status: 400, code: 'bad_view' })
    expect(code(await patch(editor, OPEN, { shared: false }))).toEqual({ status: 403, code: 'read_only_view' })
    expect(rows()).toEqual(before)
  })

  test("an administrator's PATCH that adds a column not owner-visible to a for-owners seeded view is 400, and the row is unchanged", async () => {
    expect((await admin('PUT', `/api/views/${RAPPORT}/for-owners`)).status).toBe(200)
    const before = row(RAPPORT)
    const res = await patch(admin, RAPPORT, { visible_fields: ['name', 'project_id'] })
    expect(code(res)).toEqual({ status: 400, code: 'column_not_owner_visible' })
    expect(row(RAPPORT)).toEqual(before)
    expect(code(await patch(editor, RAPPORT, { name: 'x' }))).toEqual({ status: 403, code: 'read_only_view' })
  })
})

describe('seedMissing respects a person', () => {
  test('never overwrites a person-changed unlocked view, and names it', async () => {
    await patch(admin, OPEN, { visible_fields: ['status'] })
    const before = row(OPEN)
    const report = seedMissing(sqlite, declared(sorted('Open', ['description'])))
    expect(row(OPEN)).toEqual(before)
    expect(seedLines(report)).toContain('seed-missing: view "Open" (taak) changed by a person, left alone')
    expect(report.views).toMatchObject({ added: 0, updated: 0 })
  })

  test('never re-adds a seed a person deleted, and names it', async () => {
    await admin('DELETE', `/api/views/${OPEN}`)
    const report = seedMissing(sqlite, dom)
    expect(sqlite.query("SELECT COUNT(*) AS n FROM saved_view WHERE name = 'Open'").get()).toEqual({ n: 1 })
    expect(row(OPEN).deleted_at).not.toBeNull()
    expect(seedLines(report)).toContain('seed-missing: view "Open" (taak) deleted by a person, left alone')
    expect(report.views.added).toBe(0)
  })

  test("never adopts a person's view with a seed's name", () => {
    const db = new Database(':memory:')
    migrate(db, dom)
    db.run(
      "INSERT INTO saved_view (name, source_type, source, owner_id, shared) VALUES ('Open', 'dataset', 'taak', 7, 1)",
    )
    const report = seedMissing(db, dom)
    const open = db.query("SELECT owner_id, seed_key FROM saved_view WHERE name = 'Open'").all()
    expect(open).toEqual([{ owner_id: 7, seed_key: null }])
    expect(report.views.present).toBeGreaterThanOrEqual(1)
    expect(db.query("SELECT COUNT(*) AS n FROM saved_view WHERE name = 'Open'").get()).toEqual({ n: 1 })
  })

  test("a person's shared view with a seed's name is never keyed or adopted, and still counts as present", () => {
    const db = new Database(':memory:')
    migrate(db, dom)
    db.run(
      "INSERT INTO saved_view (name, source_type, source, owner_id, shared) VALUES ('Open', 'dataset', 'taak', 7, 1)",
    )
    seedMissing(db, dom)
    seedMissing(db, dom)
    expect(db.query("SELECT owner_id, seed_key, deleted_at FROM saved_view WHERE name = 'Open'").all()).toEqual([
      { owner_id: 7, seed_key: null, deleted_at: null },
    ])
  })

  test('a renamed seeded view is still its seed: seedMissing adds no second one', async () => {
    await patch(admin, OPEN, { name: 'Alle open' })
    const count = sqlite.query('SELECT COUNT(*) AS n FROM saved_view').get()
    const report = seedMissing(sqlite, dom)
    expect(sqlite.query('SELECT COUNT(*) AS n FROM saved_view').get()).toEqual(count)
    expect(row(OPEN).name).toBe('Alle open')
    expect(report.views.added).toBe(0)
  })

  test('an untouched seeded view still follows its declaration; so does a locked one an administrator once shared by token', async () => {
    const changed = declared(
      seeds().map((v) => (v.name === 'Open' || v.name === 'Vast' ? { ...v, sort: ['name'] } : v)),
    )
    const shared = await admin('PUT', `/api/views/${VAST}/share-token`)
    expect(shared.status).toBe(200)
    const whilePublic = seedMissing(sqlite, changed)
    expect(row(VAST).sort).toBe('[]')
    expect(seedLines(whilePublic)).toContain('seed-missing: view "Vast" (per_project) is public, left alone')

    expect((await admin('DELETE', `/api/views/${VAST}/share-token`)).status).toBe(200)
    seedMissing(sqlite, changed)
    expect(row(VAST).sort).toBe('["name"]')
    expect(row(OPEN).sort).toBe('["name"]')
  })

  test('a removed declaration removes an untouched view and leaves a touched one, named; declared again, the removed one is restored, not added', async () => {
    await patch(admin, OPEN, { name: 'Alle open' })
    const kept = [table('Vast', 'per_project', { locked: true }), overzicht('Vast')]
    const report = seedMissing(sqlite, declared(kept))
    expect(row(RAPPORT).deleted_at).not.toBeNull()
    expect(row(OPEN).deleted_at).toBeNull()
    const lines = seedLines(report)
    expect(lines).toContain('seed-missing: view "Rapport" (per_project) removed, no longer declared')
    expect(lines).toContain('seed-missing: view "Alle open" (taak) changed by a person, left alone')

    const count = sqlite.query('SELECT COUNT(*) AS n FROM saved_view').get()
    seedMissing(sqlite, dom)
    expect(sqlite.query('SELECT COUNT(*) AS n FROM saved_view').get()).toEqual(count)
    expect(row(RAPPORT).deleted_at).toBeNull()
  })
})

describe('keySeeded', () => {
  test('writes no revision, keys live rows only, and a second run changes nothing', () => {
    const db = new Database(':memory:')
    migrate(db, dom)
    db.run(
      "INSERT INTO saved_view (name, source_type, source, owner_id, shared) VALUES ('Open', 'dataset', 'taak', -1, 1)",
    )
    db.run(
      "INSERT INTO saved_view (name, source_type, source, owner_id, shared, deleted_at) VALUES ('Rapport', 'query', 'per_project', -1, 1, '2026-10-01T00:00:00Z')",
    )
    db.run(
      "INSERT INTO saved_view (name, source_type, source, owner_id, shared) VALUES ('Vast', 'query', 'per_project', 7, 1)",
    )
    expect(keySeeded(db, dom)).toBe(1)
    expect(db.query('SELECT name, seed_key FROM saved_view ORDER BY id').all()).toEqual([
      { name: 'Open', seed_key: json(['Open', 'taak']) },
      { name: 'Rapport', seed_key: null },
      { name: 'Vast', seed_key: null },
    ])
    expect(contents(db, 'revision')).toEqual([])
    const after = contents(db, 'saved_view')
    expect(keySeeded(db, dom)).toBe(0)
    expect(contents(db, 'saved_view')).toEqual(after)
  })
})

describe('a dashboard tile on a deleted view (R10a)', () => {
  test('an untouched seeded dashboard loses the tile whose seeded view a person deleted; seedMissing names it and does not fail', async () => {
    await admin('DELETE', `/api/views/${OPEN}`)
    const report = seedMissing(sqlite, dom)
    expect(tileViews(layoutOf(OVERZICHT))).toEqual([VAST])
    expect(seedLines(report)).toContain('seed-missing: dashboard "Overzicht": tile on deleted view "Open" dropped')
    const again = seedMissing(sqlite, dom)
    expect(seedLines(again).filter((line) => line.includes('dropped'))).toEqual([])
  })

  test('a tile naming a view no seed declares still fails seeding', () => {
    const bad = declared([...seeds().slice(0, 3), overzicht('Nowhere')])
    const db = new Database(':memory:')
    migrate(db, bad)
    expect(() => seedMissing(db, bad)).toThrow('Nowhere')
  })

  test('a deleted seeded view never falls back to a colleague view with the same name', async () => {
    sqlite.run(
      "INSERT INTO saved_view (name, source_type, source, owner_id, shared) VALUES ('Open', 'dataset', 'taak', 7, 1)",
    )
    await admin('DELETE', `/api/views/${OPEN}`)
    seedMissing(sqlite, dom)
    expect(tileViews(layoutOf(OVERZICHT))).toEqual([VAST])
  })

  test('a person-changed dashboard keeps the tile, and GET lists its view in gone_views, on that dashboard only', async () => {
    await patch(admin, OVERZICHT, { name: 'Ons overzicht' })
    await admin('DELETE', `/api/views/${OPEN}`)
    const kept = layoutOf(OVERZICHT)
    seedMissing(sqlite, dom)
    expect(layoutOf(OVERZICHT)).toEqual(kept)
    expect(tileViews(kept)).toEqual([OPEN, VAST])
    const views = await listed(editor)
    expect(find(views, OVERZICHT)).toMatchObject({ gone_views: [OPEN] })
    expect(views.filter((v) => v.id !== OVERZICHT).every((v) => !('gone_views' in v))).toBe(true)
    expect(Object.keys((find(views, OVERZICHT)?.layout as object) ?? {})).toEqual(['sections', 'actions'])
  })

  test('a rename of a dashboard with a gone tile is accepted and leaves its layout as stored', async () => {
    await admin('DELETE', `/api/views/${OPEN}`)
    const kept = layoutOf(OVERZICHT)

    const renamed = await patch(admin, OVERZICHT, { name: 'Ons overzicht' })

    expect(renamed.status).toBe(200)
    expect(renamed.body).toMatchObject({ name: 'Ons overzicht', gone_views: [OPEN] })
    expect(layoutOf(OVERZICHT)).toEqual(kept)
  })

  test('gone_views names only deleted views the viewer could have seen', async () => {
    const hidden = (
      sqlite
        .query(
          "INSERT INTO saved_view (name, source_type, source, owner_id, shared, deleted_at) VALUES ('Prive', 'dataset', 'taak', 99, 0, '2026-01-01') RETURNING id",
        )
        .get() as { id: number }
    ).id
    const layout = {
      sections: [{ label: 'Nu', tiles: [{ kind: 'stat', view: hidden, measure: 'count' }] }],
      actions: [],
    }
    const board = (
      sqlite
        .query(
          "INSERT INTO saved_view (name, skin, owner_id, shared, layout) VALUES ('Team', 'dashboard', 99, 1, ?) RETURNING id",
        )
        .get(JSON.stringify(layout)) as { id: number }
    ).id

    expect(find(await listed(admin), board)).toMatchObject({ gone_views: [] })
  })

  test('a PATCH of that dashboard whose layout no longer holds the gone tile is accepted; one that adds a tile on a deleted view is 400', async () => {
    await admin('DELETE', `/api/views/${OPEN}`)
    const before = rows()
    const adds = await patch(admin, OVERZICHT, {
      layout: {
        ...layoutOf(OVERZICHT),
        sections: [{ label: 'Nu', tiles: [{ kind: 'stat', view: OPEN, measure: 'count' }] }],
      },
    })
    expect(code(adds)).toEqual({ status: 400, code: 'bad_view' })
    expect(rows()).toEqual(before)
    const ok = await patch(admin, OVERZICHT, {
      layout: { sections: [{ label: 'Nu', tiles: [{ kind: 'stat', view: VAST, measure: 'count' }] }], actions: [] },
    })
    expect(ok.status).toBe(200)
    expect(tileViews(layoutOf(OVERZICHT))).toEqual([VAST])
  })
})

describe('what the review asked for beside the plan', () => {
  const serviceViews = async (role: 'administrator' | 'editor') => {
    const token = createService(sqlite, `bot-${role}`, role)
    const res = await app.request('/api/views', {
      headers: { host: '127.0.0.1:4310', authorization: `Bearer ${token}` },
    })
    return ((await res.json()) as { views: Record<string, unknown>[] }).views
  }

  test('a seed renamed to a missing seed’s name does not stand in for it: the missing one is added and the dashboard still resolves', () => {
    const later = table('Later', 'taak')
    const full = declared([table('Open', 'taak'), later, overzicht('Open', 'Later')])
    const old = fresh(declared([later, overzicht('Later')]))
    old.run("UPDATE saved_view SET name = 'Open' WHERE name = 'Later'")

    const report = seedMissing(old, full)

    expect(report.views.added).toBe(1)
    const named = old
      .query("SELECT seed_key FROM saved_view WHERE name = 'Open' AND deleted_at IS NULL ORDER BY id")
      .all()
    expect(named).toEqual([{ seed_key: json(['Later', 'taak']) }, { seed_key: json(['Open', 'taak']) }])
  })

  test('a human administrator’s restore of a deleted locked, keyless or undeclared system view is refused', async () => {
    sqlite.run("UPDATE saved_view SET deleted_at = '2026-01-01' WHERE id = ?", [VAST])
    const keyless = Number(
      sqlite.run(
        "INSERT INTO saved_view (name, source_type, source, owner_id, shared, deleted_at) VALUES ('Oud', 'dataset', 'taak', -1, 1, '2026-01-01')",
      ).lastInsertRowid,
    )
    const undeclared = Number(
      sqlite.run(
        "INSERT INTO saved_view (name, source_type, source, owner_id, shared, seed_key, deleted_at) VALUES ('Weg', 'dataset', 'taak', -1, 1, ?, '2026-01-01')",
        [json(['Weg', 'taak'])],
      ).lastInsertRowid,
    )
    const before = rows()

    for (const id of [VAST, keyless, undeclared])
      expect(code(await admin('POST', `/api/views/${id}/restore`, { body: json({}) })), String(id)).toEqual({
        status: 403,
        code: 'read_only_view',
      })

    expect(rows()).toEqual(before)
  })

  test('a service account with the administrator role is served an unlocked seed as not editable', async () => {
    expect(find(await serviceViews('administrator'), OPEN)).toMatchObject({ editable: false })
    expect(find(await listed(admin), OPEN)).toMatchObject({ editable: true })
  })

  test('two system rows with one key do no harm: the seed adds none and changes neither', () => {
    sqlite.run(
      'INSERT INTO saved_view (name, source_type, source, owner_id, shared, seed_key) SELECT name, source_type, source, owner_id, shared, seed_key FROM saved_view WHERE id = ?',
      [RAPPORT],
    )
    const before = rows()

    const report = seedMissing(sqlite, dom)

    expect(report.views.added).toBe(0)
    expect(rows()).toEqual(before)
  })

  test('an administrator’s share of an unlocked seed counts as a person’s change: the seed then leaves it as it is', async () => {
    expect((await admin('PUT', `/api/views/${RAPPORT}/share-token`)).status).toBe(200)
    expect((await admin('DELETE', `/api/views/${RAPPORT}/share-token`)).status).toBe(200)
    const changed = declared(seeds().map((v) => (v.name === 'Rapport' ? { ...v, sort: ['name'] } : v)))
    const before = row(RAPPORT)

    const report = seedMissing(sqlite, changed)

    expect(seedLines(report).join('\n')).toContain('view "Rapport" (per_project) changed by a person, left alone')
    expect(row(RAPPORT)).toEqual(before)
  })
})
