import { Database } from 'bun:sqlite'
import { beforeEach, describe, expect, test } from 'bun:test'
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { type Actor, createAccount, importExport, migrate } from '../src'
import { contents, freshDb } from './fixture'
import domain from './fixtures/import-domain'
import lookupDomain from './fixtures/lookup-domain'

const TABLES = ['project', 'taak', 'plat', 'note', 'revision']

let sqlite: Database
let admin: Actor

const accountIn = (db: Database, role: Actor['role']): Actor => ({
  id: createAccount(db, domain, `${role}@example.test`, role),
  role,
  subject: null,
})

beforeEach(() => {
  sqlite = new Database(':memory:')
  migrate(sqlite, domain)
  admin = accountIn(sqlite, 'administrator')
})

type Rows = Record<string, Record<string, unknown>[]>
const exportOf = (datasets: Rows, extra: Record<string, unknown> = {}) => ({
  worktable_export: 1,
  source: 'invented',
  datasets,
  ...extra,
})

const VALID: Rows = {
  project: [
    { legacy_id: 0, name: 'Zonder project' },
    { legacy_id: 7, name: 'Alfa', custom: { colour: 'rood' } },
  ],
  note: [
    { legacy_id: 30, project_id: 7, tekst: 'eerste' },
    { legacy_id: 31, project_id: 0, tekst: 'op nul', custom: { herkomst: 'x' } },
  ],
}

const run = (data: unknown, acceptReport = false, actor = admin) =>
  importExport(sqlite, domain, data, actor, { acceptReport })
const state = (db = sqlite) => TABLES.map((t) => contents(db, t))
const empty = TABLES.map(() => [])

function refusedWith(data: unknown, status: number, code: string, names?: string) {
  let caught: unknown
  try {
    run(data)
  } catch (err) {
    caught = err
  }
  expect(caught).toMatchObject({ status, code })
  if (names) expect((caught as Error).message).toContain(names)
  expect(state()).toEqual(empty)
}

