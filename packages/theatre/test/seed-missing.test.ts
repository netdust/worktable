import { Database } from 'bun:sqlite'
import { expect, test } from 'bun:test'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { migrate } from '@worktable/engine'
import theatre from '../src'

const serve = join(import.meta.dir, '../../engine/src/serve.ts')
const ROOT = join(import.meta.dir, '../../..')
const STEP_ONE = ['Tourstops', 'Rollen', 'Sjablonen']
const PRE_STEP_ONE_DAGPLANNING = ['productie', 'soort', 'start_at', 'status']
const PRE_DETAILS_DAGPLANNING = ['productie', 'soort', 'start_at', 'status', 'locatie_id', 'locatie_bron']
const DAGPLANNING = ['start_at', 'omschrijving', 'soort', 'locatie_id', 'mensen', 'status']
const KEPT = ['organisatie', 'productie', 'activiteit', 'persoon', 'toewijzing', 'beschikbaarheid', 'speelreeks']

async function seedMissing(db: string) {
  const args = ['bun', serve, '--domain', '@worktable/theatre', '--db', db, '--seed-missing']
  const proc = Bun.spawn(args, { cwd: ROOT, stdout: 'pipe', stderr: 'pipe' })
  const code = await proc.exited
  return { code, out: await new Response(proc.stdout).text(), err: await new Response(proc.stderr).text() }
}

// A database migrated before step 1's seeds: one real row, the older system views, no Rol and no Sjabloon.
function existingDb(dagplanning = PRE_STEP_ONE_DAGPLANNING): string {
  const db = join(mkdtempSync(join(tmpdir(), 'wt-theatre-seed-')), 'engine.db')
  const sqlite = new Database(db, { create: true })
  migrate(sqlite, theatre)
  sqlite.run("INSERT INTO organisatie (naam, soort) VALUES ('Verzonnen Gezelschap', 'eigen')")
  const insert = sqlite.query(
    `INSERT INTO saved_view (name, source_type, source, skin, filters, sort, group_by, visible_fields, owner_id, shared)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, -1, 1)`,
  )
  for (const v of theatre.views.filter((view) => !STEP_ONE.includes(view.name))) {
    const visible = v.name === 'Dagplanning' ? dagplanning : v.visible_fields
    const json = JSON.stringify
    insert.run(v.name, v.source_type, v.source, v.skin, json(v.filters), json(v.sort), v.group_by, json(visible))
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

test('an existing database gets the Rol rows, the Sjabloon and the step-1 views, and an updated Dagplanning', async () => {
  const db = existingDb()
  const before = kept(db)
  const result = await seedMissing(db)
  expect(result.err).toBe('')
  expect(result.code).toBe(0)
  expect(result.out).toContain('seed-missing: rol 4 rows')
  expect(result.out).toContain('seed-missing: sjabloon 1 row\n')
  expect(result.out).toContain('seed-missing: persoon skipped (not config)')
  expect(result.out).toContain('seed-missing: views 3 added, 1 updated, 10 present')

  expect(read(db, 'SELECT naam FROM rol ORDER BY id').map((r) => r.naam)).toEqual([
    'Speler',
    'Lichttechnicus',
    'Productieleider',
    'Chauffeur',
  ])
  expect(read(db, 'SELECT naam FROM sjabloon')).toEqual([{ naam: 'speeldag op locatie' }])
  expect(kept(db)).toEqual(before)

  const views = read(db, 'SELECT name, owner_id, visible_fields FROM saved_view WHERE deleted_at IS NULL')
  for (const name of STEP_ONE) expect(views.filter((v) => v.name === name)).toHaveLength(1)
  const dagplanning = views.find((v) => v.name === 'Dagplanning')
  expect(JSON.parse(dagplanning?.visible_fields as string)).toEqual(DAGPLANNING)

  expect(read(db, 'SELECT kind, actor_id FROM batch')).toEqual([{ kind: 'seed', actor_id: -1 }])

  const again = await seedMissing(db)
  expect(again.code).toBe(0)
  expect(again.out).toContain('seed-missing: rol skipped (has rows)')
  expect(again.out).toContain('seed-missing: views 0 added, 0 updated, 14 present')
  expect(read(db, 'SELECT COUNT(*) AS n FROM batch')).toEqual([{ n: 1 }])
}, 30_000)

test('an existing system Dagplanning view is brought up to the details pass columns', async () => {
  const db = existingDb(PRE_DETAILS_DAGPLANNING)
  const result = await seedMissing(db)
  expect(result.code).toBe(0)
  expect(result.out).toContain('seed-missing: view "Dagplanning" (dagplanning) updated')
  const [view] = read(db, "SELECT visible_fields FROM saved_view WHERE name = 'Dagplanning' AND deleted_at IS NULL")
  expect(JSON.parse(view?.visible_fields as string)).toEqual(DAGPLANNING)
}, 30_000)
