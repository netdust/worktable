import { Database } from 'bun:sqlite'
import { beforeEach, describe, expect, test } from 'bun:test'
import {
  type ColumnDecl,
  type Domain,
  DomainError,
  defineDataset,
  defineQuery,
  type LinkDecl,
  migrate,
  seedDomain,
  validateDomain,
} from '../src'
import { domain, send } from './fixture'
import { signIn, testEngine } from './sign-in'

type Request = ReturnType<typeof send>
type Link = { id: number; target: number | null; title: string; state: string | null }
type Row = { id: number; links?: Record<string, Link[]> }

const json = (value: unknown) => JSON.stringify(value)
const rowsOf = (body: Record<string, unknown>) => body.rows as Row[]
const linkIds = (row: Row | undefined, name: string) => row?.links?.[name]?.map((l) => l.id)

function koppel(sqlite: Database, taak: number, project: number | null, tekst: string, stand = 'open'): number {
  const sql = 'INSERT INTO koppel (taak_id, project_id, tekst, stand) VALUES (?, ?, ?, ?)'
  return Number(sqlite.query(sql).run(taak, project, tekst, stand).lastInsertRowid)
}

function merk(sqlite: Database, taak: number, plat: number | null, tekst: string): number {
  const sql = 'INSERT INTO merk (taak_id, plat_id, tekst) VALUES (?, ?, ?)'
  return Number(sqlite.query(sql).run(taak, plat, tekst).lastInsertRowid)
}

// A query over taak that creates taak rows, so a query's links and a public view have something to read.
const taakLijst = defineQuery({
  name: 'taak_lijst',
  label: 'Takenlijst',
  title: 'description',
  sql: 'SELECT id, description FROM taak WHERE deleted_at IS NULL',
  creates: 'taak',
  columns: { id: { type: 'integer', label: 'Id' }, description: { type: 'text', label: 'Description' } },
  links: {
    koppels: { label: 'Koppels', item: 'Koppel', dataset: 'koppel', key: 'taak_id', target: 'project_id' },
  },
})

const withQuery: Domain = {
  ...domain,
  queries: [...domain.queries, taakLijst],
  writers: { ...domain.writers, taak: { create: (values) => values } },
}

let sqlite: Database
let owner: Request
let editor: Request
let admin: Request

beforeEach(async () => {
  sqlite = new Database(':memory:')
  migrate(sqlite, withQuery)
  seedDomain(sqlite, withQuery)
  const app = testEngine(sqlite, withQuery)
  owner = send(app, await signIn(app, 'owner', { dataset: 'project', id: 1 }))
  editor = send(app, await signIn(app, 'editor'))
  admin = send(app, await signIn(app, 'administrator'))
})

describe('validateDomain refuses a links declaration', () => {
  const link = (over: Partial<LinkDecl> = {}): LinkDecl => ({
    label: 'Koppels',
    item: 'Koppel',
    dataset: 'koppel',
    key: 'taak_id',
    target: 'project_id',
    ...over,
  })
  const base = (domain.datasets.find((d) => d.name === 'taak') as ReturnType<typeof defineDataset>).columns
  const onTaak = (links: Record<string, LinkDecl>, columns: Record<string, ColumnDecl> = base): Domain => ({
    ...domain,
    datasets: domain.datasets.map((d) => (d.name === 'taak' ? { ...d, columns, links } : d)),
  })
  const onQuery = (over: Partial<Parameters<typeof defineQuery>[0]>): Domain => ({
    ...withQuery,
    queries: [...domain.queries, defineQuery({ ...taakLijst, ...over })],
  })
  function failure(d: Domain): [string, string] {
    try {
      validateDomain(d)
    } catch (e) {
      if (e instanceof DomainError) return [e.declaration, e.bad]
      throw e
    }
    throw new Error('expected DomainError')
  }

  test('the fixture and a query that creates its key dataset pass', () => {
    expect(() => validateDomain(domain)).not.toThrow()
    expect(() => validateDomain(withQuery)).not.toThrow()
  })

  test('a link dataset that does not exist', () => {
    expect(failure(onTaak({ koppels: link({ dataset: 'nergens' }) }))).toEqual(['taak', 'nergens'])
  })

  test('on a dataset, a key whose relation is not that dataset', () => {
    expect(failure(onTaak({ koppels: link({ key: 'project_id', target: 'taak_id' }) }))).toEqual(['taak', 'project_id'])
    expect(failure(onTaak({ koppels: link({ key: 'tekst' }) }))).toEqual(['taak', 'tekst'])
    expect(failure(onTaak({ koppels: link({ key: 'onbekend' }) }))).toEqual(['taak', 'onbekend'])
  })

  test('on a query, links without creates', () => {
    expect(failure(onQuery({ creates: undefined }))).toEqual(['taak_lijst', 'koppels'])
  })

  test('on a query, a key whose relation is not the creates dataset', () => {
    const links = { koppels: link({ key: 'project_id', target: 'taak_id' }) }
    expect(failure(onQuery({ links }))).toEqual(['taak_lijst', 'project_id'])
  })

  test('a target that is not a relation column', () => {
    expect(failure(onTaak({ koppels: link({ target: 'tekst' }) }))).toEqual(['taak', 'tekst'])
    expect(failure(onTaak({ koppels: link({ target: 'onbekend' }) }))).toEqual(['taak', 'onbekend'])
  })

  test('a state that is not an options column', () => {
    expect(failure(onTaak({ koppels: link({ state: 'tekst' }) }))).toEqual(['taak', 'tekst'])
    expect(failure(onTaak({ koppels: link({ state: 'onbekend' }) }))).toEqual(['taak', 'onbekend'])
  })

  test('a link name that clashes with a column', () => {
    expect(failure(onTaak({ status: link() }))).toEqual(['taak', 'status'])
    expect(failure(onTaak({ id: link() }))).toEqual(['taak', 'id'])
  })

  test('a column named links', () => {
    const columns = { ...base, links: { type: 'text', label: 'L' } as ColumnDecl }
    expect(failure(onTaak({}, columns))).toEqual(['taak', 'links'])
  })

  test('a link name that is not an identifier', () => {
    expect(() =>
      defineDataset({ name: 'x', label: 'X', title: 'id', custom: false, columns: {}, links: { 'A b': link() } }),
    ).toThrow('link "A b"')
  })
})

