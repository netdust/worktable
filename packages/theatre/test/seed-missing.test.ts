import { Database } from 'bun:sqlite'
import { expect, test } from 'bun:test'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createAccount, migrate, type SavedViewSeed } from '@worktable/engine'
import { signIn, testEngine } from '@worktable/engine/test/sign-in'
import theatre from '../src'

// The slotted template's own title, so a database holding the step-1 unslotted one still gets it.
const SPEELDAG = 'speeldag op locatie (met plaatsen)'
const serve = join(import.meta.dir, '../../engine/src/serve.ts')
const ROOT = join(import.meta.dir, '../../..')
const STEP_3 = [
  'Conflicten',
  'Per persoon per dag',
  'Persoonskalender',
  'Locatiekalender',
  'Bedrijfsweek',
  'Werklijst',
  'Kandidaten',
]
const ADDED = ['Tourstops', 'Rollen', 'Sjablonen', 'Mijn producties', ...STEP_3]
const PRE_STEP_ONE_DAGPLANNING = ['productie', 'soort', 'start_at', 'status']
const PLANNING = ['start_at', 'omschrijving', 'soort', 'speelreeks_id', 'locatie', 'mensen', 'status']
const WEEK = { plandag: { $period: 'week' } }
const KEPT = ['organisatie', 'productie', 'activiteit', 'persoon', 'toewijzing', 'beschikbaarheid', 'speelreeks']

type OldView = Omit<SavedViewSeed, 'skin' | 'group_by'> & { skin?: string; group_by?: string | null }

// The views under Activiteiten before one planning; Toewijzingen per activiteit and Voorstellingen are still seeded.
const OLD_ACTIVITEIT: OldView[] = [
  {
    name: 'Planning',
    source_type: 'dataset',
    source: 'activiteit',
    filters: { status: 'bevestigd' },
    sort: ['start_at'],
    group_by: 'plandag',
    visible_fields: ['productie_id', 'soort'],
  },
  {
    name: 'Per productie per dag',
    source_type: 'query',
    source: 'productie_dag',
    filters: {},
    sort: ['plandag'],
    visible_fields: ['productie', 'plandag'],
  },
  {
    name: 'Dagplanning',
    source_type: 'query',
    source: 'dagplanning',
    filters: { plandag: { $period: 'week' } },
    sort: ['start_at'],
    group_by: 'plandag',
    visible_fields: PRE_STEP_ONE_DAGPLANNING,
  },
  {
    name: 'Optie of bevestigd',
    source_type: 'dataset',
    source: 'activiteit',
    filters: { status: { $in: ['optie', 'bevestigd'] } },
    sort: ['plandag'],
    visible_fields: ['productie_id', 'status'],
  },
]
const RENAMED = ['Planning']

const json = JSON.stringify
const insertSql = `INSERT INTO saved_view (name, source_type, source, skin, filters, sort, group_by, visible_fields, owner_id, shared)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`

function insertViews(sqlite: Database, views: OldView[], owner = -1): number[] {
  const insert = sqlite.query(insertSql)
  return views.map((v) =>
    Number(
      insert.run(
        v.name,
        v.source_type,
        v.source,
        v.skin ?? 'table',
        json(v.filters),
        json(v.sort),
        v.group_by ?? null,
        json(v.visible_fields),
        owner,
        owner === -1 ? 1 : 0,
      ).lastInsertRowid,
    ),
  )
}

async function seedMissing(db: string) {
  const args = ['bun', serve, '--domain', '@worktable/theatre', '--db', db, '--seed-missing']
  const proc = Bun.spawn(args, { cwd: ROOT, stdout: 'pipe', stderr: 'pipe' })
  const code = await proc.exited
  return { code, out: await new Response(proc.stdout).text(), err: await new Response(proc.stderr).text() }
}

// A database migrated before step 1's seeds: one real row, the older system views, no Rol and no Sjabloon.
function existingDb(): string {
  const db = join(mkdtempSync(join(tmpdir(), 'wt-theatre-seed-')), 'engine.db')
  const sqlite = new Database(db, { create: true })
  migrate(sqlite, theatre)
  sqlite.run("INSERT INTO organisatie (naam, soort) VALUES ('Verzonnen Gezelschap', 'eigen')")
  const later = [...ADDED, ...RENAMED]
  insertViews(sqlite, [...OLD_ACTIVITEIT, ...theatre.views.filter((view) => !later.includes(view.name))])
  sqlite.close()
  return db
}

