import { Database } from 'bun:sqlite'
import { beforeEach, describe, expect, test } from 'bun:test'
import { type Domain, DomainError, defineDataset, importExport, migrate, seedDomain, validateDomain } from '../src'
import { create, recordBatch } from '../src/writes'
import { contents, domain, freshDb, send } from './fixture'
import importDomain from './fixtures/import-domain'
import { signIn, testEngine } from './sign-in'

type Request = ReturnType<typeof send>

// The fixture domain with plat writable but not deletable.
const accept = (values: Record<string, unknown>) => values
const flat: Domain = { ...domain, writers: { ...domain.writers, plat: { create: accept, update: accept } } }

let sqlite: Database
let app: ReturnType<typeof testEngine>
let asA: Request
let asB: Request

// A signs in first and B second, so A is account 1 and B account 2.
const A = 1

async function engineFor(over: Domain, seeded = true): Promise<void> {
  sqlite = new Database(':memory:')
  migrate(sqlite, over)
  if (seeded) seedDomain(sqlite, over)
  app = testEngine(sqlite, over)
  asA = send(app, await signIn(app))
  asB = send(app, await signIn(app))
}

beforeEach(async () => {
  sqlite = freshDb()
  app = testEngine(sqlite, domain)
  asA = send(app, await signIn(app))
  asB = send(app, await signIn(app))
})

const json = (value: unknown) => JSON.stringify(value)
const post = (as: Request, dataset: string, body: unknown) => as('POST', `/api/rows/${dataset}`, { body: json(body) })
const patch = (as: Request, path: string, body: unknown) => as('PATCH', `/api/rows/${path}`, { body: json(body) })
const undo = (as: Request, key: string) => as('POST', `/api/batches/${key}/undo`, { body: '{}' })
const row = (table: string, id: number) =>
  sqlite.query(`SELECT * FROM "${table}" WHERE id = ?`).get(id) as Record<string, unknown>
const batchRow = (key: string) =>
  sqlite.query('SELECT actor_id, kind, undone_by FROM batch WHERE key = ?').get(key) as Record<string, unknown> | null

const state = () => ({
  project: contents(sqlite, 'project'),
  plat: contents(sqlite, 'plat'),
  note: contents(sqlite, 'note'),
  revision: contents(sqlite, 'revision'),
  batch: contents(sqlite, 'batch'),
})

async function denied(
  write: () => Promise<{ status: number; body: Record<string, unknown> }>,
  status: number,
  code: string,
) {
  const before = state()
  const res = await write()
  expect({ status: res.status, code: res.body.code }).toEqual({ status, code })
  expect(state()).toEqual(before)
  return res
}

const UUID = /^[0-9a-f-]{36}$/

async function edit(as: Request, path: string, body: unknown): Promise<string> {
  const res = await patch(as, path, body)
  expect(res.status).toBe(200)
  return res.body.revision.batch_id as string
}

