import { Database } from 'bun:sqlite'
import { beforeEach, describe, expect, test } from 'bun:test'
import {
  type ActionDecl,
  type Domain,
  DomainError,
  defineDataset,
  forbid,
  migrate,
  seedDomain,
  validateDomain,
  type Writer,
} from '../src'
import { contents, domain, send } from './fixture'
import { signIn, testEngine } from './sign-in'

type Request = ReturnType<typeof send>

const OWN = { dataset: 'project', id: 1 }

// Owner-scoped, and its writer refuses an owner every create.
const entry = defineDataset({
  name: 'entry',
  label: 'Entries',
  title: 'text',
  custom: false,
  owners: { owner: 'project_id' },
  columns: {
    project_id: { type: 'integer', label: 'Project', relation: 'project' },
    text: { type: 'text', label: 'Text' },
  },
})

const entryWriter: Writer = {
  create: (values, ctx) => {
    if (ctx.actor.role === 'owner') forbid('an owner may not add an entry')
    return values
  },
  delete: () => {},
}

const accept = (values: Record<string, unknown>) => values

const noteOf = (project: unknown, tekst: string) => ({ dataset: 'note', values: { project_id: project, tekst } })

const parentOf = (project: unknown, tekst: string) => ({
  ...noteOf(project, tekst),
  children: (id: number) => [noteOf(project, `kind van ${id}`)],
})

const actions: Record<string, ActionDecl> = {
  ...domain.actions,
  // Typed inputs: `count` notes, each named after the word, the day and whether it was loud.
  typed: {
    label: 'Typed',
    on: 'project',
    input: {
      count: { type: 'integer', label: 'Count', min: 1, max: 3 },
      day: { type: 'date', label: 'Day' },
      word: { type: 'text', label: 'Word' },
      loud: { type: 'boolean', label: 'Loud', required: false },
    },
    run: (record, input) =>
      Array.from({ length: input.count as number }, (_, n) =>
        noteOf(record.id, `${input.word} ${input.day} ${n + 1}${input.loud ? '!' : ''}`),
      ),
  },
  // The third create repeats the first, which the note writer refuses.
  repeat: {
    label: 'Repeat',
    on: 'project',
    input: {},
    run: (record) => ['a', 'b', 'a'].map((tekst) => noteOf(record.id, tekst)),
  },
  // A create naming another project than the record's.
  elsewhere: { label: 'Elsewhere', on: 'project', input: {}, run: () => [noteOf(3, 'elders')] },
  on_flat: { label: 'On flat', on: 'plat', input: {}, run: () => [noteOf(1, 'flat')] },
  // An update of a note, then a create.
  rename: {
    label: 'Rename',
    on: 'project',
    input: {},
    run: (record) => ({
      updates: [{ dataset: 'note', id: 1, values: { tekst: 'hernoemd' } }],
      creates: [noteOf(record.id, 'nieuw')],
    }),
  },
  // The update moves the note to project Beta, which the writer refuses, after a create.
  rename_refused: {
    label: 'Rename refused',
    on: 'project',
    input: {},
    run: (record) => ({
      creates: [noteOf(record.id, 'tijdelijk')],
      updates: [{ dataset: 'note', id: 1, values: { project_id: 2 } }],
    }),
  },
  // An update of a note on another project than the record's.
  update_elsewhere: {
    label: 'Update elsewhere',
    on: 'project',
    input: {},
    run: () => ({ updates: [{ dataset: 'note', id: 2, values: { tekst: 'x' } }] }),
  },
  // A note, and a note under it pointing at it by tekst.
  nested: {
    label: 'Nested',
    on: 'project',
    input: {},
    run: (record) => [parentOf(record.id, 'ouder')],
  },
  // An update, a create and a nested create.
  all_three: {
    label: 'All three',
    on: 'project',
    input: {},
    run: (record) => ({
      updates: [{ dataset: 'note', id: 1, values: { tekst: 'hernoemd' } }],
      creates: [parentOf(record.id, 'ouder')],
    }),
  },
  // A note an owner may create, then an entry its writer refuses to an owner.
  make_entry: {
    label: 'Make entry',
    on: 'project',
    input: {},
    run: (record) => [noteOf(record.id, 'first'), { dataset: 'entry', values: { project_id: record.id, text: 'x' } }],
  },
}

const testDomain: Domain = {
  ...domain,
  datasets: [...domain.datasets, entry],
  writers: { ...domain.writers, plat: { create: accept, update: accept }, entry: entryWriter },
  actions,
}

