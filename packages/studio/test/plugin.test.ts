import { Database } from 'bun:sqlite'
import { beforeEach, describe, expect, test } from 'bun:test'
import { migrate, seedDomain } from '@worktable/engine'
import { createService } from '@worktable/engine/src/auth'
import { signIn, testEngine } from '@worktable/engine/test/sign-in'
import studio from '../src'

type Body = Record<string, unknown>
type Send = (method: string, path: string, body?: Body) => Promise<{ status: number; body: Body }>

let sqlite: Database
let admin: Send
let editor: Send
let worker: Send
let claude: Send

const sender =
  (app: ReturnType<typeof testEngine>, auth: Record<string, string>): Send =>
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
  const app = testEngine(sqlite, studio)
  admin = sender(app, { cookie: await signIn(app, 'administrator') })
  editor = sender(app, { cookie: await signIn(app, 'editor') })
  worker = sender(app, { authorization: `Bearer ${createService(sqlite, 'worker', 'editor')}` })
  claude = sender(app, { authorization: `Bearer ${createService(sqlite, 'claude', 'editor')}` })
})

const WITH = 1
const WITHOUT = 2
const rows = (sql: string, ...args: unknown[]) => sqlite.query(sql).all(...(args as never[])) as Body[]
const lastActie = () => (sqlite.query('SELECT MAX(id) AS id FROM actie').get() as { id: number }).id
const linksOf = (actie: number) =>
  rows('SELECT site_id, state, resultaat, samenvatting FROM actie_site WHERE actie_id = ? ORDER BY site_id', actie)
const selection = (who: Send, action: string, ids: number[]) => who('POST', `/api/actions/${action}`, { ids })
const statusOf = (id: number) => (rows('SELECT status FROM actie WHERE id = ?', id)[0] as Body).status
const move = (who: Send, id: number, from: string, to: string) =>
  who('PATCH', `/api/rows/actie/${id}`, { status: to, expect: { status: from } })

describe('the plugin on a site', () => {
  test('the seed has two sites with the plugin and the rest without', () => {
    expect(rows('SELECT id FROM site WHERE plugin = 1 ORDER BY id').map((r) => r.id)).toEqual([1, 3])
  })

  test('a person writes bekende_admins but not admins', async () => {
    expect((await editor('PATCH', `/api/rows/site/${WITH}`, { bekende_admins: 'beheer' })).status).toBe(200)
    const refused = await editor('PATCH', `/api/rows/site/${WITH}`, { admins: 'x · nu' })
    expect(refused.status).toBe(403)
    expect(refused.body.code).toBe('service_only')
  })

  test('the worker writes the plugin reads', async () => {
    const reads = {
      plugin: true,
      plugin_versie: '1.2.0',
      db_versie: '12',
      admins: 'beheer · 2026-10-01',
      core_bestanden: 'ok',
    }
    expect((await worker('PATCH', `/api/rows/site/${WITHOUT}`, reads)).status).toBe(200)
    expect((await worker('PATCH', `/api/rows/site/${WITHOUT}`, { core_bestanden: 'raar' })).status).toBe(400)
  })
})

describe('actie soorten', () => {
  test('install and maintenance take the voorbereiden path, the others do not', async () => {
    for (const [action, fits] of [
      ['plugin_installeren', true],
      ['onderhoudsmodus_aan', true],
      ['onderhoudsmodus_uit', true],
      ['cache_legen', false],
      ['cron_draaien', false],
    ] as const) {
      const res = await selection(admin, action, [WITH])
      expect(res.status).toBe(201)
      const id = lastActie()
      expect((await move(worker, id, 'aangevraagd', 'voorbereiden')).status).toBe(fits ? 200 : 422)
    }
  })

  test('install and maintenance wait at voorbereid until an administrator confirms', async () => {
    for (const action of ['plugin_installeren', 'onderhoudsmodus_aan', 'onderhoudsmodus_uit']) {
      await selection(editor, action, [WITH])
      const id = lastActie()
      await move(worker, id, 'aangevraagd', 'voorbereiden')
      expect((await move(worker, id, 'voorbereiden', 'voorbereid')).status).toBe(200)
      expect((await move(worker, id, 'voorbereid', 'bezig')).status).toBe(422)
      const refused = await move(editor, id, 'voorbereid', 'bevestigd')
      expect([refused.status, refused.body.code]).toEqual([422, 'transition_not_allowed'])
      expect(statusOf(id)).toBe('voorbereid')
      expect((await move(admin, id, 'voorbereid', 'bevestigd')).status).toBe(200)
      expect((await move(worker, id, 'bevestigd', 'bezig')).status).toBe(200)
    }
  })

  test('a confirmed install can run its confirmed site', async () => {
    await selection(admin, 'plugin_installeren', [WITH])
    const id = lastActie()
    const [link] = rows('SELECT id FROM actie_site WHERE actie_id = ?', id)
    const site = (state: string, from: string) =>
      worker('PATCH', `/api/rows/actie_site/${link?.id}`, { state, expect: { state: from } })
    await move(worker, id, 'aangevraagd', 'voorbereiden')
    expect((await site('te_bevestigen', 'wacht')).status).toBe(200)
    await move(worker, id, 'voorbereiden', 'voorbereid')
    await move(admin, id, 'voorbereid', 'bevestigd')
    await move(worker, id, 'bevestigd', 'bezig')
    expect((await site('bezig', 'te_bevestigen')).status).toBe(200)
  })
})

