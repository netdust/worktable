import { Database } from 'bun:sqlite'
import { beforeEach, describe, expect, test } from 'bun:test'
import {
  type ColumnDecl,
  createAccount,
  type Domain,
  DomainError,
  defineDataset,
  defineQuery,
  importExport,
  migrate,
  validateDomain,
} from '../src'
import { seedMissing } from '../src/seed-missing'
import { contents, send } from './fixture'
import { signIn, testEngine } from './sign-in'

const columns = {
  name: { type: 'text', label: 'Name' },
  web: { type: 'text', label: 'Web', nullable: true, href: true },
  plain: { type: 'text', label: 'Plain', nullable: true },
} as const

const site = defineDataset({ name: 'site', label: 'Sites', title: 'name', custom: false, columns })
const vast = defineDataset({ name: 'vast', label: 'Vast', title: 'name', custom: false, config: true, columns })

const writer = {
  create: (values: Record<string, unknown>) => values,
  update: (values: Record<string, unknown>) => values,
}

const make = (seed: Domain['seed'] = () => {}): Domain => ({
  datasets: [site, vast],
  queries: [],
  writers: { site: writer, vast: writer },
  actions: {},
  seed,
  views: [],
})

const withSite = make()
const json = (value: unknown) => ({ body: JSON.stringify(value) })

let sqlite: Database
let request: ReturnType<typeof send>

beforeEach(async () => {
  sqlite = new Database(':memory:')
  migrate(sqlite, withSite)
  const app = testEngine(sqlite, withSite)
  request = send(app, await signIn(app))
  sqlite.run(`INSERT INTO site (name, web) VALUES ('een', 'https://voorbeeld-site.test')`)
})

const refused = [
  'javascript:alert(1)',
  'data:text/html,x',
  '/relative',
  'not a url',
  'ftp://x',
  '',
  ' https://voorbeeld-site.test',
]

describe('an href column holds a web address or nothing', () => {
  test.each(refused)('a PATCH of %p is 400 bad_url and the row stays', async (value) => {
    const before = contents(sqlite, 'site')
    const res = await request('PATCH', '/api/rows/site/1', json({ web: value }))
    expect({ status: res.status, code: res.body.code }).toEqual({ status: 400, code: 'bad_url' })
    expect(contents(sqlite, 'site')).toEqual(before)
  })

  test.each(refused)('a POST of %p is 400 bad_url and no row is made', async (value) => {
    const before = contents(sqlite, 'site')
    const res = await request('POST', '/api/rows/site', json({ name: 'twee', web: value }))
    expect({ status: res.status, code: res.body.code }).toEqual({ status: 400, code: 'bad_url' })
    expect(contents(sqlite, 'site')).toEqual(before)
  })

  test.each(['https://example.test', 'http://example.test'])('%p is stored', async (value) => {
    const res = await request('PATCH', '/api/rows/site/1', json({ web: value }))
    expect(res.status).toBe(200)
    expect(contents(sqlite, 'site')[0]?.web).toBe(value)
  })

  test('null is stored on a nullable one', async () => {
    const res = await request('PATCH', '/api/rows/site/1', json({ web: null }))
    expect(res.status).toBe(200)
    expect(contents(sqlite, 'site')[0]?.web).toBeNull()
  })

  test('a column without href takes any text', async () => {
    const res = await request('PATCH', '/api/rows/site/1', json({ plain: 'javascript:alert(1)' }))
    expect(res.status).toBe(200)
  })

  test('the schema serves href on the column', async () => {
    const res = await request('GET', '/api/schema')
    expect(res.body.sources.site.columns.web.href).toBe(true)
    expect(res.body.sources.site.columns.plain.href).toBeUndefined()
  })
})

describe('validateDomain on href', () => {
  const declared = (column: ColumnDecl): Domain => ({
    ...withSite,
    datasets: [
      defineDataset({
        name: 'site',
        label: 'A',
        title: 'name',
        custom: false,
        columns: { name: columns.name, web: column },
      }),
    ],
  })

  test('refuses href on an integer column', () => {
    const column = { type: 'integer', label: 'N', nullable: true, href: true } as ColumnDecl
    expect(() => validateDomain(declared(column))).toThrow(DomainError)
  })

  test.each([{ options: { a: 'A' } }, { relation: 'project' }])('refuses href with %p', (extra) => {
    const column = { type: 'text', label: 'W', nullable: true, href: true, ...extra } as ColumnDecl
    expect(() => validateDomain(declared(column))).toThrow(DomainError)
  })

  test('refuses href on a query column: its values are never checked by a write', () => {
    const view = defineQuery({
      name: 'adressen',
      label: 'Adressen',
      title: 'name',
      sql: "SELECT 1 AS id, 'x' AS name, 'https://example.test' AS web",
      columns: {
        id: { type: 'integer', label: 'Id' },
        name: { type: 'text', label: 'Name' },
        web: { type: 'text', label: 'Web', href: true },
      },
    })
    expect(() => validateDomain({ ...withSite, queries: [view] })).toThrow(DomainError)
  })

  test('refuses a second href column on one source: the drawer offers one address', () => {
    const second = defineDataset({
      name: 'site',
      label: 'A',
      title: 'name',
      custom: false,
      columns: {
        name: columns.name,
        web: columns.web,
        other: { type: 'text', label: 'Other', nullable: true, href: true },
      },
    })
    expect(() => validateDomain({ ...withSite, datasets: [second] })).toThrow(DomainError)
  })

  test('takes href on a text column', () => {
    expect(() => validateDomain(withSite)).not.toThrow()
  })
})

describe('the other write paths go through the same check', () => {
  const data = (web: string) => ({
    worktable_export: 1,
    source: 'invented',
    datasets: { site: [{ legacy_id: 1, name: 'import', web }] },
  })

  const importInto = (web: string) => {
    const db = new Database(':memory:')
    migrate(db, withSite)
    const actor = {
      id: createAccount(db, withSite, 'admin@example.test', 'administrator'),
      role: 'administrator' as const,
      subject: null,
    }
    return { db, result: importExport(db, withSite, data(web), actor, { acceptReport: true }) }
  }

  test('an import refuses a bad address and stores no row', () => {
    const { db, result } = importInto('javascript:alert(1)')
    expect(result.refused).toHaveLength(1)
    expect(result.refused[0].message).toMatch(/must be an absolute http or https address/)
    expect(contents(db, 'site')).toEqual([])
  })

  test('an import stores a good one', () => {
    const { db } = importInto('https://voorbeeld-site.test')
    expect(contents(db, 'site')).toHaveLength(1)
  })

  test('--seed-missing refuses a bad address and stores no row', () => {
    const db = new Database(':memory:')
    const domain = make((insert) => insert('vast', [{ name: 'x', web: 'data:text/html,x' }]))
    migrate(db, domain)
    expect(() => seedMissing(db, domain)).toThrow(/must be an absolute http or https address/)
    expect(contents(db, 'vast')).toEqual([])
  })
})
