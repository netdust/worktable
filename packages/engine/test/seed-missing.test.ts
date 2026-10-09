import { Database } from 'bun:sqlite'
import { describe, expect, test } from 'bun:test'
import { mkdtempSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { type Domain, DomainError, defineDataset, migrate, validateDomain } from '../src'
import { seedLines, seedMissing } from '../src/seed-missing'
import { SYSTEM_OWNER } from '../src/views'
import { contents, send } from './fixture'
import seedDomain from './fixtures/seed-domain'
import { signIn, testEngine } from './sign-in'

const TABLES = ['project', 'taak', 'plat', 'note', 'badge', 'kit', 'saved_view', 'revision', 'batch']

const everything = (sqlite: Database) => Object.fromEntries(TABLES.map((t) => [t, contents(sqlite, t)]))

// A migrated database that already holds real (non-config) rows and no seeds.
function existingDb(): Database {
  const sqlite = new Database(':memory:')
  migrate(sqlite, seedDomain)
  sqlite.run("INSERT INTO project (name) VALUES ('Echt')")
  sqlite.run("INSERT INTO plat (name) VALUES ('echt')")
  return sqlite
}

function insertView(
  sqlite: Database,
  owner: number,
  name: string,
  source: string,
  visible: string[],
  shared = 1,
): number {
  const sql = `INSERT INTO saved_view (name, source_type, source, skin, filters, sort, group_by, visible_fields, owner_id, shared)
               VALUES (?, 'dataset', ?, 'table', '{}', '[]', NULL, ?, ?, ?)`
  return Number(sqlite.query(sql).run(name, source, JSON.stringify(visible), owner, shared).lastInsertRowid)
}

const viewsNamed = (sqlite: Database, name: string) =>
  sqlite.query('SELECT * FROM saved_view WHERE name = ? ORDER BY id').all(name) as Record<string, unknown>[]

describe('seedMissing: config rows', () => {
  test('a config dataset is seeded when its table is empty, and a non-config dataset is skipped', () => {
    const sqlite = existingDb()
    const before = everything(sqlite)
    const report = seedMissing(sqlite, seedDomain)
    expect(report.datasets).toEqual({
      project: 'not config',
      taak: 'not config',
      plat: 'not config',
      note: 'not config',
      badge: { inserted: 2, present: 0 },
      kit: { inserted: 1, present: 0 },
    })
    const after = everything(sqlite)
    for (const table of ['project', 'taak', 'plat', 'note']) expect(after[table]).toEqual(before[table])
    expect((after.badge as { name: string }[]).map((r) => r.name)).toEqual(['gold', 'silver'])
    expect(after.kit).toMatchObject([{ name: 'starter', badge_id: 1 }])
  })

  test('a row is added by its missing title; a present one, live or deleted, is kept as it is', () => {
    const sqlite = existingDb()
    sqlite.run("INSERT INTO badge (name, size, maker) VALUES ('gold', 3, 'x')")
    sqlite.run("INSERT INTO kit (name, badge_id, deleted_at) VALUES ('starter', 1, '2026-01-01T00:00:00Z')")
    const report = seedMissing(sqlite, seedDomain)
    expect(report.datasets).toMatchObject({
      badge: { inserted: 1, present: 1 },
      kit: { inserted: 0, present: 1 },
    })
    expect(sqlite.query('SELECT name, size, maker FROM badge ORDER BY id').all()).toEqual([
      { name: 'gold', size: 3, maker: 'x' },
      { name: 'silver', size: 6, maker: `${SYSTEM_OWNER}:administrator` },
    ])
    expect(sqlite.query('SELECT COUNT(*) AS n FROM kit').get()).toEqual({ n: 1 })
  })

  test('every row goes through its writer as the system owner, with the administrator role', () => {
    const sqlite = existingDb()
    seedMissing(sqlite, seedDomain)
    const badges = sqlite.query('SELECT name, size, maker FROM badge ORDER BY id').all()
    // size is readonly and derived: the seeded 99 is cut and the writer's length is stored.
    expect(badges).toEqual([
      { name: 'gold', size: 4, maker: `${SYSTEM_OWNER}:administrator` },
      { name: 'silver', size: 6, maker: `${SYSTEM_OWNER}:administrator` },
    ])
    const actors = sqlite.query("SELECT DISTINCT actor_id FROM revision WHERE entity IN ('badge', 'kit')").all()
    expect(actors).toEqual([{ actor_id: SYSTEM_OWNER }])
  })

  test('validation refuses a config dataset whose relation points at a non-config dataset', () => {
    const bad = defineDataset({
      name: 'kit',
      label: 'Kits',
      title: 'name',
      custom: false,
      config: true,
      columns: {
        name: { type: 'text', label: 'Name' },
        project_id: { type: 'integer', label: 'Project', relation: 'project' },
      },
    })
    const domain: Domain = { ...seedDomain, datasets: [...seedDomain.datasets.filter((d) => d.name !== 'kit'), bad] }
    expect(() => validateDomain(domain)).toThrow(DomainError)
    expect(() => validateDomain(domain)).toThrow(/project_id relates to "project", which is not config/)
  })
})

describe('seedMissing: one seed batch', () => {
  test('rows and views are written under one batch of kind seed, by the system owner', () => {
    const sqlite = existingDb()
    const report = seedMissing(sqlite, seedDomain)
    expect(report.batch).toMatch(/^[0-9a-f-]{36}$/)
    expect(contents(sqlite, 'batch')).toMatchObject([{ key: report.batch, kind: 'seed', actor_id: SYSTEM_OWNER }])
    const batches = sqlite.query('SELECT DISTINCT batch_id FROM revision').all()
    expect(batches).toEqual([{ batch_id: report.batch }])
    const entities = sqlite.query('SELECT DISTINCT entity FROM revision ORDER BY entity').all()
    expect(entities).toEqual([{ entity: 'badge' }, { entity: 'kit' }, { entity: 'saved_view' }])
  })

  test('POST /batches/:key/undo refuses a seed batch with 422 not_undoable', async () => {
    const sqlite = existingDb()
    const { batch } = seedMissing(sqlite, seedDomain)
    const app = testEngine(sqlite, seedDomain)
    const asAdmin = send(app, await signIn(app))
    const before = everything(sqlite)
    const res = await asAdmin('POST', `/api/batches/${batch}/undo`, { body: '{}' })
    expect({ status: res.status, code: res.body.code }).toEqual({ status: 422, code: 'not_undoable' })
    expect(everything(sqlite)).toEqual(before)
  })

  test('a second run writes nothing and records no batch', () => {
    const sqlite = existingDb()
    seedMissing(sqlite, seedDomain)
    const before = everything(sqlite)
    const report = seedMissing(sqlite, seedDomain)
    expect(report).toEqual({
      datasets: {
        project: 'not config',
        taak: 'not config',
        plat: 'not config',
        note: 'not config',
        badge: { inserted: 0, present: 2 },
        kit: { inserted: 0, present: 1 },
      },
      views: { added: 0, updated: 0, present: 2 },
      named: [],
      batch: null,
    })
    expect(everything(sqlite)).toEqual(before)
  })
})

describe('seedMissing: views', () => {
  test('a seeded view is added only when no live view with that name and source exists', () => {
    const sqlite = existingDb()
    const theirs = insertView(sqlite, 7, 'Open', 'taak', ['day'])
    insertView(sqlite, 7, 'Badges', 'plat', ['name'])
    const report = seedMissing(sqlite, seedDomain)
    expect(report.views).toEqual({ added: 1, updated: 0, present: 1 })
    expect(viewsNamed(sqlite, 'Open').map((v) => v.id)).toEqual([theirs])
    const badges = viewsNamed(sqlite, 'Badges')
    expect(badges.map((v) => [v.source, v.owner_id, v.shared])).toEqual([
      ['plat', 7, 1],
      ['badge', SYSTEM_OWNER, 1],
    ])
    expect(JSON.parse(badges[1]?.visible_fields as string)).toEqual(['name', 'size'])
  })

  test("a user's private view with the seeded name and source does not block the seeded view, and is untouched", () => {
    const sqlite = existingDb()
    const mine = insertView(sqlite, 7, 'Open', 'taak', ['day'], 0)
    const before = sqlite.query('SELECT * FROM saved_view WHERE id = ?').get(mine)
    const report = seedMissing(sqlite, seedDomain)
    expect(report.views).toEqual({ added: 2, updated: 0, present: 0 })
    const open = viewsNamed(sqlite, 'Open')
    expect(open.map((v) => [v.owner_id, v.shared])).toEqual([
      [7, 0],
      [SYSTEM_OWNER, 1],
    ])
    expect(open[0]).toEqual(before as Record<string, unknown>)
  })

  test("another user's shared view with the seeded name and source counts as present", () => {
    const sqlite = existingDb()
    insertView(sqlite, 7, 'Open', 'taak', ['day'], 1)
    const report = seedMissing(sqlite, seedDomain)
    expect(report.views).toEqual({ added: 1, updated: 0, present: 1 })
    expect(viewsNamed(sqlite, 'Open').map((v) => v.owner_id)).toEqual([7])
  })

  test('a view owned by anyone else is left alone, even when it differs from the declaration', () => {
    const sqlite = existingDb()
    insertView(sqlite, 7, 'Open', 'taak', ['day'])
    const before = viewsNamed(sqlite, 'Open')
    seedMissing(sqlite, seedDomain)
    expect(viewsNamed(sqlite, 'Open')).toEqual(before)
  })

  test('a system-owned view is brought up to its current declaration, and revised', () => {
    const sqlite = existingDb()
    const id = insertView(sqlite, SYSTEM_OWNER, 'Open', 'taak', ['day'])
    const report = seedMissing(sqlite, seedDomain)
    expect(report.views).toEqual({ added: 1, updated: 1, present: 0 })
    const [open] = viewsNamed(sqlite, 'Open')
    expect(open).toMatchObject({
      id,
      owner_id: SYSTEM_OWNER,
      visible_fields: '["description"]',
      filters: '{"status":"open"}',
      sort: '["start_at"]',
      group_by: 'day',
    })
    const revised = sqlite
      .query("SELECT field, old, new, actor_id, batch_id FROM revision WHERE entity = 'saved_view' AND record_id = ?")
      .all(id) as Record<string, unknown>[]
    expect(revised.map((r) => r.field).sort()).toEqual(['filters', 'group_by', 'sort', 'visible_fields'])
    expect(revised.every((r) => r.actor_id === SYSTEM_OWNER && r.batch_id === report.batch)).toBe(true)
  })
})

describe('seedMissing: system views no longer declared', () => {
  test('a system view whose name and source match no seed is removed, revised and named', () => {
    const sqlite = existingDb()
    const old = insertView(sqlite, SYSTEM_OWNER, 'Oud', 'taak', ['day'])
    const report = seedMissing(sqlite, seedDomain)
    const [gone] = viewsNamed(sqlite, 'Oud')
    expect(gone?.deleted_at).not.toBeNull()
    expect(seedLines(report)).toContain('seed-missing: view "Oud" (taak) removed, no longer declared')
    const revised = sqlite
      .query("SELECT field, actor_id, batch_id FROM revision WHERE entity = 'saved_view' AND record_id = ?")
      .all(old) as Record<string, unknown>[]
    expect(revised).toEqual([{ field: 'deleted_at', actor_id: SYSTEM_OWNER, batch_id: report.batch }])
  })

  test('a public system view no longer declared stays, and is named', () => {
    const sqlite = existingDb()
    const id = insertView(sqlite, SYSTEM_OWNER, 'Oud', 'taak', ['day'])
    sqlite.query("UPDATE saved_view SET public = 1, share_token = 'tok' WHERE id = ?").run(id)
    const before = viewsNamed(sqlite, 'Oud')
    const report = seedMissing(sqlite, seedDomain)
    expect(viewsNamed(sqlite, 'Oud')).toEqual(before)
    expect(seedLines(report)).toContain('seed-missing: view "Oud" (taak) is public, left alone')
  })

  test("a person's own or shared view that matches no seed is never removed", () => {
    const sqlite = existingDb()
    insertView(sqlite, 7, 'Mijn', 'taak', ['day'], 0)
    insertView(sqlite, 7, 'Gedeeld', 'taak', ['day'], 1)
    const before = [...viewsNamed(sqlite, 'Mijn'), ...viewsNamed(sqlite, 'Gedeeld')]
    seedMissing(sqlite, seedDomain)
    expect([...viewsNamed(sqlite, 'Mijn'), ...viewsNamed(sqlite, 'Gedeeld')]).toEqual(before)
  })
})

describe('seedMissing: public and updated system views', () => {
  test('a public system view keeps its filters, fields, public flag, share token and format, and is named', () => {
    const sqlite = existingDb()
    const id = insertView(sqlite, SYSTEM_OWNER, 'Open', 'taak', ['day'])
    sqlite.query("UPDATE saved_view SET public = 1, share_token = 'tok', format = 'ical' WHERE id = ?").run(id)
    const before = viewsNamed(sqlite, 'Open')
    const report = seedMissing(sqlite, seedDomain)
    expect(viewsNamed(sqlite, 'Open')).toEqual(before)
    expect(report.views).toMatchObject({ added: 1, updated: 0, present: 1 })
    expect(seedLines(report)).toContain('seed-missing: view "Open" (taak) is public, left alone')
    expect(sqlite.query("SELECT 1 FROM revision WHERE entity = 'saved_view' AND record_id = ?").all(id)).toEqual([])
  })

  test('a system view for owners keeps its visible_fields and flag, and is named (attack 13)', () => {
    const sqlite = existingDb()
    const id = insertView(sqlite, SYSTEM_OWNER, 'Open', 'taak', ['day'])
    sqlite.query('UPDATE saved_view SET for_owners = 1 WHERE id = ?').run(id)
    const before = viewsNamed(sqlite, 'Open')
    const report = seedMissing(sqlite, seedDomain)
    expect(viewsNamed(sqlite, 'Open')).toEqual(before)
    expect(seedLines(report)).toContain('seed-missing: view "Open" (taak) is for owners, left alone')
    expect(sqlite.query("SELECT 1 FROM revision WHERE entity = 'saved_view' AND record_id = ?").all(id)).toEqual([])
  })

  test('a system view for owners that no seed declares any more stays, and is named', () => {
    const sqlite = existingDb()
    const id = insertView(sqlite, SYSTEM_OWNER, 'Weg', 'taak', ['day'])
    sqlite.query('UPDATE saved_view SET for_owners = 1 WHERE id = ?').run(id)
    const report = seedMissing(sqlite, seedDomain)
    expect(viewsNamed(sqlite, 'Weg')).toMatchObject([{ deleted_at: null, for_owners: 1 }])
    expect(seedLines(report)).toContain('seed-missing: view "Weg" (taak) is for owners, left alone')
  })

  test('a system view holding only a share token counts as public and is left alone', () => {
    const sqlite = existingDb()
    const id = insertView(sqlite, SYSTEM_OWNER, 'Open', 'taak', ['day'])
    sqlite.query("UPDATE saved_view SET share_token = 'tok' WHERE id = ?").run(id)
    const before = viewsNamed(sqlite, 'Open')
    const report = seedMissing(sqlite, seedDomain)
    expect(viewsNamed(sqlite, 'Open')).toEqual(before)
    expect(seedLines(report)).toContain('seed-missing: view "Open" (taak) is public, left alone')
  })

  test('each system view brought up to date is named in the log, besides the counts', () => {
    const sqlite = existingDb()
    insertView(sqlite, SYSTEM_OWNER, 'Open', 'taak', ['day'])
    const lines = seedLines(seedMissing(sqlite, seedDomain))
    expect(lines).toContain('seed-missing: view "Open" (taak) updated')
    expect(lines).toContain('seed-missing: views 1 added, 1 updated, 0 present')
    expect(lines.filter((line) => line.startsWith('seed-missing: view "'))).toHaveLength(1)
  })
})

const SERVE = join(import.meta.dir, '..', 'src', 'serve.ts')
const fixtureDomain = (file: string) => join(import.meta.dir, 'fixtures', file)

async function cli(domainFile: string, db: string, ...args: string[]) {
  const proc = Bun.spawn(['bun', SERVE, '--domain', fixtureDomain(domainFile), '--db', db, ...args], {
    stdout: 'pipe',
    stderr: 'pipe',
  })
  const code = await proc.exited
  return { code, out: await new Response(proc.stdout).text(), err: await new Response(proc.stderr).text() }
}

function existingFile(): string {
  const db = join(mkdtempSync(join(tmpdir(), 'wt-seed-missing-')), 'db.sqlite')
  const sqlite = new Database(db, { create: true })
  migrate(sqlite, seedDomain)
  sqlite.run("INSERT INTO project (name) VALUES ('Echt')")
  sqlite.close()
  return db
}

function fileContents(db: string) {
  const sqlite = new Database(db)
  const all = everything(sqlite)
  sqlite.close()
  return all
}

describe('serve.ts --seed-missing', () => {
  test('seeds what is missing, logs counts only and exits 0 without serving', async () => {
    const db = existingFile()
    const result = await cli('seed-domain.ts', db, '--seed-missing')
    expect(result.code).toBe(0)
    expect(result.out).toContain('seed-missing: badge 2 inserted, 0 present')
    expect(result.out).toContain('seed-missing: kit 1 inserted, 0 present\n')
    expect(result.out).toContain('seed-missing: project skipped (not config)')
    expect(result.out).toContain('seed-missing: views 2 added, 0 updated, 0 present')
    expect(result.out).not.toContain('gold')
    expect(result.out).not.toContain('listening')
    expect(fileContents(db).badge).toHaveLength(2)
  }, 20_000)

  test('a second run writes nothing and logs nothing inserted', async () => {
    const db = existingFile()
    await cli('seed-domain.ts', db, '--seed-missing')
    const before = fileContents(db)
    const result = await cli('seed-domain.ts', db, '--seed-missing')
    expect(result.code).toBe(0)
    expect(result.out).toContain('seed-missing: badge 0 inserted, 2 present')
    expect(result.out).toContain('seed-missing: views 0 added, 0 updated, 2 present')
    expect(fileContents(db)).toEqual(before)
  }, 20_000)

  test('one refused row writes nothing, and the command exits 1 naming the dataset and the row', async () => {
    const db = existingFile()
    const before = fileContents(db)
    const result = await cli('seed-refusal-domain.ts', db, '--seed-missing')
    expect(result.code).toBe(1)
    expect(result.err).toContain('seed-missing refused: badge row 2: a badge may not be called bad')
    expect(fileContents(db)).toEqual(before)
  }, 20_000)

  test('any other error writes nothing and exits 1 with one line, no stack trace', async () => {
    const db = existingFile()
    const before = fileContents(db)
    const result = await cli('seed-crash-domain.ts', db, '--seed-missing')
    expect(result.code).toBe(1)
    expect(result.err).toBe('seed-missing failed: disk on fire\n')
    expect(fileContents(db)).toEqual(before)
  }, 20_000)

  test('is refused together with --fresh, and the file is left as it was', async () => {
    const db = existingFile()
    const before = fileContents(db)
    const result = await cli('seed-domain.ts', db, '--seed-missing', '--fresh')
    expect(result.code).toBe(1)
    expect(result.err).toContain('--seed-missing cannot be combined with --fresh')
    expect(fileContents(db)).toEqual(before)
  }, 20_000)

  for (const other of [
    ['--import', 'export.json', '--as', 'a@example.test'],
    ['--create-admin', 'a@example.test'],
    ['--create-account', 'a@example.test', '--role', 'editor'],
    ['--disable-account', 'a@example.test'],
  ]) {
    test(`is refused together with ${other[0]}, before the file is touched`, async () => {
      const db = existingFile()
      const before = fileContents(db)
      const stamp = statSync(db).mtimeMs
      const result = await cli('seed-domain.ts', db, '--seed-missing', ...other)
      expect(result.code).toBe(1)
      expect(result.err).toContain('--seed-missing cannot be combined with --import or an account command')
      expect(fileContents(db)).toEqual(before)
      expect(statSync(db).mtimeMs).toBe(stamp)
    }, 20_000)
  }
})