describe('import denials', () => {
  test.each([
    ['an unknown dataset', { nope: [] }, 'datasets.nope'],
    ['an engine table', { revision: [] }, 'datasets.revision'],
    ['an injected dataset name', { 'note"; DROP TABLE project; --': [] }, 'is not a declared dataset'],
    ['an unknown column', { project: [{ legacy_id: 1, name: 'A', onbekend: 1 }] }, 'datasets.project[0].onbekend'],
    ['an injected column', { project: [{ legacy_id: 1, 'name" = 1; --': 'A' }] }, 'is not a declared column'],
    ['the id column', { project: [{ legacy_id: 1, id: 5, name: 'A' }] }, 'datasets.project[0].id'],
    [
      'a readonly column the writer derives',
      { note: [{ legacy_id: 1, project_id: 1, tekst: 'x', lengte: 1 }] },
      'lengte',
    ],
    ['legacy_post_id itself', { project: [{ legacy_id: 1, name: 'A', legacy_post_id: 1 }] }, 'legacy_post_id'],
    ['custom on a dataset without custom fields', { plat: [{ legacy_id: 1, name: 'x', custom: {} }] }, 'custom'],
    ['a custom that is not an object', { project: [{ legacy_id: 1, name: 'A', custom: [1] }] }, 'custom'],
    ['a row without legacy_id', { project: [{ name: 'A' }] }, 'datasets.project[0].legacy_id'],
    ['a legacy_id that is not an integer', { project: [{ legacy_id: '1', name: 'A' }] }, 'legacy_id'],
    [
      'a duplicate legacy_id',
      {
        project: [
          { legacy_id: 1, name: 'A' },
          { legacy_id: 1, name: 'B' },
        ],
      },
      '[1].legacy_id',
    ],
    ['a row that is not an object', { project: [1] }, 'datasets.project[0]'],
    ['a dataset that is not a list', { project: {} }, 'datasets.project'],
    ['a dataset no writer creates', { taak: [] }, 'datasets.taak'],
  ])('%s is 400 bad_import with its path, nothing written', (_, datasets, names) =>
    refusedWith(exportOf(datasets as Rows), 400, 'bad_import', names),
  )

  test.each([
    ['no marker', { source: 'x', datasets: {} }],
    ['another version', { worktable_export: 2, datasets: {} }],
    ['an unknown top-level key', { worktable_export: 1, datasets: {}, extra: 1 }],
    ['no datasets', { worktable_export: 1 }],
    ['an array', []],
  ])('%s is 400 bad_import', (_, data) => refusedWith(data, 400, 'bad_import'))

  test('a row naming a lookup key is refused before any write', () => {
    const db = new Database(':memory:')
    migrate(db, lookupDomain)
    const actor = accountIn(db, 'administrator')
    const valid = {
      team: [{ legacy_id: 1, name: 'One' }],
      item: [{ legacy_id: 1, name: 'First', team_id: 1 }],
      line: [{ legacy_id: 1, name: 'L', item_id: 1 }],
    }
    const inherited = { ...valid, line: [{ ...valid.line[0], team: 1 }] }
    const plain = { ...valid, item: [{ ...valid.item[0], team_name: 'x' }] }
    for (const [datasets, key] of [
      [inherited, 'line[0].team'],
      [plain, 'item[0].team_name'],
    ] as const) {
      expect(() => importExport(db, lookupDomain, exportOf(datasets), actor, { acceptReport: true })).toThrow(
        expect.objectContaining({
          status: 400,
          code: 'bad_import',
          message: `datasets.${key}: is not a declared column`,
        }),
      )
      expect(['team', 'item', 'line', 'revision'].map((t) => contents(db, t))).toEqual([[], [], [], []])
    }
  })

  test('the checks block is ignored', () => {
    const result = run(exportOf(VALID, { checks: { counts: { project: 99 } } }))
    expect(result.committed).toBe(true)
  })

  test('a non-empty database is refused: import_needs_empty_database', () => {
    const seeded = freshDb()
    const before = TABLES.map((t) => contents(seeded, t))
    const boss = accountIn(seeded, 'administrator')
    expect(() =>
      importExport(seeded, domain, exportOf({ note: VALID.note as [] }), boss, { acceptReport: true }),
    ).toThrow(expect.objectContaining({ status: 409, code: 'import_needs_empty_database' }))
    expect(TABLES.map((t) => contents(seeded, t))).toEqual(before)
  })

  test('a soft-deleted row still makes a dataset non-empty', () => {
    sqlite.run("INSERT INTO plat (name, deleted_at) VALUES ('weg', '2026-01-01T00:00:00Z')")
    expect(() => run(exportOf({ plat: [{ legacy_id: 1, name: 'x' }] }))).toThrow(
      expect.objectContaining({ code: 'import_needs_empty_database' }),
    )
  })

  test.each(['editor', 'owner'] as const)('an %s may not import', (role) => {
    const actor = accountIn(sqlite, role)
    expect(() => run(exportOf(VALID), true, actor)).toThrow(expect.objectContaining({ status: 403, code: 'forbidden' }))
    expect(state()).toEqual(empty)
  })

  test('a writer refusal is reported and nothing is committed', () => {
    const data = exportOf({ ...VALID, project: [...(VALID.project as []), { legacy_id: 8, name: 'Beta' }] })
    const result = run({
      ...data,
      datasets: {
        ...data.datasets,
        note: [...(VALID.note as []), { legacy_id: 32, project_id: 8, tekst: 'gesloten' }],
      },
    })
    expect(result.committed).toBe(false)
    expect(result.refused).toEqual([{ dataset: 'note', legacy_id: 32, message: 'project Beta is gesloten' }])
    expect(state()).toEqual(empty)
  })

  test('a relation to a legacy id absent from the export is refused, never imported with null', () => {
    const result = run(exportOf({ ...VALID, note: [{ legacy_id: 33, project_id: 99, tekst: 'wees' }] }), true)
    expect(result.refused).toEqual([
      { dataset: 'note', legacy_id: 33, message: '"project_id" names legacy id 99, absent from the export' },
    ])
    expect(contents(sqlite, 'note')).toEqual([])
  })

  test('a relation to a dataset that is not in the export is refused', () => {
    const result = run(exportOf({ note: [{ legacy_id: 33, project_id: 7, tekst: 'wees' }] }), true)
    expect(result.refused).toEqual([
      { dataset: 'note', legacy_id: 33, message: '"project_id" names legacy id 7, absent from the export' },
    ])
  })

  test('a relation value that is not a legacy id is refused without echoing it', () => {
    const result = run(exportOf({ ...VALID, note: [{ legacy_id: 33, project_id: 'geheim', tekst: 'x' }] }), true)
    expect(result.refused).toEqual([{ dataset: 'note', legacy_id: 33, message: '"project_id" must be a legacy id' }])
  })

  test('the writer pipeline refuses a duplicate the writer forbids, in the same import', () => {
    const twice = [
      { legacy_id: 30, project_id: 7, tekst: 'zelfde' },
      { legacy_id: 31, project_id: 7, tekst: 'zelfde' },
    ]
    const result = run(exportOf({ ...VALID, note: twice }), true)
    expect(result.refused).toEqual([{ dataset: 'note', legacy_id: 31, message: 'deze note bestaat al' }])
    expect(contents(sqlite, 'note')).toHaveLength(1)
  })

  test('a bad value is a refused row naming its column, not its value', () => {
    const result = run(
      exportOf({ ...VALID, note: [{ legacy_id: 30, project_id: 7, tekst: 'x', day: 'geheim' }] }),
      true,
    )
    expect(result.refused).toEqual([{ dataset: 'note', legacy_id: 30, message: '"day" must be date' }])
  })

  test('a refused row rolls back the whole import on a file database', () => {
    const file = join(mkdtempSync(join(tmpdir(), 'wt-import-')), 'db.sqlite')
    const db = new Database(file, { create: true })
    migrate(db, domain)
    const boss = accountIn(db, 'administrator')
    const data = exportOf({ ...VALID, note: [...(VALID.note as []), { legacy_id: 39, project_id: 99, tekst: 'x' }] })
    const result = importExport(db, domain, data, boss, { acceptReport: false })
    expect({ committed: result.committed, refused: result.refused.length }).toEqual({ committed: false, refused: 1 })
    db.close()
    const reopened = new Database(file)
    expect(TABLES.map((t) => contents(reopened, t))).toEqual(empty)
    reopened.close()
  })
})

