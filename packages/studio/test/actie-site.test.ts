import { Database } from 'bun:sqlite'
import { beforeEach, describe, expect, test } from 'bun:test'
import { migrate, seedDomain } from '@worktable/engine'
import { createService } from '@worktable/engine/src/auth'
import { signIn, testEngine } from '@worktable/engine/test/sign-in'
import studio from '../src'

type Body = Record<string, unknown>
type Send = (method: string, path: string, body?: Body) => Promise<{ status: number; body: Body }>

let sqlite: Database
let app: ReturnType<typeof testEngine>
let admin: Send
let claude: Send

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

beforeEach(async () => {
  sqlite = new Database(':memory:')
  migrate(sqlite, studio)
  seedDomain(sqlite, studio)
  app = testEngine(sqlite, studio)
  admin = sender({ cookie: await signIn(app, 'administrator') })
  claude = sender({ authorization: `Bearer ${createService(sqlite, 'claude', 'editor')}` })
})

const refused = (res: { status: number }) => [403, 422].includes(res.status)
const link = (id: number) => sqlite.query('SELECT * FROM actie_site WHERE id = ?').get(id) as Body

function plant(table: string, row: Body): number {
  const keys = Object.keys(row)
  const sql = `INSERT INTO ${table} (${keys.join(',')}) VALUES (${keys.map(() => '?').join(',')})`
  return Number(sqlite.query(sql).run(...(Object.values(row) as never[])).lastInsertRowid)
}

const actieIn = (status: string, soort = 'bijwerken') => plant('actie', { titel: 'x', soort, groep_id: 1, status })
const linkIn = (actie: number, state: string, site = 2) =>
  plant('actie_site', { actie_id: actie, site_id: site, state, voorstel: '[]' })

function expectRefused(res: { status: number; body: Body }, message: string, id: number, before: Body) {
  expect(refused(res)).toBe(true)
  expect(JSON.stringify(res.body)).toContain(message)
  expect(link(id)).toEqual(before)
}

const FROZEN = 'Het voorstel ligt vast sinds de preview.'
const CONFIRMED = 'Een bevestigde update verandert niet meer.'

