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
const ADDED = ['Tourstops', 'Rollen', 'Sjablonen', 'Mijn producties']
const PRE_STEP_ONE_DAGPLANNING = ['productie', 'soort', 'start_at', 'status']
const DAGPLANNING = ['start_at', 'omschrijving', 'soort', 'locatie_id', 'mensen', 'status']
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
  const insert = sqlite.query(
    `INSERT INTO saved_view (name, source_type, source, skin, filters, sort, group_by, visible_fields, owner_id, shared)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, -1, 1)`,
  )
  const later = [...ADDED, ...RENAMED]
  const old: OldView[] = [...OLD_ACTIVITEIT, ...theatre.views.filter((view) => !later.includes(view.name))]
  for (const v of old) {
    const json = JSON.stringify
    insert.run(
      v.name,
      v.source_type,
      v.source,
      v.skin ?? 'table',
      json(v.filters),
      json(v.sort),
      v.group_by ?? null,
      json(v.visible_fields),
    )
  }
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

test('an existing database gets the Rol rows, the Sjabloon and the later views, and Planning on dagplanning', async () => {
  const db = existingDb()
  const before = kept(db)
  const result = await seedMissing(db)
  expect(result.err).toBe('')
  expect(result.code).toBe(0)
  expect(result.out).toContain('seed-missing: rol 4 inserted, 0 present')
  expect(result.out).toContain('seed-missing: sjabloon 1 inserted, 0 present\n')
  expect(result.out).toContain('seed-missing: persoon skipped (not config)')
  expect(result.out).toContain('seed-missing: views 5 added, 0 updated, 7 present')

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
  expect(JSON.parse(planning?.visible_fields as string)).toEqual(DAGPLANNING)

  expect(read(db, 'SELECT kind, actor_id FROM batch')).toEqual([{ kind: 'seed', actor_id: -1 }])

  const again = await seedMissing(db)
  expect(again.code).toBe(0)
  expect(again.out).toContain('seed-missing: rol 0 inserted, 4 present')
  expect(again.out).toContain('seed-missing: views 0 added, 0 updated, 12 present')
  expect(read(db, 'SELECT COUNT(*) AS n FROM batch')).toEqual([{ n: 1 }])
}, 30_000)

const activiteitViews = (db: string) =>
  read(
    db,
    `SELECT name, source, owner_id, filters, visible_fields, share_token FROM saved_view
     WHERE deleted_at IS NULL AND source IN ('activiteit', 'dagplanning', 'productie_dag', 'voorstellingen') ORDER BY id`,
  )

test('one planning: the old activity views go, Planning on dagplanning comes, and a published or private view stays', async () => {
  const db = existingDb()
  const sqlite = new Database(db)
  sqlite.run("UPDATE saved_view SET public = 1, share_token = 'verzonnen-hash' WHERE name = 'Voorstellingen'")
  const user = createAccount(sqlite, theatre, 'planner@example.test', 'editor')
  const own = sqlite.query(
    `INSERT INTO saved_view (name, source_type, source, skin, filters, sort, group_by, visible_fields, owner_id, shared)
     VALUES (?, ?, ?, 'table', '{}', '[]', NULL, '["status"]', ?, 0)`,
  )
  own.run('Planning', 'dataset', 'activiteit', user)
  own.run('Dagplanning', 'query', 'dagplanning', user)
  sqlite.close()
  const mine = activiteitViews(db).filter((v) => v.owner_id === user)

  const result = await seedMissing(db)
  expect(result.err).toBe('')
  expect(result.code).toBe(0)
  for (const [name, source] of [
    ['Planning', 'activiteit'],
    ['Per productie per dag', 'productie_dag'],
    ['Dagplanning', 'dagplanning'],
    ['Optie of bevestigd', 'activiteit'],
  ])
    expect(result.out).toContain(`seed-missing: view "${name}" (${source}) removed, no longer declared`)
  expect(result.out).toContain('seed-missing: view "Voorstellingen" (voorstellingen) is public, left alone')

  const system = activiteitViews(db).filter((v) => v.owner_id === -1)
  expect(system.map((v) => [v.name, v.source])).toEqual([
    ['Toewijzingen per activiteit', 'activiteit'],
    ['Voorstellingen', 'voorstellingen'],
    ['Planning', 'dagplanning'],
  ])
  expect(system.find((v) => v.name === 'Voorstellingen')?.share_token).toBe('verzonnen-hash')
  const planning = system.find((v) => v.name === 'Planning')
  expect(JSON.parse(planning?.visible_fields as string)).toEqual(DAGPLANNING)
  expect(JSON.parse(planning?.filters as string)).toEqual({ plandag: { $period: 'week' } })
  expect(activiteitViews(db).filter((v) => v.owner_id === user)).toEqual(mine)

  // Served in the declared seed order although Planning was added last: it leads Activiteiten on this database too.
  const served = new Database(db)
  const app = testEngine(served, theatre)
  const cookie = await signIn(app)
  const res = await app.request('/api/views', { headers: { host: '127.0.0.1:4310', cookie } })
  const names = ((await res.json()) as { views: { name: string; source: string }[] }).views
    .filter((v) => v.source === 'activiteit' || v.source === 'dagplanning')
    .map((v) => v.name)
  served.close()
  expect(names.slice(0, 2)).toEqual(['Planning', 'Toewijzingen per activiteit'])
}, 30_000)

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
