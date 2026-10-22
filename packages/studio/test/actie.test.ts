import { Database } from 'bun:sqlite'
import { beforeEach, describe, expect, test } from 'bun:test'
import { migrate, seedDomain } from '@worktable/engine'
import { createService } from '@worktable/engine/src/auth'
import { signIn, testEngine } from '@worktable/engine/test/sign-in'
import studio from '../src'
import { localTime } from '../src/time'

type Body = Record<string, unknown>
type Send = (method: string, path: string, body?: Body) => Promise<{ status: number; body: Body }>

const HOUR = 3_600_000
const ago = (ms: number) => localTime(new Date(Date.now() - ms))
const tomorrow = () => localTime(new Date(Date.now() + 24 * HOUR))

let sqlite: Database
let admin: Send
let claude: Send
let robot: Send

const sender =
  (auth: Record<string, string>): Send =>
  async (method, path, body) => {
    const res = await app.request(path, {
      method,
      headers: { host: '127.0.0.1:4310', 'content-type': 'application/json', ...auth },
      body: body === undefined ? undefined : JSON.stringify(body),
    })
    return { status: res.status, body: (await res.json()) as Body }
  }

let app: ReturnType<typeof testEngine>

beforeEach(async () => {
  sqlite = new Database(':memory:')
  migrate(sqlite, studio)
  seedDomain(sqlite, studio)
  app = testEngine(sqlite, studio)
  admin = sender({ cookie: await signIn(app, 'administrator') })
  claude = sender({ authorization: `Bearer ${createService(sqlite, 'claude', 'editor')}` })
  robot = sender({ authorization: `Bearer ${createService(sqlite, 'robot', 'administrator')}` })
})

const actie = (id: number) => sqlite.query('SELECT * FROM actie WHERE id = ?').get(id) as Body
const status = (id: number) => actie(id).status
const refused = (res: { status: number }) => [403, 422].includes(res.status)

function plant(soort: string, state: string, extra: Body = {}): number {
  const row = { titel: 'x', soort, groep_id: 1, status: state, ...extra }
  const keys = Object.keys(row)
  const sql = `INSERT INTO actie (${keys.join(',')}) VALUES (${keys.map(() => '?').join(',')})`
  return Number(sqlite.query(sql).run(...(Object.values(row) as never[])).lastInsertRowid)
}

describe('who confirms an update', () => {
  test('no service account reaches bevestigd', async () => {
    for (const service of [claude, robot]) {
      const res = await service('PATCH', '/api/rows/actie/1', { status: 'bevestigd', expect: { status: 'voorbereid' } })
      expect(refused(res)).toBe(true)
      expect(status(1)).toBe('voorbereid')
    }
    const res = await admin('PATCH', '/api/rows/actie/1', { status: 'bevestigd' })
    expect(res.status).toBe(200)
    expect(status(1)).toBe('bevestigd')
  })

  test("a service's own undo never lands in bevestigd", async () => {
    expect((await admin('PATCH', '/api/rows/actie/1', { status: 'bevestigd' })).status).toBe(200)
    const moved = await robot('PATCH', '/api/rows/actie/1', { status: 'bezig', expect: { status: 'bevestigd' } })
    expect(moved.status).toBe(200)
    const batch = (moved.body.revision as Body).batch_id
    const res = await robot('POST', `/api/batches/${batch}/undo`, {})
    expect(refused(res)).toBe(true)
    expect(JSON.stringify(res.body)).toContain('Alleen Stefan bevestigt een update.')
    expect(status(1)).toBe('bezig')
  })

  test('an expired preview cannot be confirmed', async () => {
    const old = plant('bijwerken', 'voorbereid', { voorbereid_op: ago(25 * HOUR) })
    const fresh = plant('bijwerken', 'voorbereid', { voorbereid_op: ago(23 * HOUR) })
    const res = await admin('PATCH', `/api/rows/actie/${old}`, { status: 'bevestigd' })
    expect(refused(res)).toBe(true)
    expect(JSON.stringify(res.body)).toContain('Deze preview is verlopen.')
    expect(status(old)).toBe('voorbereid')
    expect((await admin('PATCH', `/api/rows/actie/${fresh}`, { status: 'bevestigd' })).status).toBe(200)
  })

  test('an undone confirmation is redone only on a fresh preview', async () => {
    const confirmed = await admin('PATCH', '/api/rows/actie/1', { status: 'bevestigd' })
    const undone = await admin('POST', `/api/batches/${(confirmed.body.revision as Body).batch_id}/undo`, {})
    expect(undone.status).toBe(200)
    expect(status(1)).toBe('voorbereid')
    sqlite.query('UPDATE actie SET voorbereid_op = ? WHERE id = 1').run(ago(30 * HOUR))
    const redo = await admin('POST', `/api/batches/${undone.body.batch_id}/undo`, {})
    expect(refused(redo)).toBe(true)
    expect(JSON.stringify(redo.body)).toContain('Deze preview is verlopen.')
    expect(status(1)).toBe('voorbereid')
  })

  test('a service PATCH of voorbereid_op is ignored, and an expired preview still refuses Bevestigen', async () => {
    const old = plant('bijwerken', 'voorbereid', { voorbereid_op: ago(25 * HOUR) })
    const stamp = actie(old).voorbereid_op
    await claude('PATCH', `/api/rows/actie/${old}`, { voorbereid_op: localTime(), expect: { status: 'voorbereid' } })
    expect(actie(old).voorbereid_op).toBe(stamp)
    expect(refused(await admin('PATCH', `/api/rows/actie/${old}`, { status: 'bevestigd' }))).toBe(true)
    expect(status(old)).toBe('voorbereid')
  })
})

