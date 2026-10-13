import { Database } from 'bun:sqlite'
import { beforeEach, describe, expect, test } from 'bun:test'
import { migrate, seedDomain, validateDomain } from '@worktable/engine'
import { signIn, testEngine } from '@worktable/engine/test/sign-in'
import theatre from '../src'

type Body = Record<string, unknown>
type Res = { status: number; body: Body }

let sqlite: Database
let app: ReturnType<typeof testEngine>
let request: (method: string, path: string, body?: unknown) => Promise<Res>

const requester =
  (cookie: string) =>
  async (method: string, path: string, body?: unknown): Promise<Res> => {
    const headers: Record<string, string> = { host: '127.0.0.1:4310', cookie }
    if (body !== undefined) headers['content-type'] = 'application/json'
    const res = await app.request(path, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    })
    return { status: res.status, body: (await res.json()) as Body }
  }

beforeEach(async () => {
  sqlite = new Database(':memory:')
  migrate(sqlite, theatre)
  seedDomain(sqlite, theatre)
  app = testEngine(sqlite, theatre)
  request = requester(await signIn(app))
})

const post = (dataset: string, body: unknown) => request('POST', `/api/rows/${dataset}`, body)
const patch = (dataset: string, id: number, body: unknown) => request('PATCH', `/api/rows/${dataset}/${id}`, body)
const remove = (dataset: string, id: number) => request('DELETE', `/api/rows/${dataset}/${id}`)
const stored = (dataset: string, id: number) => sqlite.query(`SELECT * FROM ${dataset} WHERE id = ?`).get(id) as Body

const TABLES = ['organisatie', 'productie', 'activiteit', 'persoon', 'toewijzing', 'beschikbaarheid', 'revision']
const snapshot = () => TABLES.map((t) => sqlite.query(`SELECT * FROM ${t} ORDER BY id`).all())

async function refused(write: () => Promise<Res>, message: string) {
  const before = snapshot()
  const res = await write()
  expect({ status: res.status, code: res.body.code, message: res.body.message }).toEqual({
    status: 422,
    code: 'refused',
    message,
  })
  expect(snapshot()).toEqual(before)
}

async function inUse(dataset: string, id: number, by: { label: string; count: number }[]) {
  const before = snapshot()
  const res = await remove(dataset, id)
  expect({ status: res.status, code: res.body.code, by: res.body.by }).toEqual({ status: 409, code: 'in_use', by })
  expect(snapshot()).toEqual(before)
}

// Seeded toewijzingen: 1 act 4 persoon 1 · 2 act 4 persoon 2 · 3 act 4 naam Gastmuzikant · 4 act 2 persoon 1
const BOTH = 'Kies een persoon of een naam, niet allebei.'
const DUPLICATE = 'Deze persoon is al toegewezen aan deze activiteit.'

describe('the Toewijzing writer refuses', () => {
  test('both a persoon and a naam', () =>
    refused(() => post('toewijzing', { activiteit_id: 5, persoon_id: 3, naam: 'Gast' }), BOTH))

  test('neither a persoon nor a naam, nor a rol for an open slot', () =>
    refused(() => post('toewijzing', { activiteit_id: 5 }), 'Een open plek heeft een rol nodig.'))

  test('a filled row emptied of both persoon and naam', () =>
    refused(() => patch('toewijzing', 1, { persoon_id: null }), 'Kies een persoon of een naam.'))

  test('a persoon and a naam in one update', () =>
    refused(() => patch('toewijzing', 3, { persoon_id: 3, naam: 'Gast' }), BOTH))

  test('a duplicate persoon on create', () =>
    refused(() => post('toewijzing', { activiteit_id: 4, persoon_id: 1 }), DUPLICATE))

  test('an update moving the persoon onto one already assigned', () =>
    refused(() => patch('toewijzing', 2, { persoon_id: 1 }), DUPLICATE))

  test('an update moving activiteit_id onto an activiteit where that persoon is assigned', () =>
    refused(() => patch('toewijzing', 4, { activiteit_id: 4 }), DUPLICATE))

  test('a state outside its options', () =>
    refused(() => post('toewijzing', { activiteit_id: 5, naam: 'Gast', state: 'misschien' }), 'Ongeldige status.'))

  test('an unknown persoon', () =>
    refused(() => post('toewijzing', { activiteit_id: 5, persoon_id: 99 }), 'Persoon bestaat niet.'))

  test('an unknown activiteit', () =>
    refused(() => post('toewijzing', { activiteit_id: 999, naam: 'Gast' }), 'Activiteit bestaat niet.'))
})