let sqlite: Database
let editor: Request
let owner: Request

beforeEach(async () => {
  sqlite = new Database(':memory:')
  migrate(sqlite, testDomain)
  seedDomain(sqlite, testDomain)
  // A note on project 2, and a project 3 its writer accepts notes on, both outside the owner's scope.
  sqlite.run("INSERT INTO note (project_id, tekst, lengte) VALUES (2, 'tweede', 6)")
  sqlite.run("INSERT INTO project (name) VALUES ('Gamma')")
  const app = testEngine(sqlite, testDomain)
  editor = send(app, await signIn(app))
  owner = send(app, await signIn(app, 'owner', OWN))
})

const json = (value: unknown) => JSON.stringify(value)
const act = (as: Request, name: string, body: unknown, site?: string) =>
  as('POST', `/api/actions/${name}`, { body: json(body), site })

const state = () => ({
  note: contents(sqlite, 'note'),
  entry: contents(sqlite, 'entry'),
  plat: contents(sqlite, 'plat'),
  revision: contents(sqlite, 'revision'),
  batch: contents(sqlite, 'batch'),
})

async function denied(
  run: () => Promise<{ status: number; body: Record<string, unknown> }>,
  status: number,
  code: string,
) {
  const before = state()
  const res = await run()
  expect({ status: res.status, code: res.body.code }).toEqual({ status, code })
  expect(state()).toEqual(before)
}

const COPY = { id: 1, input: { source: 1 } }

describe('action denials', () => {
  test('an owner running an action on a dataset it cannot see is 404 unknown_source', () =>
    denied(() => act(owner, 'on_flat', { id: 1, input: {} }), 404, 'unknown_source'))

  test('an owner whose create a writer refuses is 403 forbidden, and the earlier create rolls back', () =>
    denied(() => act(owner, 'make_entry', { id: 1, input: {} }), 403, 'forbidden'))

  test("an owner's create naming a record outside its scope is 403 forbidden", () =>
    denied(() => act(owner, 'elsewhere', { id: 1, input: {} }), 403, 'forbidden'))

  test('an owner running an action on a record outside its scope is 404 unknown_record', () =>
    denied(() => act(owner, 'copy_notes', { id: 2, input: { source: 1 } }), 404, 'unknown_record'))

  test('an input naming a record the owner cannot read is 404 unknown_record', () =>
    denied(() => act(owner, 'copy_notes', { id: 1, input: { source: 2 } }), 404, 'unknown_record'))

  test('an input naming no record is 404 unknown_record', () =>
    denied(() => act(editor, 'copy_notes', { id: 1, input: { source: 999 } }), 404, 'unknown_record'))

  test('an unknown action is 404 unknown_action', async () => {
    await denied(() => act(editor, 'nope', COPY), 404, 'unknown_action')
    await denied(() => act(editor, 'toString', COPY), 404, 'unknown_action')
  })

  test('a writer refusal on the third create rolls back all three', () =>
    denied(() => act(editor, 'repeat', { id: 1, input: {} }), 422, 'refused'))

  test('a body without a numeric id or with a missing or extra input is 400 bad_body', async () => {
    await denied(() => act(editor, 'copy_notes', { id: '1', input: { source: 1 } }), 400, 'bad_body')
    await denied(() => act(editor, 'copy_notes', { id: 1, input: {} }), 400, 'bad_body')
    await denied(() => act(editor, 'copy_notes', { id: 1, input: { source: 1, extra: 2 } }), 400, 'bad_body')
    await denied(() => act(editor, 'copy_notes', { id: 1, input: { source: 'x' } }), 400, 'bad_body')
  })

  test('a cross-site action is 403 forbidden_site', () =>
    denied(() => act(editor, 'copy_notes', COPY, 'cross-site'), 403, 'forbidden_site'))
})

