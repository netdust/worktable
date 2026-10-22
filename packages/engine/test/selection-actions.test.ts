import { Database } from 'bun:sqlite'
import { beforeEach, describe, expect, test } from 'bun:test'
import {
  type ColumnDecl,
  type Domain,
  DomainError,
  defineDataset,
  migrate,
  type SelectionActionDecl,
  seedDomain,
  validateDomain,
} from '../src'
import { contents, send } from './fixture'
import domain, { seen } from './fixtures/selection-domain'
import { signIn, testEngine } from './sign-in'

type Request = ReturnType<typeof send>

const OWN = { dataset: 'bundle', id: 1 }
const json = JSON.stringify

let sqlite: Database
let editor: Request
let owner: Request

beforeEach(async () => {
  seen.length = 0
  sqlite = new Database(':memory:')
  migrate(sqlite, domain)
  seedDomain(sqlite, domain)
  const app = testEngine(sqlite, domain)
  editor = send(app, await signIn(app))
  owner = send(app, await signIn(app, 'owner', OWN))
})

const act = (as: Request, name: string, body: unknown, site?: string) =>
  as('POST', `/api/actions/${name}`, { body: json(body), site })

const state = () => ({
  bundle: contents(sqlite, 'bundle'),
  member: contents(sqlite, 'member'),
  tie: contents(sqlite, 'tie'),
  revision: contents(sqlite, 'revision'),
  batch: contents(sqlite, 'batch'),
})

async function denied(
  run: () => Promise<{ status: number; body: Record<string, unknown> }>,
  status: number,
  code: string,
  ran = false,
) {
  const before = state()
  const res = await run()
  expect({ status: res.status, code: res.body.code }).toEqual({ status, code })
  expect(state()).toEqual(before)
  if (!ran) expect(seen).toEqual([])
}

const GATHER = { ids: [1, 2, 3], input: { name: 'Set' } }

function refusal(d: Domain): DomainError {
  try {
    validateDomain(d)
  } catch (error) {
    if (error instanceof DomainError) return error
    throw error
  }
  throw new Error('validateDomain accepted the domain')
}

describe('a selection action runs', () => {
  test('once on every id, in one batch', async () => {
    const res = await act(editor, 'gather', { ids: [3, 1, 2], input: { name: 'Set' } })
    expect(res.status).toBe(201)
    expect(seen).toHaveLength(1)
    expect(seen[0]?.map((r) => r.id)).toEqual([3, 1, 2])
    const key = res.body.batch_id as string
    expect(res.body.created).toEqual([
      { dataset: 'bundle', id: 3 },
      { dataset: 'tie', id: 1 },
      { dataset: 'tie', id: 2 },
      { dataset: 'tie', id: 3 },
    ])
    expect(sqlite.query('SELECT DISTINCT batch_id FROM revision').all()).toEqual([{ batch_id: key }])
    expect(sqlite.query('SELECT kind FROM batch WHERE key = ?').get(key)).toEqual({ kind: 'action' })
    const before = { bundle: 2, tie: 0 }
    const undo = await editor('POST', `/api/batches/${key}/undo`, { body: '{}' })
    expect(undo.status).toBe(200)
    expect(sqlite.query('SELECT COUNT(*) AS n FROM bundle WHERE deleted_at IS NULL').get()).toEqual({
      n: before.bundle,
    })
    expect(sqlite.query('SELECT COUNT(*) AS n FROM tie WHERE deleted_at IS NULL').get()).toEqual({ n: before.tie })
  })

  test('500 ids run', async () => {
    const insert = sqlite.prepare("INSERT INTO member (name, bundle_id) VALUES ('x', 1)")
    for (let n = 0; n < 496; n++) insert.run()
    const ids = Array.from({ length: 500 }, (_, n) => n + 1)
    const res = await act(editor, 'touch', { ids, input: {} })
    expect(res.status).toBe(201)
    expect(seen[0]).toHaveLength(500)
  })

  test('an owner runs it on its own records', async () => {
    const res = await act(owner, 'touch', { ids: [1, 2], input: {} })
    expect(res.status).toBe(201)
    expect(seen[0]?.map((r) => r.id)).toEqual([1, 2])
  })
})

describe('selection action denials', () => {
  test("an id outside the caller's scope fails the whole run and writes nothing", () =>
    denied(() => act(owner, 'gather', { ids: [1, 3], input: { name: 'Set' } }), 404, 'unknown_record'))

  test('an id that does not exist fails the whole run', () =>
    denied(() => act(editor, 'gather', { ids: [1, 999], input: { name: 'Set' } }), 404, 'unknown_record'))

  test('a deleted id fails the whole run', async () => {
    expect((await editor('DELETE', '/api/rows/member/4')).status).toBe(200)
    await denied(() => act(editor, 'gather', { ids: [1, 4], input: { name: 'Set' } }), 404, 'unknown_record')
  })

  test('no ids, 501 ids, a duplicate, a zero or a string are refused before any read', async () => {
    const bad: unknown[] = [
      { input: {} },
      { ids: [], input: {} },
      { ids: 'x', input: {} },
      { ids: Array.from({ length: 501 }, (_, n) => n + 1), input: {} },
      { ids: [1, 1], input: {} },
      { ids: [0], input: {} },
      { ids: [-1], input: {} },
      { ids: ['1'], input: {} },
      { ids: [1.5], input: {} },
    ]
    for (const body of bad) await denied(() => act(editor, 'touch', body), 400, 'bad_body')
  })

  test('the ids are refused before the records are read, even unreadable ones', () =>
    denied(() => act(owner, 'touch', { ids: [3, 3], input: {} }), 400, 'bad_body'))

  test('a single action refuses ids, a selection action refuses id', async () => {
    await denied(() => act(editor, 'rename', { ids: [1], input: {} }), 400, 'bad_body')
    await denied(() => act(editor, 'touch', { id: 1, input: {} }), 400, 'bad_body')
    await denied(() => act(editor, 'touch', { id: 1, ids: [1], input: {} }), 400, 'bad_body')
    await denied(() => act(editor, 'rename', { id: 1, ids: [1], input: {} }), 400, 'bad_body')
  })

  test('a refusal inside run rolls back every create', () =>
    denied(() => act(editor, 'gather', { ids: [1, 2], input: { name: 'refused' } }), 422, 'refused', true))

  test('a cross-site run is 403 forbidden_site', () =>
    denied(() => act(editor, 'gather', GATHER, 'cross-site'), 403, 'forbidden_site'))
})

