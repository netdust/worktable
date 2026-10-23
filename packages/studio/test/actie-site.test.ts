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

const actieIn = (status: string, soort = 'bijwerken') => plant('actie', { titel: 'x', soort, status })
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
const CLOSED = 'De sites van deze opdracht liggen vast.'
const UNIQUE = 'Deze site hoort al bij deze opdracht.'
const BUTTONS = 'Een site zet je alleen tijdens de preview op Niet nu of Toch wel.'
const NO_PREVIEW = 'Deze site heeft geen preview en kan niet terug.'
const SKIPPED = 'Deze site is bewust overgeslagen en kan niet terug.'
const SERVICE_SKIP = 'Een site met preview slaat de worker pas over bij het bijwerken.'
const SERVICE_RESTORE = 'Alleen Stefan zet een overgeslagen site terug.'
const patch = (who: Send, id: number, body: Body) => who('PATCH', `/api/rows/actie_site/${id}`, body)

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
        for (const body of [{ voorstel: '[{"x":1}]' }, { site_id: 3 }, { actie_id: other }]) {
          await expectRefused(() => patch(who, id, body), message, id)
        }
      }
    }
  })

  test('samenvatting is frozen in voorbereid and bevestigd, and the worker writes outcome lines in bezig', async () => {
    for (const [status, message] of [
      ['voorbereid', FROZEN],
      ['bevestigd', CONFIRMED],
    ] as const) {
      const id = linkIn(actieIn(status), 'te_bevestigen')
      for (const who of [admin, claude]) {
        await expectRefused(() => patch(who, id, { samenvatting: 'anders' }), message, id)
      }
    }
    const bezig = linkIn(actieIn('bezig'), 'bezig')
    expect((await patch(claude, bezig, { samenvatting: 'Plugin 2 van 3' })).status).toBe(200)
    expect(link(bezig).samenvatting).toBe('Plugin 2 van 3')
    const preparing = linkIn(actieIn('voorbereiden'), 'wacht')
    expect((await patch(claude, preparing, { samenvatting: 'WordPress 6.7 → 6.8' })).status).toBe(200)
  })

  test('no site joins a request after it is claimed', async () => {
    const post = (service: Send, actie: number) =>
      service('POST', '/api/rows/actie_site', { actie_id: actie, site_id: 2, voorstel: '[]' })
    const claimed: [string, string, string][] = [
      ['voorbereiden', 'bijwerken', CLOSED],
      ['voorbereid', 'bijwerken', FROZEN],
      ['bevestigd', 'bijwerken', CONFIRMED],
      ['bezig', 'bijwerken', CONFIRMED],
      ['bezig', 'gezondheidscheck', CLOSED],
    ]
    for (const who of [admin, claude]) {
      for (const [status, soort, message] of claimed) {
        const res = await post(who, actieIn(status, soort))
        expect(refused(res)).toBe(true)
        expect(JSON.stringify(res.body)).toContain(message)
      }
      const expired = plant('actie', {
        titel: 'x',
        soort: 'bijwerken',
        status: 'aangevraagd',
        voorbereid_op: '2026-10-01T10:00',
      })
      const res = await post(who, expired)
      expect(refused(res)).toBe(true)
      expect(JSON.stringify(res.body)).toContain(CLOSED)
    }
    expect((await post(claude, actieIn('aangevraagd'))).status).toBe(201)
  })

  test('a site joins an actie once', async () => {
    const actie = actieIn('aangevraagd')
    const id = linkIn(actie, 'wacht', 2)
    const post = (site: number) => claude('POST', '/api/rows/actie_site', { actie_id: actie, site_id: site })
    const dup = await post(2)
    expect(refused(dup)).toBe(true)
    expect(JSON.stringify(dup.body)).toContain(UNIQUE)
    expect((await post(3)).status).toBe(201)
    const swap = await claude('PATCH', `/api/rows/actie_site/${id}`, { site_id: 3 })
    expect(JSON.stringify(swap.body)).toContain(UNIQUE)
    expect(link(id)).toMatchObject({ site_id: 2 })
  })

  test('Stefan drops a site before confirming', async () => {
    const id = linkIn(actieIn('voorbereid'), 'te_bevestigen')
    const klaar = await admin('PATCH', `/api/rows/actie_site/${id}`, { state: 'klaar' })
    expect(klaar.status).toBe(422)
    expect(JSON.stringify(klaar.body)).toContain('transition_not_allowed')
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
      await expectRefused(
        () => admin('PATCH', `/api/rows/actie_site/${id}`, { state: 'te_bevestigen' }),
        NO_PREVIEW,
        id,
      )
    }
  })

  test('a restore needs a preview and no resultaat', async () => {
    const actie = actieIn('voorbereid')
    for (const resultaat of ['mislukt', ' ']) {
      const id = plant('actie_site', {
        actie_id: actie,
        site_id: 2,
        state: 'overgeslagen',
        voorstel: PREVIEW,
        resultaat,
      })
      await expectRefused(() => patch(admin, id, { state: 'te_bevestigen' }), SKIPPED, id)
    }
    const clean = plant('actie_site', { actie_id: actie, site_id: 3, state: 'overgeslagen', voorstel: PREVIEW })
    expect((await patch(admin, clean, { state: 'te_bevestigen' })).status).toBe(200)
  })

  test('a service cannot restore a dropped link', async () => {
    const id = plant('actie_site', {
      actie_id: actieIn('voorbereid'),
      site_id: 2,
      state: 'overgeslagen',
      voorstel: PREVIEW,
    })
    await expectRefused(
      () =>
        claude('PATCH', `/api/rows/actie_site/${id}`, { state: 'te_bevestigen', expect: { state: 'overgeslagen' } }),
      SERVICE_RESTORE,
      id,
    )
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
    const id = plant('actie_site', { actie_id: actie, site_id: 2, state: 'te_bevestigen', voorstel: PREVIEW })
    const dropped = await admin('PATCH', `/api/rows/actie_site/${id}`, { state: 'overgeslagen' })
    expect(dropped.status).toBe(200)
    const batch = (dropped.body.revision as Body).batch_id
    const restore = (who: Send) => patch(who, id, { state: 'te_bevestigen', expect: { state: 'overgeslagen' } })

    sqlite.query('UPDATE actie SET status = ? WHERE id = ?').run('bevestigd', actie)
    await expectRefused(() => restore(admin), CONFIRMED, id)
    await expectRefused(() => admin('POST', `/api/batches/${batch}/undo`, {}), CONFIRMED, id)

    sqlite.query('UPDATE actie SET status = ? WHERE id = ?').run('bezig', actie)
    await expectRefused(() => restore(claude), SERVICE_RESTORE, id)
    const forward = await patch(admin, id, { state: 'bezig' })
    expect(forward.status).toBe(422)
    expect(JSON.stringify(forward.body)).toContain('transition_not_allowed')
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

  test('a person deletes a link only while the actie is aangevraagd', async () => {
    for (const status of ['voorbereiden', 'klaar']) {
      const id = linkIn(actieIn(status), 'wacht')
      await expectRefused(
        () => admin('DELETE', `/api/rows/actie_site/${id}`),
        status === 'klaar' ? CONFIRMED : CLOSED,
        id,
      )
    }
    const open = linkIn(actieIn('aangevraagd'), 'wacht')
    expect((await claude('DELETE', `/api/rows/actie_site/${open}`)).status).toBe(403)
    expect(link(open).deleted_at ?? null).toBeNull()
    expect((await admin('DELETE', `/api/rows/actie_site/${open}`)).status).toBe(200)
  })

  test('the worker writes results while bezig', async () => {
    const id = linkIn(actieIn('bezig'), 'bezig')
    const res = await claude('PATCH', `/api/rows/actie_site/${id}`, {
      state: 'klaar',
      resultaat: 'ok',
      expect: { state: 'bezig' },
    })
    expect(res.status).toBe(200)
    expect(link(id)).toMatchObject({
      state: 'klaar',
      resultaat: 'ok',
    })
  })

  test('bevestigd takes no change at all, not even a result', async () => {
    const id = linkIn(actieIn('bevestigd'), 'te_bevestigen')
    await expectRefused(() => claude('PATCH', `/api/rows/actie_site/${id}`, { resultaat: 'x' }), CONFIRMED, id)
  })

  test("the drawer's buttons are marked only in voorbereid", async () => {
    type Item = { id: number; available?: { buttons: { label: string }[] } }
    const labelsOf = async (actie: number, link: number) => {
      const rows = (await admin('GET', '/api/rows/actie?sort=id')).body.rows as {
        id: number
        links: { sites: Item[] }
      }[]
      const item = rows.find((r) => r.id === actie)?.links.sites.find((i) => i.id === link)
      return item?.available?.buttons.map((b) => b.label) ?? []
    }
    const actie = actieIn('voorbereid')
    const pending = plant('actie_site', { actie_id: actie, site_id: 2, state: 'te_bevestigen', voorstel: PREVIEW })
    const dropped = plant('actie_site', { actie_id: actie, site_id: 3, state: 'overgeslagen', voorstel: PREVIEW })
    const done = plant('actie_site', {
      actie_id: actie,
      site_id: 4,
      state: 'overgeslagen',
      voorstel: PREVIEW,
      resultaat: 'x',
    })
    expect(await labelsOf(actie, pending)).toEqual(['Niet nu'])
    expect(await labelsOf(actie, dropped)).toEqual(['Toch wel'])
    expect(await labelsOf(actie, done)).toEqual([])
    for (const status of ['voorbereiden', 'bevestigd', 'bezig']) {
      sqlite.query('UPDATE actie SET status = ? WHERE id = ?').run(status, actie)
      expect(await labelsOf(actie, pending)).toEqual([])
      expect(await labelsOf(actie, dropped)).toEqual([])
    }
  })
})

