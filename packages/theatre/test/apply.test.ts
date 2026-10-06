import { Database } from 'bun:sqlite'
import { beforeEach, describe, expect, test } from 'bun:test'
import { migrate, seedDomain } from '@worktable/engine'
import { signIn, testEngine } from '@worktable/engine/test/sign-in'
import theatre from '../src'

type Body = Record<string, unknown>
type Request = (method: string, path: string, body?: unknown) => Promise<{ status: number; body: Body }>

const LOTTE = { dataset: 'persoon', id: 1 }
const SPEELDAG = 1
const TWICE =
  'Deze speelreeks heeft al activiteiten. Maak de vorige toepassing ongedaan of verwijder die activiteiten, en pas het sjabloon dan opnieuw toe.'
const DAYS = ['2026-11-01', '2026-11-02', '2026-11-03', '2026-11-04']
const TIMED = [
  ['13:00', '14:00'],
  ['14:00', '17:30'],
  ['17:30', '18:30'],
  ['18:30', '20:00'],
  ['20:00', '21:15'],
  ['21:15', '22:15'],
]

let sqlite: Database
let editor: Request
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
  owner = requester(app, await signIn(app, 'owner', LOTTE))
})

async function reeks(): Promise<number> {
  const res = await editor('POST', '/api/rows/speelreeks', {
    productie_id: 1,
    naam: 'Tournee West',
    locatie_id: 3,
    start_datum: DAYS[0],
    eind_datum: DAYS[3],
  })
  expect(res.status).toBe(201)
  return res.body.id as number
}

const apply = (id: number, sjabloon_id = SPEELDAG, as = editor) =>
  as('POST', '/api/actions/sjabloon_toepassen', { id, input: { sjabloon_id } })

const live = (id: number) =>
  sqlite
    .query(
      'SELECT id, datum, start_at, eind_at, plandag, soort, omschrijving, productie_id, speelreeks_id, locatie_id, status FROM activiteit WHERE speelreeks_id = ? AND deleted_at IS NULL ORDER BY id',
    )
    .all(id) as Body[]

describe('sjabloon_toepassen', () => {
  test('a 4-day speelreeks gets the speeldag pattern on every day', async () => {
    const id = await reeks()
    const res = await apply(id)
    expect(res.status).toBe(201)
    const rows = live(id)
    expect(rows).toHaveLength(28)
    DAYS.forEach((day, d) => {
      const ofDay = rows.slice(d * 7, d * 7 + 7)
      expect(ofDay.slice(0, 6).map((r) => [r.start_at, r.eind_at])).toEqual(
        TIMED.map(([start, end]) => [`${day}T${start}`, `${day}T${end}`]),
      )
      expect(ofDay[6]).toMatchObject({ soort: 'overnachting', start_at: null, eind_at: null, plandag: day })
      for (const row of ofDay) {
        expect(row).toMatchObject({ datum: day, productie_id: 1, speelreeks_id: id, locatie_id: null, status: 'optie' })
      }
    })
  })

  test('every one inherits the venue in Dagplanning', async () => {
    const id = await reeks()
    await apply(id)
    const bron = sqlite
      .query(
        'SELECT d.locatie_id, d.locatie_bron FROM dagplanning d JOIN activiteit a ON a.id = d.id WHERE a.speelreeks_id = ?',
      )
      .all(id)
    expect(bron).toEqual(Array(28).fill({ locatie_id: 3, locatie_bron: 'speelreeks' }))
  })

  test('one batch for all 28, and the reply names them', async () => {
    const id = await reeks()
    const res = await apply(id)
    const created = res.body.created as { dataset: string; id: number }[]
    expect(created).toHaveLength(28)
    expect(created.every((c) => c.dataset === 'activiteit')).toBe(true)
    const batches = sqlite
      .query(
        `SELECT DISTINCT batch_id FROM revision WHERE entity = 'activiteit' AND record_id IN (${created.map((c) => c.id).join(',')})`,
      )
      .all()
    expect(batches).toEqual([{ batch_id: res.body.batch_id }])
    expect(sqlite.query('SELECT kind FROM batch WHERE key = ?').get(res.body.batch_id as string)).toEqual({
      kind: 'action',
    })
  })

  test('a second apply is refused with how to proceed', async () => {
    const id = await reeks()
    await apply(id)
    const res = await apply(id)
    expect({ status: res.status, code: res.body.code, message: res.body.message }).toEqual({
      status: 422,
      code: 'refused',
      message: TWICE,
    })
    expect(live(id)).toHaveLength(28)
  })

  test('one undo removes them all, and the reeks takes the template again', async () => {
    const id = await reeks()
    const res = await apply(id)
    const undo = await editor('POST', `/api/batches/${res.body.batch_id}/undo`, {})
    expect(undo.status).toBe(200)
    expect(live(id)).toHaveLength(0)
    expect((await apply(id)).status).toBe(201)
  })

  test('an offset_dag of 1 on the last day lands the day after eind_datum', async () => {
    const made = await editor('POST', '/api/rows/sjabloon', {
      naam: 'afbouw de dag erna',
      items: [
        {
          soort: 'afbouw',
          omschrijving: 'Afbouw',
          offset_dag: 1,
          start_tijd: '09:00',
          duur: 120,
          locatie_regel: 'speelreeks',
        },
      ],
    })
    expect(made.status).toBe(201)
    const id = await reeks()
    expect((await apply(id, made.body.id as number)).status).toBe(201)
    const last = live(id).at(-1)
    expect(last).toMatchObject({ datum: '2026-11-05', start_at: '2026-11-05T09:00', eind_at: '2026-11-05T11:00' })
  })

  test('a Sjabloon written around its writer is refused in Dutch before any create', async () => {
    const item = { soort: 'repetitie', omschrijving: 'Doorloop', offset_dag: 0, locatie_regel: 'eigen' }
    sqlite.run('INSERT INTO sjabloon (naam, items) VALUES (?, ?)', ['buiten de writer', JSON.stringify([item])])
    const sjabloon = (sqlite.query('SELECT MAX(id) AS id FROM sjabloon').get() as { id: number }).id
    const id = await reeks()
    const res = await apply(id, sjabloon)
    expect({ status: res.status, code: res.body.code, message: res.body.message }).toEqual({
      status: 422,
      code: 'refused',
      message: 'Item 1: ongeldige locatieregel.',
    })
    expect(live(id)).toHaveLength(0)
  })

  test('an owner is refused: speelreeks declares no owners', async () => {
    const id = await reeks()
    const res = await apply(id, SPEELDAG, owner)
    expect({ status: res.status, code: res.body.code }).toEqual({ status: 404, code: 'unknown_source' })
    expect(live(id)).toHaveLength(0)
  })

  test('undo is refused in_use once a Toewijzing points at one of them', async () => {
    const id = await reeks()
    const res = await apply(id)
    const [first] = res.body.created as { id: number }[]
    const added = await editor('POST', '/api/rows/toewijzing', { activiteit_id: first?.id, persoon_id: 2 })
    expect(added.status).toBe(201)
    const undo = await editor('POST', `/api/batches/${res.body.batch_id}/undo`, {})
    expect({ status: undo.status, code: undo.body.code }).toEqual({ status: 409, code: 'in_use' })
    expect(live(id)).toHaveLength(28)
  })
})

