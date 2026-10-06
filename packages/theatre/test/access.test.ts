import { Database } from 'bun:sqlite'
import { beforeEach, describe, expect, test } from 'bun:test'
import { migrate, seedDomain } from '@worktable/engine'
import { signIn, testEngine } from '@worktable/engine/test/sign-in'
import theatre from '../src'

type Body = Record<string, unknown>
type Request = (method: string, path: string, body?: unknown) => Promise<{ status: number; body: Body }>

// Lotte Verhaegen: Toewijzingen 1 and 4, Beschikbaarheid 3; the seed gives other people rows too.
const LOTTE = { dataset: 'persoon', id: 1 }
const TABLES = ['persoon', 'toewijzing', 'beschikbaarheid', 'activiteit', 'productie', 'revision']

let sqlite: Database
let owner: Request
let editor: Request

function requester(app: ReturnType<typeof testEngine>, cookie: string): Request {
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

const state = () => TABLES.map((t) => sqlite.query(`SELECT * FROM ${t} ORDER BY id`).all())
const ids = (body: Body) => (body.rows as { id: number }[]).map((r) => r.id)

async function denied(call: Promise<{ status: number; body: Body }>, status: number, code: string) {
  const before = state()
  const res = await call
  expect({ status: res.status, code: res.body.code }).toEqual({ status, code })
  expect(state()).toEqual(before)
  return res
}

beforeEach(async () => {
  sqlite = new Database(':memory:')
  migrate(sqlite, theatre)
  seedDomain(sqlite, theatre)
  const app = testEngine(sqlite, theatre)
  owner = requester(app, await signIn(app, 'owner', LOTTE))
  editor = requester(app, await signIn(app, 'editor'))
})

const AFWEZIG = { persoon_id: 1, start_at: '2026-10-20T09:00', eind_at: '2026-10-20T17:00', reden: 'Dokter' }

describe('an owner reads only its own rows', () => {
  test.each(['activiteit', 'productie', 'organisatie'])('%s does not exist for an owner', async (source) => {
    const res = await owner('GET', `/api/rows/${source}`)
    expect({ status: res.status, code: res.body.code }).toEqual({ status: 404, code: 'unknown_source' })
  })

  test('Toewijzingen: only its own', async () => {
    expect(ids((await owner('GET', '/api/rows/toewijzing')).body)).toEqual([1, 4])
    expect(ids((await editor('GET', '/api/rows/toewijzing')).body)).toEqual([1, 2, 3, 4, 5, 6])
  })

  test("another person's Toewijzing by id is 404", async () => {
    const res = await owner('GET', '/api/revisions/toewijzing/2')
    expect({ status: res.status, code: res.body.code }).toEqual({ status: 404, code: 'unknown_record' })
  })

  test('Beschikbaarheid and Persoon: only its own', async () => {
    expect(ids((await owner('GET', '/api/rows/beschikbaarheid')).body)).toEqual([3])
    expect(ids((await owner('GET', '/api/rows/persoon')).body)).toEqual([1])
  })
})

describe('an owner writes only its own Beschikbaarheid', () => {
  test('creates, updates and deletes its own absence', async () => {
    const created = await owner('POST', '/api/rows/beschikbaarheid', AFWEZIG)
    expect(created.status).toBe(201)
    const id = created.body.id as number
    expect((await owner('PATCH', `/api/rows/beschikbaarheid/${id}`, { reden: 'Ziek' })).status).toBe(200)
    expect((await owner('DELETE', `/api/rows/beschikbaarheid/${id}`)).status).toBe(200)
  })

  test('an absence for another persoon is refused', async () => {
    await denied(owner('POST', '/api/rows/beschikbaarheid', { ...AFWEZIG, persoon_id: 2 }), 403, 'forbidden')
    await denied(owner('PATCH', '/api/rows/beschikbaarheid/3', { persoon_id: 2 }), 403, 'forbidden')
    await denied(owner('PATCH', '/api/rows/beschikbaarheid/2', { reden: 'Ziek' }), 404, 'unknown_record')
    await denied(owner('DELETE', '/api/rows/beschikbaarheid/2'), 404, 'unknown_record')
  })

  test('a Toewijzing, even its own, is forbidden', async () => {
    const res = await denied(
      owner('POST', '/api/rows/toewijzing', { activiteit_id: 5, persoon_id: 1 }),
      403,
      'forbidden',
    )
    expect(res.body.message).toBe('Alleen de planning wijzigt toewijzingen.')
    await denied(owner('PATCH', '/api/rows/toewijzing/1', { state: 'geweigerd' }), 403, 'forbidden')
    await denied(owner('DELETE', '/api/rows/toewijzing/1'), 403, 'forbidden')
  })

  test('its own Persoon row is forbidden', async () => {
    const res = await denied(owner('PATCH', '/api/rows/persoon/1', { telefoon: '0470 99' }), 403, 'forbidden')
    expect(res.body.message).toBe('Alleen de planning wijzigt personen.')
    await denied(owner('DELETE', '/api/rows/persoon/1'), 403, 'forbidden')
  })

  test('an Activiteit is not there to write', async () => {
    await denied(owner('PATCH', '/api/rows/activiteit/2', { status: 'optie' }), 404, 'unknown_source')
  })
})

describe("an editor's rights are unchanged", () => {
  test('writes Toewijzing, Persoon and another persoon’s Beschikbaarheid', async () => {
    expect((await editor('POST', '/api/rows/toewijzing', { activiteit_id: 5, persoon_id: 1 })).status).toBe(201)
    expect((await editor('PATCH', '/api/rows/toewijzing/2', { state: 'bevestigd' })).status).toBe(200)
    expect((await editor('PATCH', '/api/rows/persoon/2', { telefoon: '0470 99' })).status).toBe(200)
    expect((await editor('POST', '/api/rows/beschikbaarheid', { ...AFWEZIG, persoon_id: 2 })).status).toBe(201)
    expect((await editor('DELETE', '/api/rows/beschikbaarheid/1')).status).toBe(200)
    expect((await editor('PATCH', '/api/rows/activiteit/2', { status: 'optie' })).status).toBe(200)
  })
})
