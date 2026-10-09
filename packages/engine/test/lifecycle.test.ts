import { Database } from 'bun:sqlite'
import { beforeEach, describe, expect, test } from 'bun:test'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  type Actor,
  createAccount,
  type DatasetDecl,
  type Domain,
  DomainError,
  defineDataset,
  type HookResult,
  importExport,
  type LifecycleDecl,
  type Mail,
  migrate,
  refuse,
  seedDomain,
  validateDomain,
} from '../src'
import { checkTransition } from '../src/writes'
import { contents, send } from './fixture'
import { signIn, testEngine } from './sign-in'

type Request = ReturnType<typeof send>

const ANN = { dataset: 'member', id: 1 }
const hookCalls: { id: unknown; state: unknown }[] = []

const lifecycle: LifecycleDecl = {
  column: 'state',
  transitions: [
    { from: ['a'], to: 'b', roles: ['editor', 'administrator'] },
    { from: ['b'], to: 'c', roles: ['owner'] },
    { from: '*', to: 'c', roles: ['editor', 'administrator'] },
  ],
  hooks: {
    b: (row): HookResult => {
      hookCalls.push({ id: row.id, state: row.state })
      return {
        token: { to: ['c'], days: 7 },
        mail: () => ({ to: 'ann@example.test', subject: 'Uitnodiging', text: `ticket ${String(row.id)}` }),
        notice: 'invited',
      }
    },
  },
}

const member = defineDataset({
  name: 'member',
  label: 'Members',
  title: 'name',
  custom: false,
  columns: { name: { type: 'text', label: 'Name' } },
})

const ticketOf = (over: Partial<DatasetDecl> = {}): DatasetDecl =>
  defineDataset({
    name: 'ticket',
    label: 'Tickets',
    title: 'note',
    custom: false,
    owners: { owner: 'member_id' },
    columns: {
      member_id: { type: 'integer', label: 'Member', relation: 'member', nullable: true },
      state: { type: 'text', label: 'State', default: 'a', options: { a: 'A', b: 'B', c: 'C' } },
      note: { type: 'text', label: 'Note', nullable: true },
    },
    lifecycle,
    ...over,
  })

const domainOf = (ticket: DatasetDecl = ticketOf()): Domain => ({
  datasets: [member, ticket],
  queries: [],
  seed: (insert) => {
    insert('member', [{ name: 'Ann' }, { name: 'Bob' }])
    insert('ticket', [
      { member_id: 1, state: 'a' },
      { member_id: 1, state: 'b' },
    ])
  },
  views: [],
  writers: {
    member: { create: (values) => values },
    ticket: {
      create: (values) => (values.note === 'weiger' ? refuse('geweigerd') : values),
      update: (values) => (values.note === 'weiger' ? refuse('geweigerd') : values),
    },
  },
  actions: {
    invite: {
      label: 'Invite',
      on: 'member',
      input: {},
      run: (r) => [{ dataset: 'ticket', values: { member_id: r.id, state: 'b' } }],
    },
    invite_broken: {
      label: 'Invite, then refused',
      on: 'member',
      input: {},
      run: (r) => [
        { dataset: 'ticket', values: { member_id: r.id, state: 'b' } },
        { dataset: 'ticket', values: { member_id: r.id, note: 'weiger' } },
      ],
    },
  },
})

const domain = domainOf()

let sqlite: Database
let app: ReturnType<typeof testEngine>
let editor: Request
let owner: Request
let sent: { mail: Mail; inTransaction: boolean }[]

// Sign-in mails go to the outbox signIn reads; every other mail is recorded with the transaction state at send time.
function recordingMailer(outbox: string) {
  return {
    send: async (mail: Mail) => {
      if (mail.subject === 'Inloggen') {
        writeFileSync(join(outbox, `${crypto.randomUUID()}.txt`), `To: ${mail.to}\n\n${mail.text}\n`)
        return
      }
      sent.push({ mail, inTransaction: sqlite.inTransaction })
    },
  }
}

const tables = () => ({
  ticket: contents(sqlite, 'ticket'),
  revision: contents(sqlite, 'revision'),
  batch: sqlite.query('SELECT * FROM batch ORDER BY key').all(),
})

async function denied(call: Promise<{ status: number; body: Record<string, unknown> }>, status: number, code: string) {
  const before = tables()
  const res = await call
  expect(res.status).toBe(status)
  expect(res.body.code).toBe(code)
  expect(tables()).toEqual(before)
  return res
}

const stateOf = (id: number) =>
  (sqlite.query('SELECT state FROM ticket WHERE id = ?').get(id) as { state: string }).state
const patch = (as: Request, id: number, body: unknown) =>
  as('PATCH', `/api/rows/ticket/${id}`, { body: JSON.stringify(body) })