describe('action updates and nested creates', () => {
  const tekst = () => sqlite.query('SELECT id, tekst FROM note WHERE deleted_at IS NULL ORDER BY id').all()

  test('an update goes through the writer, and the batch holds it with the create', async () => {
    const res = await act(editor, 'rename', { id: 1 })
    expect(res.status).toBe(201)
    expect(tekst()).toEqual([
      { id: 1, tekst: 'hernoemd' },
      { id: 2, tekst: 'tweede' },
      { id: 3, tekst: 'nieuw' },
    ])
    expect(sqlite.query('SELECT lengte FROM note WHERE id = 1').get()).toEqual({ lengte: 8 })
    const key = res.body.batch_id as string
    const rows = sqlite.query('SELECT record_id FROM revision WHERE batch_id = ?').all(key)
    expect(new Set(rows.map((r) => (r as { record_id: number }).record_id))).toEqual(new Set([1, 3]))
    expect(
      sqlite
        .query('SELECT COUNT(DISTINCT batch_id) AS n FROM revision WHERE record_id IN (1, 3) AND batch_id = ?')
        .get(key),
    ).toEqual({ n: 1 })
  })

  test('a refusing writer on the update rolls back the create too', async () => {
    await denied(() => act(editor, 'rename_refused', { id: 1 }), 422, 'refused')
    expect(tekst().map((n) => (n as { tekst: string }).tekst)).toEqual(['eerste', 'tweede'])
    expect(sqlite.query("SELECT id FROM note WHERE tekst = 'tijdelijk'").all()).toEqual([])
    expect(sqlite.query('SELECT project_id FROM note WHERE id = 1').get()).toEqual({ project_id: 1 })
  })

  test("an update outside an owner's scope is 404 unknown_record", () =>
    denied(() => act(owner, 'update_elsewhere', { id: 1 }), 404, 'unknown_record'))

  test("a nested create gets its parent's id", async () => {
    const res = await act(editor, 'nested', { id: 1 })
    expect(res.body.created).toEqual([
      { dataset: 'note', id: 3 },
      { dataset: 'note', id: 4 },
    ])
    expect(tekst().slice(2)).toEqual([
      { id: 3, tekst: 'ouder' },
      { id: 4, tekst: 'kind van 3' },
    ])
  })

  test('one undo reverses an update, a create and a nested create', async () => {
    const before = tekst()
    const key = (await act(editor, 'all_three', { id: 1 })).body.batch_id as string
    expect(tekst()).toHaveLength(4)
    const res = await editor('POST', `/api/batches/${key}/undo`, { body: '{}' })
    expect(res.status).toBe(200)
    expect(tekst()).toEqual(before)
  })
})

describe('actions', () => {
  test('three creates land in one batch of kind action', async () => {
    const res = await act(editor, 'copy_notes', COPY)
    expect(res.status).toBe(201)
    expect(res.body.created).toEqual([
      { dataset: 'note', id: 3 },
      { dataset: 'note', id: 4 },
      { dataset: 'note', id: 5 },
    ])
    const key = res.body.batch_id as string
    expect(sqlite.query('SELECT kind FROM batch WHERE key = ?').get(key)).toEqual({ kind: 'action' })
    const batches = sqlite.query('SELECT DISTINCT batch_id FROM revision WHERE record_id > 2').all()
    expect(batches).toEqual([{ batch_id: key }])
    const tekst = sqlite.query('SELECT tekst FROM note WHERE id > 2 ORDER BY id').all()
    expect(tekst).toEqual([{ tekst: 'eerste 1' }, { tekst: 'eerste 2' }, { tekst: 'eerste 3' }])
  })

  test('an owner runs an action on its own record, its creates scoped to it', async () => {
    const res = await act(owner, 'copy_notes', COPY)
    expect(res.status).toBe(201)
    expect(res.body.created).toHaveLength(3)
  })

  test('undo by the batch removes all three', async () => {
    const key = (await act(editor, 'copy_notes', COPY)).body.batch_id as string
    const res = await editor('POST', `/api/batches/${key}/undo`, { body: '{}' })
    expect(res.status).toBe(200)
    const live = sqlite.query('SELECT id FROM note WHERE deleted_at IS NULL ORDER BY id').all()
    expect(live).toEqual([{ id: 1 }, { id: 2 }])
  })

  test('/schema lists the action on its dataset', async () => {
    const { body } = await editor('GET', '/api/schema')
    expect(body.sources.project.actions).toContainEqual({
      name: 'copy_notes',
      label: 'Notes kopiëren',
      input: { source: { relation: 'note', label: 'Source' } },
    })
    expect(body.sources.note.actions).toEqual([])
  })

  test('validation refuses an action on a dataset without a writer, or on no dataset', () => {
    const on = (dataset: string): Domain => ({
      ...domain,
      actions: { bad: { label: 'Bad', on: dataset, input: {}, run: () => [] } },
    })
    expect(() => validateDomain(on('taak'))).toThrow(DomainError)
    expect(() => validateDomain(on('per_project'))).toThrow(DomainError)
    expect(() => validateDomain(on('project'))).not.toThrow()
  })

  test('validation refuses an input relation to an undeclared dataset', () => {
    const bad: Domain = {
      ...domain,
      actions: { bad: { label: 'Bad', on: 'project', input: { x: { relation: 'nope', label: 'X' } }, run: () => [] } },
    }
    expect(() => validateDomain(bad)).toThrow(DomainError)
  })
})