describe('the other theatre writers refuse', () => {
  test('a beschikbaarheid ending before its start on create', () =>
    refused(
      () => post('beschikbaarheid', { persoon_id: 1, start_at: '2026-10-20T10:00', eind_at: '2026-10-20T09:00' }),
      'Einde ligt voor de start.',
    ))

  test('a beschikbaarheid eind_at moved before the stored start_at', () =>
    refused(() => patch('beschikbaarheid', 2, { eind_at: '2026-10-19T08:00' }), 'Einde ligt voor de start.'))

  test('a persoon without achternaam', () =>
    refused(() => post('persoon', { voornaam: 'Ilse' }), 'Voornaam en achternaam zijn verplicht.'))

  test('a persoon whose voornaam is emptied', () =>
    refused(() => patch('persoon', 1, { voornaam: ' ' }), 'Voornaam en achternaam zijn verplicht.'))

  test('a persoon with an email without @', () =>
    refused(() => patch('persoon', 1, { email: 'lotte.voorbeeld.test' }), 'Ongeldig e-mailadres.'))

  test('a persoon with an unknown organisatie', () =>
    refused(() => patch('persoon', 1, { organisatie_id: 99 }), 'Organisatie bestaat niet.'))

  test('an organisatie without naam', () =>
    refused(() => post('organisatie', { soort: 'venue' }), 'Naam is verplicht.'))

  test('an organisatie with a soort outside its options', () =>
    refused(() => post('organisatie', { naam: 'Zaal X', soort: 'museum' }), 'Ongeldige soort.'))

  test('a productie without titel', () =>
    refused(() => post('productie', { seizoen: '2027-2028' }), 'Titel is verplicht.'))

  test('a productie with a status outside its options', () =>
    refused(() => patch('productie', 1, { status: 'klaar' }), 'Ongeldige status.'))

  test('a productie with an unknown organisatie', () =>
    refused(() => patch('productie', 1, { organisatie_id: 99 }), 'Organisatie bestaat niet.'))

  test('an activiteit with an unknown locatie', () =>
    refused(() => patch('activiteit', 1, { locatie_id: 99 }), 'Organisatie bestaat niet.'))
})

describe('the Toewijzing writer accepts', () => {
  test('an update of notitie on an assigned row', async () => {
    const res = await patch('toewijzing', 1, { notitie: 'Komt met de trein' })
    expect(res.status).toBe(200)
    expect(stored('toewijzing', 1).notitie).toBe('Komt met de trein')
  })

  test('two name-only rows on one activiteit', async () => {
    const res = await post('toewijzing', { activiteit_id: 4, naam: 'Tweede gast' })
    expect(res.status).toBe(201)
  })

  test('an explicit null persoon_id with a naam switches a row to name-only', async () => {
    const res = await patch('toewijzing', 2, { persoon_id: null, naam: 'Invaller' })
    expect(res.status).toBe(200)
    expect(stored('toewijzing', 2)).toMatchObject({ persoon_id: null, naam: 'Invaller' })
  })

  test('a soft-deleted duplicate does not count', async () => {
    expect((await remove('toewijzing', 1)).status).toBe(200)
    expect((await patch('toewijzing', 2, { persoon_id: 1 })).status).toBe(200)
  })
})

