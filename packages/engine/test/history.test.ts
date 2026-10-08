import { Database } from 'bun:sqlite'
import { beforeEach, describe, expect, test } from 'bun:test'
import { type Domain, defineQuery, migrate, seedDomain } from '../src'
import { domain, send } from './fixture'
import { signIn, testEngine } from './sign-in'

type Request = ReturnType<typeof send>

const OWN = { dataset: 'project', id: 1 }
const SYSTEM = -1
const json = (value: unknown) => JSON.stringify(value)

// Every row claims project 1 here, so an owner of project 1 has all of them in this query's scope; note's own scope is narrower.
const noteAlle = defineQuery({
  name: 'note_alle',
  label: 'Alle notes',
  title: 'inhoud',
  sql: 'SELECT n.id, 1 AS project_id, n.tekst AS inhoud, n.lengte FROM note n WHERE n.deleted_at IS NULL',
  owners: { owner: 'project_id' },
  creates: 'note',
  columns: {
    id: { type: 'integer', label: 'Id' },
    project_id: { type: 'integer', label: 'Project', relation: 'project' },
    inhoud: { type: 'text', label: 'Inhoud', writes: { dataset: 'note', field: 'tekst', key: 'id' } },
    lengte: { type: 'integer', label: 'Lengte' },
  },
})
const wider: Domain = { ...domain, queries: [...domain.queries, noteAlle] }

let sqlite: Database
let owner: Request
let editor: Request
let anonymous: Request
let ids: { owner: number; editor: number }
let emails: { owner: string; editor: string }

interface Entry {
  batch: string
  others?: number
  by: string
  actor: string | null
  undoable: boolean
  batch_kind: string | null
  created: boolean
  record: { id: number; title: string }
  changes: { field: string; label: string; old: unknown; new: unknown }[]
}

let at = 0
// A batch as the engine writes it: one batch row, one revision row per change.
function revised(key: string, actor: number, kind: string, rows: [string, number, string, unknown, unknown][]): void {
  const stamp = `2026-10-08T10:00:${String(at++).padStart(2, '0')}.000Z`
  sqlite.query('INSERT INTO batch (key, actor_id, kind, at) VALUES (?, ?, ?, ?)').run(key, actor, kind, stamp)
  const insert = sqlite.query(
    'INSERT INTO revision (entity, record_id, field, old, new, actor_id, at, batch_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
  )
  for (const [entity, id, field, old, value] of rows) {
    const encoded = (v: unknown) => (v === null ? null : json(v))
    insert.run(entity, id, field, encoded(old), encoded(value), actor, stamp, key)
  }
}

async function history(as: Request, source: string, query = ''): Promise<Entry[]> {
  const res = await as('GET', `/api/history/${source}${query}`)
  expect(res.status).toBe(200)
  return res.body.entries as Entry[]
}

async function engineFor(over: Domain): Promise<void> {
  sqlite = new Database(':memory:')
  migrate(sqlite, over)
  seedDomain(sqlite, over)
  // Another subject's note: raw, since the writer refuses project 2.
  sqlite.run(`INSERT INTO note (project_id, tekst, lengte) VALUES (2, 'ander', 5)`)
  sqlite.run(`INSERT INTO stempel (project_id, tekst) VALUES (1, 'rond')`)
  const app = testEngine(sqlite, over)
  owner = send(app, await signIn(app, 'owner', OWN))
  editor = send(app, await signIn(app, 'editor'))
  anonymous = send(app)
  const account = (role: string) =>
    sqlite.query('SELECT id, email FROM account WHERE role = ?').get(role) as {
      id: number
      email: string
    }
  ids = { owner: account('owner').id, editor: account('editor').id }
  emails = { owner: account('owner').email, editor: account('editor').email }
}

beforeEach(() => engineFor(wider))

