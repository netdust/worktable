import { Database } from 'bun:sqlite'
import { beforeEach, describe, expect, test } from 'bun:test'
import { migrate, seedDomain } from '@worktable/engine'
import { signIn, testEngine } from '@worktable/engine/test/sign-in'
import theatre from '../src'

type Body = Record<string, unknown>
type Row = Record<string, unknown>
type Request = (method: string, path: string, body?: unknown) => Promise<{ status: number; body: Body }>

const LOTTE = 1
const BRAM = 2
const NOOR = 3
const SAM = 4
const SPELER = 1
const LICHTTECHNICUS = 2
const SLOT = 10
const NOOR_ON_16 = 8
const SAM_INVITED = 5
const QUERIES = ['conflicten', 'persoon_dag', 'locatie_dag', 'kandidaten', 'werklijst']

let sqlite: Database
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
  admin = requester(app, await signIn(app, 'administrator'))
  owner = requester(app, await signIn(app, 'owner', { dataset: 'persoon', id: LOTTE }))
})

// SQL's today is the server's local date, as $period reads it.
const localDay = (offset: number): string => {
  const d = new Date()
  d.setDate(d.getDate() + offset)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}
const daysAgoIso = (n: number) => new Date(Date.now() - n * 86_400_000).toISOString()

async function rows(source: string, filter?: Body, sort?: string): Promise<Row[]> {
  const params = new URLSearchParams({ limit: '500' })
  if (filter) params.set('filter', JSON.stringify(filter))
  if (sort) params.set('sort', sort)
  const res = await admin('GET', `/api/rows/${source}?${params}`)
  expect(res.status).toBe(200)
  return res.body.rows as Row[]
}

async function create(dataset: string, body: Body): Promise<number> {
  const res = await admin('POST', `/api/rows/${dataset}`, body)
  expect({ dataset, status: res.status, body: res.status === 201 ? null : res.body }).toEqual({
    dataset,
    status: 201,
    body: null,
  })
  return res.body.id as number
}

async function patch(dataset: string, id: number, body: Body): Promise<void> {
  const res = await admin('PATCH', `/api/rows/${dataset}/${id}`, body)
  expect({ dataset, id, status: res.status }).toEqual({ dataset, id, status: 200 })
}

type Plan = { soort?: string; datum: string; start_at?: string; eind_at?: string; productie_id?: number }
const activity = (plan: Plan) =>
  create('activiteit', { productie_id: 1, soort: 'repetitie', status: 'bevestigd', ...plan })

let people = 0
const newPerson = () => create('persoon', { voornaam: `Proef${++people}`, achternaam: 'Persoon' })
const assign = (activiteit_id: number, persoon_id: number, state = 'voorlopig') =>
  create('toewijzing', { activiteit_id, persoon_id, state })

async function conflictsOf(persoon_id: number): Promise<Row[]> {
  return (await rows('conflicten')).filter((c) => c.persoon_id === persoon_id)
}