describe('Persoon email', () => {
  // Only an administrator changes the address a link is mailed to.
  test('an empty string or null is accepted', async () => {
    const admin = requester(await signIn(app, 'administrator'))
    expect((await admin('PATCH', '/api/rows/persoon/1', { email: '' })).status).toBe(200)
    expect(stored('persoon', 1).email).toBe('')
    expect((await admin('PATCH', '/api/rows/persoon/1', { email: null })).status).toBe(200)
    expect(stored('persoon', 1).email).toBeNull()
  })
})

describe('Persoon weergavenaam', () => {
  test('is derived on create and update, and a sent value is dropped', async () => {
    const created = await post('persoon', { voornaam: 'Ilse', achternaam: 'Wouters', weergavenaam: 'Baas' })
    expect({ status: created.status, weergavenaam: created.body.weergavenaam }).toEqual({
      status: 201,
      weergavenaam: 'Ilse Wouters',
    })
    const id = created.body.id as number
    await patch('persoon', id, { achternaam: 'Janssens', weergavenaam: 'Baas' })
    expect(stored('persoon', id).weergavenaam).toBe('Ilse Janssens')
  })

  test('is readonly in /schema', async () => {
    const { body } = await request('GET', '/api/schema')
    const sources = body.sources as Record<string, { columns: Record<string, { readonly?: boolean }> }>
    expect(sources.persoon?.columns.weergavenaam?.readonly).toBe(true)
  })
})

describe('deleting what live rows reference', () => {
  test('an organisatie used as a venue is 409 in_use', () =>
    inUse('organisatie', 2, [{ label: 'Tourstops', count: 3 }, { label: 'Activiteiten', count: 8 }]))

  test('an organisatie used by nobody is deleted', async () => {
    expect((await remove('organisatie', 5)).status).toBe(200)
    expect(stored('organisatie', 5).deleted_at).not.toBeNull()
  })

  test('a productie with activiteiten is 409 in_use', () =>
    inUse('productie', 1, [{ label: 'Tourstops', count: 2 }, { label: 'Activiteiten', count: 12 }]))
})

describe('voorstellingen', () => {
  const rows = async () => {
    const res = await request('GET', '/api/rows/voorstellingen?limit=500')
    return res.body.rows as Body[]
  }

  test('holds only bevestigde voorstellingen, with only the public columns', async () => {
    const all = await rows()
    expect(all.map((r) => r.id).sort((a, b) => Number(a) - Number(b))).toEqual([4, 8, 9, 22])
    for (const row of all) {
      const { custom, lookups, ...columns } = row
      expect({ custom, lookups }).toEqual({ custom: {}, lookups: {} })
      expect(Object.keys(columns).sort()).toEqual(['adres', 'datum', 'id', 'productie', 'start', 'title', 'venue'])
    }
    expect(all.find((r) => r.id === 9)).toMatchObject({
      productie: 'De Kersentuin',
      datum: '2026-10-14',
      start: '00:30',
      venue: 'Theater Het Anker',
    })
  })

  test('lists a show without venue with an empty venue', async () => {
    expect((await rows()).find((r) => r.id === 22)).toMatchObject({ venue: null, adres: null })
  })

  test('drops a voorstelling whose productie is soft-deleted and keeps one whose venue is', async () => {
    sqlite.run("UPDATE organisatie SET deleted_at = '2026-10-01T00:00:00.000Z' WHERE id = 2")
    sqlite.run("UPDATE productie SET deleted_at = '2026-10-01T00:00:00.000Z' WHERE id = 3")
    const all = await rows()
    expect(all.map((r) => r.id).sort((a, b) => Number(a) - Number(b))).toEqual([4, 8, 9])
    expect(all.find((r) => r.id === 4)).toMatchObject({ venue: null, adres: null })
  })

  test('is read-only', async () => {
    const { body } = await request('GET', '/api/schema')
    const sources = body.sources as Record<string, { writable: boolean }>
    expect(sources.voorstellingen?.writable).toBe(false)
  })
})

test('the theatre domain passes validateDomain with the new relations', () => {
  expect(() => validateDomain(theatre)).not.toThrow()
})
