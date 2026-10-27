import { Database } from 'bun:sqlite'
import { beforeEach, describe, expect, test } from 'bun:test'
import {
  type ActionDecl,
  type Condition,
  type DatasetDecl,
  type Domain,
  DomainError,
  type LifecycleDecl,
  migrate,
  type SelectionActionDecl,
  seedDomain,
  validateDomain,
} from '../src'
import { availableOf } from '../src/available'
import { linkSelect } from '../src/rows'
import { contents, send } from './fixture'
import domain, { seen } from './fixtures/selection-domain'
import { signIn, testEngine } from './sign-in'

type Request = ReturnType<typeof send>
type Marked = {
  id: number
  available?: { state: string | null; buttons: { to: string; label: string }[]; actions: string[] }
}
type Item = Marked & { detail?: string | null; title: string }

const OWN = { dataset: 'bundle', id: 1 }
const json = JSON.stringify

let sqlite: Database
let editor: Request
let admin: Request
let owner: Request

beforeEach(async () => {
  seen.length = 0
  sqlite = new Database(':memory:')
  migrate(sqlite, domain)
  seedDomain(sqlite, domain)
  const app = testEngine(sqlite, domain)
  editor = send(app, await signIn(app))
  admin = send(app, await signIn(app, 'administrator'))
  owner = send(app, await signIn(app, 'owner', OWN))
})

const rowsOf = async (as: Request, source: string) =>
  (await as('GET', `/api/rows/${source}?sort=id`)).body.rows as Marked[]
const memberOf = async (as: Request, id: number) => (await rowsOf(as, 'member')).find((r) => r.id === id)
const labels = (row: Marked | undefined) => row?.available?.buttons.map((b) => b.label)
const entriesOf = async (as: Request, name = 'entries', bundle = 1) => {
  const row = (await rowsOf(as, 'bundle')).find((r) => r.id === bundle) as { links: Record<string, Item[]> }
  return row.links[name] as Item[]
}
const setStage = (id: number, stage: string) => sqlite.run('UPDATE member SET stage = ? WHERE id = ?', [stage, id])
const setPhase = (id: number, phase: string) => sqlite.run('UPDATE bundle SET phase = ? WHERE id = ?', [phase, id])
const run = (as: Request, name: string, body: unknown) => as('POST', `/api/actions/${name}`, { body: json(body) })

const state = () => ({
  member: contents(sqlite, 'member'),
  revision: contents(sqlite, 'revision'),
  batch: contents(sqlite, 'batch'),
})

async function denied(
  go: () => Promise<{ status: number; body: Record<string, unknown> }>,
  status: number,
  code: string,
) {
  const before = state()
  const res = await go()
  expect({ status: res.status, code: res.body.code }).toEqual({ status, code })
  expect(state()).toEqual(before)
}

describe('a row is marked', () => {
  test("with the buttons its state, the viewer's role and the condition allow", async () => {
    expect((await memberOf(editor, 1))?.available).toEqual({
      state: 'new',
      buttons: [
        { to: 'active', label: 'Start' },
        { to: 'parked', label: 'Park' },
      ],
      actions: ['settle', 'sweep', 'gather', 'touch', 'pair', 'rename'],
    })
    expect((await memberOf(editor, 3))?.available?.actions).toEqual(['gather', 'touch', 'pair', 'rename'])
    setStage(1, 'active')
    expect(labels(await memberOf(editor, 1))).toEqual(['Finish', 'Park'])
    setPhase(1, 'closed')
    expect(labels(await memberOf(editor, 1))).toEqual(['Park'])
  })

  test('a source that declares no button and no action condition carries no available', async () => {
    expect((await rowsOf(editor, 'bundle'))[0]?.available).toBeUndefined()
  })

  test('a button is not marked for a role the transition does not list', async () => {
    setStage(1, 'active')
    expect(labels(await memberOf(editor, 1))).not.toContain('Back')
    expect(labels(await memberOf(admin, 1))).toEqual(['Finish', 'Back', 'Park'])
    setStage(1, 'new')
    expect(labels(await memberOf(owner, 1))).toEqual(['Start'])
  })

  test('a transition with only a label shows no button', async () => {
    setStage(1, 'done')
    expect(labels(await memberOf(admin, 1))).toEqual(['Park'])
  })

  test("a '*' transition does not offer a button to the state the record is already in", async () => {
    setStage(1, 'parked')
    expect((await memberOf(editor, 1))?.available?.buttons).toEqual([])
  })

  test("a key absent from the caller's row never matches, not even null", async () => {
    const row = await memberOf(owner, 1)
    expect(row).not.toHaveProperty('bundle_phase')
    expect(labels(row)).not.toContain('Skip')
    expect(row?.available?.actions).not.toContain('settle')
    await denied(() => run(owner, 'settle', { id: 1, input: {} }), 422, 'condition_not_met')
  })

  test('a state that is not a string marks no button', () => {
    const member = domain.datasets.find((d) => d.name === 'member') as DatasetDecl
    const editorActor = { id: 1, role: 'editor' as const, subject: null }
    const row = { id: 1, stage: null, bundle_phase: 'open' }
    expect(availableOf(domain, member, row, editorActor)).toMatchObject({ state: null, buttons: [] })
  })

  test('a condition operator the engine does not know is no match, never a throw, in a domain that skipped validation', () => {
    const member = domain.datasets.find((d) => d.name === 'member') as DatasetDecl
    const raw = {
      ...member,
      lifecycle: {
        ...(member.lifecycle as LifecycleDecl),
        transitions: [{ from: '*', to: 'parked', roles: ['editor'], button: 'Park', when: { stage: { $gt: 1 } } }],
      },
    } as DatasetDecl
    const row = { id: 1, stage: 'new', bundle_phase: 'open' }
    expect(availableOf(domain, raw, row, { id: 1, role: 'editor' as const, subject: null })).toMatchObject({
      buttons: [],
    })
  })
})