describe('creating an actie', () => {
  const create = (body: Body) => claude('POST', '/api/rows/actie', { soort: 'gezondheidscheck', groep_id: 1, ...body })

  test('a create starts at aangevraagd', async () => {
    expect(refused(await create({ status: 'bevestigd' }))).toBe(true)
    const res = await create({})
    expect(res.status).toBe(201)
    expect(actie(res.body.id as number)).toMatchObject({ status: 'aangevraagd' })
    expect(String(actie(res.body.id as number).titel).trim()).not.toBe('')
  })

  test('bijwerken is never future-dated', async () => {
    expect(refused(await create({ soort: 'bijwerken', gepland_op: tomorrow() }))).toBe(true)
    const own = plant('bijwerken', 'aangevraagd')
    const res = await claude('PATCH', `/api/rows/actie/${own}`, {
      gepland_op: tomorrow(),
      expect: { status: 'aangevraagd' },
    })
    expect(refused(res)).toBe(true)
    expect(actie(own).gepland_op).toBeNull()
    expect([200, 201]).toContain((await create({ gepland_op: tomorrow() })).status)
    const check = plant('gezondheidscheck', 'aangevraagd')
    expect((await claude('PATCH', `/api/rows/actie/${check}`, { gepland_op: tomorrow() })).status).toBe(200)
  })
})

describe('transitions fit the soort', () => {
  const move = (service: Send, id: number, from: string, to: string) =>
    service('PATCH', `/api/rows/actie/${id}`, { status: to, expect: { status: from } })

  test('transitions fit the soort', async () => {
    const check = plant('gezondheidscheck', 'aangevraagd')
    expect(refused(await move(claude, check, 'aangevraagd', 'voorbereiden'))).toBe(true)
    const update = plant('bijwerken', 'aangevraagd')
    expect(refused(await move(claude, update, 'aangevraagd', 'bezig'))).toBe(true)
    const busy = plant('gezondheidscheck', 'bezig')
    expect(refused(await move(claude, busy, 'bezig', 'deels'))).toBe(true)
    expect((await move(claude, busy, 'bezig', 'klaar')).status).toBe(200)
    expect((await move(claude, update, 'aangevraagd', 'voorbereiden')).status).toBe(200)
  })

  test('soort and groep are fixed', async () => {
    const id = plant('bijwerken', 'aangevraagd')
    expect(refused(await claude('PATCH', `/api/rows/actie/${id}`, { soort: 'smoketest' }))).toBe(true)
    expect(refused(await claude('PATCH', `/api/rows/actie/${id}`, { groep_id: 2 }))).toBe(true)
    expect(actie(id)).toMatchObject({ soort: 'bijwerken', groep_id: 1 })
  })
})