describe('undo by batch through the domain writers', () => {
  const row = (table: string, id: number, columns: string) =>
    sqlite.query(`SELECT ${columns} FROM ${table} WHERE id = ?`).get(id) as Body

  const MOVES = [
    { to: '2026-11-11T01:30', moved: { datum: '2026-11-11', plandag: '2026-11-10' } },
    { to: '2026-11-11T06:30', moved: { datum: '2026-11-11', plandag: '2026-11-11' } },
  ]

  for (const { to, moved } of MOVES) {
    test(`a day-line move to ${to} undoes to start_at, datum and plandag of before`, async () => {
      const made = await editor('POST', '/api/rows/activiteit', {
        productie_id: 1,
        soort: 'repetitie',
        start_at: '2026-11-10T23:30',
      })
      const id = made.body.id as number
      const before = row('activiteit', id, 'start_at, datum, plandag')
      expect(before).toEqual({ start_at: '2026-11-10T23:30', datum: '2026-11-10', plandag: '2026-11-10' })
      const res = await editor('PATCH', `/api/rows/activiteit/${id}`, { start_at: to })
      expect(res.status).toBe(200)
      expect(row('activiteit', id, 'start_at, datum, plandag')).toEqual({ start_at: to, ...moved })
      const undo = await editor('POST', `/api/batches/${(res.body.revision as Body).batch_id}/undo`, {})
      expect(undo.status).toBe(200)
      expect(row('activiteit', id, 'start_at, datum, plandag')).toEqual(before)
    })
  }

  test('a person-to-name switch on a Toewijzing restores the person and clears the name', async () => {
    const switched = await editor('PATCH', '/api/rows/toewijzing/1', { persoon_id: null, naam: 'Invaller' })
    expect(switched.status).toBe(200)
    const batch = (switched.body.revision as Body).batch_id
    const undo = await editor('POST', `/api/batches/${batch}/undo`, {})
    expect({ status: undo.status, message: undo.body.message }).toEqual({ status: 200, message: undefined })
    expect(row('toewijzing', 1, 'persoon_id, naam')).toEqual({ persoon_id: 1, naam: null })
  })
})