describe('Inloggen', () => {
  test('creates one inloggen actie with one link, as an administrator', async () => {
    const res = await admin('POST', '/api/actions/inloggen', { id: WITH })
    expect(res.status).toBe(201)
    const id = lastActie()
    expect(rows('SELECT soort, status FROM actie WHERE id = ?', id)).toEqual([
      { soort: 'inloggen', status: 'aangevraagd' },
    ])
    expect(linksOf(id)).toEqual([{ site_id: WITH, state: 'wacht', resultaat: null, samenvatting: null }])
  })

  test('is served as a head action with a handoff', async () => {
    const schema = await admin('GET', '/api/schema')
    const site = (schema.body.sources as Record<string, { actions: Body[] }>).site
    const served = site?.actions.find((a) => a.name === 'inloggen')
    expect(served).toMatchObject({ label: 'Inloggen', head: { icon: 'log-in' }, handoff: true, conditional: true })
    expect(served?.many).toBeUndefined()
  })

  test('is refused to an editor and to a service, and nothing is created', async () => {
    const before = lastActie()
    expect((await editor('POST', '/api/actions/inloggen', { id: WITH })).status).toBe(403)
    expect((await claude('POST', '/api/actions/inloggen', { id: WITH })).status).toBe(403)
    expect((await worker('POST', '/api/actions/inloggen', { id: WITH })).status).toBe(403)
    expect(lastActie()).toBe(before)
  })

  test('cannot be made by a plain create either', async () => {
    const body = { soort: 'inloggen', titel: 'Inloggen' }
    expect((await editor('POST', '/api/rows/actie', body)).status).toBe(403)
    expect((await claude('POST', '/api/rows/actie', body)).status).toBe(403)
  })

  test('is refused 422 condition_not_met on a site without the plugin', async () => {
    const before = lastActie()
    const res = await admin('POST', '/api/actions/inloggen', { id: WITHOUT })
    expect(res.status).toBe(422)
    expect(res.body.code).toBe('condition_not_met')
    expect(lastActie()).toBe(before)
  })
})

describe('the selection actions', () => {
  const names = ['plugin_installeren', 'cache_legen', 'cron_draaien', 'onderhoudsmodus_aan', 'onderhoudsmodus_uit']

  test('each creates its soort with a link per site', async () => {
    for (const name of names) {
      const res = await selection(admin, name, [WITH, 3])
      expect(res.status).toBe(201)
      const [actie] = rows('SELECT soort, titel FROM actie WHERE id = ?', lastActie())
      expect(actie?.soort).toBe(name)
      expect(linksOf(lastActie()).map((l) => [l.site_id, l.state])).toEqual([
        [1, 'wacht'],
        [3, 'wacht'],
      ])
    }
  })

  test('a site without the plugin gets its link skipped, the others run', async () => {
    for (const name of ['cache_legen', 'cron_draaien', 'onderhoudsmodus_aan', 'onderhoudsmodus_uit']) {
      await selection(admin, name, [WITH, WITHOUT])
      expect(linksOf(lastActie())).toEqual([
        { site_id: WITH, state: 'wacht', resultaat: null, samenvatting: null },
        { site_id: WITHOUT, state: 'overgeslagen', resultaat: 'geen plugin', samenvatting: 'Geen studio-plugin' },
      ])
    }
  })

  test('with no plugin site at all, all but the install are refused', async () => {
    for (const name of ['cache_legen', 'cron_draaien', 'onderhoudsmodus_aan', 'onderhoudsmodus_uit']) {
      const before = lastActie()
      const res = await selection(admin, name, [WITHOUT, 4])
      expect(res.status).toBe(422)
      expect(JSON.stringify(res.body)).toContain('Geen van deze sites heeft de studio-plugin.')
      expect(lastActie()).toBe(before)
    }
    expect((await selection(admin, 'plugin_installeren', [WITHOUT, 4])).status).toBe(201)
  })

  test('a site gone from the registry is skipped as before, with its own reason', async () => {
    await selection(admin, 'plugin_installeren', [WITH, 5])
    expect(linksOf(lastActie()).map((l) => [l.site_id, l.state, l.samenvatting])).toEqual([
      [1, 'wacht', null],
      [5, 'overgeslagen', 'Niet meer in de registry'],
    ])
  })

  test('the actions are served as selection actions without a when', async () => {
    const schema = await admin('GET', '/api/schema')
    const site = (schema.body.sources as Record<string, { actions: Body[] }>).site
    for (const [name, label] of [
      ['plugin_installeren', 'Studio-plugin installeren'],
      ['cache_legen', 'Cache legen'],
      ['cron_draaien', 'Cron draaien'],
      ['onderhoudsmodus_aan', 'Onderhoudsmodus aan'],
      ['onderhoudsmodus_uit', 'Onderhoudsmodus uit'],
    ]) {
      const served = site?.actions.find((a) => a.name === name)
      expect(served).toMatchObject({ label, many: true, opens: true })
      expect(served?.conditional).toBeUndefined()
    }
  })
})
