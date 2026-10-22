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

async function expectRefused(send: () => Promise<{ status: number; body: Body }>, message: string, id: number) {
  const before = link(id)
  const res = await send()
  expect(refused(res)).toBe(true)
  expect(JSON.stringify(res.body)).toContain(message)
  expect(link(id)).toEqual(before)
}

const FROZEN = 'Het voorstel ligt vast sinds de preview.'
const PREVIEW = '[["cache-plugin","1.9.0","1.9.2"]]'
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
          await expectRefused(() => who('PATCH', `/api/rows/actie_site/${id}`, patch), message, id)
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
  })

  test('a person restores a site they dropped before confirming', async () => {
    const id = plant('actie_site', {
      actie_id: actieIn('voorbereid'),
      site_id: 2,
      state: 'te_bevestigen',
      voorstel: PREVIEW,
    })
    const dropped = await admin('PATCH', `/api/rows/actie_site/${id}`, { state: 'overgeslagen' })
    expect(dropped.status).toBe(200)
    const undone = await admin('POST', `/api/batches/${(dropped.body.revision as Body).batch_id}/undo`, {})
    expect(undone.status).toBe(200)
    expect(link(id).state).toBe('te_bevestigen')
    expect((await admin('PATCH', `/api/rows/actie_site/${id}`, { state: 'overgeslagen' })).status).toBe(200)
    expect((await admin('PATCH', `/api/rows/actie_site/${id}`, { state: 'te_bevestigen' })).status).toBe(200)
    expect(link(id).state).toBe('te_bevestigen')
  })

  test('a skipped link without a voorstel cannot be restored, even by a person', async () => {
    const actie = actieIn('voorbereid')
    for (const voorstel of [null, '', '[]']) {
      const id = plant('actie_site', { actie_id: actie, site_id: 2, state: 'overgeslagen', voorstel })
      await expectRefused(() => admin('PATCH', `/api/rows/actie_site/${id}`, { state: 'te_bevestigen' }), FROZEN, id)
    }
  })

  test('a service cannot restore a dropped link', async () => {
    const id = plant('actie_site', {
      actie_id: actieIn('voorbereid'),
      site_id: 2,
      state: 'overgeslagen',
      voorstel: PREVIEW,
    })
    await expectRefused(() => claude('PATCH', `/api/rows/actie_site/${id}`, { state: 'te_bevestigen' }), FROZEN, id)
  })

  test('a link needs both ids before uniqueness is asked', async () => {
    const actie = actieIn('aangevraagd')
    for (const body of [{ actie_id: actie }, { site_id: 2 }, { actie_id: null, site_id: 2 }]) {
      expect((await claude('POST', '/api/rows/actie_site', body)).status).toBe(400)
    }
  })

  test('a voorstel of null cannot be rewritten as the text "null"', async () => {
    const id = plant('actie_site', { actie_id: actieIn('voorbereid'), site_id: 2, state: 'te_bevestigen' })
    await expectRefused(() => claude('PATCH', `/api/rows/actie_site/${id}`, { voorstel: 'null' }), FROZEN, id)
  })

  test('a link cannot be moved into a frozen actie', async () => {
    for (const [status, message] of [
      ['voorbereid', FROZEN],
      ['bevestigd', CONFIRMED],
    ] as const) {
      const id = linkIn(actieIn('aangevraagd'), 'wacht')
      const target = actieIn(status)
      await expectRefused(() => claude('PATCH', `/api/rows/actie_site/${id}`, { actie_id: target }), message, id)
    }
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
      for (const to of ['te_bevestigen', 'bezig']) await expectRefused(() => move(who, to), CONFIRMED, id)
    }
    await expectRefused(() => claude('POST', `/api/batches/${batch}/undo`, {}), CONFIRMED, id)

    sqlite.query('UPDATE actie SET status = ? WHERE id = ?').run('bezig', actie)
    for (const who of [admin, claude]) {
      for (const to of ['te_bevestigen', 'bezig']) await expectRefused(() => move(who, to), CONFIRMED, id)
    }
    await expectRefused(() => claude('POST', `/api/batches/${batch}/undo`, {}), CONFIRMED, id)
    expect(link(id).state).toBe('overgeslagen')
  })

  test('a confirmed set cannot lose a link', async () => {
    for (const [status, message] of [
      ['voorbereid', FROZEN],
      ['bevestigd', CONFIRMED],
      ['bezig', CONFIRMED],
    ] as const) {
      const id = linkIn(actieIn(status), 'te_bevestigen')
      await expectRefused(() => claude('DELETE', `/api/rows/actie_site/${id}`), message, id)
      expect(link(id).deleted_at ?? null).toBeNull()
    }
    const open = linkIn(actieIn('aangevraagd'), 'wacht')
    expect((await claude('DELETE', `/api/rows/actie_site/${open}`)).status).toBe(403)
    expect((await admin('DELETE', `/api/rows/actie_site/${open}`)).status).toBe(200)
  })

  test('the worker writes results while bezig', async () => {
    const id = linkIn(actieIn('bezig'), 'bezig')
    const res = await claude('PATCH', `/api/rows/actie_site/${id}`, { state: 'klaar', resultaat: 'ok' })
    expect(res.status).toBe(200)
    expect(link(id)).toMatchObject({ state: 'klaar', resultaat: 'ok' })
  })

  test('bevestigd takes no change at all, not even a result', async () => {
    const id = linkIn(actieIn('bevestigd'), 'te_bevestigen')
    await expectRefused(() => claude('PATCH', `/api/rows/actie_site/${id}`, { resultaat: 'x' }), CONFIRMED, id)
  })
})