describe('conflicten', () => {
  test('conflicten lists one row per seeded type', async () => {
    const seeded = new Set((await rows('conflicten')).map((c) => c.type))
    for (const type of ['overlap', 'afwezig', 'onzeker', 'locatie_dubbel']) expect(seeded).toContain(type)

    const soon = await activity({ datum: localDay(1) })
    const slot = await create('toewijzing', { activiteit_id: soon, rol_id: SPELER })
    sqlite.run('UPDATE toewijzing SET created_at = ? WHERE id = ?', [daysAgoIso(30), SAM_INVITED])

    const all = await rows('conflicten')
    expect(new Set(all.map((c) => c.type)).size).toBe(6)
    expect(all.find((c) => c.type === 'open_slot' && c.toewijzing_id === slot)).toMatchObject({
      ernst: 'conflict',
      persoon_id: null,
    })
    expect(all.find((c) => c.type === 'onbevestigd')).toMatchObject({ toewijzing_id: SAM_INVITED, persoon_id: SAM })
    expect(new Set(all.map((c) => c.id)).size).toBe(all.length)
    expect(all.every((c) => Number.isSafeInteger(c.id))).toBe(true)
  })

  test('a fresh invitation in the revision log is not yet onbevestigd, an old one is', async () => {
    sqlite.run('UPDATE toewijzing SET created_at = ? WHERE id = 7', [daysAgoIso(30)])
    await patch('toewijzing', 7, { state: 'uitgenodigd' })
    const onbevestigd = async () => (await rows('conflicten')).filter((c) => c.type === 'onbevestigd')
    expect((await onbevestigd()).map((c) => c.toewijzing_id)).not.toContain(7)
    sqlite.run("UPDATE revision SET at = ? WHERE entity = 'toewijzing' AND record_id = 7", [daysAgoIso(8)])
    expect((await onbevestigd()).map((c) => c.toewijzing_id)).toContain(7)
  })

  describe('the untimed rule', () => {
    async function overlapOf(a: Plan, b: Plan): Promise<Row[]> {
      const p = await newPerson()
      await assign(await activity(a), p)
      await assign(await activity(b), p)
      return (await conflictsOf(p)).filter((c) => c.type === 'overlap')
    }
    const DAY = '2026-11-02'
    const at = (time: string, day = DAY) => `${day}T${time}`

    test('two untimed work activities on one day warn', async () => {
      const found = await overlapOf({ datum: DAY }, { datum: DAY, soort: 'opbouw' })
      expect(found.map((c) => c.ernst)).toEqual(['waarschuwing'])
    })

    test('a timed and an untimed work activity warn', async () => {
      const found = await overlapOf({ datum: DAY, start_at: at('10:00'), eind_at: at('12:00') }, { datum: DAY })
      expect(found.map((c) => c.ernst)).toEqual(['waarschuwing'])
    })

    test('two timed activities that touch do not clash', async () => {
      const found = await overlapOf(
        { datum: DAY, start_at: at('10:00'), eind_at: at('14:00') },
        { datum: DAY, start_at: at('14:00'), eind_at: at('18:00') },
      )
      expect(found).toEqual([])
    })

    for (const soort of ['maaltijd', 'overnachting', 'reis']) {
      test(`a pair with ${soort} never clashes, timed or untimed`, async () => {
        const timed = await overlapOf(
          { datum: DAY, start_at: at('10:00'), eind_at: at('14:00') },
          { datum: DAY, soort, start_at: at('12:00'), eind_at: at('13:00') },
        )
        const untimed = await overlapOf({ datum: DAY }, { datum: DAY, soort })
        expect([...timed, ...untimed]).toEqual([])
      })
    }

    test('a night past midnight on one plandag clashes', async () => {
      const found = await overlapOf(
        { datum: DAY, start_at: at('22:00'), eind_at: at('01:00', '2026-11-03') },
        { datum: '2026-11-03', start_at: at('00:30', '2026-11-03'), eind_at: at('01:30', '2026-11-03') },
      )
      expect(found.map((c) => [c.ernst, c.plandag])).toEqual([['conflict', DAY]])
    })
  })

  test('name-only rows count toward nothing', async () => {
    // Activity 2 overlaps activity 13, and the absence covers it: neither touches a row without a person.
    const naamOnly = await create('toewijzing', { activiteit_id: 2, naam: 'Gastspeler', state: 'bevestigd' })
    await create('beschikbaarheid', { persoon_id: LOTTE, start_at: '2026-10-12T13:00', eind_at: '2026-10-12T19:00' })
    const named = (await rows('conflicten')).filter(
      (c) => c.toewijzing_id === naamOnly || c.ander_toewijzing_id === naamOnly,
    )
    expect(named).toEqual([])
    expect((await rows('persoon_dag')).map((r) => r.id)).not.toContain(naamOnly)
  })

  test('geweigerd, geannuleerd and cancelled activities count toward nothing', async () => {
    const DAY = '2026-11-04'
    const p = await newPerson()
    const a = await activity({ datum: DAY, start_at: `${DAY}T10:00`, eind_at: `${DAY}T14:00` })
    const b = await activity({ datum: DAY, start_at: `${DAY}T12:00`, eind_at: `${DAY}T16:00` })
    const c = await activity({ datum: DAY, start_at: `${DAY}T13:00`, eind_at: `${DAY}T17:00` })
    await create('beschikbaarheid', { persoon_id: p, start_at: `${DAY}T00:00`, eind_at: `${DAY}T23:59` })
    const ta = await assign(a, p)
    const tb = await assign(b, p, 'uitgenodigd')
    await assign(c, p)
    const types = async () => (await conflictsOf(p)).map((r) => r.type).sort()
    expect(await types()).toEqual(['afwezig', 'afwezig', 'afwezig', 'overlap', 'overlap', 'overlap'])

    await patch('toewijzing', ta, { state: 'geannuleerd' })
    expect(await types()).toEqual(['afwezig', 'afwezig', 'overlap'])
    await patch('toewijzing', tb, { state: 'geweigerd' })
    expect(await types()).toEqual(['afwezig'])
    await patch('activiteit', c, { status: 'geannuleerd' })
    expect(await types()).toEqual([])
  })
})