describe('a link item', () => {
  test("carries its link record's buttons and its detail text", async () => {
    const [item] = await entriesOf(editor)
    expect(item).toMatchObject({
      id: 1,
      title: 'Ann',
      detail: 'Bring a pen',
      available: {
        state: 'pending',
        buttons: [
          { to: 'confirmed', label: 'Confirm' },
          { to: 'declined', label: 'Decline' },
        ],
      },
    })
    expect((await entriesOf(editor, 'memos'))[0]?.detail).toBe('Kept inside')
  })

  test("whose button's when reads the parent through a lookup is marked only in the matching parent state", async () => {
    expect(labels((await entriesOf(editor))[0])).toEqual(['Confirm', 'Decline'])
    expect(labels((await entriesOf(editor, 'entries', 2))[0])).toEqual(['Decline'])
    setPhase(1, 'closed')
    expect(labels((await entriesOf(editor))[0])).toEqual(['Decline'])
  })

  test('gets its detail as an owner only when its column is owner_visible', async () => {
    expect((await entriesOf(owner))[0]?.detail).toBe('Bring a pen')
    const memo = (await entriesOf(owner, 'memos'))[0] as Item
    expect(memo).not.toHaveProperty('detail')
    expect(memo.available?.buttons).toEqual([])
  })
})

describe('an action', () => {
  test('whose when names a lookup is marked and run alike', async () => {
    expect((await memberOf(editor, 1))?.available?.actions).toContain('settle')
    expect((await run(editor, 'settle', { id: 1, input: {} })).status).toBe(201)
    expect(seen).toHaveLength(1)
    expect((await memberOf(editor, 3))?.available?.actions).not.toContain('settle')
    await denied(() => run(editor, 'settle', { id: 3, input: {} }), 422, 'condition_not_met')
  })

  test('run on a record its when excludes is refused 422 and run is never called', async () => {
    await denied(() => run(editor, 'settle', { id: 3, input: {} }), 422, 'condition_not_met')
    expect(seen).toEqual([])
  })

  test('selection: one excluded record refuses the whole run and run is never called', async () => {
    await denied(() => run(editor, 'sweep', { ids: [1, 2, 3], input: {} }), 422, 'condition_not_met')
    expect(seen).toEqual([])
    expect((await run(editor, 'sweep', { ids: [1, 2, 4], input: {} })).status).toBe(201)
    expect(seen[0]?.map((r) => r.id)).toEqual([1, 2, 4])
  })

  test('judged on the record as it is now, not as it was marked', async () => {
    expect((await memberOf(editor, 1))?.available?.actions).toContain('settle')
    setPhase(1, 'closed')
    await denied(() => run(editor, 'settle', { id: 1, input: {} }), 422, 'condition_not_met')
    expect(seen).toEqual([])
  })

  test('on a missing record is still 404 before the condition', () =>
    denied(() => run(editor, 'settle', { id: 999, input: {} }), 404, 'unknown_record'))
})

