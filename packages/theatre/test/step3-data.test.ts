import { Database } from 'bun:sqlite'
import { beforeEach, describe, expect, test } from 'bun:test'
import { migrate, seedDomain } from '@worktable/engine'
import { signIn, testEngine } from '@worktable/engine/test/sign-in'
import theatre from '../src'

type Body = Record<string, unknown>
type Request = (method: string, path: string, body?: unknown) => Promise<{ status: number; body: Body }>

const LOTTE = { dataset: 'persoon', id: 1 }

let sqlite: Database
let editor: Request
let admin: Request
let owner: Request

function requester(app: ReturnType<typeof testEngine>, cookie: string): Request {
  return async (method, path, body) => {
    const headers: Record<string, string> = { host: '127.0.0.1:4310', cookie }
    if (body !== undefined) headers['content-type'] = 'application/json'
    const res = await app.request(path, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    })
    return { status: res.status, body: (await res.json()) as Body }
  }
}

beforeEach(async () => {
  sqlite = new Database(':memory:')
  migrate(sqlite, theatre)
  seedDomain(sqlite, theatre)
  const app = testEngine(sqlite, theatre)
  editor = requester(app, await signIn(app, 'editor'))
  admin = requester(app, await signIn(app, 'administrator'))
  owner = requester(app, await signIn(app, 'owner', LOTTE))
})

const NEW_ROL = { persoon_id: 2, rol_id: 3, dagtarief: 250 }
const AFWEZIG = { persoon_id: 1, start_at: '2026-10-20T09:00', eind_at: '2026-10-20T17:00' }

describe('persoon_rol', () => {
  test('an editor cannot set a rate; an administrator can', async () => {
    const refused = await editor('POST', '/api/rows/persoon_rol', NEW_ROL)
    expect({ status: refused.status, message: refused.body.message }).toEqual({
      status: 403,
      message: 'Alleen een beheerder wijzigt tarieven.',
    })
    expect((await editor('POST', '/api/rows/persoon_rol', { persoon_id: 2, rol_id: 3 })).status).toBe(201)
    expect((await admin('POST', '/api/rows/persoon_rol', { ...NEW_ROL, persoon_id: 3, rol_id: 4 })).status).toBe(201)
  })

  // An administrator's rate stays with the person and role it was set for (review SS-S1).
  test('an editor cannot move or delete a row that carries a rate', async () => {
    const rated = await admin('POST', '/api/rows/persoon_rol', { ...NEW_ROL, persoon_id: 3, rol_id: 4 })
    const id = rated.body.id as number
    const moved = await editor('PATCH', `/api/rows/persoon_rol/${id}`, { persoon_id: 5 })
    const dropped = await editor('DELETE', `/api/rows/persoon_rol/${id}`)
    expect([moved.status, moved.body.message, dropped.status, dropped.body.message]).toEqual([
      403,
      'Alleen een beheerder wijzigt tarieven.',
      403,
      'Alleen een beheerder wijzigt tarieven.',
    ])
    expect((await editor('PATCH', `/api/rows/persoon_rol/${id}`, { voorkeur: true })).status).toBe(200)
    const plain = await editor('POST', '/api/rows/persoon_rol', { persoon_id: 2, rol_id: 3 })
    expect((await editor('PATCH', `/api/rows/persoon_rol/${plain.body.id}`, { rol_id: 4 })).status).toBe(200)
  })

  test('one persoon_rol per person and role', async () => {
    const res = await editor('POST', '/api/rows/persoon_rol', { persoon_id: 2, rol_id: 1 })
    expect({ status: res.status, message: res.body.message }).toEqual({
      status: 422,
      message: 'Deze persoon heeft deze rol al.',
    })
  })

  test('voorkeur defaults to false', async () => {
    const res = await editor('POST', '/api/rows/persoon_rol', { persoon_id: 2, rol_id: 3 })
    expect(res.body.voorkeur).toBe(false)
  })
})

describe('beschikbaarheid soort', () => {
  test('without soort it is afwezig', async () => {
    const res = await editor('POST', '/api/rows/beschikbaarheid', AFWEZIG)
    expect({ status: res.status, soort: res.body.soort }).toEqual({ status: 201, soort: 'afwezig' })
  })

  test('an owner sets soort on its own beschikbaarheid', async () => {
    const res = await owner('PATCH', '/api/rows/beschikbaarheid/3', { soort: 'onzeker' })
    expect(res.status).toBe(200)
    expect(res.body.soort).toBe('onzeker')
  })

  test('an owner cannot set soort outside its options on its own beschikbaarheid', async () => {
    const res = await owner('PATCH', '/api/rows/beschikbaarheid/3', { soort: 'vakantie' })
    expect(res.status).toBe(422)
    expect(sqlite.query('SELECT soort FROM beschikbaarheid WHERE id = 3').get()).toEqual({ soort: 'afwezig' })
  })
})