describe('import behaviour', () => {
  test('relations resolve to the new ids, legacy id 0 included', () => {
    const result = run(exportOf(VALID))
    expect(result).toEqual({ counts: { project: 2, note: 2 }, refused: [], committed: true })
    const projects = sqlite.query('SELECT id, name, legacy_post_id FROM project ORDER BY id').all()
    expect(projects).toEqual([
      { id: 1, name: 'Zonder project', legacy_post_id: 0 },
      { id: 2, name: 'Alfa', legacy_post_id: 7 },
    ])
    const notes = sqlite.query('SELECT tekst, project_id FROM note ORDER BY id').all()
    expect(notes).toEqual([
      { tekst: 'eerste', project_id: 2 },
      { tekst: 'op nul', project_id: 1 },
    ])
  })

  test('datasets import in relation order, whatever their order in the file', () => {
    const result = run(exportOf({ note: VALID.note as [], project: VALID.project as [] }))
    expect(result.committed).toBe(true)
    expect(sqlite.query('SELECT project_id FROM note ORDER BY id').all()).toEqual([
      { project_id: 2 },
      { project_id: 1 },
    ])
  })

  test('derived columns come from the writer', () => {
    run(exportOf(VALID))
    expect(sqlite.query('SELECT lengte FROM note ORDER BY id').all()).toEqual([{ lengte: 6 }, { lengte: 6 }])
  })

  test('custom is stored on a dataset that declares custom fields, and defaults to {}', () => {
    run(exportOf(VALID))
    expect(sqlite.query('SELECT custom FROM project ORDER BY id').all()).toEqual([
      { custom: '{}' },
      { custom: '{"colour":"rood"}' },
    ])
    expect(sqlite.query('SELECT custom FROM note ORDER BY id').all()).toEqual([
      { custom: '{}' },
      { custom: '{"herkomst":"x"}' },
    ])
  })

  test('a custom with a bad key or a nested value refuses its row, reported without the value', () => {
    const customs = ['{"__proto__":"x"}', '{"a.b":"x"}', '{"diep":{"geheim":"x"}}', '{"lijst":[{"geheim":"x"}]}']
    const rows = customs.map((custom, i) => ({ legacy_id: 10 + i, name: 'P', custom: JSON.parse(custom) }))
    rows.push({ legacy_id: 20, name: 'P', custom: { ok_1: 'x', vlag: true, n: 2, leeg: null, tags: ['a', 1] } })
    const result = run(exportOf({ project: rows }), true)
    expect(result.refused.map((r) => r.legacy_id)).toEqual([10, 11, 12, 13])
    expect(JSON.stringify(result.refused)).not.toContain('geheim')
    expect(result.counts.project).toBe(1)
  })

  test('legacy_post_id is written only where the dataset declares it', () => {
    run(exportOf(VALID))
    const columns = sqlite.query("SELECT name FROM pragma_table_info('note')").all() as { name: string }[]
    expect(columns.map((c) => c.name)).not.toContain('legacy_post_id')
  })

  test('the whole import is one Revision batch with the administrator as actor', () => {
    run(exportOf(VALID))
    const batches = sqlite.query('SELECT DISTINCT batch_id, actor_id FROM revision').all() as Record<string, unknown>[]
    expect(batches).toHaveLength(1)
    expect(batches[0]?.actor_id).toBe(admin.id)
    const records = sqlite.query('SELECT DISTINCT entity, record_id FROM revision ORDER BY entity, record_id').all()
    expect(records).toHaveLength(4)
  })

  test('--accept-report skips refused rows, and rows that point at them, and commits the rest', () => {
    const data = exportOf({
      project: [...(VALID.project as []), { legacy_id: 8, name: 'Beta' }, { legacy_id: 9, name: 3 }],
      note: [...(VALID.note as []), { legacy_id: 32, project_id: 9, tekst: 'hangt aan een geweigerd project' }],
    })
    const result = run(data, true)
    expect(result).toEqual({
      counts: { project: 3, note: 2 },
      refused: [
        { dataset: 'project', legacy_id: 9, message: '"name" must be text' },
        { dataset: 'note', legacy_id: 32, message: '"project_id" names legacy id 9, which was refused' },
      ],
      committed: true,
    })
    expect(contents(sqlite, 'project')).toHaveLength(3)
    expect(contents(sqlite, 'note')).toHaveLength(2)
  })
})