describe('undo denials', () => {
  test("another account's batch is 403 forbidden and nothing changes", async () => {
    const key = await edit(asA, 'note/1', { tekst: 'ander' })
    await denied(() => undo(asB, key), 403, 'forbidden')
  })

  test('B edits after A: A undo is 409 changed_since naming the column, and B keeps its value', async () => {
    const key = await edit(asA, 'note/1', { tekst: 'ander' })
    await edit(asB, 'note/1', { tekst: 'van B' })
    const res = await denied(() => undo(asA, key), 409, 'changed_since')
    expect(res.body).toMatchObject({ dataset: 'note', id: 1, column: 'tekst', label: 'Tekst' })
    expect(row('note', 1).tekst).toBe('van B')
  })

  test('redo after someone changed the row is 409 changed_since', async () => {
    const key = await edit(asA, 'note/1', { tekst: 'ander' })
    const undone = (await undo(asA, key)).body.batch_id as string
    await edit(asB, 'note/1', { tekst: 'van B' })
    const res = await denied(() => undo(asA, undone), 409, 'changed_since')
    expect(res.body).toMatchObject({ column: 'tekst' })
  })

  test('a second undo of the same batch is 409 already_undone', async () => {
    const key = await edit(asA, 'note/1', { tekst: 'ander' })
    expect((await undo(asA, key)).status).toBe(200)
    await denied(() => undo(asA, key), 409, 'already_undone')
  })

  test('a batch with no batch row, and an unknown key, are 422 not_undoable', async () => {
    sqlite.run(
      `INSERT INTO revision (entity, record_id, field, old, new, actor_id, at, batch_id)
       VALUES ('note', 1, 'tekst', '"oud"', '"eerste"', ${A}, 'x', 'bare')`,
    )
    await denied(() => undo(asA, 'bare'), 422, 'not_undoable')
    await denied(() => undo(asA, 'nope'), 422, 'not_undoable')
    expect(row('note', 1).tekst).toBe('eerste')
  })

  test('an import batch is recorded with kind import and is 422 not_undoable', async () => {
    await engineFor(importDomain, false)
    const data = { worktable_export: 1, datasets: { plat: [{ legacy_id: 1, name: 'x' }] } }
    const result = importExport(
      sqlite,
      importDomain,
      data,
      { id: A, role: 'administrator', subject: null },
      {
        acceptReport: false,
      },
    )
    expect(result.committed).toBe(true)
    const { batch_id: key } = sqlite.query('SELECT DISTINCT batch_id FROM revision').get() as { batch_id: string }
    expect(batchRow(key)).toEqual({ actor_id: A, kind: 'import', undone_by: null })
    await denied(() => undo(asA, key), 422, 'not_undoable')
  })

  test("another account's import batch is 403 forbidden: the owner is checked before the kind", async () => {
    await engineFor(importDomain, false)
    const data = { worktable_export: 1, datasets: { plat: [{ legacy_id: 1, name: 'x' }] } }
    importExport(sqlite, importDomain, data, { id: A, role: 'administrator', subject: null }, { acceptReport: false })
    const { batch_id: key } = sqlite.query('SELECT DISTINCT batch_id FROM revision').get() as { batch_id: string }
    await denied(() => undo(asB, key), 403, 'forbidden')
  })

  test('a seed batch, owned by the system, is 422 not_undoable for any account', async () => {
    recordBatch(sqlite, 'seeded', -1, 'seed', new Date().toISOString())
    await denied(() => undo(asA, 'seeded'), 422, 'not_undoable')
    await denied(() => undo(asB, 'seeded'), 422, 'not_undoable')
  })

  test('a delete batch is 422 not_undoable', async () => {
    expect((await asA('DELETE', '/api/rows/note/1', { type: null })).status).toBe(200)
    const { batch_id: key } = sqlite.query("SELECT batch_id FROM revision WHERE field = 'deleted_at'").get() as {
      batch_id: string
    }
    expect(batchRow(key)).toMatchObject({ kind: 'write' })
    await denied(() => undo(asA, key), 422, 'not_undoable')
  })

  test('an owner undoing its own batch on a source it can no longer see is 404 unknown_source', async () => {
    await engineFor(flat)
    const key = await edit(asA, 'plat/1', { name: 'nieuw' })
    sqlite.run(`UPDATE account SET role = 'owner', subject_dataset = 'project', subject_id = 1 WHERE id = ${A}`)
    await denied(() => undo(asA, key), 404, 'unknown_source')
  })

  test('an owner undoing its own batch on a record now out of its scope is 404 unknown_record', async () => {
    sqlite.run(`UPDATE account SET role = 'owner', subject_dataset = 'project', subject_id = 1 WHERE id = ${A}`)
    const key = await edit(asA, 'note/1', { tekst: 'eigen' })
    sqlite.run(`UPDATE account SET subject_id = 2 WHERE id = ${A}`)
    await denied(() => undo(asA, key), 404, 'unknown_record')
    expect(row('note', 1).tekst).toBe('eigen')
  })

  test('undo of a create on a dataset whose writer has no delete is 405 read_only', async () => {
    await engineFor(flat)
    const created = await post(asA, 'plat', { name: 'nieuw' })
    expect(created.status).toBe(201)
    await denied(() => undo(asA, created.body.revision.batch_id), 405, 'read_only')
    expect(row('plat', created.body.id).deleted_at).toBeNull()
  })

  test('redo of an undo that removed created records is 422 not_undoable', async () => {
    const created = await post(asA, 'note', { project_id: 1, tekst: 'nieuw' })
    const undone = (await undo(asA, created.body.revision.batch_id)).body.batch_id as string
    await denied(() => undo(asA, undone), 422, 'not_undoable')
  })

  test('a record created by the batch and deleted since is 409 changed_since naming deleted_at', async () => {
    const created = await post(asA, 'note', { project_id: 1, tekst: 'nieuw' })
    expect((await asB('DELETE', `/api/rows/note/${created.body.id}`, { type: null })).status).toBe(200)
    const res = await denied(() => undo(asA, created.body.revision.batch_id), 409, 'changed_since')
    expect(res.body).toMatchObject({ dataset: 'note', id: created.body.id, column: 'deleted_at' })
  })

  test('a created record whose empty column B filled since is 409 changed_since naming it, and B keeps it', async () => {
    const created = await post(asA, 'note', { project_id: 1, tekst: 'nieuw' })
    await edit(asB, `note/${created.body.id}`, { day: '2026-10-12' })
    const res = await denied(() => undo(asA, created.body.revision.batch_id), 409, 'changed_since')
    expect(res.body).toMatchObject({ dataset: 'note', id: created.body.id, column: 'day', label: 'Day' })
    expect(row('note', created.body.id)).toMatchObject({ day: '2026-10-12', deleted_at: null })
  })

  test('undo of a create that a live row now references is 409 in_use', async () => {
    const key = crypto.randomUUID()
    const project = domain.datasets.find((d) => d.name === 'project')
    if (!project) throw new Error('fixture dataset missing')
    sqlite.transaction(() => {
      const now = new Date().toISOString()
      create(sqlite, project, { name: 'Gamma' }, now, A, key)
      recordBatch(sqlite, key, A, 'action', now)
    })()
    expect((await post(asB, 'note', { project_id: 3, tekst: 'verwijst' })).status).toBe(201)
    await denied(() => undo(asA, key), 409, 'in_use')
  })

  test('an undo the writer refuses rolls back the whole undo', async () => {
    sqlite.run("UPDATE project SET name = 'Gamma' WHERE id = 2")
    const key = await edit(asA, 'note/1', { project_id: 2 })
    sqlite.run("UPDATE project SET name = 'Beta' WHERE id = 1")
    await denied(() => undo(asA, key), 422, 'refused')
  })
})