const read = (db: string, sql: string) => {
  const sqlite = new Database(db)
  const rows = sqlite.query(sql).all() as Record<string, unknown>[]
  sqlite.close()
  return rows
}

const kept = (db: string) => Object.fromEntries(KEPT.map((t) => [t, read(db, `SELECT * FROM ${t} ORDER BY id`)]))

test('rol and sjabloon are config datasets, and no demo dataset is', () => {
  const config = theatre.datasets.filter((d) => d.config).map((d) => d.name)
  expect(config.sort()).toEqual(['rol', 'sjabloon'])
})

test('an existing database gets the Rol rows, the Sjabloon and the later views, and Planning on activiteit', async () => {
  const db = existingDb()
  const before = kept(db)
  const result = await seedMissing(db)
  expect(result.err).toBe('')
  expect(result.code).toBe(0)
  expect(result.out).toContain('seed-missing: rol 4 inserted, 0 present')
  expect(result.out).toContain('seed-missing: sjabloon 1 inserted, 0 present\n')
  expect(result.out).toContain('seed-missing: persoon skipped (not config)')
  expect(result.out).toContain('seed-missing: views 11 added, 1 updated, 7 present')

  expect(read(db, 'SELECT naam FROM rol ORDER BY id').map((r) => r.naam)).toEqual([
    'Speler',
    'Lichttechnicus',
    'Productieleider',
    'Chauffeur',
  ])
  expect(read(db, 'SELECT naam FROM sjabloon')).toEqual([{ naam: SPEELDAG }])
  expect(kept(db)).toEqual(before)

  const views = read(db, 'SELECT name, owner_id, visible_fields FROM saved_view WHERE deleted_at IS NULL')
  for (const name of ADDED) expect(views.filter((v) => v.name === name)).toHaveLength(1)
  const planning = views.find((v) => v.name === 'Planning')
  expect(JSON.parse(planning?.visible_fields as string)).toEqual(PLANNING)

  expect(read(db, 'SELECT kind, actor_id FROM batch')).toEqual([{ kind: 'seed', actor_id: -1 }])

  const again = await seedMissing(db)
  expect(again.code).toBe(0)
  expect(again.out).toContain('seed-missing: rol 0 inserted, 4 present')
  expect(again.out).toContain('seed-missing: views 0 added, 0 updated, 19 present')
  expect(read(db, 'SELECT COUNT(*) AS n FROM batch')).toEqual([{ n: 1 }])
}, 30_000)

// A database holding today's seeds except Planning, plus the given system views.
function planningDb(system: OldView[]): { db: string; ids: number[]; user: number } {
  const db = join(mkdtempSync(join(tmpdir(), 'wt-theatre-seed-')), 'engine.db')
  const sqlite = new Database(db, { create: true })
  migrate(sqlite, theatre)
  insertViews(
    sqlite,
    theatre.views.filter((view) => view.name !== 'Planning'),
  )
  const ids = insertViews(sqlite, system)
  const user = createAccount(sqlite, theatre, 'planner@example.test', 'editor')
  insertViews(sqlite, [{ ...DAGPLANNING_VIEW, name: 'Mijn dagplanning' }], user)
  sqlite.close()
  return { db, ids, user }
}

const DAGPLANNING_VIEW: OldView = {
  name: 'Dagplanning',
  source_type: 'query',
  source: 'dagplanning',
  filters: WEEK,
  sort: ['start_at'],
  group_by: 'plandag',
  visible_fields: ['start_at', 'omschrijving', 'soort', 'locatie_id', 'mensen', 'status'],
}
const ORPHAN = 'seed-missing: view "Mijn dagplanning" (dagplanning) has no source any more, left alone'

const planningViews = (db: string) =>
  read(
    db,
    `SELECT id, name, source, owner_id, filters, sort, group_by, visible_fields FROM saved_view
     WHERE deleted_at IS NULL AND (name LIKE '%lanning%') ORDER BY id`,
  )

const count = (out: string, line: string) => out.split('\n').filter((l) => l === line).length