describe('the write reply and the schema', () => {
  test('a PATCH reply carries the same available as GET /rows', async () => {
    const res = await editor('PATCH', '/api/rows/member/1', {
      body: json({ stage: 'active', expect: { stage: 'new' } }),
    })
    expect(res.status).toBe(200)
    expect(res.body.available.state).toBe('active')
    expect(res.body.available).toEqual((await memberOf(editor, 1))?.available)
  })

  test('a button press is an ordinary transition: a forged one is refused as before', async () => {
    await denied(
      () => owner('PATCH', '/api/rows/member/1', { body: json({ stage: 'parked', expect: { stage: 'new' } }) }),
      422,
      'transition_not_allowed',
    )
    setStage(1, 'active')
    await denied(
      () => editor('PATCH', '/api/rows/member/1', { body: json({ stage: 'new', expect: { stage: 'active' } }) }),
      422,
      'transition_not_allowed',
    )
    await denied(
      () => editor('PATCH', '/api/rows/member/1', { body: json({ stage: 'done', expect: { stage: 'new' } }) }),
      409,
      'transition_lost',
    )
  })

  test('/schema serves live, detail and opens', async () => {
    const { sources } = (await editor('GET', '/api/schema')).body
    expect(sources.member.lifecycle).toEqual({ buttons: true, column: 'stage', live: ['active'] })
    expect(sources.bundle.links.entries.detail).toBe('note')
    const opens = (name: string) => sources.member.actions.find((a: { name: string }) => a.name === name).opens
    expect([opens('settle'), opens('sweep'), opens('touch')]).toEqual([true, true, undefined])
    const action = (name: string) => sources.member.actions.find((a: { name: string }) => a.name === name)
    expect([action('settle').head, action('settle').handoff]).toEqual([{ icon: 'star' }, true])
    expect([action('sweep').head, action('sweep').handoff, action('touch').head]).toEqual([
      undefined,
      undefined,
      undefined,
    ])
    const own = (await owner('GET', '/api/schema')).body.sources.bundle.links
    expect([own.entries.detail, own.memos.detail]).toEqual(['note', undefined])
  })
})