describe('undo', () => {
  test('restores an update and answers the new batch', async () => {
    const key = await edit(asA, 'note/1', { tekst: 'ander' })
    const res = await undo(asA, key)
    expect(res.status).toBe(200)
    expect(res.body.affected).toEqual([{ dataset: 'note', id: 1 }])
    expect(res.body.batch_id).toMatch(UUID)
    expect(res.body.batch_id).not.toBe(key)
    expect(row('note', 1)).toMatchObject({ tekst: 'eerste', lengte: 6 })
    expect(batchRow(key)).toEqual({ actor_id: A, kind: 'write', undone_by: res.body.batch_id })
    expect(batchRow(res.body.batch_id)).toEqual({ actor_id: A, kind: 'undo', undone_by: null })
  })

  test('undo of a create soft-deletes the record', async () => {
    const created = await post(asA, 'note', { project_id: 1, tekst: 'nieuw' })
    const res = await undo(asA, created.body.revision.batch_id)
    expect(res.body.affected).toEqual([{ dataset: 'note', id: created.body.id }])
    expect(row('note', created.body.id).deleted_at).toMatch(/^\d{4}-/)
  })

  test('a create whose later edit was undone again is undone', async () => {
    const created = await post(asA, 'note', { project_id: 1, tekst: 'nieuw' })
    const key = await edit(asA, `note/${created.body.id}`, { day: '2026-10-12' })
    expect((await undo(asA, key)).status).toBe(200)
    expect((await undo(asA, created.body.revision.batch_id)).status).toBe(200)
    expect(row('note', created.body.id).deleted_at).toMatch(/^\d{4}-/)
  })

  test('undo of the undo (redo) restores the edit', async () => {
    const key = await edit(asA, 'note/1', { tekst: 'ander' })
    const undone = (await undo(asA, key)).body.batch_id as string
    const redone = await undo(asA, undone)
    expect(redone.status).toBe(200)
    expect(row('note', 1)).toMatchObject({ tekst: 'ander', lengte: 5 })
    expect(batchRow(undone)).toMatchObject({ kind: 'undo', undone_by: redone.body.batch_id })
  })

  test('undo of an edit that filled an empty cell restores null and keeps the record', async () => {
    const key = await edit(asA, 'note/1', { day: '2026-10-12' })
    expect((await undo(asA, key)).status).toBe(200)
    expect(row('note', 1)).toMatchObject({ day: null, deleted_at: null })
  })

  test('a batch that created a parent and then a child is undone child first', async () => {
    const key = crypto.randomUUID()
    const [project, note] = ['project', 'note'].map((name) => domain.datasets.find((d) => d.name === name))
    if (!project || !note) throw new Error('fixture datasets missing')
    sqlite.transaction(() => {
      const now = new Date().toISOString()
      const parent = create(sqlite, project, { name: 'Gamma' }, now, A, key).id
      create(sqlite, note, { project_id: parent, tekst: 'kind', lengte: 4 }, now, A, key)
      recordBatch(sqlite, key, A, 'action', now)
    })()
    const res = await undo(asA, key)
    expect(res.status).toBe(200)
    expect(res.body.affected).toEqual([
      { dataset: 'note', id: 2 },
      { dataset: 'project', id: 3 },
    ])
    expect([row('note', 2).deleted_at, row('project', 3).deleted_at]).toEqual([
      expect.stringMatching(/^\d{4}-/),
      expect.stringMatching(/^\d{4}-/),
    ])
  })
})

