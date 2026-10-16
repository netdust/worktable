import { Database } from 'bun:sqlite'
import { beforeEach, describe, expect, test } from 'bun:test'
import { type DatasetDecl, type Domain, DomainError, migrate, validateDomain } from '../src'
import { recordLinkFor } from '../src/record-link'
import { contents, domain, freshDb, type Sent, send } from './fixture'
import { signIn, TEST_LINK_SECRET, testEngine } from './sign-in'

type Request = ReturnType<typeof send>

const json = (value: unknown) => JSON.stringify(value)
const body = (value: unknown): Sent => ({ body: json(value) })
const columnsOf = (db: Database, table: string) =>
  (db.query(`PRAGMA table_info(${table})`).all() as { name: string }[]).map((c) => c.name)

let sqlite: Database
let app: ReturnType<typeof testEngine>
let editor: Request
let owner: Request

beforeEach(async () => {
  sqlite = freshDb()
  // A note on project 2, whose writer refuses every change: project Beta is closed.
  sqlite.run("INSERT INTO note (project_id, tekst, lengte) VALUES (2, 'tweede', 6)")
  app = testEngine(sqlite, domain)
  editor = send(app, await signIn(app, 'editor'))
  owner = send(app, await signIn(app, 'owner', { dataset: 'project', id: 1 }))
})

const written = () => ({ note: contents(sqlite, 'note'), revision: contents(sqlite, 'revision') })

async function denied(
  run: () => Promise<{ status: number; body: Record<string, unknown> }>,
  status: number,
  code: string,
) {
  const before = written()
  const res = await run()
  expect({ status: res.status, code: res.body.code }).toEqual({ status, code })
  expect(written()).toEqual(before)
}

describe('position on every dataset table', () => {
  test('a database made before it gains it, null on every row, as a fresh create has it; engine tables have none', () => {
    const before = freshDb()
    for (const { name } of domain.datasets) {
      before.run(`ALTER TABLE ${name} DROP COLUMN position`)
      before.query("UPDATE _migrations SET hash = 'before position' WHERE source = ?").run(name)
    }
    migrate(before, domain)
    const fresh = new Database(':memory:')
    migrate(fresh, domain)
    for (const { name } of domain.datasets) expect(columnsOf(before, name)).toEqual(columnsOf(fresh, name))
    expect(columnsOf(fresh, 'taak').at(-1)).toBe('position')
    expect(before.query('SELECT position FROM taak').all()).toEqual(Array(4).fill({ position: null }))
    for (const table of ['saved_view', 'revision']) expect(columnsOf(fresh, table)).not.toContain('position')
  })

  const withDataset = (name: string, over: Partial<DatasetDecl>): Domain => ({
    ...domain,
    datasets: domain.datasets.map((d) => (d.name === name ? { ...d, ...over } : d)),
  })
  const refusal = (d: Domain): DomainError => {
    try {
      validateDomain(d)
    } catch (e) {
      if (e instanceof DomainError) return e
      throw e
    }
    throw new Error('expected DomainError')
  }
  const taak = domain.datasets.find((d) => d.name === 'taak') as DatasetDecl
  const stempel = domain.datasets.find((d) => d.name === 'stempel') as DatasetDecl

  test('a domain declaring a column, a lookup or a link named position is refused', () => {
    const column = { ...taak.columns, position: { type: 'text', label: 'P', nullable: true } } as DatasetDecl['columns']
    const lookup = { ...stempel.lookups, position: { label: 'P', via: 'project_id', field: 'name' } }
    const link = {
      ...taak.links,
      position: { label: 'P', item: 'P', dataset: 'merk', key: 'taak_id', target: 'plat_id' },
    }
    expect(refusal(withDataset('taak', { columns: column })).bad).toBe('position')
    expect(refusal(withDataset('stempel', { lookups: lookup })).bad).toBe('position')
    expect(refusal(withDataset('taak', { links: link })).bad).toBe('position')
  })
})

