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

function expectServiceOnly(res: Res): void {
  expect(res.status).toBe(403)
  expect(res.body.code).toBe('service_only')
}

function expectReadOnly(res: Res): void {
  expect(res.status).toBe(405)
  expect(res.body.code).toBe('read_only')
}

const LOG_FIXED = 'Het onderhoudslog verandert niet.'
const NO_DELETE = 'Een serviceaccount verwijdert geen rijen.'

const SLA_OWN = 'De SLA is van studio: de worker zet ze alleen bij een nieuwe site.'
const NAME_FIXED = 'De naam van een site ligt vast.'

const synced = { naam: 'nieuwe-site', sla: true, in_registry: true }

describe('site ownership', () => {
  test('a person writes no health column, naam or in_registry', async () => {
    const before = row('site', 1)
    const revs = revisions()
    const forbidden: Body[] = [
      { gezondheid: 'ok' },
      { laatste_check: '2026-01-01T10:00:00' },
      { naam: 'andere-naam' },
      { in_registry: false },
    ]
    for (const change of forbidden) expectServiceOnly(await admin('PATCH', '/api/rows/site/1', change))
    expect(row('site', 1)).toEqual(before)
    expect(revisions()).toBe(revs)
  })

  test('a person writes organisatie, sla, smoke URLs and notes', async () => {
    const changes: [Body, Body][] = [
      [{ organisatie_id: 1 }, { organisatie_id: 1 }],
      [{ sla: false }, { sla: 0 }],
      [{ smoke_urls: '/kassa' }, { smoke_urls: '/kassa' }],
      [{ notities: 'let op' }, { notities: 'let op' }],
    ]
    for (const [change, stored] of changes) {
      expect((await admin('PATCH', '/api/rows/site/1', change)).status).toBe(200)
      expect(row('site', 1)).toMatchObject(stored)
    }
  })

  test('a service writes sla only on create', async () => {
    const created = await worker('POST', '/api/rows/site', { ...synced, sla: true })
    expect(created.status).toBe(201)
    expect(row('site', created.body.id as number).sla).toBe(1)
    const before = row('site', 1)
    const revs = revisions()
    expectRefused(await worker('PATCH', '/api/rows/site/1', { sla: !before.sla }), 403, SLA_OWN)
    expect(row('site', 1)).toEqual(before)
    expect(revisions()).toBe(revs)
    const own = { organisatie_id: 2, smoke_urls: '/x', notities: 'n' }
    expect((await worker('PATCH', '/api/rows/site/1', own)).status).toBe(200)
    expect(row('site', 1)).toMatchObject(own)
  })

  test('sites come from the registry', async () => {
    const sites = count('site')
    expectServiceOnly(await admin('POST', '/api/rows/site', synced))
    expectReadOnly(await admin('DELETE', '/api/rows/site/5'))
    expect(count('site')).toBe(sites)
    expect(row('site', 5).deleted_at ?? null).toBeNull()
    const res = await worker('POST', '/api/rows/site', synced)
    expect(res.status).toBe(201)
    expect(count('site')).toBe(sites + 1)
  })

  test("the undo of the sync's site create answers 405 read_only, and the row stays", async () => {
    const created = await worker('POST', '/api/rows/site', synced)
    expect(created.status).toBe(201)
    const batch = (created.body.revision as Body).batch_id
    expectReadOnly(await worker('POST', `/api/batches/${batch}/undo`, {}))
    expect(row('site', created.body.id as number).deleted_at ?? null).toBeNull()
  })

  test('a site name is unique', async () => {
    const sites = count('site')
    expect((await worker('POST', '/api/rows/site', synced)).status).toBe(201)
    expectRefused(await worker('POST', '/api/rows/site', synced), 422, 'Er is al een site met deze naam.')
    expect(count('site')).toBe(sites + 1)
  })

  // The worker finds a confirmed link's production site by its name, so a rename would point it at another site.
  test("a site's naam never changes after create, for a service too", async () => {
    const before = row('site', 2)
    const revs = revisions()
    expectRefused(await worker('PATCH', '/api/rows/site/2', { naam: 'tmp-x' }), 422, NAME_FIXED)
    expectRefused(await worker('PATCH', '/api/rows/site/2', { naam: 'testmans-winkel' }), 422, NAME_FIXED)
    expectServiceOnly(await admin('PATCH', '/api/rows/site/2', { naam: 'tmp-x' }))
    expect(row('site', 2)).toEqual(before)
    expect(revisions()).toBe(revs)
  })

  test("the sync's PATCH with the same naam answers 200", async () => {
    const res = await worker('PATCH', '/api/rows/site/2', { naam: 'testmans-bestel', gezondheid: 'ok' })
    expect(res.status).toBe(200)
    expect(row('site', 2)).toMatchObject({ naam: 'testmans-bestel', gezondheid: 'ok' })
  })
})

describe('a site without a name', () => {
  test('is refused, not a crash', async () => {
    const before = row('site', 2)
    const sites = count('site')
    const created = await worker('POST', '/api/rows/site', { ...synced, naam: null })
    const renamed = await worker('PATCH', '/api/rows/site/2', { naam: null })
    expect([created.status, renamed.status]).toEqual([400, 422])
    expectRefused(renamed, 422, NAME_FIXED)
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
    expectServiceOnly(await admin('PATCH', `/api/rows/onderhoud/${id}`, { samenvatting: 'Anders' }))
    expectRefused(await worker('PATCH', `/api/rows/onderhoud/${id}`, { samenvatting: 'Anders' }), 403, LOG_FIXED)
    for (const send of [admin, worker]) expectReadOnly(await send('DELETE', `/api/rows/onderhoud/${id}`))
    expect(row('onderhoud', id)).toEqual(before)
    const logs = count('onderhoud')
    expectServiceOnly(await admin('POST', '/api/rows/onderhoud', entry))
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
  test('a service cannot delete an actie, a taak or a werkpakket, nor a site', async () => {
    const bare = Number(
      sqlite.query(`INSERT INTO actie (titel, soort, status) VALUES ('x', 'bijwerken', 'aangevraagd')`).run()
        .lastInsertRowid,
    )
    expectReadOnly(await worker('DELETE', '/api/rows/site/1'))
    expect(row('site', 1).deleted_at ?? null).toBeNull()
    const targets: [string, number][] = [
      ['actie', bare],
      ['taak', 1],
      ['werkpakket', 1],
    ]
    for (const [dataset, id] of targets) {
      const res = await worker('DELETE', `/api/rows/${dataset}/${id}`)
      expect(res.status).toBe(403)
      expect(JSON.stringify(res.body)).toContain(NO_DELETE)
      expect(row(dataset, id).deleted_at ?? null).toBeNull()
    }
  })
})