describe('the write reply', () => {
  test('revision.changed lists exactly the columns the writer changed, derived ones included', async () => {
    const res = await patch(asA, 'note/1', { tekst: 'ander', klaar: false })
    expect(res.body.revision).toEqual({ batch_id: expect.stringMatching(UUID), changed: ['tekst', 'lengte'] })
    expect(batchRow(res.body.revision.batch_id)).toEqual({ actor_id: A, kind: 'write', undone_by: null })
  })

  test('a create answers its batch and the columns it stored', async () => {
    const res = await post(asA, 'note', { project_id: 1, tekst: 'hallo' })
    expect(res.body.revision).toEqual({
      batch_id: expect.stringMatching(UUID),
      changed: ['project_id', 'tekst', 'lengte', 'klaar', 'kind'],
    })
  })

  test('a PATCH with no change answers batch_id null and records no batch', async () => {
    const before = state()
    const res = await patch(asA, 'note/1', { tekst: 'eerste' })
    expect(res.body.revision).toEqual({ batch_id: null, changed: [] })
    expect(state()).toEqual(before)
  })

  test('a declared column named revision is refused at validation', () => {
    const named = defineDataset({
      name: 'named',
      label: 'Named',
      title: 'revision',
      custom: false,
      columns: { revision: { type: 'text', label: 'Revision' } },
    })
    expect(() => validateDomain({ ...domain, datasets: [...domain.datasets, named] })).toThrow(DomainError)
  })
})