describe('sorting on position', () => {
  const four = encodeURIComponent(json({ id: { $in: [1, 2, 3, 5] } }))
  const read = async (query: string) => (await editor('GET', `/api/rows/taak?filter=${four}&${query}`)).body
  const ids = async (query: string) => ((await read(query)).rows as { id: number }[]).map((r) => r.id)

  beforeEach(() => {
    sqlite.run(
      "INSERT INTO taak (project_id, description, status, start_at, day) VALUES (1, 'vijf', 'open', '2026-10-20T10:00', '2026-10-20')",
    )
    sqlite.run("UPDATE taak SET position = 'b' WHERE id = 1")
    sqlite.run("UPDATE taak SET position = 'a' WHERE id = 2")
  })

  test('the rows route serves it, and orders the ranked rows first, the unranked by id', async () => {
    const rows = (await read('sort=position')).rows as { id: number; position: string | null }[]
    expect(rows.map((r) => [r.id, r.position])).toEqual([
      [2, 'a'],
      [1, 'b'],
      [3, null],
      [5, null],
    ])
  })

  test('the unranked rows follow in the sort’s other keys', async () => {
    expect(await ids('sort=position,-day')).toEqual([2, 1, 5, 3])
  })

  test('descending, the ranks reverse and the unranked rows stay last', async () => {
    expect(await ids('sort=-position')).toEqual([1, 2, 3, 5])
  })

  test('filter and group on position are refused, and a query has none to sort on', async () => {
    const filter = await editor('GET', `/api/rows/taak?filter=${encodeURIComponent(json({ position: 'a' }))}`)
    expect({ status: filter.status, code: filter.body.code }).toEqual({ status: 400, code: 'bad_filter' })
    const group = await editor('GET', '/api/rows/taak?group=position')
    expect({ status: group.status, code: group.body.code }).toEqual({ status: 400, code: 'bad_group' })
    const query = await editor('GET', '/api/rows/per_project?sort=position')
    expect({ status: query.status, code: query.body.code }).toEqual({ status: 400, code: 'bad_sort' })
  })

  test('a saved view on a dataset sorts on position then another column, and never groups or filters on it', async () => {
    const view = { name: 'Handmatig', source: 'taak', skin: 'table' }
    expect((await editor('POST', '/api/views', body({ ...view, sort: ['position', 'day'] }))).status).toBe(201)
    for (const over of [{ group_by: 'position' }, { filters: { position: 'a' } }]) {
      const res = await editor('POST', '/api/views', body({ ...view, ...over }))
      expect({ status: res.status, code: res.body.code }).toEqual({ status: 400, code: 'bad_view' })
    }
  })

  test('a view on a query, the only kind owners see, cannot sort on position: it is not a column there', async () => {
    const res = await editor(
      'POST',
      '/api/views',
      body({ name: 'Volgorde', source: 'per_project', sort: ['position'] }),
    )
    expect({ status: res.status, code: res.body.code }).toEqual({ status: 400, code: 'bad_view' })
    expect(res.body.message).toContain('"position" is not a column')
  })
})

