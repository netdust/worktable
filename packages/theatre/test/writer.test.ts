import { Database } from 'bun:sqlite'
import { beforeEach, describe, expect, test } from 'bun:test'
import { migrate, seedDomain, validateDomain } from '@worktable/engine'
import { signIn, testEngine } from '@worktable/engine/test/sign-in'
import theatre from '../src'

type Body = Record<string, unknown>

let sqlite: Database
let request: (method: string, path: string, body?: unknown) => Promise<{ status: number; body: Body }>

beforeEach(async () => {
  sqlite = new Database(':memory:')
  migrate(sqlite, theatre)
  seedDomain(sqlite, theatre)
  const app = testEngine(sqlite, theatre)
  const cookie = await signIn(app)
  request = async (method, path, body) => {
    const headers: Record<string, string> = { host: '127.0.0.1:4310', cookie }
    if (body !== undefined) headers['content-type'] = 'application/json'
    const res = await app.request(path, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    })
    return { status: res.status, body: (await res.json()) as Body }
  }
})

const patch = (id: number, body: unknown) => request('PATCH', `/api/rows/activiteit/${id}`, body)
const post = (body: unknown) => request('POST', '/api/rows/activiteit', body)
const all = (table: string) => sqlite.query(`SELECT * FROM ${table} ORDER BY id`).all()
const stored = (id: number) => sqlite.query('SELECT * FROM activiteit WHERE id = ?').get(id) as Body
const revised = (id: number, field: string) =>
  sqlite
    .query('SELECT old, new FROM revision WHERE entity = ? AND record_id = ? AND field = ?')
    .all('activiteit', id, field)

const NEW = { productie_id: 1, soort: 'repetitie', start_at: '2026-10-20T10:00', eind_at: '2026-10-20T12:00' }

async function refused(write: () => Promise<{ status: number; body: Body }>, message: string) {
  const before = [all('activiteit'), all('revision')]
  const res = await write()
  expect({ status: res.status, code: res.body.code, message: res.body.message }).toEqual({
    status: 422,
    code: 'refused',
    message,
  })
  expect([all('activiteit'), all('revision')]).toEqual(before)
}

describe('the Activiteit writer refuses', () => {
  // id 1: 2026-10-12T09:00 to 13:00
  test('an eind_at before start_at on create', () =>
    refused(() => post({ ...NEW, eind_at: '2026-10-20T09:00' }), 'Einde ligt voor de start.'))

  test('an eind_at moved before the stored start_at', () =>
    refused(() => patch(1, { eind_at: '2026-10-12T08:00' }), 'Einde ligt voor de start.'))

  test('a start_at moved after the stored eind_at', () =>
    refused(() => patch(1, { start_at: '2026-10-12T14:00' }), 'Einde ligt voor de start.'))

  test('an unknown productie_id', () => refused(() => patch(1, { productie_id: 99 }), 'Productie bestaat niet.'))

  test('a soft-deleted productie_id', () => {
    sqlite.run("UPDATE productie SET deleted_at = '2026-10-01T00:00:00.000Z' WHERE id = 3")
    return refused(() => patch(1, { productie_id: 3 }), 'Productie bestaat niet.')
  })

  test('a status outside its options', () => refused(() => patch(1, { status: 'klaar' }), 'Ongeldige status.'))

  test('a soort outside its options', () => refused(() => patch(1, { soort: 'middel' }), 'Ongeldige soort.'))
})