const SERVE = join(import.meta.dir, '..', 'src', 'serve.ts')
const DOMAIN = join(import.meta.dir, 'fixtures', 'import-domain.ts')

describe('serve.ts --import', () => {
  let dir: string
  let db: string
  let file: string
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'wt-import-cli-'))
    db = join(dir, 'db.sqlite')
    file = join(dir, 'export.json')
  })

  const cli = async (...args: string[]) => {
    const proc = Bun.spawn(['bun', SERVE, '--domain', DOMAIN, '--db', db, ...args], { stdout: 'pipe', stderr: 'pipe' })
    const code = await proc.exited
    return { code, out: await new Response(proc.stdout).text(), err: await new Response(proc.stderr).text() }
  }
  const count = (table: string) => {
    const opened = new Database(db)
    const { n } = opened.query(`SELECT COUNT(*) AS n FROM ${table}`).get() as { n: number }
    opened.close()
    return n
  }
  const withAccount = async (role: string) =>
    expect((await cli('--create-account', `${role}@example.test`, '--role', role)).code).toBe(0)

  test('imports as an administrator, prints counts only and writes an empty report beside the file', async () => {
    writeFileSync(file, JSON.stringify(exportOf(VALID)))
    await withAccount('administrator')
    const done = await cli('--import', file, '--as', 'administrator@example.test')
    expect(done.code).toBe(0)
    expect(done.out).not.toContain('Alfa')
    expect(done.out).toContain('project 2')
    expect(JSON.parse(readFileSync(`${file}.report.json`, 'utf8'))).toEqual({ committed: true, refused: [] })
    expect(count('note')).toBe(2)
  }, 20_000)

  test('a refusal exits 1, commits nothing, and the report holds ids and messages, never values', async () => {
    const secret = 'Geheime Waarde'
    const bad = { ...VALID, note: [{ legacy_id: 33, project_id: 99, tekst: secret }] }
    writeFileSync(file, JSON.stringify(exportOf(bad)))
    const report = join(dir, 'elders.json')
    await withAccount('administrator')
    const done = await cli('--import', file, '--as', 'administrator@example.test', '--report', report)
    expect(done.code).toBe(1)
    expect(count('project')).toBe(0)
    const text = readFileSync(report, 'utf8')
    expect(JSON.parse(text)).toEqual({
      committed: false,
      refused: [{ dataset: 'note', legacy_id: 33, message: '"project_id" names legacy id 99, absent from the export' }],
    })
    for (const out of [text, done.out, done.err]) expect(out).not.toContain(secret)
    expect(existsSync(`${file}.report.json`)).toBe(false)
  }, 20_000)

  test('--accept-report commits the rest and exits 0', async () => {
    const bad = { ...VALID, note: [...(VALID.note as []), { legacy_id: 33, project_id: 99, tekst: 'x' }] }
    writeFileSync(file, JSON.stringify(exportOf(bad)))
    await withAccount('administrator')
    const done = await cli('--import', file, '--as', 'administrator@example.test', '--accept-report')
    expect(done.code).toBe(0)
    expect(done.out).toContain('1 refused')
    expect(count('note')).toBe(2)
  }, 20_000)

  test.each([
    ['an editor', 'editor', 'editor@example.test'],
    ['an unknown account', 'administrator', 'nobody@example.test'],
  ])(
    '--as %s is refused and nothing is imported',
    async (_, role, as) => {
      writeFileSync(file, JSON.stringify(exportOf(VALID)))
      await withAccount(role)
      const done = await cli('--import', file, '--as', as)
      expect(done.code).toBe(1)
      expect(done.err).toMatch(/administrator/)
      expect(count('project')).toBe(0)
    },
    20_000,
  )

  test('--as a disabled administrator is refused', async () => {
    writeFileSync(file, JSON.stringify(exportOf(VALID)))
    await withAccount('administrator')
    expect((await cli('--disable-account', 'administrator@example.test')).code).toBe(0)
    const done = await cli('--import', file, '--as', 'administrator@example.test')
    expect(done.code).toBe(1)
    expect(count('project')).toBe(0)
  }, 20_000)

  test('a file that is not JSON is refused without quoting it', async () => {
    writeFileSync(file, '{"datasets": Geheim}')
    await withAccount('administrator')
    const done = await cli('--import', file, '--as', 'administrator@example.test')
    expect(done.code).toBe(1)
    expect(done.err).toContain('is not valid JSON')
    expect(done.err).not.toContain('Geheim')
  }, 20_000)

  test('--import without --as is refused', async () => {
    writeFileSync(file, JSON.stringify(exportOf(VALID)))
    const done = await cli('--import', file)
    expect(done.code).toBe(1)
    expect(done.err).toMatch(/--as/)
  }, 20_000)
})