describe('writing position', () => {
  const patch = (as: Request, id: number, value: unknown) => as('PATCH', `/api/rows/note/${id}`, body(value))
  const rankOf = (id: number) =>
    (sqlite.query('SELECT position FROM note WHERE id = ?').get(id) as { position: unknown }).position

  test('with another column, in one batch, and one undo restores both, the rank to the one before', async () => {
    await patch(editor, 1, { position: 'U' })
    const res = await patch(editor, 1, { kind: 'lang', position: 'V' })
    expect(res.status).toBe(200)
    expect(res.body.position).toBe('V')
    expect(res.body.revision.changed).toEqual(['kind', 'position'])
    const batch = res.body.revision.batch_id as string
    const fields = sqlite.query('SELECT field FROM revision WHERE batch_id = ? ORDER BY id').all(batch)
    expect(fields).toEqual([{ field: 'kind' }, { field: 'position' }])

    expect((await editor('POST', `/api/batches/${batch}/undo`, { body: '{}' })).status).toBe(200)
    expect(sqlite.query('SELECT kind, position FROM note WHERE id = 1').get()).toEqual({ kind: 'kort', position: 'U' })
  })

  test('a create another account has ranked since is not undone: 409 changed_since, and nothing changes', async () => {
    const made = await editor('POST', '/api/rows/note', body({ project_id: 1, tekst: 'nieuw' }))
    const other = send(app, await signIn(app, 'editor'))
    expect((await patch(other, made.body.id, { position: 'V' })).status).toBe(200)
    await denied(
      () => editor('POST', `/api/batches/${made.body.revision.batch_id}/undo`, { body: '{}' }),
      409,
      'changed_since',
    )
    expect(rankOf(made.body.id)).toBe('V')
  })

  test.each([
    ['not a rank!', 'not a rank!'],
    ['256 characters', 'V'.repeat(256)],
    ['a rank ending in 0', 'V0'],
    ['the rank 0', '0'],
    ['an empty rank', ''],
    ['a number', 5],
  ])('%s is 400 bad_value and writes nothing', (_, value) =>
    denied(() => patch(editor, 1, { position: value }), 400, 'bad_value'),
  )

  test('255 characters of the alphabet are a rank, and null clears it', async () => {
    const longest = `${'0'.repeat(254)}z`
    expect((await patch(editor, 1, { position: longest })).status).toBe(200)
    expect(rankOf(1)).toBe(longest)
    expect((await patch(editor, 1, { position: null })).status).toBe(200)
    expect(rankOf(1)).toBeNull()
  })

  test('a rank alone is read in the caller’s scope: outside it, 404', () =>
    denied(() => patch(owner, 2, { position: 'V' }), 404, 'unknown_record'))

  test('a rank alone still passes the writer, which refuses it as any change to that row', () =>
    denied(() => patch(editor, 2, { position: 'V' }), 422, 'refused'))

  test('an owner never writes it, alone or with a column it may write', async () => {
    await denied(() => patch(owner, 1, { position: 'V' }), 403, 'forbidden')
    await denied(() => patch(owner, 1, { tekst: 'eigen', position: 'V' }), 403, 'forbidden')
  })

  test('an undo of a rank its maker wrote as an editor, now an owner, is 403 forbidden: the rank stays', async () => {
    const res = await patch(editor, 1, { position: 'V' })
    expect(res.status).toBe(200)
    const { id } = sqlite.query("SELECT id FROM account WHERE role = 'editor'").get() as { id: number }
    sqlite.query("UPDATE account SET role = 'owner', subject_dataset = 'project', subject_id = 1 WHERE id = ?").run(id)
    await denied(
      () => editor('POST', `/api/batches/${res.body.revision.batch_id}/undo`, { body: '{}' }),
      403,
      'forbidden',
    )
    expect(rankOf(1)).toBe('V')
  })

  test('a person link never writes it: it is no owner-writable column', async () => {
    const token = recordLinkFor(sqlite, TEST_LINK_SECRET, 'project', 1)
    const link = async () => {
      const res = await app.request('/api/rows/note/1', {
        method: 'PATCH',
        headers: { host: '127.0.0.1:4310', 'content-type': 'application/json', authorization: `RecordLink ${token}` },
        body: json({ position: 'V' }),
      })
      return { status: res.status, body: (await res.json()) as Record<string, unknown> }
    }
    await denied(link, 403, 'column_not_owner_writable')
  })

  test('a create carrying it makes the row unranked', async () => {
    const res = await editor('POST', '/api/rows/note', body({ project_id: 1, tekst: 'nieuw', position: 'V' }))
    expect(res.status).toBe(201)
    expect(res.body.position).toBeNull()
    expect(res.body.revision.changed).not.toContain('position')
    expect(rankOf(res.body.id)).toBeNull()
  })
})

describe('position in history and the schema', () => {
  test('a rank-only batch is listed as a move, without the rank', async () => {
    await editor('PATCH', '/api/rows/note/1', body({ position: 'V' }))
    const res = await editor('GET', `/api/history/note?filter=${encodeURIComponent(json({ id: 1 }))}`)
    const [entry] = res.body.entries
    expect(entry.changes).toStrictEqual([{ field: 'position', label: 'Position', moved: true }])
  })

  test('/schema marks each dataset sortable on position, and no query', async () => {
    const { sources } = (await editor('GET', '/api/schema')).body
    expect(sources.taak.position).toBe(true)
    expect(sources.note.position).toBe(true)
    expect(sources.per_project.position).toBeUndefined()
  })
})
