import { Database } from 'bun:sqlite'
import { beforeEach, describe, expect, test } from 'bun:test'
import { migrate, seedDomain } from '../src'
import { createService } from '../src/auth'
import { domain } from './fixture'
import { signIn, testEngine } from './sign-in'

const HOST = { host: '127.0.0.1:4310', 'content-type': 'application/json' }
const URL_SENTINEL = 'https://sentinel-handoff.example.test/login?token=SENTINEL-abc123'

let sqlite: Database
let app: ReturnType<typeof testEngine>

beforeEach(() => {
  sqlite = new Database(':memory:')
  migrate(sqlite, domain)
  seedDomain(sqlite, domain)
  app = testEngine(sqlite, domain)
})

async function call(method: string, path: string, headers: Record<string, string> = {}, body?: unknown) {
  const res = await app.request(path, {
    method,
    headers: { ...HOST, ...headers },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  const text = await res.text()
  // biome-ignore lint/suspicious/noExplicitAny: response bodies are asserted structurally
  let json: Record<string, any> = {}
  try {
    json = JSON.parse(text)
  } catch {}
  return { status: res.status, text, headers: res.headers, body: json }
}

const as = (cookie: string) => ({ cookie })
const bearer = (token: string) => ({ authorization: `Bearer ${token}` })
const put = (who: Record<string, string>, id: number, body: unknown, dataset = 'note') =>
  call('PUT', `/api/handoff/${dataset}/${id}`, who, body)
const get = (who: Record<string, string>, id: number, dataset = 'note') =>
  call('GET', `/api/handoff/${dataset}/${id}`, who)

// A note made through the API by a signed-in person, who is then its creator.
let notes = 0
async function noteBy(cookie: string): Promise<number> {
  const made = await call('POST', '/api/rows/note', as(cookie), { project_id: 1, tekst: `handoff ${++notes}` })
  expect(made.status).toBe(201)
  return made.body.id
}

async function setup() {
  const creator = as(await signIn(app, 'editor'))
  const id = await noteBy(creator.cookie)
  const service = bearer(createService(sqlite, 'bot', 'editor'))
  return { creator, id, service }
}

describe('a handoff', () => {
  test('a service puts a value and only the creator reads it, with no-store headers', async () => {
    const { creator, id, service } = await setup()
    const stored = await put(service, id, { value: URL_SENTINEL })
    expect(stored.status).toBe(200)
    const read = await get(creator, id)
    expect(read.status).toBe(200)
    expect(read.body).toEqual({ value: URL_SENTINEL })
    expect(read.headers.get('cache-control')).toBe('no-store')
    expect(read.headers.get('referrer-policy')).toBe('no-referrer')
  })

  test('a second read is 404 unknown_record', async () => {
    const { creator, id, service } = await setup()
    await put(service, id, { value: URL_SENTINEL })
    expect((await get(creator, id)).status).toBe(200)
    const again = await get(creator, id)
    expect(again.status).toBe(404)
    expect(again.body.code).toBe('unknown_record')
  })

  test('two parallel reads give exactly one 200', async () => {
    const { creator, id, service } = await setup()
    await put(service, id, { value: URL_SENTINEL })
    const both = await Promise.all([get(creator, id), get(creator, id)])
    expect(both.map((r) => r.status).sort()).toEqual([200, 404])
  })

  test("another person's read is 404 and leaves the value for the creator", async () => {
    const { creator, id, service } = await setup()
    await put(service, id, { value: URL_SENTINEL })
    const other = as(await signIn(app, 'administrator'))
    const denied = await get(other, id)
    expect(denied.status).toBe(404)
    expect(denied.body.code).toBe('unknown_record')
    expect(denied.text).not.toContain('SENTINEL')
    expect((await get(creator, id)).status).toBe(200)
  })

  test('a service never reads, not even the one that put it', async () => {
    const { id, service } = await setup()
    await put(service, id, { value: URL_SENTINEL })
    const denied = await get(service, id)
    expect(denied.status).toBe(404)
    expect(denied.body.code).toBe('unknown_record')
  })

  test('a person may not put: 403 service_only, and nothing is stored', async () => {
    const { creator, id } = await setup()
    const denied = await put(creator, id, { value: URL_SENTINEL })
    expect(denied.status).toBe(403)
    expect(denied.body.code).toBe('service_only')
    expect(sqlite.query('SELECT COUNT(*) AS n FROM handoff').get()).toEqual({ n: 0 })
  })

  test('a second put by the same service is 409 and keeps the first value', async () => {
    const { creator, id, service } = await setup()
    await put(service, id, { value: URL_SENTINEL })
    const second = await put(service, id, { value: 'https://other.example.test/' })
    expect(second.status).toBe(409)
    expect(second.text).not.toContain('SENTINEL')
    expect((await get(creator, id)).body).toEqual({ value: URL_SENTINEL })
  })

  test('a second put by another service is 409', async () => {
    const { id, service } = await setup()
    await put(service, id, { value: URL_SENTINEL })
    const rival = bearer(createService(sqlite, 'rival', 'editor'))
    expect((await put(rival, id, { value: 'https://rival.example.test/' })).status).toBe(409)
  })

  test('a put after the value was read is 409', async () => {
    const { creator, id, service } = await setup()
    await put(service, id, { value: URL_SENTINEL })
    await get(creator, id)
    expect((await put(service, id, { value: URL_SENTINEL })).status).toBe(409)
  })

  test('a put after expiry is 409', async () => {
    const { id, service } = await setup()
    await put(service, id, { value: URL_SENTINEL })
    sqlite.run("UPDATE handoff SET expires_at = '2000-01-01T00:00:00.000Z'")
    expect((await put(service, id, { value: URL_SENTINEL })).status).toBe(409)
  })

  test.each(['javascript:alert(1)', 'data:text/html,SENTINEL', 'ftp://x.example.test/SENTINEL', 'not a url'])(
    'the value %s is 400 bad_url and the error does not echo it',
    async (value) => {
      const { id, service } = await setup()
      const refused = await put(service, id, { value })
      expect(refused.status).toBe(400)
      expect(refused.body.code).toBe('bad_url')
      expect(refused.text).not.toContain(value)
      expect(sqlite.query('SELECT COUNT(*) AS n FROM handoff').get()).toEqual({ n: 0 })
    },
  )

  test.each([
    [{}],
    [{ value: 5 }],
    [{ value: URL_SENTINEL, ttl_s: 0 }],
    [{ value: URL_SENTINEL, ttl_s: 121 }],
    [{ value: URL_SENTINEL, ttl_s: 1.5 }],
  ])('the body %j is 400 bad_body', async (body) => {
    const { id, service } = await setup()
    const refused = await put(service, id, body)
    expect(refused.status).toBe(400)
    expect(refused.body.code).toBe('bad_body')
    expect(refused.text).not.toContain('SENTINEL')
  })

  test('the ttl sets expires_at', async () => {
    const { id, service } = await setup()
    await put(service, id, { value: URL_SENTINEL, ttl_s: 10 })
    const row = sqlite.query('SELECT expires_at FROM handoff').get() as { expires_at: string }
    const wait = Date.parse(row.expires_at) - Date.now()
    expect(wait).toBeGreaterThan(5_000)
    expect(wait).toBeLessThanOrEqual(10_000)
  })

  test('an expired value reads 404 and its row stays as a tombstone with the value cleared', async () => {
    const { creator, id, service } = await setup()
    await put(service, id, { value: URL_SENTINEL })
    sqlite.run("UPDATE handoff SET expires_at = '2000-01-01T00:00:00.000Z'")
    const late = await get(creator, id)
    expect(late.status).toBe(404)
    expect(late.body.code).toBe('unknown_record')
    const row = sqlite.query('SELECT value, taken_at FROM handoff').get() as { value: unknown; taken_at: unknown }
    expect(row.value).toBeNull()
    expect(row.taken_at).toEqual(expect.any(String))
  })

  test('a put sweeps the values of other expired rows without deleting them', async () => {
    const { creator, id, service } = await setup()
    await put(service, id, { value: URL_SENTINEL })
    sqlite.run("UPDATE handoff SET expires_at = '2000-01-01T00:00:00.000Z'")
    const second = await noteBy(creator.cookie)
    await put(service, second, { value: 'https://second.example.test/' })
    expect(sqlite.query('SELECT record_id, value IS NULL AS cleared FROM handoff ORDER BY record_id').all()).toEqual([
      { record_id: id, cleared: 1 },
      { record_id: second, cleared: 0 },
    ])
  })

  test('a put for a record that does not exist is 404', async () => {
    const { service } = await setup()
    expect((await put(service, 9999, { value: URL_SENTINEL })).status).toBe(404)
  })

  test('a put for a deleted record is 404', async () => {
    const { id, service } = await setup()
    sqlite.run("UPDATE note SET deleted_at = '2026-01-01' WHERE id = ?", [id])
    expect((await put(service, id, { value: URL_SENTINEL })).status).toBe(404)
  })

  test('an unknown dataset, an engine table and a query are 404 on both verbs', async () => {
    const { creator, id, service } = await setup()
    for (const name of ['nope', 'revision', 'handoff', 'note_lijst']) {
      expect((await put(service, id, { value: URL_SENTINEL }, name)).status).toBe(404)
      expect((await get(creator, id, name)).status).toBe(404)
    }
  })

  test('the creator is the actor of the create revision, not whoever changed the record later', async () => {
    const { creator, id, service } = await setup()
    const editor = as(await signIn(app, 'administrator'))
    expect((await call('PATCH', `/api/rows/note/${id}`, editor, { tekst: 'bewerkt' })).status).toBe(200)
    await put(service, id, { value: URL_SENTINEL })
    expect((await get(editor, id)).status).toBe(404)
    expect((await get(creator, id)).status).toBe(200)
  })

  test('the value is in no revision, batch, history, schema or row response', async () => {
    const { id, service } = await setup()
    const admin = as(await signIn(app, 'administrator'))
    await put(service, id, { value: URL_SENTINEL })
    for (const table of ['revision', 'batch']) {
      expect(JSON.stringify(sqlite.query(`SELECT * FROM ${table}`).all())).not.toContain('SENTINEL')
    }
    for (const path of [`/api/revisions/note/${id}`, '/api/schema', '/api/rows/note', '/api/history/note']) {
      const res = await call('GET', path, admin)
      expect(res.status).toBe(200)
      expect(res.text).not.toContain('SENTINEL')
    }
  })
})