describe('validateDomain: drawer declarations', () => {
  const member = domain.datasets.find((d) => d.name === 'member') as DatasetDecl
  const lifecycle = member.lifecycle as LifecycleDecl

  const refusal = (d: Domain): DomainError => {
    try {
      validateDomain(d)
    } catch (error) {
      if (error instanceof DomainError) return error
      throw error
    }
    throw new Error('validateDomain accepted the domain')
  }
  const swapped = (name: string, over: Partial<DatasetDecl>): Domain => ({
    ...domain,
    datasets: domain.datasets.map((d) => (d.name === name ? ({ ...d, ...over } as DatasetDecl) : d)),
  })
  const withLifecycle = (over: Partial<LifecycleDecl>): Domain =>
    swapped('member', { lifecycle: { ...lifecycle, ...over } })
  const withTransition = (extra: object): Domain =>
    withLifecycle({ transitions: [{ from: '*', to: 'parked', roles: ['editor'], ...extra }] })
  const withAction = (name: string, extra: object): Domain => ({
    ...domain,
    actions: { ...domain.actions, [name]: { ...domain.actions?.[name], ...extra } as ActionDecl | SelectionActionDecl },
  })

  test('accepts the fixture', () => expect(() => validateDomain(domain)).not.toThrow())

  const conditions: [string, Condition | unknown, string][] = [
    ['a column the source does not serve', { nope: 'x' }, 'nope'],
    ['an operator other than $in', { stage: { $gt: 1 } }, 'stage'],
    ['a list as the value', { stage: ['new'] }, 'stage'],
    ['an $in that is not a list', { stage: { $in: 'new' } }, 'stage'],
    ['an $in with a non-scalar', { stage: { $in: [{}] } }, 'stage'],
  ]
  for (const [name, when, bad] of conditions) {
    test(`a transition when on ${name} is refused`, () => {
      const error = refusal(withTransition({ button: 'Park', when }))
      expect([error.declaration, error.bad]).toEqual(['member', bad])
    })
    test(`an action when on ${name} is refused`, () => {
      expect(refusal(withAction('settle', { when })).bad).toBe(bad)
    })
  }

  test('a when on a lookup of another source is refused', () => {
    expect(refusal(withAction('tidy', { when: { bundle_phase: 'open' } })).bad).toBe('bundle_phase')
  })

  test('a when on a lookup, equality or $in is accepted', () => {
    expect(() =>
      validateDomain(withTransition({ button: 'Park', when: { bundle_phase: { $in: ['open', null] } } })),
    ).not.toThrow()
  })

  test('a when value that is no option of its column or lookup target is refused, and null and other text columns are accepted', () => {
    expect(refusal(withTransition({ button: 'Park', when: { stage: 'ghost' } })).bad).toBe('stage')
    expect(refusal(withTransition({ button: 'Park', when: { stage: { $in: ['new', 'ghost'] } } })).bad).toBe('stage')
    expect(refusal(withTransition({ button: 'Park', when: { bundle_phase: 'ghost' } })).bad).toBe('bundle_phase')
    expect(refusal(withAction('settle', { when: { bundle_phase: { $in: ['open', 'ghost'] } } })).bad).toBe(
      'bundle_phase',
    )
    expect(() =>
      validateDomain(withTransition({ button: 'Park', when: { stage: null, bundle_phase: 'closed' } })),
    ).not.toThrow()
    expect(() => validateDomain(withTransition({ button: 'Park', when: { name: 'anything' } }))).not.toThrow()
  })

  test('a live state the lifecycle does not have is refused', () => {
    expect(refusal(withLifecycle({ live: ['ghost'] })).bad).toBe('ghost')
  })

  test('a detail column the link dataset does not have is refused', () => {
    const bundle = domain.datasets.find((d) => d.name === 'bundle') as DatasetDecl
    const entries = { ...(bundle.links?.entries as object), detail: 'ghost' }
    expect(refusal(swapped('bundle', { links: { ...bundle.links, entries } as never })).bad).toBe('ghost')
  })

  test('an empty button label is refused', () => {
    expect(refusal(withTransition({ button: ' ' })).declaration).toBe('member')
  })

  test('opens that is not true is refused', () => {
    expect(refusal(withAction('settle', { opens: false })).bad).toBe('opens')
  })

  test('head and handoff on a selection action are refused', () => {
    expect(refusal(withAction('sweep', { head: { icon: 'star' } })).bad).toBe('head')
    expect(refusal(withAction('sweep', { handoff: true })).bad).toBe('handoff')
  })

  test('an unknown head icon, or a head without an icon, is refused', () => {
    expect(refusal(withAction('settle', { head: { icon: 'ghost' } })).bad).toBe('head')
    expect(refusal(withAction('settle', { head: {} })).bad).toBe('head')
  })

  test('a head on an action with inputs is refused', () => {
    const input = { n: { type: 'integer' as const, label: 'N', min: 1, max: 5 } }
    expect(refusal(withAction('settle', { head: { icon: 'star' }, input })).bad).toBe('head')
  })

  test('a handoff that is not true is refused, and a good head and handoff are accepted', () => {
    expect(refusal(withAction('settle', { handoff: false })).bad).toBe('handoff')
    expect(() => validateDomain(withAction('settle', { head: { icon: 'star' }, handoff: true }))).not.toThrow()
  })

  test('a column or lookup named available is refused', () => {
    const column = { type: 'text' as const, label: 'A', nullable: true }
    expect(refusal(swapped('member', { columns: { ...member.columns, available: column } })).bad).toBe('available')
    const lookups = { ...member.lookups, available: { label: 'A', via: 'bundle_id', field: 'name' } }
    expect(refusal(swapped('member', { lookups })).bad).toBe('available')
  })
})

describe('what a link read selects', () => {
  const keys = (name: string) => {
    const linked = domain.datasets.find((d) => d.name === name) as DatasetDecl
    return Object.keys(linkSelect(domain, linked, 'all'))
  }

  test('a link dataset that declares marks reads its lookups', () => {
    expect(keys('entry')).toContain('bundle_phase')
  })

  test('a link dataset with lookups but without marks carries no lookup keys', () => {
    const entry = domain.datasets.find((d) => d.name === 'entry') as DatasetDecl
    const plain = {
      ...entry,
      lifecycle: {
        ...(entry.lifecycle as LifecycleDecl),
        transitions: (entry.lifecycle as LifecycleDecl).transitions.map((t) => ({ ...t, button: undefined })),
      },
    } as DatasetDecl
    const unmarked = { ...domain, datasets: domain.datasets.map((d) => (d.name === 'entry' ? plain : d)) }
    expect(Object.keys(linkSelect(unmarked, plain, 'all'))).not.toContain('bundle_phase')
  })
})