describe('the Activiteit writer', () => {
  test('an eind_at without seconds equal to a start_at with seconds is accepted', async () => {
    const res = await patch(1, { start_at: '2026-10-12T14:00:00', eind_at: '2026-10-12T14:00' })
    expect(res.status).toBe(200)
    expect(stored(1)).toMatchObject({ start_at: '2026-10-12T14:00:00', eind_at: '2026-10-12T14:00' })
  })

  test('create stores plandag from start_at', async () => {
    const res = await post({ ...NEW, start_at: '2026-10-21T03:30', eind_at: null })
    expect({ status: res.status, plandag: res.body.plandag }).toEqual({ status: 201, plandag: '2026-10-20' })
  })

  test('update of start_at to 03:30 stores the previous day and revises start_at and plandag', async () => {
    await patch(1, { eind_at: null, start_at: '2026-10-14T10:00' })
    const res = await patch(1, { start_at: '2026-10-15T03:30' })
    expect({ status: res.status, plandag: res.body.plandag }).toEqual({ status: 200, plandag: '2026-10-14' })
    expect(revised(1, 'start_at').at(-1)).toEqual({ old: '"2026-10-14T10:00"', new: '"2026-10-15T03:30"' })
    expect(revised(1, 'plandag')).toEqual([{ old: '"2026-10-12"', new: '"2026-10-14"' }])
  })

  test('update to 06:00 stores that day', async () => {
    await patch(1, { eind_at: null })
    expect((await patch(1, { start_at: '2026-10-15T06:00' })).body.plandag).toBe('2026-10-15')
  })

  test('a sent plandag is dropped (readonly)', async () => {
    await patch(1, { plandag: '2030-01-01' })
    expect(stored(1).plandag).toBe('2026-10-12')
    const res = await post({ ...NEW, plandag: '2030-01-01' })
    expect(res.body.plandag).toBe('2026-10-20')
  })

  test('delete is soft', async () => {
    const res = await request('DELETE', '/api/rows/activiteit/1')
    expect(res.status).toBe(200)
    expect(stored(1).deleted_at).not.toBeNull()
  })
})

const FOLLOWS_START = 'Datum volgt de start. Wijzig Start om de dag te verplaatsen.'
const END_NEEDS_START = 'Een einde heeft een start nodig.'
const CLEAR_END_FIRST = 'Wis eerst Einde: een einde heeft een start nodig.'
const DATUM_REQUIRED = 'Datum is verplicht.'
const UNTIMED = { productie_id: 1, soort: 'maaltijd', datum: '2026-10-20' }