const undo = (as: Request, batch: string) => as('POST', `/api/batches/${batch}/undo`, { body: '{}' })

beforeEach(async () => {
  hookCalls.length = 0
  sent = []
  sqlite = new Database(':memory:')
  migrate(sqlite, domain)
  seedDomain(sqlite, domain)
  const outbox = mkdtempSync(join(tmpdir(), 'wt-lifecycle-'))
  app = testEngine(sqlite, domain, { outbox, mailer: recordingMailer(outbox) })
  editor = send(app, await signIn(app, 'editor'))
  owner = send(app, await signIn(app, 'owner', ANN))
})

describe('lifecycle validation', () => {
  const refused = (ticket: DatasetDecl, bad: string) => {
    let error: unknown
    try {
      validateDomain(domainOf(ticket))
    } catch (err) {
      error = err
    }
    expect(error).toBeInstanceOf(DomainError)
    expect((error as DomainError).bad).toBe(bad)
  }

  test('the test domain is valid', () => {
    expect(() => validateDomain(domain)).not.toThrow()
  })

  test('the column must be an options column', () => {
    refused(ticketOf({ lifecycle: { ...lifecycle, column: 'note' } }), 'note')
    refused(ticketOf({ lifecycle: { ...lifecycle, column: 'nope' } }), 'nope')
  })

  test('every from and to must be an option', () => {
    refused(ticketOf({ lifecycle: { ...lifecycle, transitions: [{ from: ['x'], to: 'b', roles: ['editor'] }] } }), 'x')
    refused(ticketOf({ lifecycle: { ...lifecycle, transitions: [{ from: '*', to: 'y', roles: ['editor'] }] } }), 'y')
  })

  test('a hook is on an option', () => {
    refused(ticketOf({ lifecycle: { ...lifecycle, hooks: { z: () => ({}) } } }), 'z')
  })

  test('a role is a known role', () => {
    const roles = ['planner'] as unknown as Actor['role'][]
    refused(ticketOf({ lifecycle: { ...lifecycle, transitions: [{ from: '*', to: 'b', roles }] } }), 'planner')
  })

  test('token_projection names declared columns', () => {
    refused(ticketOf({ lifecycle: { ...lifecycle, token_projection: ['state', 'secret'] } }), 'secret')
    expect(() =>
      validateDomain(domainOf(ticketOf({ lifecycle: { ...lifecycle, token_projection: ['state'] } }))),
    ).not.toThrow()
  })
})

describe('transitions', () => {
  test('a create sets any option, and is no transition', async () => {
    for (const state of ['a', 'b', 'c']) {
      const res = await editor('POST', '/api/rows/ticket', { body: JSON.stringify({ member_id: 2, state }) })
      expect(res.status).toBe(201)
      expect(stateOf(res.body.id)).toBe(state)
    }
  })

  test('an undeclared transition is 422 transition_not_allowed, tables unchanged', async () => {
    await patch(editor, 2, { state: 'c' })
    await denied(patch(editor, 2, { state: 'a' }), 422, 'transition_not_allowed')
  })

  test("an owner making an editor's transition is 422, tables unchanged", async () => {
    await denied(patch(owner, 1, { state: 'b' }), 422, 'transition_not_allowed')
    await denied(patch(owner, 1, { state: 'c' }), 422, 'transition_not_allowed')
  })

  test('an owner makes its own transition', async () => {
    const res = await patch(owner, 2, { state: 'c' })
    expect(res.status).toBe(200)
    expect(stateOf(2)).toBe('c')
  })

  test('a stale expect is 409 transition_lost, tables unchanged', async () => {
    await denied(patch(editor, 2, { state: 'c', expect: { state: 'a' } }), 409, 'transition_lost')
    await denied(patch(editor, 2, { note: 'x', expect: { state: 'a' } }), 409, 'transition_lost')
  })

  test('a matching expect is 200, revised', async () => {
    const res = await patch(editor, 1, { state: 'b', expect: { state: 'a' } })
    expect(res.status).toBe(200)
    expect(res.body.revision.changed).toEqual(['state'])
    expect(res.body.revision.batch_id).toEqual(expect.any(String))
    expect(stateOf(1)).toBe('b')
  })

  test('a no-change PATCH without expect stays a 200 no-op', async () => {
    const res = await patch(editor, 1, { state: 'a' })
    expect(res.status).toBe(200)
    expect(res.body.revision.batch_id).toBeNull()
  })

  test('an expect is an object naming only the lifecycle column', async () => {
    await denied(patch(editor, 1, { state: 'b', expect: 'a' }), 400, 'bad_body')
    await denied(patch(editor, 1, { state: 'b', expect: { note: 'a' } }), 400, 'bad_body')
  })
})