describe('taak', () => {
  test.each(['persoon_rol', 'taak'])('an owner cannot read %s', async (source) => {
    expect((await owner('GET', `/api/rows/${source}`)).status).toBe(404)
  })

  test('refuses a status outside open, gedaan', async () => {
    const res = await editor('POST', '/api/rows/taak', { titel: 'X', status: 'bezig' })
    expect(res.status).toBe(422)
  })

  test('refuses a gekoppeld_aan outside its options', async () => {
    const res = await editor('POST', '/api/rows/taak', { titel: 'X', gekoppeld_aan: 'persoon' })
    expect(res.status).toBe(422)
  })

  test('is created open', async () => {
    const res = await editor('POST', '/api/rows/taak', { titel: 'X', gekoppeld_aan: 'productie', record_id: 1 })
    expect({ status: res.status, state: res.body.status }).toEqual({ status: 201, state: 'open' })
  })
})

describe('the step 3 seeds', () => {
  const one = (sql: string) => sqlite.query(sql).get() as Record<string, unknown>

  test('the own organisation carries the planning parameters', () => {
    const { parameters } = one("SELECT parameters FROM organisatie WHERE soort = 'eigen'")
    expect(JSON.parse(parameters as string)).toEqual({
      dag_grens_uur: 5,
      waarschuwingshorizon_dagen: 14,
      bevestigingstermijn_dagen: 7,
    })
  })

  test('A-dubbel overlaps activity 1 and keeps its own words', () => {
    expect(one("SELECT * FROM activiteit WHERE omschrijving = 'perspresentatie Gent'")).toMatchObject({
      id: 27,
      productie_id: 2,
      soort: 'vergadering',
      start_at: '2026-10-12T10:00',
      eind_at: '2026-10-12T11:00',
      status: 'bevestigd',
      plaats: 'Gent',
    })
    expect(one("SELECT count(*) AS n FROM activiteit WHERE omschrijving = 'vergadering Gent'")).toEqual({ n: 1 })
  })

  test('the appended toewijzingen', () => {
    const rows = sqlite
      .query('SELECT activiteit_id, persoon_id, rol_id, aantal, state FROM toewijzing WHERE id > 6')
      .all()
    expect(rows).toEqual([
      { activiteit_id: 13, persoon_id: 1, rol_id: null, aantal: 1, state: 'voorlopig' },
      { activiteit_id: 16, persoon_id: 3, rol_id: null, aantal: 1, state: 'bevestigd' },
      { activiteit_id: 15, persoon_id: 4, rol_id: null, aantal: 1, state: 'voorlopig' },
      { activiteit_id: 15, persoon_id: null, rol_id: 1, aantal: 1, state: 'open' },
      { activiteit_id: 26, persoon_id: 1, rol_id: null, aantal: 1, state: 'voorlopig' },
    ])
  })

  test("Bram's onzeker, the persoon_rol rows and the taken", () => {
    expect(one("SELECT * FROM beschikbaarheid WHERE soort = 'onzeker'")).toMatchObject({
      persoon_id: 2,
      start_at: '2026-10-12T20:00',
      eind_at: '2026-10-12T23:00',
    })
    expect(sqlite.query('SELECT persoon_id, rol_id, dagtarief, voorkeur FROM persoon_rol ORDER BY id').all()).toEqual([
      { persoon_id: 2, rol_id: 1, dagtarief: null, voorkeur: 1 },
      { persoon_id: 1, rol_id: 1, dagtarief: null, voorkeur: 0 },
      { persoon_id: 3, rol_id: 1, dagtarief: null, voorkeur: 0 },
      { persoon_id: 4, rol_id: 1, dagtarief: null, voorkeur: 0 },
      { persoon_id: 3, rol_id: 2, dagtarief: 300, voorkeur: 0 },
    ])
    expect(sqlite.query('SELECT toegewezen_aan, deadline, status FROM taak ORDER BY id').all()).toEqual([
      { toegewezen_aan: 1, deadline: '2026-10-16', status: 'open' },
      { toegewezen_aan: null, deadline: '2026-10-09', status: 'gedaan' },
    ])
  })
})