describe('an activity without a time', () => {
  test('is created with only datum, with plandag equal to datum and no start_at', async () => {
    const res = await post(UNTIMED)
    expect(res.status).toBe(201)
    expect(stored(res.body.id as number)).toMatchObject({
      datum: '2026-10-20',
      plandag: '2026-10-20',
      start_at: null,
      eind_at: null,
    })
  })

  test('with start_at set, datum follows it', async () => {
    const res = await post({ ...NEW, start_at: '2026-10-21T03:30', eind_at: null })
    expect(res.status).toBe(201)
    expect(stored(res.body.id as number)).toMatchObject({ datum: '2026-10-21', plandag: '2026-10-20' })
  })

  test('a body with neither datum nor start_at is refused in Dutch', () =>
    refused(() => post({ productie_id: 1, soort: 'maaltijd', start_at: null }), DATUM_REQUIRED))

  test('a null datum without start_at is refused in Dutch on create', () =>
    refused(() => post({ ...UNTIMED, datum: null }), DATUM_REQUIRED))

  test('a PATCH clearing datum on an untimed row is refused in Dutch', async () => {
    const { body } = await post(UNTIMED)
    return refused(() => patch(body.id as number, { datum: null }), DATUM_REQUIRED)
  })

  test('on create a set start_at decides datum over a disagreeing one', async () => {
    const res = await post({ ...NEW, datum: '2026-10-19', start_at: '2026-10-21T20:00', eind_at: null })
    expect(res.status).toBe(201)
    expect(stored(res.body.id as number)).toMatchObject({ datum: '2026-10-21', plandag: '2026-10-21' })
  })

  test('an eind_at without start_at is refused', () =>
    refused(() => post({ ...UNTIMED, eind_at: '2026-10-20T12:00' }), END_NEEDS_START))

  test('an eind_at added to an untimed row is refused', async () => {
    const { body } = await post(UNTIMED)
    return refused(() => patch(body.id as number, { eind_at: '2026-10-20T12:00' }), END_NEEDS_START)
  })

  // id 9: the 00:30 show on 2026-10-14, so its plandag is the 13th.
  test('clearing start_at and eind_at keeps datum and puts plandag on it', async () => {
    const res = await patch(9, { start_at: null, eind_at: null })
    expect(res.status).toBe(200)
    expect(stored(9)).toMatchObject({ datum: '2026-10-14', plandag: '2026-10-14', start_at: null, eind_at: null })
  })

  test('clearing only start_at on a row with an end is refused, saying to clear Einde first', () =>
    refused(() => patch(9, { start_at: null }), CLEAR_END_FIRST))

  test('editing datum alone on a timed row is refused, saying to change Start', () =>
    refused(() => patch(1, { datum: '2026-10-13' }), FOLLOWS_START))

  test('a datum equal to the day of start_at is accepted on a timed row', async () => {
    expect((await patch(1, { datum: '2026-10-12' })).status).toBe(200)
  })

  test('a start_at on another day moves datum with it', async () => {
    const res = await patch(1, { start_at: '2026-10-15T10:00', eind_at: null })
    expect(res.status).toBe(200)
    expect(stored(1)).toMatchObject({ datum: '2026-10-15', plandag: '2026-10-15' })
  })

  test('a PATCH of datum alone on an untimed row moves plandag', async () => {
    const { body } = await post(UNTIMED)
    const res = await patch(body.id as number, { datum: '2026-10-25' })
    expect(res.status).toBe(200)
    expect(stored(body.id as number)).toMatchObject({ datum: '2026-10-25', plandag: '2026-10-25' })
  })

  test('a time set on an untimed row on another day moves datum to it', async () => {
    const { body } = await post(UNTIMED)
    expect((await patch(body.id as number, { start_at: '2026-10-23T03:00' })).status).toBe(200)
    expect(stored(body.id as number)).toMatchObject({ datum: '2026-10-23', plandag: '2026-10-22' })
  })

  test("an empty string for start_at is refused by the engine before the writer, so datum never becomes ''", async () => {
    const before = [all('activiteit'), all('revision')]
    const res = await patch(1, { start_at: '' })
    expect({ status: res.status, message: res.body.message }).toEqual({
      status: 400,
      message: expect.stringContaining('"start_at"'),
    })
    expect([all('activiteit'), all('revision')]).toEqual(before)
  })

  test('a 05:00 start stays a time', async () => {
    const res = await post({ ...NEW, start_at: '2026-10-20T05:00', eind_at: null })
    expect(res.status).toBe(201)
    expect(stored(res.body.id as number)).toMatchObject({
      start_at: '2026-10-20T05:00',
      datum: '2026-10-20',
      plandag: '2026-10-20',
    })
  })
})

