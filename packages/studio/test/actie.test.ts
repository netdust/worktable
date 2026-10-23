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
  const row = { titel: 'x', soort, status: state, ...extra }
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
    expect(JSON.stringify(res.body)).toContain('Deze preview is verlopen. De worker maakt een nieuwe.')
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
    expect(JSON.stringify(redo.body)).toContain('Deze preview is verlopen. De worker maakt een nieuwe.')
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
  const create = (body: Body) => claude('POST', '/api/rows/actie', { soort: 'gezondheidscheck', ...body })

  test('a create starts at aangevraagd', async () => {
    expect(refused(await create({ status: 'bevestigd' }))).toBe(true)
    const res = await create({})
    expect(res.status).toBe(201)
    expect(actie(res.body.id as number)).toMatchObject({ status: 'aangevraagd', titel: 'Gezondheidscheck' })
  })

  test('a person starts an opdracht in Sites', async () => {
    const before = (sqlite.query('SELECT COUNT(*) AS n FROM actie').get() as { n: number }).n
    const res = await admin('POST', '/api/rows/actie', { soort: 'gezondheidscheck' })
    expect(res.status).toBe(403)
    expect(JSON.stringify(res.body)).toContain('Een opdracht start je in Sites: vink sites aan en kies een actie.')
    expect((sqlite.query('SELECT COUNT(*) AS n FROM actie').get() as { n: number }).n).toBe(before)
    expect((await admin('POST', '/api/rows/actie', { soort: 'gezondheidscheck', titel: 'Check' })).status).toBe(201)
    const own = await create({})
    expect(own.status).toBe(201)
    expect(actie(own.body.id as number).titel).toBe('Gezondheidscheck')
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

  test('the soort is fixed', async () => {
    const id = plant('bijwerken', 'aangevraagd')
    const res = await claude('PATCH', `/api/rows/actie/${id}`, { soort: 'smoketest' })
    expect({ status: res.status, message: res.body.message }).toEqual({ status: 422, message: 'De soort ligt vast.' })
    expect(actie(id).soort).toBe('bijwerken')
  })
})

describe('a preview leaves voorbereid only through Stefan', () => {
  const move = (service: Send, id: number, from: string, to: string) =>
    service('PATCH', `/api/rows/actie/${id}`, { status: to, expect: { status: from } })
  const batchOf = (res: { body: Body }) => (res.body.revision as Body).batch_id
  const PREVIEW_UNDO = 'Alleen Stefan zet een preview terug.'
  const link = (id: number) => sqlite.query('SELECT * FROM actie_site WHERE id = ?').get(id) as Body

  test('a service cannot take a fresh preview out of voorbereid', async () => {
    const before = { actie: actie(1), link: link(1) }
    const res = await move(claude, 1, 'voorbereid', 'aangevraagd')
    expect({ status: res.status, message: res.body.message }).toEqual({
      status: 422,
      message: 'Deze preview is nog niet verlopen.',
    })
    expect(actie(1)).toEqual(before.actie)
    expect(link(1)).toEqual(before.link)
    expect((await admin('PATCH', '/api/rows/actie/1', { status: 'bevestigd' })).status).toBe(200)

    const old = plant('bijwerken', 'voorbereid', { voorbereid_op: ago(25 * HOUR) })
    expect((await move(claude, old, 'voorbereid', 'aangevraagd')).status).toBe(200)
    expect(status(old)).toBe('aangevraagd')
  })

  test("a service's undo never leaves or enters voorbereid", async () => {
    const id = plant('bijwerken', 'aangevraagd')
    await move(claude, id, 'aangevraagd', 'voorbereiden')
    const prepared = await move(claude, id, 'voorbereiden', 'voorbereid')
    expect(prepared.status).toBe(200)
    const undo = await claude('POST', `/api/batches/${batchOf(prepared)}/undo`, {})
    expect(refused(undo)).toBe(true)
    expect(JSON.stringify(undo.body)).toContain(PREVIEW_UNDO)
    expect(status(id)).toBe('voorbereid')

    const cancelled = await move(claude, id, 'voorbereid', 'geannuleerd')
    expect(cancelled.status).toBe(200)
    const back = await claude('POST', `/api/batches/${batchOf(cancelled)}/undo`, {})
    expect(refused(back)).toBe(true)
    expect(JSON.stringify(back.body)).toContain(PREVIEW_UNDO)
    expect(status(id)).toBe('geannuleerd')
  })

  test('cancel, rewrite, undo does not reach Bevestigen', async () => {
    const skipped = plant('bijwerken', 'voorbereid', { voorbereid_op: ago(HOUR) })
    const kept = Number(
      sqlite
        .query(
          `INSERT INTO actie_site (actie_id, site_id, state, voorstel, samenvatting, resultaat) VALUES (?,?,?,?,?,?)`,
        )
        .run(skipped, 4, 'overgeslagen', '[["a","1","2"]]', 'Detail', 'Hoog risico').lastInsertRowid,
    )
    const cancelled = await move(claude, skipped, 'voorbereid', 'geannuleerd')
    expect(cancelled.status).toBe(200)
    const before = link(kept)
    const text = await claude('PATCH', `/api/rows/actie_site/${kept}`, { samenvatting: 'Niets bijzonders' })
    const reason = await claude('PATCH', `/api/rows/actie_site/${kept}`, { resultaat: null })
    const undo = await claude('POST', `/api/batches/${batchOf(cancelled)}/undo`, {})
    expect([text, reason, undo].every(refused)).toBe(true)
    expect(JSON.stringify(text.body)).toContain('De sites van deze opdracht liggen vast.')
    expect(status(skipped)).toBe('geannuleerd')
    expect(link(kept)).toEqual(before)
  })

  test('an old confirmation is not claimed', async () => {
    const stale = plant('bijwerken', 'bevestigd', { voorbereid_op: ago(25 * HOUR) })
    const res = await move(robot, stale, 'bevestigd', 'bezig')
    expect({ status: res.status, message: res.body.message }).toEqual({
      status: 422,
      message: 'Deze bevestiging is verlopen. Vraag de update opnieuw aan.',
    })
    expect(status(stale)).toBe('bevestigd')
    const fresh = plant('bijwerken', 'bevestigd', { voorbereid_op: ago(23 * HOUR) })
    expect((await move(claude, fresh, 'bevestigd', 'bezig')).status).toBe(200)
  })

  test('Stefan calls off a confirmed update', async () => {
    const id = plant('bijwerken', 'bevestigd', { voorbereid_op: ago(HOUR) })
    const editor = await move(claude, id, 'bevestigd', 'geannuleerd')
    expect({ status: editor.status, code: editor.body.code }).toEqual({ status: 422, code: 'transition_not_allowed' })
    const service = await move(robot, id, 'bevestigd', 'geannuleerd')
    expect(service.status).toBe(403)
    expect(JSON.stringify(service.body)).toContain('Alleen Stefan annuleert een bevestigde update.')
    expect(status(id)).toBe('bevestigd')
    type Marked = { id: number; available?: { buttons: { label: string }[] } }
    const rows = (await admin('GET', '/api/rows/actie')).body.rows as Marked[]
    expect(rows.find((r) => r.id === id)?.available?.buttons.map((b) => b.label)).toContain('Annuleren')
    expect((await admin('PATCH', `/api/rows/actie/${id}`, { status: 'geannuleerd' })).status).toBe(200)
    expect(status(id)).toBe('geannuleerd')
  })

  test('the drawer re-reads while Stefan reads the preview', async () => {
    const served = (await admin('GET', '/api/schema')).body as {
      sources: Record<string, { lifecycle?: { live?: string[] } }>
    }
    expect(served.sources.actie?.lifecycle?.live).toContain('voorbereid')
  })
})

