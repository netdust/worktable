import { Database } from 'bun:sqlite'
import { beforeEach, describe, expect, test } from 'bun:test'
import { migrate, seedDomain } from '@worktable/engine'
import { createService } from '@worktable/engine/src/auth'
import { signIn, testEngine } from '@worktable/engine/test/sign-in'
import studio from '../src'

type Body = Record<string, unknown>
type Res = { status: number; body: Body }
type Send = (method: string, path: string, body?: Body) => Promise<Res>

let app: ReturnType<typeof testEngine>
let sqlite: Database
let admin: Send
let worker: Send

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
  worker = sender({ authorization: `Bearer ${createService(sqlite, 'worker', 'editor')}` })
})

const row = (table: string, id: number) => sqlite.query(`SELECT * FROM ${table} WHERE id = ?`).get(id) as Body
const count = (table: string) => (sqlite.query(`SELECT COUNT(*) AS n FROM ${table}`).get() as { n: number }).n
const revisions = () => count('revision')

function expectRefused(res: Res, status: number, message: string): void {
  expect(res.status).toBe(status)
  expect(res.body.code).toBe(status === 403 ? 'forbidden' : 'refused')
  expect(JSON.stringify(res.body)).toContain(message)
}

const REGISTRY = 'Registry- en gezondheidsgegevens schrijft alleen de worker.'
const FROM_REGISTRY = 'Sites komen uit de registry.'
const LOG_FIXED = 'Het onderhoudslog verandert niet.'
const LOG_WORKER = 'Onderhoud schrijft alleen de worker.'
const NO_DELETE = 'Een serviceaccount verwijdert geen rijen.'

const synced = {
  naam: 'nieuwe-site',
  domein: 'nieuw.example',
  hosting: 'Voorbeeldhost',
  sla: true,
  risico: 'laag',
  health_markers: true,
  beheer: 'volledig',
  staging: false,
}

describe('site ownership', () => {
  test('a person cannot overwrite registry or health', async () => {
    const before = row('site', 1)
    const revs = revisions()
    const forbidden: Body[] = [
      { gezondheid: 'ok' },
      { laatste_check: '2026-01-01T10:00:00' },
      { sla: false },
      { naam: 'andere-naam' },
    ]
    for (const change of forbidden) expectRefused(await admin('PATCH', '/api/rows/site/1', change), 403, REGISTRY)
    expect(row('site', 1)).toEqual(before)
    expect(revisions()).toBe(revs)
    const allowed = { organisatie_id: 1, smoke_urls: '/kassa', notities: 'let op' }
    expect((await admin('PATCH', '/api/rows/site/1', allowed)).status).toBe(200)
    expect(row('site', 1)).toMatchObject(allowed)
  })

  test('sites come from the registry', async () => {
    const sites = count('site')
    expectRefused(await admin('POST', '/api/rows/site', synced), 403, FROM_REGISTRY)
    expectRefused(await admin('DELETE', '/api/rows/site/5'), 403, FROM_REGISTRY)
    expect(count('site')).toBe(sites)
    expect(row('site', 5).deleted_at ?? null).toBeNull()
    const res = await worker('POST', '/api/rows/site', synced)
    expect(res.status).toBe(201)
    expect(count('site')).toBe(sites + 1)
  })

  test('a site name is unique', async () => {
    const sites = count('site')
    expect((await worker('POST', '/api/rows/site', synced)).status).toBe(201)
    expectRefused(await worker('POST', '/api/rows/site', synced), 422, 'Er is al een site met deze naam.')
    expectRefused(
      await worker('PATCH', '/api/rows/site/2', { naam: 'testmans-winkel' }),
      422,
      'Er is al een site met deze naam.',
    )
    expect(count('site')).toBe(sites + 1)
  })
})

describe('a site without a name', () => {
  test('is a 400 from the engine, not a crash', async () => {
    const before = row('site', 2)
    const sites = count('site')
    const created = await worker('POST', '/api/rows/site', { ...synced, naam: null })
    const renamed = await worker('PATCH', '/api/rows/site/2', { naam: null })
    expect([created.status, renamed.status]).toEqual([400, 400])
    expect(row('site', 2)).toEqual(before)
    expect(count('site')).toBe(sites)
  })
})

describe('the maintenance log', () => {
  const entry = { site_id: 1, datum: '2026-10-01T09:00:00', soort: 'bijwerken', uitkomst: 'ok', samenvatting: 'Klaar' }

  async function logged(): Promise<number> {
    const res = await worker('POST', '/api/rows/onderhoud', entry)
    expect(res.status).toBe(201)
    return res.body.id as number
  }

  test('the log is append-only', async () => {
    const id = await logged()
    const before = row('onderhoud', id)
    const revs = revisions()
    for (const send of [admin, worker]) {
      expectRefused(await send('PATCH', `/api/rows/onderhoud/${id}`, { samenvatting: 'Anders' }), 403, LOG_FIXED)
      expectRefused(await send('DELETE', `/api/rows/onderhoud/${id}`), 403, LOG_FIXED)
    }
    expect(row('onderhoud', id)).toEqual(before)
    const logs = count('onderhoud')
    expectRefused(await admin('POST', '/api/rows/onderhoud', entry), 403, LOG_WORKER)
    expect(count('onderhoud')).toBe(logs)
    expect(revisions()).toBe(revs)
  })

  test("a log row belongs to its site's client", async () => {
    const site = row('site', 1).organisatie_id
    const other = site === 1 ? 2 : 1
    const res = await worker('POST', '/api/rows/onderhoud', { ...entry, organisatie_id: other })
    expect(res.status).toBe(201)
    expect(row('onderhoud', res.body.id as number).organisatie_id).toBe(site)
  })
})

describe('no service deletes a row', () => {
  test('a service cannot delete a site, an actie, a taak or a werkpakket', async () => {
    sqlite.run('DELETE FROM groep_lid WHERE site_id = 1')
    for (const dataset of ['site', 'actie', 'taak', 'werkpakket']) {
      const res = await worker('DELETE', `/api/rows/${dataset}/1`)
      expect(res.status).toBe(403)
      expect(JSON.stringify(res.body)).toContain(NO_DELETE)
      expect(row(dataset, 1).deleted_at ?? null).toBeNull()
    }
  })

  test("the sync's service removes a site from the SLA group", async () => {
    const member = sqlite.query('SELECT id FROM groep_lid WHERE groep_id = 2 LIMIT 1').get() as { id: number }
    expect((await worker('DELETE', `/api/rows/groep_lid/${member.id}`)).status).toBe(200)
  })
})