describe('GET /history/:source', () => {
  test("answers the view's rows' entries, newest batch first, with title and changes", async () => {
    revised('a', ids.editor, 'write', [['note', 1, 'tekst', 'eerste', 'tweede']])
    revised('b', ids.editor, 'write', [['note', 1, 'tekst', 'tweede', 'derde']])
    sqlite.run(`UPDATE note SET tekst = 'derde' WHERE id = 1`)
    const entries = await history(editor, 'note')
    expect(entries.map((e) => e.batch)).toEqual(['b', 'a'])
    expect(entries[0]).toMatchObject({
      record: { id: 1, title: 'derde' },
      changes: [{ field: 'tekst', label: 'Tekst', old: 'tweede', new: 'derde' }],
      created: false,
      batch_kind: 'write',
    })
  })

  test('reads only the rows the filter keeps', async () => {
    revised('a', ids.editor, 'write', [['note', 1, 'tekst', 'x', 'eerste']])
    revised('b', ids.editor, 'write', [['note', 2, 'tekst', 'x', 'ander']])
    const only = await history(editor, 'note', `?filter=${encodeURIComponent(json({ id: 2 }))}`)
    expect(only.map((e) => e.record.id)).toEqual([2])
  })

  test('a create is one entry with created true', async () => {
    const made = await editor('POST', '/api/rows/note', { body: json({ project_id: 1, tekst: 'nieuw' }) })
    const [entry] = await history(editor, 'note')
    expect(entry).toMatchObject({ batch: made.body.revision.batch_id, created: true, record: { id: made.body.id } })
    expect(entry?.changes.map((c) => c.field)).toContain('tekst')
    expect(entry?.changes.map((c) => c.field)).not.toContain('id')
  })

  test("a relation's old and new values come as titles", async () => {
    revised('a', ids.editor, 'write', [['note', 1, 'project_id', 2, 1]])
    const [entry] = await history(editor, 'note')
    expect(entry?.changes).toEqual([{ field: 'project_id', label: 'Project', old: 'Beta', new: 'Alfa' }])
  })

  test("a relation's title outside the caller's scope is not named: an owner reads no other project's title", async () => {
    revised('a', ids.editor, 'write', [['note', 1, 'project_id', 2, 1]])
    const [entry] = await history(owner, 'note')
    expect(entry?.changes).toEqual([{ field: 'project_id', label: 'Project', old: null, new: 'Alfa' }])
    expect(json(await history(owner, 'note'))).not.toContain('Beta')
  })

  test('an undoable entry counts the other records its undo changes, across the whole batch', async () => {
    revised('a', ids.editor, 'write', [
      ['note', 1, 'tekst', 'x', 'eerste'],
      ['note', 2, 'tekst', 'y', 'ander'],
      ['taak', 1, 'status', 'open', 'klaar'],
    ])
    const entries = await history(editor, 'note', `?filter=${encodeURIComponent(json({ id: 1 }))}`)
    expect(entries.map((e) => [e.record.id, e.others])).toEqual([[1, 2]])
  })

  test('one batch over two records gives an entry for each', async () => {
    revised('a', ids.editor, 'write', [
      ['note', 1, 'tekst', 'x', 'eerste'],
      ['note', 2, 'tekst', 'y', 'ander'],
    ])
    const entries = await history(editor, 'note')
    expect(entries.map((e) => [e.batch, e.record.id]).sort()).toEqual([
      ['a', 1],
      ['a', 2],
    ])
    expect(entries.every((e) => e.undoable)).toBe(true)
  })

  test('entries caps the entries: default 50, at most 100', async () => {
    for (let i = 0; i < 3; i++) revised(`k${i}`, ids.editor, 'write', [['note', 1, 'tekst', 'x', 'y']])
    expect((await history(editor, 'note', '?entries=2')).map((e) => e.batch)).toEqual(['k2', 'k1'])
    for (const bad of ['0', '101', 'x', '1.5']) {
      expect(await editor('GET', `/api/history/note?entries=${bad}`)).toMatchObject({
        status: 400,
        body: { code: 'bad_entries' },
      })
    }
  })
})

describe('whose change it was', () => {
  test('self for the caller, account with the email for another, system for -1, gone for no account', async () => {
    revised('own', ids.editor, 'write', [['note', 1, 'tekst', 'a', 'b']])
    revised('other', ids.owner, 'write', [['note', 1, 'tekst', 'b', 'c']])
    revised('sys', SYSTEM, 'seed', [['note', 1, 'tekst', 'c', 'd']])
    revised('lost', 999, 'write', [['note', 1, 'tekst', 'd', 'e']])
    const by = Object.fromEntries((await history(editor, 'note')).map((e) => [e.batch, [e.by, e.actor]]))
    expect(by).toEqual({
      own: ['self', emails.editor],
      other: ['account', emails.owner],
      sys: ['system', null],
      lost: ['gone', null],
    })
  })

  test('a disabled account still has its email: it is account', async () => {
    revised('other', ids.owner, 'write', [['note', 1, 'tekst', 'a', 'b']])
    sqlite.run(`UPDATE account SET disabled_at = '2026-10-01T00:00:00.000Z' WHERE id = ${ids.owner}`)
    const [entry] = await history(editor, 'note')
    expect([entry?.by, entry?.actor]).toEqual(['account', emails.owner])
  })

  // Threat 4.
  test("an owner sees hidden and no other account's email", async () => {
    revised('other', ids.editor, 'write', [['note', 1, 'tekst', 'a', 'b']])
    revised('lost', 999, 'write', [['note', 1, 'tekst', 'b', 'c']])
    revised('own', ids.owner, 'write', [['note', 1, 'tekst', 'c', 'd']])
    const res = await owner('GET', '/api/history/note')
    const by = Object.fromEntries((res.body.entries as Entry[]).map((e) => [e.batch, [e.by, e.actor]]))
    expect(by).toEqual({ other: ['hidden', null], lost: ['hidden', null], own: ['self', emails.owner] })
    expect(json(res.body)).not.toContain(emails.editor)
  })
})

