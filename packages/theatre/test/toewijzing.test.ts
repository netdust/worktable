import { Database } from 'bun:sqlite'
import { beforeEach, describe, expect, test } from 'bun:test'
import { migrate, seedDomain } from '@worktable/engine'
import { signIn, testEngine } from '@worktable/engine/test/sign-in'
import theatre from '../src'

type Body = Record<string, unknown>
type Request = (method: string, path: string, body?: unknown) => Promise<{ status: number; body: Body }>

// Lotte Verhaegen is persoon 1; Rol 1 is Speler; activiteit 5 holds no Toewijzing in the seed.
const LOTTE = { dataset: 'persoon', id: 1 }

let sqlite: Database
let app: ReturnType<typeof testEngine>
let editor: Request
let admin: Request
let owner: Request

function requester(cookie: string): Request {
  return async (method, path, body) => {
    const headers: Record<string, string> = { host: '127.0.0.1:4310', cookie }
    if (body !== undefined) headers['content-type'] = 'application/json'
    const res = await app.request(path, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    })
    return { status: res.status, body: (await res.json()) as Body }
  }
}

beforeEach(async () => {
  sqlite = new Database(':memory:')
  migrate(sqlite, theatre)
  seedDomain(sqlite, theatre)
  app = testEngine(sqlite, theatre)
  editor = requester(await signIn(app, 'editor'))
  admin = requester(await signIn(app, 'administrator'))
  owner = requester(await signIn(app, 'owner', LOTTE))
})

const stored = (id: number) => sqlite.query('SELECT * FROM toewijzing WHERE id = ?').get(id) as Body
const rows = () => sqlite.query('SELECT * FROM toewijzing ORDER BY id').all()
const post = (as: Request, body: Body) => as('POST', '/api/rows/toewijzing', body)
const patch = (as: Request, id: number, body: Body) => as('PATCH', `/api/rows/toewijzing/${id}`, body)

async function created(body: Body): Promise<number> {
  const res = await post(editor, { activiteit_id: 5, ...body })
  expect(res.status).toBe(201)
  return res.body.id as number
}

async function refusedWith(call: Promise<{ status: number; body: Body }>, status: number, code: string) {
  const before = rows()
  const res = await call
  expect({ status: res.status, code: res.body.code }).toEqual({ status, code })
  expect(rows()).toEqual(before)
  return res
}

describe('an open slot', () => {
  test('a row with a role and neither person nor name is accepted, as open, aantal 1', async () => {
    const id = await created({ rol_id: 1 })
    expect(stored(id)).toMatchObject({ persoon_id: null, naam: null, rol_id: 1, aantal: 1, state: 'open' })
  })

  test('without a role it is refused in Dutch', async () => {
    const res = await refusedWith(post(editor, { activiteit_id: 5 }), 422, 'refused')
    expect(res.body.message).toBe('Een open plek heeft een rol nodig.')
  })

  test('a create with neither person nor name becomes open, whatever state it asks', async () => {
    const id = await created({ rol_id: 1, state: 'uitgenodigd' })
    expect(stored(id).state).toBe('open')
  })

  test('a filled create keeps the state given, else the column default', async () => {
    expect(stored(await created({ persoon_id: 3, state: 'voorlopig' })).state).toBe('voorlopig')
    expect(stored(await created({ naam: 'Gast' })).state).toBe('uitgenodigd')
  })

  test('two open slots for one role on one activity are both accepted: the duplicate rule is for persons', async () => {
    await created({ rol_id: 1 })
    await created({ rol_id: 1 })
    await created({ persoon_id: 3 })
    const res = await refusedWith(post(editor, { activiteit_id: 5, persoon_id: 3 }), 422, 'refused')
    expect(res.body.message).toBe('Deze persoon is al toegewezen aan deze activiteit.')
  })
})

const TRANSITIONS: [string, string][] = [
  ['open', 'voorlopig'],
  ['open', 'uitgenodigd'],
  ['open', 'bevestigd'],
  ['voorlopig', 'uitgenodigd'],
  ['voorlopig', 'bevestigd'],
  ['uitgenodigd', 'bevestigd'],
  ['uitgenodigd', 'geweigerd'],
  ['geweigerd', 'uitgenodigd'],
  ...['open', 'voorlopig', 'uitgenodigd', 'bevestigd', 'geweigerd'].map((from): [string, string] => [
    from,
    'geannuleerd',
  ]),
]

describe('the transitions', () => {
  for (const role of ['editor', 'administrator'] as const) {
    test.each(TRANSITIONS)(`%s → %s passes for an ${role}`, async (from, to) => {
      const as = role === 'editor' ? editor : admin
      // An open slot is filled in the same write that moves it on.
      const id = from === 'open' ? await created({ rol_id: 1 }) : await created({ naam: 'Gast', state: from })
      const body = from === 'open' ? { state: to, persoon_id: 3 } : { state: to }
      const res = await patch(as, id, body)
      expect(res.status).toBe(200)
      expect(stored(id).state).toBe(to)
    })
  }

  test('geweigerd → bevestigd is refused', async () => {
    const id = await created({ naam: 'Gast', state: 'geweigerd' })
    await refusedWith(patch(editor, id, { state: 'bevestigd' }), 422, 'transition_not_allowed')
  })

  test('two PATCHes with the same expect: one lands, the other lost the race', async () => {
    const first = await patch(editor, 2, { state: 'bevestigd', expect: { state: 'uitgenodigd' } })
    expect(first.status).toBe(200)
    await refusedWith(
      patch(editor, 2, { state: 'geweigerd', expect: { state: 'uitgenodigd' } }),
      409,
      'transition_lost',
    )
  })
})

describe('an owner', () => {
  const invited = () => created({ persoon_id: 1, state: 'uitgenodigd' })

  test('confirms or declines its own uitgenodigd row', async () => {
    const yes = await invited()
    expect((await patch(owner, yes, { state: 'bevestigd' })).status).toBe(200)
    expect(stored(yes).state).toBe('bevestigd')

    sqlite.query('UPDATE toewijzing SET state = ? WHERE id = ?').run('uitgenodigd', yes)
    expect((await patch(owner, yes, { state: 'geweigerd' })).status).toBe(200)
    expect(stored(yes).state).toBe('geweigerd')
  })

  test('makes no other transition on its own row', async () => {
    const id = await invited()
    await refusedWith(patch(owner, id, { state: 'geannuleerd' }), 422, 'transition_not_allowed')
    await refusedWith(patch(owner, 1, { state: 'geannuleerd' }), 422, 'transition_not_allowed')
  })

  test("writes nothing else: no other column, no create, no delete, no one else's row", async () => {
    const id = await invited()
    const message = 'Alleen de planning wijzigt toewijzingen.'
    expect((await refusedWith(patch(owner, id, { notitie: 'Kom later' }), 403, 'forbidden')).body.message).toBe(message)
    await refusedWith(patch(owner, id, { state: 'bevestigd', notitie: 'Kom later' }), 403, 'forbidden')
    await refusedWith(post(owner, { activiteit_id: 6, persoon_id: 1 }), 403, 'forbidden')
    await refusedWith(owner('DELETE', `/api/rows/toewijzing/${id}`), 403, 'forbidden')
    await refusedWith(patch(owner, 2, { state: 'bevestigd' }), 404, 'unknown_record')
  })
})
