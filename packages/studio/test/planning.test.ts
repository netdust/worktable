import { Database } from 'bun:sqlite'
import { beforeEach, describe, expect, test } from 'bun:test'
import { migrate, seedDomain } from '@worktable/engine'
import { createService } from '@worktable/engine/src/auth'
import { signIn, testEngine } from '@worktable/engine/test/sign-in'
import studio from '../src'

type Body = Record<string, unknown>
type Res = { status: number; body: Body }
type Send = (method: string, path: string, body?: Body) => Promise<Res>

const INTERN = 1
const KLANT = 2
const STUDIO_PROJECT = 1
const SHOP_PROJECT = 2

let app: ReturnType<typeof testEngine>
let sqlite: Database
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

const row = (table: string, id: number) => sqlite.query(`SELECT * FROM ${table} WHERE id = ?`).get(id) as Body
const count = (table: string) => (sqlite.query(`SELECT COUNT(*) AS n FROM ${table}`).get() as { n: number }).n
const created = async (dataset: string, send: Promise<Res>): Promise<Body> => {
  const res = await send
  expect(res.status).toBe(201)
  return row(dataset, res.body.id as number)
}
const feature = (values: Body) => claude('POST', '/api/rows/werkpakket', { naam: 'Feature', ...values })

async function refused(send: () => Promise<Res>, message: string): Promise<void> {
  const before = ['organisatie', 'project', 'werkpakket', 'taak', 'agendapunt'].map(count)
  const res = await send()
  expect({ status: res.status, message: res.body.message }).toEqual({ status: 422, message })
  expect(['organisatie', 'project', 'werkpakket', 'taak', 'agendapunt'].map(count)).toEqual(before)
}

describe('projects', () => {
  test('a project without a client belongs to Netdust', async () => {
    const res = await claude('POST', '/api/rows/project', { naam: 'Eigen tool' })
    expect(res.status).toBe(201)
    expect(row('project', res.body.id as number).organisatie_id).toBe(INTERN)
    const own = await claude('POST', '/api/rows/project', { naam: 'Klantwerk', organisatie_id: KLANT })
    expect(row('project', own.body.id as number).organisatie_id).toBe(KLANT)
  })
})

describe('features', () => {
  test('one row per repo and branch', async () => {
    const first = await feature({ project_id: SHOP_PROJECT, repo: '/srv/voorbeeld/shop', branch: 'feature/x' })
    expect(first.status).toBe(201)
    const message = 'Er is al een feature voor deze repo en branch.'
    await refused(
      () => feature({ project_id: SHOP_PROJECT, repo: '/srv/voorbeeld/shop', branch: 'feature/x' }),
      message,
    )
    expect(
      (await feature({ project_id: STUDIO_PROJECT, repo: '/srv/voorbeeld/studio', branch: 'feature/x' })).status,
    ).toBe(201)
    const other = await feature({ project_id: SHOP_PROJECT, repo: '/srv/voorbeeld/shop', branch: 'feature/y' })
    await refused(() => claude('PATCH', `/api/rows/werkpakket/${other.body.id}`, { branch: 'feature/x' }), message)
    expect((await claude('PATCH', `/api/rows/werkpakket/${first.body.id}`, { laatste_stap: 'Taak 2' })).status).toBe(
      200,
    )
  })

  test('a feature takes its repo from the project when it names none', async () => {
    const res = await feature({ project_id: SHOP_PROJECT, branch: 'feature/z' })
    expect(row('werkpakket', res.body.id as number).repo).toBe('/srv/voorbeeld/testmans-shop')
    const own = await feature({ project_id: SHOP_PROJECT, repo: '/srv/elders', branch: 'feature/z' })
    expect(row('werkpakket', own.body.id as number).repo).toBe('/srv/elders')
  })

  test('bijgewerkt moves on every write', async () => {
    const id = (await feature({ project_id: STUDIO_PROJECT, branch: 'feature/b' })).body.id as number
    expect(row('werkpakket', id).bijgewerkt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/)
    sqlite.query("UPDATE werkpakket SET bijgewerkt = '2026-01-01T09:00:00' WHERE id = ?").run(id)
    expect((await admin('PATCH', `/api/rows/werkpakket/${id}`, { laatste_stap: 'Taak 3 klaar' })).status).toBe(200)
    expect(String(row('werkpakket', id).bijgewerkt) > '2026-01-01T09:00:00').toBe(true)
  })

  test('nobody writes bijgewerkt by hand', async () => {
    const id = (await feature({ project_id: STUDIO_PROJECT, branch: 'feature/c' })).body.id as number
    const stamp = row('werkpakket', id).bijgewerkt
    await claude('PATCH', `/api/rows/werkpakket/${id}`, { bijgewerkt: '2030-01-01T00:00:00', laatste_stap: 'x' })
    expect(row('werkpakket', id).bijgewerkt).not.toBe('2030-01-01T00:00:00')
    expect(String(row('werkpakket', id).bijgewerkt) >= String(stamp)).toBe(true)
  })

  test("a werkpakket belongs to its project's client", async () => {
    const id = (await feature({ project_id: SHOP_PROJECT, branch: 'feature/d', organisatie_id: INTERN })).body
      .id as number
    expect(row('werkpakket', id).organisatie_id).toBe(KLANT)
    expect((await admin('PATCH', `/api/rows/werkpakket/${id}`, { project_id: STUDIO_PROJECT })).status).toBe(200)
    expect(row('werkpakket', id).organisatie_id).toBe(INTERN)
  })
})

describe('every record has a name', () => {
  test('titles and names are required', async () => {
    const cases: [string, Body, string][] = [
      ['organisatie', { naam: ' ' }, 'Een organisatie heeft een naam.'],
      ['project', { naam: '' }, 'Een project heeft een naam.'],
      ['werkpakket', { project_id: STUDIO_PROJECT, naam: '  ' }, 'Een feature heeft een naam.'],
      ['taak', { titel: '' }, 'Een taak heeft een titel.'],
      ['agendapunt', { titel: ' ', datum: '2026-10-26' }, 'Een agendapunt heeft een titel.'],
    ]
    for (const [dataset, body, message] of cases) {
      await refused(() => admin('POST', `/api/rows/${dataset}`, body), message)
      const key = 'naam' in body ? 'naam' : 'titel'
      await refused(() => admin('PATCH', `/api/rows/${dataset}/1`, { [key]: '' }), message)
    }
  })

  test('options are checked', async () => {
    const fase = await feature({ project_id: STUDIO_PROJECT, branch: 'feature/e', fase: 'ergens' })
    const soort = await admin('POST', '/api/rows/agendapunt', { titel: 'x', datum: '2026-10-26', soort: 'feest' })
    expect([fase.status, soort.status]).toEqual([400, 400])
    expect([fase.body.code, soort.body.code]).toEqual(['bad_value', 'bad_value'])
  })

  test('a person still creates and edits', async () => {
    expect(await created('taak', admin('POST', '/api/rows/taak', { titel: 'Bellen' }))).toMatchObject({
      titel: 'Bellen',
    })
    expect((await admin('PATCH', '/api/rows/organisatie/2', { naam: 'Bakkerij Testmans bv' })).status).toBe(200)
  })
})