// Threat 3.
describe("an owner's history holds only its own scope", () => {
  test('no entry for a row outside its scope, by record id', async () => {
    revised('a', ids.editor, 'write', [['note', 2, 'tekst', 'x', 'ander']])
    revised('b', ids.editor, 'write', [
      ['note', 1, 'tekst', 'x', 'eerste'],
      ['note', 2, 'tekst', 'y', 'ander'],
    ])
    expect((await history(owner, 'note')).map((e) => [e.batch, e.record.id])).toEqual([['b', 1]])
  })

  test("no id that is in the query's scope but not in the created dataset's own scope", async () => {
    revised('a', ids.editor, 'write', [['note', 2, 'tekst', 'x', 'ander']])
    revised('b', ids.editor, 'write', [['note', 1, 'tekst', 'x', 'eerste']])
    const rows = await owner('GET', '/api/rows/note_alle')
    expect(rows.body.rows.map((r: { id: number }) => r.id)).toEqual([1, 2])
    expect((await history(owner, 'note_alle')).map((e) => e.record.id)).toEqual([1])
  })

  test('a query whose created dataset the caller cannot read answers no entries', async () => {
    // stempel_lijst writes no column, so only the create shows.
    revised('a', ids.editor, 'write', [
      ['stempel', 1, 'id', null, 1],
      ['stempel', 1, 'tekst', null, 'rond'],
    ])
    expect((await history(editor, 'stempel_lijst')).map((e) => e.record.id)).toEqual([1])
    expect(await history(owner, 'stempel_lijst')).toEqual([])
  })

  test('an unreadable source is 404, and unauthenticated is 401', async () => {
    expect(await owner('GET', '/api/history/plat')).toMatchObject({ status: 404, body: { code: 'unknown_source' } })
    expect(await editor('GET', '/api/history/nope')).toMatchObject({ status: 404, body: { code: 'unknown_source' } })
    expect((await anonymous('GET', '/api/history/note')).status).toBe(401)
  })
})

describe('a query source', () => {
  test('a query without creates answers no entries', async () => {
    revised('a', ids.editor, 'write', [['taak', 1, 'status', 'klaar', 'open']])
    expect(await history(editor, 'per_project')).toEqual([])
  })

  test('changes hold only its mapped columns, under its own names and labels', async () => {
    revised('a', ids.editor, 'write', [
      ['note', 1, 'tekst', 'x', 'eerste'],
      ['note', 1, 'lengte', 1, 6],
    ])
    revised('b', ids.editor, 'write', [['note', 1, 'lengte', 6, 7]])
    const entries = await history(editor, 'note_alle')
    expect(entries.map((e) => e.batch)).toEqual(['a'])
    expect(entries[0]?.changes).toEqual([{ field: 'inhoud', label: 'Inhoud', old: 'x', new: 'eerste' }])
  })
})

// Threat 5.
describe('undoable', () => {
  test("only the caller's own undone-able batch", async () => {
    revised('write', ids.editor, 'write', [['note', 1, 'tekst', 'a', 'b']])
    revised('action', ids.editor, 'action', [['note', 1, 'tekst', 'b', 'c']])
    revised('undo', ids.editor, 'undo', [['note', 1, 'tekst', 'c', 'd']])
    revised('delete', ids.editor, 'write', [
      ['note', 1, 'tekst', 'd', 'e'],
      ['note', 2, 'deleted_at', null, '2026-10-08T00:00:00.000Z'],
    ])
    revised('seed', ids.editor, 'seed', [['note', 1, 'tekst', 'e', 'f']])
    revised('import', ids.editor, 'import', [['note', 1, 'tekst', 'f', 'g']])
    revised('sys', SYSTEM, 'write', [['note', 1, 'tekst', 'g', 'h']])
    revised('other', ids.owner, 'write', [['note', 1, 'tekst', 'h', 'i']])
    revised('undone', ids.editor, 'write', [['note', 1, 'tekst', 'i', 'j']])
    sqlite.run(`UPDATE batch SET undone_by = 'later' WHERE key = 'undone'`)
    const undoable = Object.fromEntries((await history(editor, 'note')).map((e) => [e.batch, e.undoable]))
    expect(undoable).toEqual({
      write: true,
      action: true,
      undo: true,
      delete: false,
      seed: false,
      import: false,
      sys: false,
      other: false,
      undone: false,
    })
  })

  test('an undoable entry is undone through the batch undo', async () => {
    await editor('PATCH', '/api/rows/note/1', { body: json({ tekst: 'nieuw' }) })
    const [entry] = await history(editor, 'note')
    expect(entry?.undoable).toBe(true)
    expect((await editor('POST', `/api/batches/${entry?.batch}/undo`, { body: '{}' })).status).toBe(200)
    const after = await history(editor, 'note')
    expect(after.find((e) => e.batch === entry?.batch)?.undoable).toBe(false)
    expect(after[0]?.batch_kind).toBe('undo')
  })
})