describe('who moves a link', () => {
  const planted = (status: string, state: string, extra: Body = {}) =>
    plant('actie_site', { actie_id: actieIn(status), site_id: 2, state, voorstel: PREVIEW, ...extra })

  test('a drop in voorbereid needs a person', async () => {
    const id = planted('voorbereid', 'te_bevestigen')
    await expectRefused(
      () => patch(claude, id, { state: 'overgeslagen', expect: { state: 'te_bevestigen' } }),
      FROZEN,
      id,
    )
  })

  test('a person drops or restores only in voorbereid', async () => {
    for (const [status, message] of [
      ['aangevraagd', BUTTONS],
      ['voorbereiden', BUTTONS],
      ['bevestigd', CONFIRMED],
      ['bezig', BUTTONS],
    ] as const) {
      const pending = planted(status, 'te_bevestigen')
      await expectRefused(() => patch(admin, pending, { state: 'overgeslagen' }), message, pending)
      const dropped = planted(status, 'overgeslagen')
      await expectRefused(() => patch(admin, dropped, { state: 'te_bevestigen' }), message, dropped)
    }
  })

  test('the worker skips at apply only in bezig', async () => {
    const skip = (id: number) => patch(claude, id, { state: 'overgeslagen', expect: { state: 'te_bevestigen' } })
    const applying = planted('bezig', 'te_bevestigen')
    expect((await skip(applying)).status).toBe(200)
    const preparing = planted('voorbereiden', 'te_bevestigen')
    await expectRefused(() => skip(preparing), SERVICE_SKIP, preparing)
    const preview = planted('voorbereid', 'te_bevestigen')
    await expectRefused(() => skip(preview), FROZEN, preview)
    for (const status of ['aangevraagd', 'voorbereiden', 'voorbereid', 'bevestigd', 'bezig']) {
      const id = planted(status, 'overgeslagen')
      const res = await patch(claude, id, { state: 'te_bevestigen', expect: { state: 'overgeslagen' } })
      expect(refused(res)).toBe(true)
      expect(link(id).state).toBe('overgeslagen')
    }
  })

  test('the worker writes the preview while voorbereiden', async () => {
    const actie = actieIn('voorbereiden')
    const id = plant('actie_site', { actie_id: actie, site_id: 2, state: 'wacht' })
    const res = await patch(claude, id, {
      voorstel: PREVIEW,
      samenvatting: '1 plugin: cache-plugin 1.9.0 → 1.9.2',
      state: 'te_bevestigen',
      expect: { state: 'wacht' },
    })
    expect(res.status).toBe(200)
    expect(link(id)).toMatchObject({ state: 'te_bevestigen', voorstel: PREVIEW })
    const skipped = plant('actie_site', { actie_id: actie, site_id: 3, state: 'wacht' })
    const skip = await patch(claude, skipped, {
      state: 'overgeslagen',
      resultaat: 'Geen updates',
      expect: { state: 'wacht' },
    })
    expect(skip.status).toBe(200)
    expect(link(skipped)).toMatchObject({ state: 'overgeslagen', resultaat: 'Geen updates' })
  })

  test('every service write of state sends expect', async () => {
    const id = planted('bezig', 'bezig')
    const res = await patch(claude, id, { state: 'klaar' })
    expect(res.status).toBe(400)
    expect(link(id).state).toBe('bezig')
  })
})