describe('kandidaten', () => {
  const namesFor = async (slot: number) =>
    (await rows('kandidaten', { toewijzing_id: slot }, 'rang')).map((r) => r.naam)

  test('kandidaten for the seeded open slot', async () => {
    // Bram prefers Speler: first, against the id order. Noor is afwezig, Sam is on the activity already.
    expect(await namesFor(SLOT)).toEqual(['Bram De Wilde', 'Lotte Verhaegen'])
    expect((await rows('kandidaten', { toewijzing_id: SLOT }, 'rang')).map((r) => r.rang)).toEqual([1, 2])
  })

  test('kandidaten rank by rate after voorkeur', async () => {
    const a = await activity({ datum: '2026-11-05', start_at: '2026-11-05T10:00', eind_at: '2026-11-05T12:00' })
    const slot = await create('toewijzing', { activiteit_id: a, rol_id: LICHTTECHNICUS })
    const duur = await newPerson()
    const goedkoop = await newPerson()
    await create('persoon_rol', { persoon_id: duur, rol_id: LICHTTECHNICUS, dagtarief: 250 })
    await create('persoon_rol', { persoon_id: goedkoop, rol_id: LICHTTECHNICUS, dagtarief: 200 })
    const ranked = await rows('kandidaten', { toewijzing_id: slot }, 'rang')
    expect(ranked.map((r) => [r.persoon_id, r.rang])).toEqual([
      [goedkoop, 1],
      [duur, 2],
      [NOOR, 3],
    ])
    expect(ranked.every((r) => !('dagtarief' in r))).toBe(true)
  })

  test('kandidaten leave out a timed overlap and an inactive person', async () => {
    const elsewhere = await activity({
      productie_id: 2,
      datum: '2026-10-14',
      start_at: '2026-10-14T11:00',
      eind_at: '2026-10-14T12:00',
    })
    await assign(elsewhere, LOTTE)
    expect(await namesFor(SLOT)).toEqual(['Bram De Wilde'])
    await patch('persoon', BRAM, { actief: false })
    expect(await namesFor(SLOT)).toEqual([])
  })
})