test('a one-planning database', async () => {
  const published: OldView = { ...DAGPLANNING_VIEW, name: 'Gedeelde planning' }
  const { db, ids, user } = planningDb([{ ...DAGPLANNING_VIEW, name: 'Planning' }, published])
  const sqlite = new Database(db)
  sqlite.query("UPDATE saved_view SET public = 1, share_token = 'verzonnen-hash' WHERE id = ?").run(ids[1] as number)
  sqlite.close()

  const result = await seedMissing(db)
  expect(result.err).toBe('')
  expect(result.code).toBe(0)
  expect(result.out).toContain('seed-missing: view "Planning" (dagplanning) removed, no longer declared')
  expect(count(result.out, ORPHAN)).toBe(1)
  expect(result.out.split('\n').filter((l) => l.includes('"Gedeelde planning"'))).toEqual([
    'seed-missing: view "Gedeelde planning" (dagplanning) is public, left alone',
  ])

  const views = planningViews(db)
  const planning = views.find((v) => v.name === 'Planning')
  expect(planning).toMatchObject({ source: 'activiteit', owner_id: -1, group_by: 'plandag' })
  expect(planning?.id).not.toBe(ids[0])
  expect(JSON.parse(planning?.filters as string)).toEqual(WEEK)
  expect(JSON.parse(planning?.visible_fields as string)).toEqual(PLANNING)
  expect(views.filter((v) => v.owner_id === user).map((v) => [v.name, v.source])).toEqual([
    ['Mijn dagplanning', 'dagplanning'],
  ])

  // Served in the declared seed order although Planning was added last: it leads Activiteiten on this database too.
  const served = new Database(db)
  const app = testEngine(served, theatre)
  const cookie = await signIn(app)
  const res = await app.request('/api/views', { headers: { host: '127.0.0.1:4310', cookie } })
  const names = ((await res.json()) as { views: { name: string; source: string }[] }).views
    .filter((v) => v.source === 'activiteit')
    .map((v) => v.name)
  served.close()
  expect(names.slice(0, 2)).toEqual(['Planning', 'Toewijzingen per activiteit'])
}, 30_000)

test('a step-2 database', async () => {
  const planning: OldView = {
    name: 'Planning',
    source_type: 'dataset',
    source: 'activiteit',
    filters: { status: 'bevestigd' },
    sort: ['start_at'],
    group_by: 'plandag',
    visible_fields: ['productie_id', 'soort', 'datum', 'start_at', 'status'],
  }
  const { db, ids, user } = planningDb([planning, DAGPLANNING_VIEW])

  const result = await seedMissing(db)
  expect(result.err).toBe('')
  expect(result.code).toBe(0)
  expect(result.out).toContain('seed-missing: view "Planning" (activiteit) updated')
  expect(result.out).toContain('seed-missing: view "Dagplanning" (dagplanning) removed, no longer declared')
  expect(count(result.out, ORPHAN)).toBe(1)

  const views = planningViews(db)
  expect(views.filter((v) => v.owner_id === -1).map((v) => [v.id, v.name, v.source])).toEqual([
    [ids[0], 'Planning', 'activiteit'],
  ])
  const kept = views.find((v) => v.id === ids[0])
  expect(JSON.parse(kept?.filters as string)).toEqual(DAGPLANNING_VIEW.filters)
  expect(JSON.parse(kept?.sort as string)).toEqual(DAGPLANNING_VIEW.sort)
  expect(kept?.group_by).toBe(DAGPLANNING_VIEW.group_by)
  expect(JSON.parse(kept?.visible_fields as string)).toEqual(PLANNING)
  expect(views.filter((v) => v.owner_id === user).map((v) => [v.name, v.source])).toEqual([
    ['Mijn dagplanning', 'dagplanning'],
  ])
}, 30_000)

test('no dagplanning source', async () => {
  const sqlite = new Database(':memory:')
  migrate(sqlite, theatre)
  const app = testEngine(sqlite, theatre)
  const cookie = await signIn(app)
  const res = await app.request('/api/schema', { headers: { host: '127.0.0.1:4310', cookie } })
  const body = (await res.json()) as { sources: Record<string, unknown> }
  expect(Object.keys(body.sources)).not.toContain('dagplanning')
  expect(theatre.views.map((view) => view.source)).not.toContain('dagplanning')
})

test('queries sit under Overzichten', () => {
  const queries = theatre.queries.map((query) => query.name)
  expect(theatre.sections?.find((section) => section.label === 'Overzichten')?.sources).toEqual(queries)
  expect(theatre.queries.filter((query) => query.of !== undefined)).toEqual([])
  expect(theatre.views[0]).toEqual({
    name: 'Planning',
    source_type: 'dataset',
    source: 'activiteit',
    skin: 'table',
    filters: WEEK,
    sort: ['start_at'],
    group_by: 'plandag',
    visible_fields: PLANNING,
  })
})