describe('undo of a transition', () => {
  test("an editor's a→b, undone, leaves a", async () => {
    const res = await patch(editor, 1, { state: 'b' })
    expect((await undo(editor, res.body.revision.batch_id)).status).toBe(200)
    expect(stateOf(1)).toBe('a')
  })

  test("an owner's b→c, undone, leaves b although no one may make c→b", async () => {
    const res = await patch(owner, 2, { state: 'c' })
    expect((await undo(owner, res.body.revision.batch_id)).status).toBe(200)
    expect(stateOf(2)).toBe('b')
  })

  test('an undo after a later transition is 409 changed_since, tables unchanged', async () => {
    const first = await patch(editor, 1, { state: 'b' })
    await patch(editor, 1, { state: 'c' })
    await denied(undo(editor, first.body.revision.batch_id), 409, 'changed_since')
  })

  test('an undo back into a hooked state fires no hook', async () => {
    const res = await patch(editor, 2, { state: 'c' })
    expect((await undo(editor, res.body.revision.batch_id)).status).toBe(200)
    expect(stateOf(2)).toBe('b')
    expect(hookCalls).toEqual([])
    expect(sent).toEqual([])
  })
})

describe('checkTransition', () => {
  const ticket = ticketOf()
  const ed: Actor = { id: 1, role: 'editor', subject: null }

  const codeOf = (call: () => void): string | undefined => {
    try {
      call()
    } catch (err) {
      return (err as { code?: string }).code
    }
    return undefined
  }

  test('undo mode allows only the exact inverse', () => {
    const mode = { kind: 'undo', from: 'a', to: 'b' } as const
    expect(codeOf(() => checkTransition(ticket, { state: 'b' }, { state: 'a' }, ed, mode))).toBeUndefined()
    expect(codeOf(() => checkTransition(ticket, { state: 'b' }, { state: 'c' }, ed, mode))).toBe(
      'transition_not_allowed',
    )
    expect(codeOf(() => checkTransition(ticket, { state: 'c' }, { state: 'a' }, ed, mode))).toBe(
      'transition_not_allowed',
    )
  })

  test('a create is no transition', () => {
    expect(() => checkTransition(ticket, null, { state: 'c' }, ed, { kind: 'write' })).not.toThrow()
  })
})

describe('hooks', () => {
  test('a transition into a hooked state fires the hook; its mail is sent after commit', async () => {
    const res = await patch(editor, 1, { state: 'b' })
    expect(res.status).toBe(200)
    expect(hookCalls).toEqual([{ id: 1, state: 'b' }])
    await Bun.sleep(5)
    expect(sent).toEqual([
      { mail: { to: 'ann@example.test', subject: 'Uitnodiging', text: 'ticket 1' }, inTransaction: false },
    ])
  })

  test("a hook's notice is in the reply", async () => {
    expect((await patch(editor, 1, { state: 'b' })).body.notices).toEqual(['invited'])
    expect((await patch(editor, 1, { note: 'x' })).body.notices).toEqual([])
  })

  test('a later writer refusal leaves no mail', async () => {
    await denied(editor('POST', '/api/actions/invite_broken', { body: JSON.stringify({ id: 1 }) }), 422, 'refused')
    await Bun.sleep(5)
    expect(sent).toEqual([])
  })

  test('a create into b fires the hook, through POST /rows and through an action', async () => {
    const made = await editor('POST', '/api/rows/ticket', { body: JSON.stringify({ member_id: 2, state: 'b' }) })
    expect(made.body.notices).toEqual(['invited'])
    const acted = await editor('POST', '/api/actions/invite', { body: JSON.stringify({ id: 2 }) })
    expect(acted.status).toBe(201)
    expect(hookCalls.map((c) => c.id)).toEqual([made.body.id, acted.body.created[0].id])
    await Bun.sleep(5)
    expect(sent).toHaveLength(2)
  })

  test('an import into b fires no hook', () => {
    const db = new Database(':memory:')
    migrate(db, domain)
    const admin: Actor = {
      id: createAccount(db, domain, 'a@example.test', 'administrator'),
      role: 'administrator',
      subject: null,
    }
    const data = {
      worktable_export: 1,
      datasets: { member: [{ legacy_id: 1, name: 'Ann' }], ticket: [{ legacy_id: 2, member_id: 1, state: 'b' }] },
    }
    expect(importExport(db, domain, data, admin, { acceptReport: false }).committed).toBe(true)
    expect(hookCalls).toEqual([])
  })
})

describe('/schema', () => {
  test('serves lifecycle: { column } for a source declaring one, and nothing for one that does not', async () => {
    const { body } = await editor('GET', '/api/schema', { type: null })
    expect(body.sources.ticket.lifecycle).toEqual({ column: 'state' })
    expect(body.sources.member.lifecycle).toBeUndefined()
  })
})