describe('dagplanning', () => {
  test('serves writes on status and start_at in /schema', async () => {
    const { body } = await request('GET', '/api/schema')
    const query = body.sources.dagplanning
    expect(query.writable).toBe(true)
    expect(query.columns.status.writes).toEqual({ dataset: 'activiteit', field: 'status', key: 'activiteit_id' })
    expect(query.columns.start_at.writes).toEqual({ dataset: 'activiteit', field: 'start_at', key: 'activiteit_id' })
  })

  test('serves the people on an activity as links.mensen', async () => {
    const { body } = await request('GET', '/api/schema')
    expect(body.sources.dagplanning.links.mensen).toEqual({
      label: 'Mensen',
      item: 'Toewijzing',
      dataset: 'toewijzing',
      key: 'activiteit_id',
      target: 'persoon_id',
      target_dataset: 'persoon',
      state: {
        options: body.sources.toewijzing.columns.state.options,
        tones: { voorlopig: 'sky', uitgenodigd: 'warn', bevestigd: 'ok', geweigerd: 'bad', geannuleerd: 'bad' },
        default: 'uitgenodigd',
      },
    })
  })

  test("a dagplanning row lists its activity's toewijzingen as mensen", async () => {
    const assigned = (await request('GET', '/api/rows/toewijzing?limit=500')).body.rows as {
      id: number
      activiteit_id: number
    }[]
    const activity = assigned[0]?.activiteit_id as number
    const ids = assigned.filter((t) => t.activiteit_id === activity).map((t) => t.id)
    const { body } = await request('GET', '/api/rows/dagplanning?limit=500')
    const row = (body.rows as { id: number; links: { mensen: { id: number }[] } }[]).find((r) => r.id === activity)
    expect(row?.links.mensen.map((m) => m.id).sort()).toEqual(ids.sort())
  })

  test('the theatre domain passes validateDomain with dagplanning writes', () => {
    expect(() => validateDomain(theatre)).not.toThrow()
  })

  const dagRows = async () => {
    const res = await request('GET', '/api/rows/dagplanning?limit=500')
    return res.body.rows as {
      id: number
      activiteit_id: number
      start_at: string
      plandag: string
      locatie_id: number | null
      locatie_bron: string | null
    }[]
  }

  test('a soft-deleted activiteit leaves dagplanning, and every row has id equal to activiteit_id', async () => {
    const before = await dagRows()
    expect(before.some((r) => r.id === 1)).toBe(true)
    await request('DELETE', '/api/rows/activiteit/1')
    const after = await dagRows()
    expect(after.length).toBe(before.length - 1)
    expect(after.some((r) => r.id === 1)).toBe(false)
    expect(after.every((r) => r.id === r.activiteit_id)).toBe(true)
  })

  test('a changed start_at shows in dagplanning with the same id and the recomputed plandag', async () => {
    await patch(1, { eind_at: null, start_at: '2026-10-15T03:30' })
    const row = (await dagRows()).find((r) => r.id === 1)
    expect(row).toMatchObject({ start_at: '2026-10-15T03:30', plandag: '2026-10-14' })
  })

  // The engine has no PATCH on a query: the grid sends a mapped column to the dataset in its `writes`.
  const dagPatch = (id: number, body: unknown) => patch(id, body)

  test('omschrijving, soort and locatie in dagplanning write the activity', async () => {
    const { body } = await request('GET', '/api/schema')
    const columns = body.sources.dagplanning.columns
    for (const field of ['omschrijving', 'soort', 'locatie_id']) {
      expect(columns[field].writes).toEqual({ dataset: 'activiteit', field, key: 'activiteit_id' })
      expect(columns[field].readonly).toBeFalsy()
    }
    const res = await dagPatch(1, { omschrijving: 'Nieuwe titel', soort: 'opbouw', locatie_id: 2 })
    expect(res.status).toBe(200)
    expect(stored(1)).toMatchObject({ omschrijving: 'Nieuwe titel', soort: 'opbouw', locatie_id: 2 })
  })

  test('clearing dagplanning locatie falls back to the speelreeks', async () => {
    sqlite.run(
      "INSERT INTO speelreeks (productie_id, naam, locatie_id, start_datum, eind_datum) VALUES (1, 'Tour', 3, '2026-10-12', '2026-10-12')",
    )
    const reeks = (sqlite.query('SELECT last_insert_rowid() AS id').get() as { id: number }).id
    sqlite.run('UPDATE activiteit SET speelreeks_id = ?, locatie_id = NULL WHERE id = 1', [reeks])
    const reeksBefore = sqlite.query('SELECT * FROM speelreeks WHERE id = ?').get(reeks)
    const row = async () => (await dagRows()).find((r) => r.id === 1)

    expect((await dagPatch(1, { locatie_id: 2 })).status).toBe(200)
    expect(await row()).toMatchObject({ locatie_id: 2, locatie_bron: 'eigen' })
    expect((await dagPatch(1, { locatie_id: null })).status).toBe(200)
    expect(await row()).toMatchObject({ locatie_id: 3, locatie_bron: 'speelreeks' })
    expect(sqlite.query('SELECT * FROM speelreeks WHERE id = ?').get(reeks)).toEqual(reeksBefore)
  })
})