describe('/schema serves links', () => {
  test('with the target dataset and the state options, tones and default', async () => {
    const { body } = await editor('GET', '/api/schema')
    expect(body.sources.taak.links).toEqual({
      koppels: {
        label: 'Koppels',
        item: 'Koppel',
        dataset: 'koppel',
        key: 'taak_id',
        target: 'project_id',
        target_dataset: 'project',
        state: { options: { open: 'Open', vast: 'Vast' }, tones: { open: 'amber', vast: 'ok' }, default: 'open' },
      },
      merken: {
        label: 'Merken',
        item: 'Merk',
        dataset: 'merk',
        key: 'taak_id',
        target: 'plat_id',
        target_dataset: 'plat',
      },
    })
    expect(body.sources.project).not.toHaveProperty('links')
  })

  test('an owner who cannot read the link dataset gets no entry for it (threat 5)', async () => {
    const { body } = await owner('GET', '/api/schema')
    expect(body.sources).not.toHaveProperty('merk')
    expect(Object.keys(body.sources.taak.links)).toEqual(['koppels'])
  })
})

describe('/rows serves each row its link rows', () => {
  test('ordered by id, a soft-deleted one absent, a targetless one with its own title', async () => {
    const b = koppel(sqlite, 1, 2, 'bee', 'vast')
    const a = koppel(sqlite, 1, 1, 'aa')
    const gone = koppel(sqlite, 1, 1, 'weg')
    sqlite.run(`UPDATE koppel SET deleted_at = '2026-10-01' WHERE id = ${gone}`)
    const free = koppel(sqlite, 2, null, 'los')
    const { status, body } = await editor('GET', '/api/rows/taak')
    expect(status).toBe(200)
    const [one, two, three] = rowsOf(body)
    expect(one?.links?.koppels).toEqual([
      { id: b, target: 2, title: 'Beta', state: 'vast' },
      { id: a, target: 1, title: 'Alfa', state: 'open' },
    ])
    expect(two?.links?.koppels).toEqual([{ id: free, target: null, title: 'los', state: 'open' }])
    expect(three?.links).toEqual({ koppels: [], merken: [] })
  })

  test('a link without state is served with state null, and no column of the link row or target leaks', async () => {
    const id = merk(sqlite, 1, 1, 'rood')
    const row = rowsOf((await editor('GET', '/api/rows/taak')).body)[0]
    expect(row?.links?.merken).toEqual([{ id, target: 1, title: 'x', state: null }])
    for (const name of ['koppels', 'merken']) {
      koppel(sqlite, 1, 1, 'k')
      const links = rowsOf((await editor('GET', '/api/rows/taak')).body)[0]?.links?.[name] ?? []
      for (const link of links) expect(Object.keys(link).sort()).toEqual(['id', 'state', 'target', 'title'])
    }
  })

  test("an owner sees only its own project's link rows; another project's on the same taak is absent (threat 1)", async () => {
    const mine = koppel(sqlite, 1, 1, 'mijn')
    const theirs = koppel(sqlite, 1, 2, 'hun')
    const free = koppel(sqlite, 1, null, 'los')
    merk(sqlite, 1, 1, 'rood')
    const rows = rowsOf((await owner('GET', '/api/rows/taak')).body)
    const one = rows.find((r) => r.id === 1)
    expect(linkIds(one, 'koppels')).toEqual([mine])
    expect(linkIds(one, 'koppels')).not.toContain(theirs)
    expect(linkIds(one, 'koppels')).not.toContain(free)
    expect(one?.links).not.toHaveProperty('merken')
    expect(linkIds(rowsOf((await editor('GET', '/api/rows/taak')).body)[0], 'koppels')).toEqual([mine, theirs, free])
  })

  test("a query's rows carry their links by the created dataset's id", async () => {
    const id = koppel(sqlite, 3, 2, 'drie')
    const rows = rowsOf((await editor('GET', '/api/rows/taak_lijst')).body)
    expect(rows.map((r) => [r.id, linkIds(r, 'koppels')])).toEqual([
      [1, []],
      [2, []],
      [3, [id]],
      [4, []],
    ])
  })

  test('600 parents, two chunks of 500, each get their own link rows', async () => {
    const insert = sqlite.query(
      "INSERT INTO taak (project_id, description, status, start_at, day) VALUES (1, ?, 'open', '2026-10-12T09:00', '2026-10-12')",
    )
    const expected = new Map<number, number[]>()
    sqlite.transaction(() => {
      for (let i = 0; i < 600; i++) {
        const taak = Number(insert.run(`t${i}`).lastInsertRowid)
        expected.set(taak, [koppel(sqlite, taak, 1, `a${i}`), koppel(sqlite, taak, 2, `b${i}`)])
      }
    })()
    const rows = rowsOf((await editor('GET', '/api/rows/taak')).body).filter((r) => expected.has(r.id))
    expect(rows).toHaveLength(600)
    for (const row of rows) expect(linkIds(row, 'koppels')).toEqual(expected.get(row.id) as number[])
  })
})

