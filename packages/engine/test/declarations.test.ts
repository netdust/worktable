import { Database } from 'bun:sqlite'
import { describe, expect, test } from 'bun:test'
import {
  type ColumnDecl,
  type DatasetDecl,
  type Domain,
  DomainError,
  migrate,
  type QueryDecl,
  seedDomain,
  validateDomain,
} from '../src'
import { domain as plain } from './fixture'
import spaced from './fixtures/space-domain'
import { signIn, testEngine } from './sign-in'

type Body = Record<string, unknown>
// biome-ignore lint/suspicious/noExplicitAny: response bodies are asserted structurally
type Schema = Record<string, any>

const dataset = (name: string): DatasetDecl => spaced.datasets.find((d) => d.name === name) as DatasetDecl
const query = (name: string): QueryDecl => spaced.queries.find((q) => q.name === name) as QueryDecl

const withDataset = (name: string, over: Partial<DatasetDecl>): Domain => ({
  ...spaced,
  datasets: spaced.datasets.map((d) => (d.name === name ? { ...d, ...over } : d)),
})

const withQuery = (name: string, over: Partial<QueryDecl>): Domain => ({
  ...spaced,
  queries: spaced.queries.map((q) => (q.name === name ? { ...q, ...over } : q)),
})

function failure(d: Domain): DomainError {
  try {
    validateDomain(d)
  } catch (e) {
    if (e instanceof DomainError) return e
    throw e
  }
  throw new Error('expected DomainError')
}

const refused = (d: Domain) => {
  const e = failure(d)
  return [e.declaration, e.bad]
}

describe('validateDomain refuses a bad space, section, fact or inherited column', () => {
  test('the fixture passes', () => expect(() => validateDomain(spaced)).not.toThrow())

  test('a space naming an unknown dataset', () => {
    expect(refused({ ...spaced, space: { dataset: 'nowhere' } })).toEqual(['space', 'nowhere'])
  })

  test('a scoped column that is not a relation to the space dataset', () => {
    expect(refused(withDataset('job', { scoped: 'member_id' }))).toEqual(['job', 'member_id'])
    expect(refused(withDataset('job', { scoped: 'name' }))).toEqual(['job', 'name'])
    expect(refused(withDataset('job', { scoped: 'missing' }))).toEqual(['job', 'missing'])
  })

  test('a scoped column without a declared space', () => {
    expect(refused({ ...spaced, space: undefined })).toEqual(['job', 'team_id'])
  })

  test('a space no source is scoped to', () => {
    const bare = {
      ...spaced,
      datasets: spaced.datasets.map(({ scoped: _, ...d }) => d),
      queries: spaced.queries.map(({ scoped: _, ...q }) => q),
    }
    expect(refused(bare)).toEqual(['space', 'team'])
  })

  test('scoped columns with different names', () => {
    const other: ColumnDecl = { type: 'integer', label: 'Other team', relation: 'team' }
    const d = withQuery('job_room', { scoped: 'other_id', columns: { ...query('job_room').columns, other_id: other } })
    expect(refused(d)).toEqual(['job_room', 'other_id'])
  })

  test('a section naming an unknown source', () => {
    expect(refused({ ...spaced, sections: [{ label: 'X', sources: ['job', 'ghost'] }] })).toEqual(['X', 'ghost'])
  })

  test('a source listed twice, in one section or across two', () => {
    expect(refused({ ...spaced, sections: [{ label: 'X', sources: ['job', 'job'] }] })).toEqual(['X', 'job'])
    const across = [
      { label: 'X', sources: ['job'] },
      { label: 'Y', sources: ['room', 'job'] },
    ]
    expect(refused({ ...spaced, sections: across })).toEqual(['Y', 'job'])
  })

  test('a fact naming an unknown column, in column or in where', () => {
    const first = { kind: 'first', column: 'ghost', where: { kind: 'main' }, label: 'g' } as const
    expect(refused(withDataset('job', { group_facts: [first] }))).toEqual(['job', 'ghost'])
    const where = { kind: 'count', where: { ghost: 1 }, label: 'g' } as const
    expect(refused(withDataset('job', { group_facts: [where] }))).toEqual(['job', 'ghost'])
    const empty = { kind: 'empty', column: 'ghost', label: 'g' } as const
    expect(refused(withQuery('job_room', { group_facts: [empty] }))).toEqual(['job_room', 'ghost'])
  })

  test('inherited on a dataset column', () => {
    const columns = { ...dataset('job').columns }
    columns.room_id = { ...columns.room_id, inherited: { flag: 'kind', own: 'main' } } as ColumnDecl
    expect(refused(withDataset('job', { columns }))).toEqual(['job', 'room_id'])
  })

  test('inherited with a flag that is not a column of the query', () => {
    const columns = { ...query('job_room').columns }
    columns.room_id = { ...columns.room_id, inherited: { flag: 'ghost', own: 'own' } } as ColumnDecl
    expect(refused(withQuery('job_room', { columns }))).toEqual(['job_room', 'ghost'])
  })
})

async function schemaOf(domain: Domain, role: 'owner' | 'editor'): Promise<Schema> {
  const sqlite = new Database(':memory:')
  migrate(sqlite, domain)
  seedDomain(sqlite, domain)
  const app = testEngine(sqlite, domain)
  const subject = role === 'owner' ? { dataset: 'member', id: 1 } : null
  const cookie = await signIn(app, role, subject)
  const res = await app.request('/api/schema', { headers: { host: '127.0.0.1:4310', cookie } })
  expect(res.status).toBe(200)
  return (await res.json()) as Body
}

describe('/schema serves the declarations', () => {
  test('an editor gets the space, the sections, each source in or out of the space, facts and inherited', async () => {
    const body = await schemaOf(spaced, 'editor')
    expect(body.space).toEqual({ model: 'team', field: 'team_id' })
    expect(body.sections).toEqual([
      { label: 'Work', sources: ['job_room', 'job'] },
      { label: 'Setup', sources: ['team', 'room'] },
    ])
    const space = Object.fromEntries(Object.entries(body.sources).map(([name, s]) => [name, (s as Schema).space]))
    expect(space).toEqual({ team: 'global', member: 'global', room: 'global', job: 'scoped', job_room: 'scoped' })
    expect(body.sources.job.group_facts).toEqual(dataset('job').group_facts)
    expect(body.sources.job_room.group_facts).toBeUndefined()
    expect(body.sources.job_room.columns.room_id.inherited).toEqual({ flag: 'room_from', own: 'own' })
  })

  test('an owner who cannot read the space dataset gets no space, and only readable, non-empty sections', async () => {
    const body = await schemaOf(spaced, 'owner')
    expect(Object.keys(body.sources)).toEqual(['member', 'job'])
    expect(body.space).toBeUndefined()
    expect(body.sections).toEqual([{ label: 'Work', sources: ['job'] }])
    expect(body.sources.job.space).toBeUndefined()
    expect(body.sources.job.group_facts).toEqual(dataset('job').group_facts)
  })

  test('a domain without the declarations serves none of them', async () => {
    const body = await schemaOf(plain, 'editor')
    expect(Object.keys(body)).toEqual(['sources'])
    for (const source of Object.values(body.sources) as Schema[]) {
      expect(source.space).toBeUndefined()
      expect(source.group_facts).toBeUndefined()
      for (const column of Object.values(source.columns) as Schema[]) expect(column.inherited).toBeUndefined()
    }
  })
})