const slotsOf = (db: string) =>
  (read(db, `SELECT items FROM sjabloon WHERE naam = '${SPEELDAG}'`).map((r) => JSON.parse(r.items as string))[0] ?? [])
    .filter((item: { slots?: unknown }) => item.slots)
    .map((item: { omschrijving: string; slots: unknown }) => [item.omschrijving, item.slots])

test('a database with the Rol rows and another Sjabloon gets the speeldag with slots, and a second run adds nothing', async () => {
  const db = existingDb()
  const sqlite = new Database(db)
  sqlite.run("INSERT INTO rol (naam, categorie) VALUES ('Speler', 'artistiek'), ('Lichttechnicus', 'techniek')")
  sqlite.run("INSERT INTO sjabloon (naam, items) VALUES ('eigen sjabloon', '[]')")
  sqlite.close()
  const result = await seedMissing(db)
  expect(result.err).toBe('')
  expect(result.out).toContain('seed-missing: rol 2 inserted, 2 present')
  expect(result.out).toContain('seed-missing: sjabloon 1 inserted, 0 present')
  expect(read(db, 'SELECT naam FROM sjabloon ORDER BY id').map((r) => r.naam)).toEqual(['eigen sjabloon', SPEELDAG])
  expect(slotsOf(db)).toEqual([
    ['Voorbereiding', [{ rol: 'Lichttechnicus', aantal: 1 }]],
    ['Voorstelling', [{ rol: 'Speler', aantal: 2 }]],
  ])
  const after = kept(db)
  const again = await seedMissing(db)
  expect(again.out).toContain('seed-missing: sjabloon 0 inserted, 1 present')
  expect(kept(db)).toEqual(after)
  expect(read(db, 'SELECT COUNT(*) AS n FROM sjabloon')).toEqual([{ n: 2 }])
}, 30_000)

test('a step-1 unslotted "speeldag op locatie" stays as it is, and the slotted one is added beside it', async () => {
  const db = existingDb()
  const sqlite = new Database(db)
  sqlite.run("INSERT INTO sjabloon (naam, items) VALUES ('speeldag op locatie', '[]')")
  const old = sqlite.query('SELECT * FROM sjabloon').all()
  sqlite.close()
  const first = await seedMissing(db)
  expect(first.out).toContain('seed-missing: sjabloon 1 inserted, 0 present')
  expect(read(db, "SELECT * FROM sjabloon WHERE naam = 'speeldag op locatie'")).toEqual(old)
  expect(read(db, 'SELECT naam FROM sjabloon ORDER BY id').map((r) => r.naam)).toEqual([
    'speeldag op locatie',
    SPEELDAG,
  ])
  expect(slotsOf(db)).toEqual([
    ['Voorbereiding', [{ rol: 'Lichttechnicus', aantal: 1 }]],
    ['Voorstelling', [{ rol: 'Speler', aantal: 2 }]],
  ])
}, 30_000)

test('a planner-deleted seeded speeldag counts as present', async () => {
  const db = existingDb()
  const sqlite = new Database(db)
  sqlite.run(`INSERT INTO sjabloon (naam, items, deleted_at) VALUES ('${SPEELDAG}', '[]', '2026-01-01T00:00:00Z')`)
  sqlite.close()
  const result = await seedMissing(db)
  expect(result.out).toContain('seed-missing: sjabloon 0 inserted, 1 present')
  expect(read(db, 'SELECT COUNT(*) AS n FROM sjabloon')).toEqual([{ n: 1 }])
}, 30_000)

test('a renamed seeded Rol: its original title is added again', async () => {
  const db = existingDb()
  const first = await seedMissing(db)
  expect(first.code).toBe(0)
  const sqlite = new Database(db)
  sqlite.run("UPDATE rol SET naam = 'Acteur' WHERE naam = 'Speler'")
  sqlite.close()
  const again = await seedMissing(db)
  expect(again.out).toContain('seed-missing: rol 1 inserted, 3 present')
  expect(read(db, 'SELECT naam FROM rol ORDER BY id').map((r) => r.naam)).toEqual([
    'Acteur',
    'Lichttechnicus',
    'Productieleider',
    'Chauffeur',
    'Speler',
  ])
}, 30_000)