describe('a person makes only the button steps', () => {
  const WORKER = 'Deze stap zet de worker.'
  const patch = (id: number, to: string) => admin('PATCH', `/api/rows/actie/${id}`, { status: to })

  test('a person makes only the button steps', async () => {
    const steps: [string, string, string][] = [
      ['gezondheidscheck', 'aangevraagd', 'bezig'],
      ['bijwerken', 'aangevraagd', 'voorbereiden'],
      ['bijwerken', 'voorbereiden', 'voorbereid'],
      ['bijwerken', 'voorbereid', 'aangevraagd'],
      ['bijwerken', 'bevestigd', 'bezig'],
      ['bijwerken', 'bezig', 'klaar'],
    ]
    for (const [soort, from, to] of steps) {
      const id = plant(soort, from, { voorbereid_op: ago(HOUR) })
      const res = await patch(id, to)
      expect({ from, to, status: res.status, message: res.body.message }).toEqual({
        from,
        to,
        status: 422,
        message: WORKER,
      })
      expect(status(id)).toBe(from)
    }
    const fresh = plant('bijwerken', 'voorbereid', { voorbereid_op: ago(HOUR) })
    expect((await patch(fresh, 'bevestigd')).status).toBe(200)
    const queued = plant('bijwerken', 'aangevraagd')
    expect((await patch(queued, 'geannuleerd')).status).toBe(200)
    const confirmed = plant('bijwerken', 'bevestigd', { voorbereid_op: ago(HOUR) })
    expect((await patch(confirmed, 'geannuleerd')).status).toBe(200)
  })

  test("a person's undo of Bevestigen still works", async () => {
    const confirmed = await patch(1, 'bevestigd')
    expect(confirmed.status).toBe(200)
    const undo = await admin('POST', `/api/batches/${(confirmed.body.revision as Body).batch_id}/undo`, {})
    expect(undo.status).toBe(200)
    expect(status(1)).toBe('voorbereid')
  })
})

describe('an opdracht with sites is cancelled, not deleted', () => {
  const live = (table: string, id: number) =>
    sqlite.query(`SELECT id FROM ${table} WHERE id = ? AND deleted_at IS NULL`).get(id)

  test('an opdracht with sites is cancelled, not deleted', async () => {
    const res = await admin('DELETE', '/api/rows/actie/1')
    expect({ status: res.status, message: res.body.message }).toEqual({
      status: 422,
      message: 'Een opdracht met sites verwijder je niet. Annuleer ze.',
    })
    expect(live('actie', 1)).not.toBeNull()
    expect(live('actie_site', 1)).not.toBeNull()
  })

  test("the undo of a selection action's batch still deletes the opdracht", async () => {
    const run = await admin('POST', '/api/actions/gezondheidscheck', { ids: [3] })
    expect(run.status).toBe(201)
    const created = (sqlite.query('SELECT MAX(id) AS id FROM actie').get() as { id: number }).id
    const link = (sqlite.query('SELECT id FROM actie_site WHERE actie_id = ?').get(created) as { id: number }).id
    const undo = await admin('POST', `/api/batches/${run.body.batch_id}/undo`, {})
    expect(undo.status).toBe(200)
    expect(live('actie', created)).toBeNull()
    expect(live('actie_site', link)).toBeNull()
  })
})
