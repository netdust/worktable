import type { Database } from 'bun:sqlite'
import { beforeEach, describe, expect, test } from 'bun:test'
import { type ActionCreate, type Domain, DomainError, defineDataset, validateDomain, type Writer } from '../src'
import { contents, domain, freshDb, send } from './fixture'
import { signIn, testEngine } from './sign-in'

type Request = ReturnType<typeof send>

// The fixture's note writer, whose update adds the rows a tekst names to its own batch.
const note = domain.writers?.note as Required<Writer>
const PLANS: Record<string, ActionCreate[]> = {
  'met kopie': [{ dataset: 'note', values: { project_id: 1, tekst: 'kopie' } }],
  // project's writer only deletes: no actor creates one.
  'naar project': [{ dataset: 'project', values: { name: 'Gamma' } }],
  // note's own writer refuses project Beta.
  'naar beta': [{ dataset: 'note', values: { project_id: 2, tekst: 'beta' } }],
  // An owner cannot see plat at all.
  'naar plat': [{ dataset: 'plat', values: { name: 'Plat' } }],
}
const splitting: Writer = {
  ...note,
  update: (values, ctx) => {
    const own = note.update(values, ctx)
    const creates = PLANS[String(values.tekst)]
    return creates ? { values: own, creates } : own
  },
}
const withCreates: Domain = { ...domain, writers: { ...domain.writers, note: splitting } }

let sqlite: Database
let editor: Request
let owner: Request

beforeEach(async () => {
  sqlite = freshDb()
  const app = testEngine(sqlite, withCreates)
  editor = send(app, await signIn(app, 'editor'))
  owner = send(app, await signIn(app, 'owner', { dataset: 'project', id: 1 }))
})

const json = (value: unknown) => JSON.stringify(value)
const patch = (as: Request, id: number, tekst: string) => as('PATCH', `/api/rows/note/${id}`, { body: json({ tekst }) })
const state = () => ({
  note: contents(sqlite, 'note'),
  project: contents(sqlite, 'project'),
  plat: contents(sqlite, 'plat'),
  revision: contents(sqlite, 'revision'),
  batch: contents(sqlite, 'batch'),
})
const batchOf = (entity: string, id: number) =>
  (
    sqlite.query('SELECT DISTINCT batch_id FROM revision WHERE entity = ? AND record_id = ?').all(entity, id) as {
      batch_id: string
    }[]
  ).map((r) => r.batch_id)

describe("a writer's update that adds creates", () => {
  test('lands them in its own batch through their own writer, and the reply names them', async () => {
    const res = await patch(editor, 1, 'met kopie')
    expect(res.status).toBe(200)
    const { batch_id, created } = res.body.revision
    expect(created).toEqual([{ dataset: 'note', id: expect.any(Number) }])
    const made = sqlite.query('SELECT tekst, lengte, project_id FROM note WHERE id = ?').get(created[0].id)
    // lengte is derived by note's create: the row went through its writer, not around it.
    expect(made).toEqual({ tekst: 'kopie', lengte: 5, project_id: 1 })
    expect(batchOf('note', created[0].id)).toEqual([batch_id])
    expect(batchOf('note', 1)).toContain(batch_id)
  })

  test('one undo reverses the update and removes the created row', async () => {
    const before = sqlite.query('SELECT tekst FROM note WHERE id = 1').get()
    const { batch_id, created } = (await patch(editor, 1, 'met kopie')).body.revision
    const undone = await editor('POST', `/api/batches/${batch_id}/undo`, { body: '{}' })
    expect(undone.status).toBe(200)
    expect(sqlite.query('SELECT tekst FROM note WHERE id = 1').get()).toEqual(before)
    expect(sqlite.query('SELECT deleted_at FROM note WHERE id = ?').get(created[0].id)).not.toEqual({
      deleted_at: null,
    })
  })

  test('a write without creates answers no created', async () => {
    const res = await patch(editor, 1, 'gewoon')
    expect(res.status).toBe(200)
    expect(res.body.revision).not.toHaveProperty('created')
  })
})

describe('a create the actor may not make refuses the whole write, and nothing is stored', () => {
  async function refused(as: Request, tekst: string, status: number, code: string) {
    const before = state()
    const res = await patch(as, 1, tekst)
    expect({ status: res.status, code: res.body.code }).toEqual({ status, code })
    expect(state()).toEqual(before)
  }

  test('into a dataset no one may create in', async () => {
    await refused(editor, 'naar project', 405, 'read_only')
  })

  test("into a dataset the owner cannot see, from the owner's own note", async () => {
    await refused(owner, 'naar plat', 404, 'unknown_source')
  })

  test("a create the target's own writer refuses", async () => {
    await refused(editor, 'naar beta', 422, 'refused')
  })
})

test('a dataset column named creates is refused at validation', () => {
  const named = defineDataset({
    name: 'named',
    label: 'Named',
    title: 'creates',
    custom: false,
    columns: { creates: { type: 'text', label: 'Creates' } },
  })
  expect(() => validateDomain({ ...domain, datasets: [...domain.datasets, named] })).toThrow(DomainError)
})