describe('the confirmed set', () => {
  test('voorstel is frozen from voorbereid on', async () => {
    for (const [status, message] of [
      ['voorbereid', FROZEN],
      ['bevestigd', CONFIRMED],
      ['bezig', CONFIRMED],
    ] as const) {
      const id = linkIn(actieIn(status), 'te_bevestigen')
      const other = actieIn('aangevraagd')
      for (const who of [admin, claude]) {
        for (const patch of [{ voorstel: '[{"x":1}]' }, { site_id: 3 }, { actie_id: other }]) {
          const before = link(id)
          expectRefused(await who('PATCH', `/api/rows/actie_site/${id}`, patch), message, id, before)
        }
      }
    }
  })

  test('no site joins after the preview', async () => {
    const post = (service: Send, actie: number) =>
      service('POST', '/api/rows/actie_site', { actie_id: actie, site_id: 2, voorstel: '[]' })
    for (const who of [admin, claude]) {
      for (const [status, message] of [
        ['voorbereid', FROZEN],
        ['bevestigd', CONFIRMED],
        ['bezig', CONFIRMED],
        ['klaar', CONFIRMED],
      ] as const) {
        const res = await post(who, actieIn(status))
        expect(refused(res)).toBe(true)
        expect(JSON.stringify(res.body)).toContain(message)
      }
    }
    expect((await post(claude, actieIn('aangevraagd'))).status).toBe(201)
    expect((await post(claude, actieIn('voorbereiden'))).status).toBe(201)
    expect((await post(claude, actieIn('bezig', 'gezondheidscheck'))).status).toBe(201)
  })

  test('a site joins an actie once', async () => {
    const actie = actieIn('aangevraagd')
    const id = linkIn(actie, 'wacht', 2)
    const post = (site: number) => claude('POST', '/api/rows/actie_site', { actie_id: actie, site_id: site })
    const dup = await post(2)
    expect(refused(dup)).toBe(true)
    expect(JSON.stringify(dup.body)).toContain('Deze site hoort al bij deze actie.')
    expect((await post(3)).status).toBe(201)
    const swap = await claude('PATCH', `/api/rows/actie_site/${id}`, { site_id: 3 })
    expect(JSON.stringify(swap.body)).toContain('Deze site hoort al bij deze actie.')
    expect(link(id)).toMatchObject({ site_id: 2 })
  })

  test('Stefan drops a site before confirming', async () => {
    const id = linkIn(actieIn('voorbereid'), 'te_bevestigen')
    const klaar = await admin('PATCH', `/api/rows/actie_site/${id}`, { state: 'klaar' })
    expect(refused(klaar)).toBe(true)
    expect(JSON.stringify(klaar.body)).toContain(FROZEN)
    expect(link(id).state).toBe('te_bevestigen')
    expect((await admin('PATCH', `/api/rows/actie_site/${id}`, { state: 'overgeslagen' })).status).toBe(200)
    expect(link(id).state).toBe('overgeslagen')
    const restore = await admin('PATCH', `/api/rows/actie_site/${id}`, { state: 'te_bevestigen' })
    expect(refused(restore)).toBe(true)
    expect(link(id).state).toBe('overgeslagen')
  })

  test('a dropped site stays dropped after confirmation', async () => {
    const actie = actieIn('voorbereid')
    const id = linkIn(actie, 'te_bevestigen')
    const dropped = await claude('PATCH', `/api/rows/actie_site/${id}`, { state: 'overgeslagen' })
    expect(dropped.status).toBe(200)
    const batch = (dropped.body.revision as Body).batch_id
    const move = (who: Send, to: string) => who('PATCH', `/api/rows/actie_site/${id}`, { state: to })

    sqlite.query('UPDATE actie SET status = ? WHERE id = ?').run('bevestigd', actie)
    for (const who of [admin, claude]) {
      for (const to of ['te_bevestigen', 'bezig']) expectRefused(await move(who, to), CONFIRMED, id, link(id))
    }
    expectRefused(await claude('POST', `/api/batches/${batch}/undo`, {}), CONFIRMED, id, link(id))

    sqlite.query('UPDATE actie SET status = ? WHERE id = ?').run('bezig', actie)
    for (const who of [admin, claude]) {
      for (const to of ['te_bevestigen', 'bezig']) expectRefused(await move(who, to), CONFIRMED, id, link(id))
    }
    expectRefused(await claude('POST', `/api/batches/${batch}/undo`, {}), CONFIRMED, id, link(id))
    expect(link(id).state).toBe('overgeslagen')
  })

  test('a confirmed set cannot lose a link', async () => {
    for (const [status, message] of [
      ['voorbereid', FROZEN],
      ['bevestigd', CONFIRMED],
      ['bezig', CONFIRMED],
    ] as const) {
      const id = linkIn(actieIn(status), 'te_bevestigen')
      const res = await claude('DELETE', `/api/rows/actie_site/${id}`)
      expectRefused(res, message, id, link(id))
      expect(link(id).deleted_at ?? null).toBeNull()
    }
    const open = linkIn(actieIn('aangevraagd'), 'wacht')
    expect((await claude('DELETE', `/api/rows/actie_site/${open}`)).status).toBe(200)
  })

  test('the worker writes results while bezig', async () => {
    const id = linkIn(actieIn('bezig'), 'te_bevestigen')
    const res = await claude('PATCH', `/api/rows/actie_site/${id}`, { state: 'klaar', resultaat: 'ok' })
    expect(res.status).toBe(200)
    expect(link(id)).toMatchObject({ state: 'klaar', resultaat: 'ok' })
  })

  test('bevestigd takes no change at all, not even a result', async () => {
    const id = linkIn(actieIn('bevestigd'), 'te_bevestigen')
    expectRefused(await claude('PATCH', `/api/rows/actie_site/${id}`, { resultaat: 'x' }), CONFIRMED, id, link(id))
  })
})
