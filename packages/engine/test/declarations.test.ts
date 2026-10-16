import { Database } from 'bun:sqlite'
import { describe, expect, test } from 'bun:test'
import {
  type ColumnDecl,
  type DatasetDecl,
  type Domain,
  DomainError,
  type Icon,
  migrate,
  type QueryDecl,
  seedDomain,
  TONES,
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

describe('validateDomain refuses a bad space, section or fact', () => {
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

  test('a section lists a query without of', () => {
    const sections = [{ label: 'Overviews', sources: ['job_room'] }]
    expect(() => validateDomain({ ...withQuery('job_room', { of: undefined }), sections })).not.toThrow()
  })

  test('a section listing a query with of is refused', () => {
    expect(refused({ ...spaced, sections: [{ label: 'Overviews', sources: ['job_room'] }] })).toEqual([
      'Overviews',
      'job_room',
    ])
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

  test('a filled fact names a link of its source', () => {
    const plainTaak = (facts: DatasetDecl['group_facts']): Domain => ({
      ...plain,
      datasets: plain.datasets.map((d) => (d.name === 'taak' ? { ...d, group_facts: facts } : d)),
    })
    expect(() => validateDomain(plainTaak([{ kind: 'filled', link: 'koppels', label: 'bezet' }]))).not.toThrow()
    expect(refused(plainTaak([{ kind: 'filled', link: 'ghost', label: 'bezet' }]))).toEqual(['taak', 'ghost'])
  })
})

async function schemaOf(domain: Domain, role: 'owner' | 'editor', owner = 'member'): Promise<Schema> {
  const sqlite = new Database(':memory:')
  migrate(sqlite, domain)
  seedDomain(sqlite, domain)
  const app = testEngine(sqlite, domain)
  const subject = role === 'owner' ? { dataset: owner, id: 1 } : null
  const cookie = await signIn(app, role, subject)
  const res = await app.request('/api/schema', { headers: { host: '127.0.0.1:4310', cookie } })
  expect(res.status).toBe(200)
  return (await res.json()) as Body
}

describe('/schema serves the declarations', () => {
  test('an editor gets the space, the sections, each source in or out of the space, and facts', async () => {
    const body = await schemaOf(spaced, 'editor')
    expect(body.space).toEqual({ model: 'team', field: 'team_id' })
    expect(body.sections).toEqual([
      { label: 'Work', sources: ['job'] },
      { label: 'Setup', sources: ['team', 'room'] },
    ])
    const space = Object.fromEntries(Object.entries(body.sources).map(([name, s]) => [name, (s as Schema).space]))
    expect(space).toEqual({ team: 'global', member: 'global', room: 'global', job: 'scoped', job_room: 'scoped' })
    expect(body.sources.job.group_facts).toEqual(dataset('job').group_facts)
    expect(body.sources.job_room.group_facts).toBeUndefined()
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
    }
  })
})

describe('tones', () => {
  const withTones = (tones: Record<string, 'ok' | 'warn' | 'bad'>, options?: Record<string, string>) => {
    const columns = { ...dataset('job').columns }
    columns.name = { ...columns.name, ...(options ? { options } : {}), tones } as ColumnDecl
    return withDataset('job', { columns })
  }

  test('a tone on a column without options is refused', () => {
    expect(refused(withTones({ a: 'ok' }))).toEqual(['job', 'name'])
  })

  test('a tone for an unknown option is refused', () => {
    expect(refused(withTones({ ghost: 'ok' }, { a: 'A' }))).toEqual(['job', 'ghost'])
  })

  test('declared tones validate and /schema serves them', async () => {
    const domain = withTones({ a: 'ok', b: 'bad' }, { a: 'A', b: 'B' })
    expect(() => validateDomain(domain)).not.toThrow()
    expect((await schemaOf(domain, 'editor')).sources.job.columns.name.tones).toEqual({ a: 'ok', b: 'bad' })
  })
})

describe('the tone palette', () => {
  const withTone = (tone: string) => {
    const columns = { ...dataset('job').columns }
    columns.kind = { ...columns.kind, tones: { main: tone } } as ColumnDecl
    return withDataset('job', { columns })
  }

  test('every palette tone validates', () => {
    for (const tone of TONES) expect(() => validateDomain(withTone(tone))).not.toThrow()
  })

  test('a tone outside the palette is refused', () => {
    expect(refused(withTone('purple'))).toEqual(['job', 'purple'])
  })
})

describe("a dataset's tone", () => {
  const withKind = (over: Partial<ColumnDecl>, tone = 'kind') =>
    withDataset('job', {
      tone,
      columns: { ...dataset('job').columns, kind: { ...dataset('job').columns.kind, ...over } },
    })

  test('a tone naming an unknown column, a column without tones, or one leaving an option untoned is refused', () => {
    expect(refused(withKind({}, 'ghost'))).toEqual(['job', 'ghost'])
    expect(refused(withKind({}))).toEqual(['job', 'kind'])
    expect(refused(withKind({ tones: { main: 'sky' } }))).toEqual(['job', 'kind'])
  })

  test('a tone on an options column toning every option validates, and /schema serves it on the dataset', async () => {
    const domain = withKind({ tones: { main: 'sky', side: 'rose' } })
    expect(() => validateDomain(domain)).not.toThrow()
    const sources = (await schemaOf(domain, 'editor')).sources
    expect(sources.job.tone).toBe('kind')
    expect(sources.room.tone).toBeUndefined()
  })
})

describe('a long text', () => {
  const withNote = (note: ColumnDecl) => withDataset('job', { columns: { ...dataset('job').columns, note } })

  test('long on an integer, an options or a relation column is refused', () => {
    expect(refused(withNote({ type: 'integer', label: 'Note', nullable: true, long: true }))).toEqual(['job', 'note'])
    expect(refused(withNote({ type: 'text', label: 'Note', options: { a: 'A' }, long: true }))).toEqual(['job', 'note'])
    expect(refused(withNote({ type: 'text', label: 'Note', relation: 'team', long: true }))).toEqual(['job', 'note'])
  })

  test('long on a text column validates and /schema serves it', async () => {
    const domain = withNote({ type: 'text', label: 'Note', nullable: true, long: true })
    expect(() => validateDomain(domain)).not.toThrow()
    const columns = (await schemaOf(domain, 'editor')).sources.job.columns
    expect(columns.note.long).toBe(true)
    expect(columns.name.long).toBeUndefined()
  })
})

describe('a declared default icon', () => {
  test('an icon outside the generic set is refused, on a dataset or a query', () => {
    expect(refused(withDataset('job', { icon: 'rocket' as Icon }))).toEqual(['job', 'rocket'])
    expect(refused(withQuery('job_room', { icon: 'rocket' as Icon }))).toEqual(['job_room', 'rocket'])
  })

  test('/schema serves the declared icon, and an administrator choice wins over it', async () => {
    const domain = withDataset('job', { icon: 'flag' })
    const sqlite = new Database(':memory:')
    migrate(sqlite, domain)
    seedDomain(sqlite, domain)
    const app = testEngine(sqlite, domain)
    const admin = await signIn(app, 'administrator')
    const headers = { host: '127.0.0.1:4310', cookie: admin, 'content-type': 'application/json' }
    const sources = async () => ((await (await app.request('/api/schema', { headers })).json()) as Schema).sources
    const put = (icon: string | null) =>
      app.request('/api/sources/job/display', { method: 'PUT', headers, body: JSON.stringify({ icon }) })

    expect((await sources()).job.icon).toBe('flag')
    expect((await sources()).room.icon).toBeNull()
    expect(await (await put('star')).json()).toMatchObject({ icon: 'star' })
    expect((await sources()).job.icon).toBe('star')
    expect(await (await put(null)).json()).toMatchObject({ icon: 'flag' })
    expect((await sources()).job.icon).toBe('flag')
  })
})

describe("a dataset's words for a new row", () => {
  test('a blank or overlong new_label is refused', () => {
    expect(refused(withDataset('job', { new_label: ' ' }))).toEqual(['job', ' '])
    expect(refused(withDataset('job', { new_label: 'x'.repeat(61) }))).toEqual(['job', 'x'.repeat(61)])
  })

  test('/schema serves it until an administrator renames the dataset', async () => {
    const domain = withDataset('job', { new_label: 'New job' })
    const sqlite = new Database(':memory:')
    migrate(sqlite, domain)
    seedDomain(sqlite, domain)
    const app = testEngine(sqlite, domain)
    const admin = await signIn(app, 'administrator')
    const headers = { host: '127.0.0.1:4310', cookie: admin, 'content-type': 'application/json' }
    const sources = async () => ((await (await app.request('/api/schema', { headers })).json()) as Schema).sources
    const put = (label: string) =>
      app.request('/api/sources/job/display', { method: 'PUT', headers, body: JSON.stringify({ label }) })

    expect((await sources()).job.new_label).toBe('New job')
    expect((await sources()).room.new_label).toBeUndefined()
    expect((await put('Tasks')).status).toBe(200)
    expect((await sources()).job.new_label).toBeUndefined()
  })
})

// A query over job that writes room's state and may create a room or a job.
function withStates(over: Partial<QueryDecl> = {}): Domain {
  const state: ColumnDecl = {
    type: 'text',
    label: 'State',
    default: 'open',
    options: { open: 'Open', shut: 'Shut' },
    tones: { open: 'ok', shut: 'bad' },
  }
  const room = dataset('room')
  const writes = { dataset: 'room', field: 'state', key: 'room_id' }
  const jobState: QueryDecl = {
    kind: 'query',
    name: 'job_state',
    label: 'Job states',
    title: 'name',
    owners: { owner: 'member_id' },
    creates: 'room',
    sql: `SELECT j.id, j.name, j.member_id, j.room_id, r.state, r.state AS own_state
          FROM job j LEFT JOIN room r ON r.id = j.room_id WHERE j.deleted_at IS NULL`,
    columns: {
      id: { type: 'integer', label: 'Id' },
      name: { type: 'text', label: 'Name' },
      member_id: { type: 'integer', label: 'Member', nullable: true, relation: 'member' },
      room_id: { type: 'integer', label: 'Room', nullable: true },
      state: { type: 'text', label: 'State', nullable: true, writes },
      own_state: { type: 'text', label: 'Own state', nullable: true, options: { open: 'Up', shut: 'Down' }, writes },
    },
    ...over,
  }
  const same = { create: (v: Body) => v, update: (v: Body) => v }
  return {
    ...spaced,
    datasets: spaced.datasets.map((d) => (d.name === 'room' ? { ...room, columns: { ...room.columns, state } } : d)),
    queries: [...spaced.queries, jobState],
    writers: { room: same, job: same },
  }
}

describe('creates on a query', () => {
  test('the fixture passes', () => expect(() => validateDomain(withStates())).not.toThrow())

  test('creates naming no dataset, a query, or a dataset without a writer that creates is refused', () => {
    expect(refused(withStates({ creates: 'ghost' }))).toEqual(['job_state', 'ghost'])
    expect(refused(withStates({ creates: 'job_room' }))).toEqual(['job_state', 'job_room'])
    expect(refused(withStates({ creates: 'team' }))).toEqual(['job_state', 'team'])
    const noCreate = { ...withStates(), writers: { room: { update: (v: Body) => v } } }
    expect(refused(noCreate)).toEqual(['job_state', 'room'])
  })

  test('/schema serves creates to a caller who can read the dataset, never to one who cannot', async () => {
    expect((await schemaOf(withStates(), 'editor')).sources.job_state.creates).toBe('room')
    expect((await schemaOf(withStates(), 'owner')).sources.job_state.creates).toBeUndefined()
    expect((await schemaOf(withStates({ creates: 'job' }), 'owner')).sources.job_state.creates).toBe('job')
    expect((await schemaOf(spaced, 'editor')).sources.job_room.creates).toBeUndefined()
  })
})

describe('of on a query', () => {
  const plainWith = (over: Partial<QueryDecl>): Domain => ({
    ...plain,
    queries: plain.queries.map((q) => (q.name === 'per_project' ? { ...q, ...over } : q)),
  })

  test('of naming an unknown dataset, a query, or the query itself is refused', () => {
    expect(refused(withQuery('job_room', { of: 'ghost' }))).toEqual(['job_room', 'ghost'])
    expect(refused(withStates({ of: 'job_room' }))).toEqual(['job_state', 'job_room'])
    expect(refused(withQuery('job_room', { of: 'job_room' }))).toEqual(['job_room', 'job_room'])
  })

  test('a section listing a query is refused', () => {
    expect(refused({ ...spaced, sections: [{ label: 'X', sources: ['job', 'job_room'] }] })).toEqual(['X', 'job_room'])
  })

  test('/schema serves of', async () => {
    expect((await schemaOf(spaced, 'editor')).sources.job_room.of).toBe('job')
    expect((await schemaOf(spaced, 'editor')).sources.job.of).toBeUndefined()
  })

  test('an owner who cannot read the of dataset gets no of, and still reads the query', async () => {
    const body = await schemaOf(plainWith({ of: 'plat' }), 'owner', 'project')
    expect(body.sources.per_project).toBeDefined()
    expect(body.sources.per_project.of).toBeUndefined()
    expect((await schemaOf(plainWith({ of: 'plat' }), 'editor', 'project')).sources.per_project.of).toBe('plat')
    expect((await schemaOf(plainWith({ of: 'taak' }), 'owner', 'project')).sources.per_project.of).toBe('taak')
  })
})

describe('flags on a query', () => {
  // job_room flags jobs and rooms, toned by where its room comes from.
  const flags = { marks: { job: 'id', room: 'room_id' }, tone: 'room_from' }
  const flagged = (over: Partial<NonNullable<QueryDecl['flags']>> = {}, tones?: Record<string, string>) => {
    const columns = query('job_room').columns
    const room_from = { ...columns.room_from, tones: tones ?? { own: 'warn', team: 'bad' } } as ColumnDecl
    return withQuery('job_room', { flags: { ...flags, ...over }, columns: { ...columns, room_from } })
  }

  test('a mark to an unknown dataset or a query, to a text or an undeclared column, or a tone without tones is refused', () => {
    expect(refused(flagged({ marks: { ghost: 'id' } }))).toEqual(['job_room', 'ghost'])
    expect(refused(flagged({ marks: { job_room: 'id' } }))).toEqual(['job_room', 'job_room'])
    expect(refused(flagged({ marks: { job: 'name' } }))).toEqual(['job_room', 'name'])
    expect(refused(flagged({ marks: { job: 'missing' } }))).toEqual(['job_room', 'missing'])
    expect(refused(flagged({ marks: {} }))).toEqual(['job_room', 'marks'])
    expect(refused(flagged({ tone: 'name' }))).toEqual(['job_room', 'name'])
    expect(refused(flagged({}, { own: 'warn' }))).toEqual(['job_room', 'room_from'])
  })

  test('/schema serves the flags of a query', async () => {
    const domain = flagged()
    expect(() => validateDomain(domain)).not.toThrow()
    const sources = (await schemaOf(domain, 'editor')).sources
    expect(sources.job_room.flags).toEqual(flags)
    expect(sources.job.flags).toBeUndefined()
  })

  // per_project flags taak, which an owner reads, and plat, which no owner reads (threat 5).
  const plainFlagged = (marks: Record<string, string>): Domain => ({
    ...plain,
    queries: plain.queries.map((q) =>
      q.name === 'per_project'
        ? {
            ...q,
            sql: q.sql.replace('COUNT(*) AS aantal', "COUNT(*) AS aantal, NULL AS plat_id, 'high' AS level"),
            columns: {
              ...q.columns,
              plat_id: { type: 'integer', label: 'Plat', nullable: true },
              level: { type: 'text', label: 'Level', options: { high: 'High' }, tones: { high: 'bad' } },
            },
            flags: { marks, tone: 'level' },
          }
        : q,
    ),
  })

  test('/schema names a mark only to a caller who can read its dataset, and no flags when none is left', async () => {
    const both = plainFlagged({ taak: 'id', plat: 'plat_id' })
    expect(() => validateDomain(both)).not.toThrow()
    expect((await schemaOf(both, 'editor', 'project')).sources.per_project.flags).toEqual({
      marks: { taak: 'id', plat: 'plat_id' },
      tone: 'level',
    })
    expect((await schemaOf(both, 'owner', 'project')).sources.per_project.flags).toEqual({
      marks: { taak: 'id' },
      tone: 'level',
    })
    const unread = await schemaOf(plainFlagged({ plat: 'plat_id' }), 'owner', 'project')
    expect(unread.sources.per_project).toBeDefined()
    expect(unread.sources.per_project.flags).toBeUndefined()
  })
})

describe('a mapped query column', () => {
  test('takes its target column options and tones', async () => {
    const columns = (await schemaOf(withStates(), 'editor')).sources.job_state.columns
    expect(columns.state.options).toEqual({ open: 'Open', shut: 'Shut' })
    expect(columns.state.tones).toEqual({ open: 'ok', shut: 'bad' })
  })

  test('that declares its own options keeps them and takes no tones', async () => {
    const columns = (await schemaOf(withStates(), 'editor')).sources.job_state.columns
    expect(columns.own_state.options).toEqual({ open: 'Up', shut: 'Down' })
    expect(columns.own_state.tones).toBeUndefined()
  })

  test('takes nothing from a target the caller cannot read', async () => {
    const columns = (await schemaOf(withStates(), 'owner')).sources.job_state.columns
    expect(columns.state.options).toBeUndefined()
    expect(columns.state.tones).toBeUndefined()
  })
})