describe('persoon_dag', () => {
  const rowOf = async (id: number) => (await rows('persoon_dag', { id }))[0]

  test('persoon_dag writes state through refuse()', async () => {
    expect(await rowOf(NOOR_ON_16)).toMatchObject({ state: 'bevestigd', conflicten: 1 })
    // The grid sends a mapped write to the dataset the column writes to, keyed by toewijzing_id.
    await patch('toewijzing', NOOR_ON_16, { state: 'geannuleerd' })
    expect(await rowOf(NOOR_ON_16)).toMatchObject({ state: 'geannuleerd', conflicten: 0 })
    const refused = await admin('PATCH', `/api/rows/toewijzing/${NOOR_ON_16}`, { state: 'bevestigd' })
    expect({ status: refused.status, code: refused.body.code }).toEqual({
      status: 422,
      code: 'transition_not_allowed',
    })
  })

  test('a cleared absence clears the count', async () => {
    await patch('beschikbaarheid', 1, { soort: 'beschikbaar' })
    expect(await rowOf(NOOR_ON_16)).toMatchObject({ beschikbaarheid: 'beschikbaar', conflicten: 0 })
  })
})

describe('locatie_dag', () => {
  test('locatie_dag counts the venue clash on both rows', async () => {
    const counted = (await rows('locatie_dag')).filter((r) => r.conflicten !== 0)
    expect(counted.map((r) => [r.id, r.conflicten])).toEqual([
      [1, 1],
      [27, 1],
    ])
  })

  test('a cancelled activity keeps its locatie_dag row, with no clash', async () => {
    await patch('activiteit', 27, { status: 'geannuleerd' })
    const all = await rows('locatie_dag')
    expect(all.find((r) => r.id === 27)).toMatchObject({ status: 'geannuleerd', conflicten: 0 })
    expect(all.find((r) => r.id === 1)).toMatchObject({ conflicten: 0 })
  })
})

describe('werklijst', () => {
  test('werklijst lists open slots and unanswered invitations', async () => {
    const soon = await activity({ datum: localDay(2) })
    const slot = await create('toewijzing', { activiteit_id: soon, rol_id: SPELER })
    sqlite.run('UPDATE toewijzing SET created_at = ? WHERE id = ?', [daysAgoIso(30), SAM_INVITED])
    const all = await rows('werklijst')
    expect(all.find((r) => r.soort === 'open_slot' && r.id === 2_000_000_000_000 + slot)).toMatchObject({
      persoon_id: null,
      deadline: localDay(2),
    })
    expect(all.find((r) => r.soort === 'onbeantwoord')).toMatchObject({ persoon_id: SAM })
  })

  test('an open Taak is listed and its status writes to Taak; an optie soon is listed', async () => {
    const taak = (await rows('werklijst')).find((r) => r.soort === 'taak')
    expect(taak).toMatchObject({ titel: 'Rider versturen', persoon_id: LOTTE, status: 'open' })
    await patch('taak', taak?.taak_id as number, { status: 'gedaan' })
    expect((await rows('werklijst')).filter((r) => r.soort === 'taak')).toEqual([])
    expect(sqlite.query('SELECT status FROM taak WHERE id = ?').get(taak?.taak_id as number)).toEqual({
      status: 'gedaan',
    })

    const optie = await create('activiteit', {
      productie_id: 1,
      soort: 'voorstelling',
      omschrijving: 'try-out',
      status: 'optie',
      datum: localDay(3),
    })
    expect((await rows('werklijst')).find((r) => r.id === 4_000_000_000_000 + optie)).toMatchObject({
      soort: 'optie',
      deadline: localDay(3),
    })
  })
})

test('owners read none of them', async () => {
  for (const source of QUERIES) {
    expect({ source, status: (await owner('GET', `/api/rows/${source}`)).status }).toEqual({ source, status: 404 })
  }
  const schema = await owner('GET', '/api/schema')
  expect(schema.status).toBe(200)
  const sources = Object.keys(schema.body.sources as Body)
  for (const source of QUERIES) expect(sources).not.toContain(source)
})

// Seeding inserts views without the views route's checks; each one must also save through it.
test('every seeded view saves through the views route', async () => {
  for (const { name, ...fields } of theatre.views) {
    const res = await admin('POST', '/api/views', { name: `${name} (copy)`, ...fields, shared: false })
    expect({ name, status: res.status, body: res.status === 201 ? null : res.body }).toEqual({
      name,
      status: 201,
      body: null,
    })
  }
})