describe('typed action inputs', () => {
  const TYPED = { id: 1, input: { count: 2, day: '2026-10-12', word: 'repetitie' } }

  test('a typed input reaches run as its value, in one batch', async () => {
    const res = await act(editor, 'typed', { ...TYPED, input: { ...TYPED.input, loud: true } })
    expect(res.status).toBe(201)
    expect(res.body.created).toHaveLength(2)
    const notes = (contents(sqlite, 'note') as { tekst: string }[]).map((note) => note.tekst)
    expect(notes.filter((tekst) => tekst.startsWith('repetitie'))).toEqual([
      'repetitie 2026-10-12 1!',
      'repetitie 2026-10-12 2!',
    ])
  })

  test('an input that is not required may be left out', async () => {
    expect((await act(editor, 'typed', TYPED)).status).toBe(201)
  })

  test.each([
    ['an integer below min', { count: 0 }, 'count'],
    ['an integer above max', { count: 4 }, 'count'],
    ['a number that is not an integer', { count: 1.5 }, 'count'],
    ['a malformed date', { day: '12-10-2026' }, 'day'],
    ['a date that does not exist', { day: '2026-02-30' }, 'day'],
    ['a text over 500 characters', { word: 'x'.repeat(501) }, 'word'],
    ['a boolean given as text', { loud: 'yes' }, 'loud'],
    ['a missing required input', { word: undefined }, 'word'],
    ['an input the action does not declare', { extra: 1 }, 'extra'],
  ])('%s is 400 bad_body naming the input', async (_, change, named) => {
    const input: Record<string, unknown> = { ...TYPED.input, ...change }
    for (const key of Object.keys(input)) if (input[key] === undefined) delete input[key]
    const res = await act(editor, 'typed', { id: 1, input })
    expect(res.status).toBe(400)
    expect(res.body.code).toBe('bad_body')
    expect(res.body.message).toContain(`input.${named}`)
  })

  test('/schema lists the typed inputs', async () => {
    const { body } = await editor('GET', '/api/schema')
    const typed = body.sources.project.actions.find((a: { name: string }) => a.name === 'typed')
    expect(typed.input.count).toEqual({ type: 'integer', label: 'Count', min: 1, max: 3 })
    expect(typed.input.loud).toEqual({ type: 'boolean', label: 'Loud', required: false })
  })

  test('validation refuses an unknown type, min above max, and min on a non-integer', () => {
    const withInput = (input: Record<string, unknown>): Domain => ({
      ...domain,
      actions: { bad: { label: 'Bad', on: 'project', input, run: () => [] } as unknown as ActionDecl },
    })
    expect(() => validateDomain(withInput({ x: { type: 'blob', label: 'X' } }))).toThrow(DomainError)
    expect(() => validateDomain(withInput({ x: { type: 'integer', label: 'X', min: 5, max: 1 } }))).toThrow(DomainError)
    expect(() => validateDomain(withInput({ x: { type: 'text', label: 'X', min: 1 } }))).toThrow(DomainError)
    expect(() => validateDomain(withInput({ x: { type: 'integer', label: 'X', min: 1, max: 5 } }))).not.toThrow()
  })

  test.each([
    ['no bounds', {}],
    ['no max', { min: 1 }],
    ['no min', { max: 5 }],
    ['an infinite max', { min: 1, max: Number.POSITIVE_INFINITY }],
    ['a NaN min', { min: Number.NaN, max: 5 }],
    ['a bound given as text', { min: '1', max: 5 }],
  ])('validation refuses an integer input with %s, naming the input', (_, bounds) => {
    const bad = {
      ...domain,
      actions: {
        bad: { label: 'Bad', on: 'project', input: { x: { type: 'integer', label: 'X', ...bounds } }, run: () => [] },
      },
    } as unknown as Domain
    expect(() => validateDomain(bad)).toThrow(/input x .*min and max/)
  })
})