describe('a link in a view', () => {
  const view = (over: Record<string, unknown>) =>
    json({ name: 'Met koppels', source: 'taak', visible_fields: ['description', 'koppels'], ...over })

  test('POST and PATCH /views keep a link name in visible_fields', async () => {
    const made = await editor('POST', '/api/views', { body: view({}) })
    expect({ status: made.status, fields: made.body.visible_fields }).toEqual({
      status: 201,
      fields: ['description', 'koppels'],
    })
    const patched = await editor('PATCH', `/api/views/${made.body.id}`, {
      body: json({ visible_fields: ['koppels', 'merken'] }),
    })
    expect({ status: patched.status, fields: patched.body.visible_fields }).toEqual({
      status: 200,
      fields: ['koppels', 'merken'],
    })
  })

  test('a view cannot sort or group on a link', async () => {
    for (const body of [view({ sort: ['koppels'] }), view({ sort: ['-koppels'] }), view({ group_by: 'koppels' })]) {
      const res = await editor('POST', '/api/views', { body })
      expect({ status: res.status, code: res.body.code }).toEqual({ status: 400, code: 'bad_view' })
    }
    const made = await editor('POST', '/api/views', { body: view({}) })
    const res = await editor('PATCH', `/api/views/${made.body.id}`, { body: json({ group_by: 'koppels' }) })
    expect({ status: res.status, code: res.body.code }).toEqual({ status: 400, code: 'bad_view' })
  })

  test('GET /rows cannot sort, group or filter on a link', async () => {
    const filter = encodeURIComponent(json({ koppels: 1 }))
    for (const [query, code] of [
      ['sort=koppels', 'bad_sort'],
      ['sort=-koppels', 'bad_sort'],
      ['group=koppels', 'bad_group'],
      [`filter=${filter}`, 'bad_filter'],
    ]) {
      const res = await editor('GET', `/api/rows/taak?${query}`)
      expect({ query, status: res.status, code: res.body.code }).toEqual({ query, status: 400, code })
    }
  })

  test("a public view's rows and columns leave the link out", async () => {
    koppel(sqlite, 1, 1, 'mijn')
    const body = json({ name: 'Publiek', source: 'taak_lijst', visible_fields: ['description', 'koppels'] })
    const made = await admin('POST', '/api/views', { body })
    expect(made.status).toBe(201)
    const { token } = (await admin('PUT', `/api/views/${made.body.id}/share-token`, { body: '{}' })).body
    const read = await admin('GET', `/api/public/views/${token}`, { type: null, cookie: '' })
    expect(read.status).toBe(200)
    expect(read.body.columns.map((c: { key: string }) => c.key)).toEqual(['description'])
    expect(read.body.rows[0]).toEqual({ description: 'een' })
  })
})
