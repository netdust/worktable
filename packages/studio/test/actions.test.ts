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
  claude = sender(app, { authorization: `Bearer ${createService(sqlite, 'claude', 'editor')}` })
})

const run = (who: Send, action: string, ids: number[]) => who('POST', `/api/actions/${action}`, { ids })
const rows = (sql: string, ...args: unknown[]) => sqlite.query(sql).all(...(args as never[])) as Body[]
const maxActie = () => (sqlite.query('SELECT MAX(id) AS id FROM actie').get() as { id: number }).id
const linksOf = (actie: number) =>
  rows('SELECT site_id, state, resultaat, samenvatting FROM actie_site WHERE actie_id = ? ORDER BY site_id', actie)

describe('selection actions on site', () => {
  test('a health check on three selected sites is one request with three links, in one batch', async () => {
    const before = maxActie()
    const res = await run(admin, 'gezondheidscheck', [2, 3, 4])
    expect(res.status).toBe(201)
    const [actie] = rows('SELECT * FROM actie WHERE id > ?', before)
    expect(actie).toMatchObject({
      soort: 'gezondheidscheck',
      status: 'aangevraagd',
      titel: 'Gezondheidscheck · 3 sites',
    })
    const links = linksOf(actie?.id as number)
    expect(links.map((l) => [l.site_id, l.state])).toEqual([
      [2, 'wacht'],
      [3, 'wacht'],
      [4, 'wacht'],
    ])
    const undo = await admin('POST', `/api/batches/${res.body.batch_id}/undo`, {})
    expect(undo.status).toBe(200)
    expect(rows('SELECT id FROM actie WHERE id > ? AND deleted_at IS NULL', before)).toEqual([])
    expect(rows('SELECT id FROM actie_site WHERE actie_id = ? AND deleted_at IS NULL', actie?.id)).toEqual([])
  })

  test('one site from its drawer', async () => {
    const before = maxActie()
    const res = await run(admin, 'gezondheidscheck', [2])
    expect(res.status).toBe(201)
    const [actie] = rows('SELECT * FROM actie WHERE id > ?', before)
    expect(actie?.titel).toBe('Gezondheidscheck · testmans-bestel')
    expect(linksOf(actie?.id as number)).toHaveLength(1)
  })

  test('the result opens', async () => {
    const before = maxActie()
    const res = await run(admin, 'malwarescan', [1, 2])
    const created = res.body.created as { dataset: string; id: number }[]
    expect(created[0]).toEqual({ dataset: 'actie', id: before + 1 })
    const schema = await admin('GET', '/api/schema')
    const site = (schema.body.sources as Record<string, { actions: Body[] }>).site
    const served = Object.fromEntries((site?.actions ?? []).map((a) => [a.name, a]))
    for (const [name, label] of [
      ['gezondheidscheck', 'Gezondheid checken'],
      ['malwarescan', 'Malware scannen'],
      ['bijwerken', 'Bijwerken'],
      ['smoketest', 'Smoketest draaien'],
    ]) {
      expect(served[name as string]).toMatchObject({ label, many: true, opens: true })
    }
  })

  test('a site gone from the registry is skipped in a request', async () => {
    const before = maxActie()
    await run(admin, 'gezondheidscheck', [3, 5])
    expect(linksOf(before + 1)).toEqual([
      { site_id: 3, state: 'wacht', resultaat: null, samenvatting: null },
      { site_id: 5, state: 'overgeslagen', resultaat: 'niet in registry', samenvatting: 'Niet meer in de registry' },
    ])
    await run(admin, 'bijwerken', [1, 2])
    expect(linksOf(before + 2).map((l) => l.state)).toEqual(['wacht', 'wacht'])
  })

  test('a service can start a request on ids', async () => {
    const before = maxActie()
    const res = await run(claude, 'smoketest', [2, 3])
    expect(res.status).toBe(201)
    expect(rows('SELECT titel FROM actie WHERE id > ?', before)).toEqual([{ titel: 'Smoketest · 2 sites' }])
  })

  test('every request from an action carries a titel', async () => {
    for (const name of ['gezondheidscheck', 'malwarescan', 'bijwerken', 'smoketest']) {
      for (const ids of [[2], [2, 3]]) {
        const before = maxActie()
        expect((await run(admin, name, ids)).status).toBe(201)
        const [actie] = rows('SELECT titel FROM actie WHERE id > ?', before)
        expect(String(actie?.titel).trim()).not.toBe('')
      }
    }
  })
})