describe('a selection action that skips what does not fit', () => {
  const memberDecl = domain.datasets.find((d) => d.name === 'member') as DatasetDecl
  const sweep = domain.actions?.sweep as SelectionActionDecl
  const lifecycle = memberDecl.lifecycle as LifecycleDecl
  const iconed = {
    ...memberDecl,
    lifecycle: {
      ...lifecycle,
      transitions: lifecycle.transitions.map((t) => (t.button === 'Park' ? { ...t, icon: 'flag' as const } : t)),
    },
  } as DatasetDecl
  const skipping: Domain = {
    ...domain,
    datasets: domain.datasets.map((d) => (d.name === 'member' ? iconed : d)),
    actions: { ...domain.actions, cull: { ...sweep, label: 'Cull', skip: true } as SelectionActionDecl },
  }
  let as: Request

  beforeEach(async () => {
    const db = new Database(':memory:')
    migrate(db, skipping)
    seedDomain(db, skipping)
    sqlite = db
    const app = testEngine(db, skipping)
    as = send(app, await signIn(app))
  })

  test('a mixed selection runs, and run gets every record, the misfits included', async () => {
    const res = await run(as, 'cull', { ids: [1, 3, 4], input: {} })
    expect(res.status, JSON.stringify(res.body)).toBe(201)
    expect(seen[0]?.map((r) => r.id)).toEqual([1, 3, 4])
  })

  test('a selection with no record that fits is refused 422 and run is never called', async () => {
    await denied(() => run(as, 'cull', { ids: [3, 5], input: {} }), 422, 'condition_not_met')
    expect(seen).toEqual([])
  })

  test('an action without skip still refuses the mixed selection', async () => {
    await denied(() => run(as, 'sweep', { ids: [1, 3], input: {} }), 422, 'condition_not_met')
  })

  test('/schema serves skips beside conditional, only on the action that declares it', async () => {
    const { sources } = (await as('GET', '/api/schema')).body
    const action = (name: string) => sources.member.actions.find((a: { name: string }) => a.name === name)
    expect([action('cull').conditional, action('cull').skips]).toEqual([true, true])
    expect(action('sweep').skips).toBeUndefined()
  })

  test("a button's icon is served in the marks, and only on the button that declares one", async () => {
    const row = (await rowsOf(as, 'member')).find((r) => r.id === 1)
    expect(row?.available?.buttons).toEqual([
      { to: 'active', label: 'Start' },
      { to: 'parked', label: 'Park', icon: 'flag' },
    ])
  })
})

describe('validateDomain: skip and icon', () => {
  const refusal = (d: Domain): DomainError => {
    try {
      validateDomain(d)
    } catch (error) {
      if (error instanceof DomainError) return error
      throw error
    }
    throw new Error('validateDomain accepted the domain')
  }
  const withAction = (name: string, extra: object): Domain => ({
    ...domain,
    actions: { ...domain.actions, [name]: { ...domain.actions?.[name], ...extra } as ActionDecl | SelectionActionDecl },
  })
  const member = domain.datasets.find((d) => d.name === 'member') as DatasetDecl
  const withTransition = (extra: object): Domain => ({
    ...domain,
    datasets: domain.datasets.map((d) =>
      d === member
        ? ({
            ...member,
            lifecycle: {
              ...(member.lifecycle as LifecycleDecl),
              transitions: [{ from: '*', to: 'parked', roles: ['editor'], ...extra }],
            },
          } as DatasetDecl)
        : d,
    ),
  })

  test('skip on a selection action with a when is accepted', () => {
    expect(() => validateDomain(withAction('sweep', { skip: true }))).not.toThrow()
  })

  test('skip without a when is refused', () => {
    expect(refusal(withAction('touch', { skip: true })).bad).toBe('skip')
  })

  test('skip on a single-record action is refused', () => {
    expect(refusal(withAction('settle', { skip: true })).bad).toBe('skip')
  })

  test('skip that is not true is refused', () => {
    expect(refusal(withAction('sweep', { skip: false })).bad).toBe('skip')
  })

  test('an icon on a button is accepted; without a button, or outside the icons, it is refused', () => {
    expect(() => validateDomain(withTransition({ button: 'Park', icon: 'flag' }))).not.toThrow()
    expect(refusal(withTransition({ icon: 'flag' })).bad).toBe('parked')
    expect(refusal(withTransition({ button: 'Park', icon: 'ghost' })).bad).toBe('parked')
  })
})