describe('the served shape', () => {
  test('/schema serves many on a selection action and listed: false on its source', async () => {
    const res = await editor('GET', '/api/schema')
    const actions = res.body.sources.member.actions as { name: string; many?: true }[]
    expect(actions.find((a) => a.name === 'gather')?.many).toBe(true)
    expect(actions.find((a) => a.name === 'rename')?.many).toBeUndefined()
    expect(res.body.sources.tie.listed).toBe(false)
    expect(res.body.sources.member.listed).toBeUndefined()
  })

  test('the OpenAPI document gives a selection action an ids body', async () => {
    const res = await editor('GET', '/api/schema?format=openapi')
    const body = (name: string) =>
      res.body.paths[`/actions/${name}`].post.requestBody.content['application/json'].schema
    expect(body('gather').required).toEqual(['ids', 'input'])
    expect(body('gather').properties.ids).toMatchObject({
      type: 'array',
      minItems: 1,
      maxItems: 500,
      uniqueItems: true,
      items: { type: 'integer', minimum: 1 },
    })
    expect(body('gather').properties.id).toBeUndefined()
    expect(body('rename').properties.id).toBeDefined()
  })
})

describe('validateDomain and selection actions', () => {
  const selection = (extra: Partial<SelectionActionDecl>): SelectionActionDecl => ({
    ...(domain.actions?.touch as SelectionActionDecl),
    ...extra,
  })

  test('accepts the fixture', () => expect(() => validateDomain(domain)).not.toThrow())

  test('refuses a matrix fill that names a selection action', () => {
    const text: ColumnDecl = { type: 'text', label: 'T', nullable: true }
    const rel = (relation: string): ColumnDecl => ({ type: 'integer', label: 'R', relation, nullable: true })
    const slot = defineDataset({
      name: 'slot',
      label: 'Slots',
      title: 'name',
      custom: false,
      columns: {
        item_id: rel('item'),
        member_id: rel('member'),
        name: text,
        state: { type: 'text', label: 'S', options: { a: 'A', b: 'B' } },
        kind_id: rel('member'),
        size: { type: 'integer', label: 'N', default: 1 },
      },
      matrix: {
        down: 'item_id',
        across: 'member_id',
        label: 'name',
        cell: 'state',
        keys: { x: 'a' },
        marks: { a: '?' },
        count: 'b',
        open: { match: 'kind_id', count: 'size', fill: 'fill' },
      },
    })
    const item = defineDataset({ name: 'item', label: 'Items', title: 'name', custom: false, columns: { name: text } })
    const input = { member_id: { relation: 'member', label: 'M' } }
    const withFill = (fill: Domain['actions']): Domain => ({
      ...domain,
      datasets: [...domain.datasets, item, slot],
      writers: { ...domain.writers, slot: { create: (v) => v } },
      actions: { ...domain.actions, ...fill },
    })
    const single = { label: 'Fill', on: 'slot', input, run: () => [] }
    expect(() => validateDomain(withFill({ fill: single }))).not.toThrow()
    const many = { fill: selection({ on: 'slot', input }) }
    expect(refusal(withFill(many)).message).toContain('selection action')
  })

  test('refuses a section that lists an unlisted dataset', () => {
    const err = refusal({ ...domain, sections: [{ label: 'All', sources: ['member', 'tie'] }] })
    expect(err.message).toContain('tie')
  })

  test('refuses a query of an unlisted dataset', () => {
    const err = refusal({
      ...domain,
      queries: [
        {
          kind: 'query',
          name: 'tie_list',
          label: 'Tie list',
          title: 'note',
          of: 'tie',
          sql: 'SELECT id, note FROM tie WHERE deleted_at IS NULL',
          columns: { id: { type: 'integer', label: 'Id' }, note: { type: 'text', label: 'Note', nullable: true } },
        },
      ],
    })
    expect(err.message).toContain('tie')
  })

  test("refuses options_from on a selection action's input", () => {
    const picks = { source: 'tie_list', match: {}, value: 'member_id' }
    const tieList = {
      kind: 'query' as const,
      name: 'tie_list',
      label: 'Tie list',
      title: 'note',
      sql: 'SELECT id, member_id, note FROM tie WHERE deleted_at IS NULL',
      columns: {
        id: { type: 'integer' as const, label: 'Id' },
        member_id: { type: 'integer' as const, label: 'Member', relation: 'member' },
        note: { type: 'text' as const, label: 'Note', nullable: true },
      },
    }
    const input = { m: { relation: 'member', label: 'Member', options_from: picks } }
    const base = { ...domain, queries: [tieList] }
    expect(() =>
      validateDomain({ ...base, actions: { ...domain.actions, pick: { ...selection({}), input: { m: input.m } } } }),
    ).toThrow('options_from')
    const single = { label: 'Pick', on: 'member', input, run: () => [] }
    expect(() => validateDomain({ ...base, actions: { ...domain.actions, pick: single } })).not.toThrow()
  })
})
