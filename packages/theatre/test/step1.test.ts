import { Database } from 'bun:sqlite'
import { beforeEach, describe, expect, test } from 'bun:test'
import { type Actor, migrate, seedDomain, type WriteContext } from '@worktable/engine'
import { signIn, testEngine } from '@worktable/engine/test/sign-in'
import theatre from '../src'
import { rolWriter, sjabloonWriter, speelreeksWriter, validateItems } from '../src/writers'

type Body = Record<string, unknown>
type Request = (method: string, path: string, body?: unknown) => Promise<{ status: number; body: Body }>

const LOTTE = { dataset: 'persoon', id: 1 }
const TABLES = ['speelreeks', 'rol', 'sjabloon', 'activiteit', 'revision']

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

const state = () => TABLES.map((t) => sqlite.query(`SELECT * FROM ${t} ORDER BY id`).all())

async function denied(call: Promise<{ status: number; body: Body }>, status: number, code: string, message?: string) {
  const before = state()
  const res = await call
  const got = { status: res.status, code: res.body.code, ...(message ? { message: res.body.message } : {}) }
  expect(got).toEqual({ status, code, ...(message ? { message } : {}) })
  expect(state()).toEqual(before)
}

const refused = (call: Promise<{ status: number; body: Body }>, message: string) =>
  denied(call, 422, 'refused', message)

const REEKS = {
  productie_id: 1,
  naam: 'Tournee West',
  locatie_id: 3,
  start_datum: '2026-11-01',
  eind_datum: '2026-11-04',
}

async function reeks(body: Body = {}): Promise<number> {
  const res = await editor('POST', '/api/rows/speelreeks', { ...REEKS, ...body })
  expect(res.status).toBe(201)
  return res.body.id as number
}

const softDelete = (table: string, id: number) =>
  sqlite.run(`UPDATE ${table} SET deleted_at = '2026-10-01T00:00:00.000Z' WHERE id = ?`, [id])

function ctxOf(role: Actor['role']): WriteContext {
  return {
    actor: { id: 1, role, subject: role === 'owner' ? LOTTE : null },
    current: null,
    find: () => null,
    exists: () => false,
  }
}

function statusOf(call: () => unknown): number | undefined {
  try {
    call()
  } catch (err) {
    return (err as { status?: number }).status
  }
  return undefined
}

describe('the Speelreeks writer refuses', () => {
  test('an eind_datum before the start_datum', () =>
    refused(
      editor('POST', '/api/rows/speelreeks', { ...REEKS, eind_datum: '2026-10-31' }),
      'Einde ligt voor de start.',
    ))

  test('an unknown productie', () =>
    refused(editor('POST', '/api/rows/speelreeks', { ...REEKS, productie_id: 99 }), 'Productie bestaat niet.'))

  test('a deleted locatie', () => {
    softDelete('organisatie', 3)
    return refused(editor('POST', '/api/rows/speelreeks', REEKS), 'Locatie bestaat niet.')
  })

  test('a reeks of 32 days, the default cap', () =>
    refused(
      editor('POST', '/api/rows/speelreeks', { ...REEKS, start_datum: '2026-11-01', eind_datum: '2026-12-02' }),
      'Een speelreeks duurt hoogstens 31 dagen.',
    ))

  test('a reeks longer than the own organisation sets', () => {
    sqlite.run(`UPDATE organisatie SET parameters = '{"dag_grens_uur":5,"max_speelreeks_dagen":10}' WHERE id = 1`)
    return refused(
      editor('POST', '/api/rows/speelreeks', { ...REEKS, start_datum: '2026-11-01', eind_datum: '2026-11-11' }),
      'Een speelreeks duurt hoogstens 10 dagen.',
    )
  })

  test('an end moved past the cap on update', async () => {
    const id = await reeks()
    await refused(
      editor('PATCH', `/api/rows/speelreeks/${id}`, { eind_datum: '2026-12-02' }),
      'Een speelreeks duurt hoogstens 31 dagen.',
    )
  })
})

describe('the Speelreeks writer accepts', () => {
  test('a reeks of exactly 31 days', async () => {
    await reeks({ start_datum: '2026-11-01', eind_datum: '2026-12-01' })
  })

  test('a reeks of exactly the own organisation cap', async () => {
    sqlite.run(`UPDATE organisatie SET parameters = '{"max_speelreeks_dagen":10}' WHERE id = 1`)
    await reeks({ start_datum: '2026-11-01', eind_datum: '2026-11-10' })
  })
})

describe('deleting a Speelreeks', () => {
  test('with a live activity is 409 in_use', async () => {
    const id = await reeks()
    const made = await editor('POST', '/api/rows/activiteit', {
      productie_id: 1,
      soort: 'repetitie',
      datum: '2026-11-02',
      speelreeks_id: id,
    })
    expect(made.status).toBe(201)
    await denied(editor('DELETE', `/api/rows/speelreeks/${id}`), 409, 'in_use')
  })

  test('without one is 200', async () => {
    const id = await reeks()
    expect((await editor('DELETE', `/api/rows/speelreeks/${id}`)).status).toBe(200)
  })
})

describe('an owner', () => {
  test.each(['speelreeks', 'rol', 'sjabloon'])('does not see %s', async (source) => {
    await denied(owner('GET', `/api/rows/${source}`), 404, 'unknown_source')
    await denied(owner('POST', `/api/rows/${source}`, { naam: 'X' }), 404, 'unknown_source')
  })

  test('is forbidden by each writer called directly', () => {
    const ctx = ctxOf('owner')
    expect(statusOf(() => speelreeksWriter.create?.({ ...REEKS }, ctx))).toBe(403)
    expect(statusOf(() => rolWriter.create?.({ naam: 'X', categorie: 'techniek' }, ctx))).toBe(403)
    expect(statusOf(() => sjabloonWriter.create?.({ naam: 'X', items: [] }, ctx))).toBe(403)
  })
})

describe('Activiteit.speelreeks_id', () => {
  test('an unknown speelreeks is refused', () =>
    refused(editor('PATCH', '/api/rows/activiteit/1', { speelreeks_id: 99 }), 'Speelreeks bestaat niet.'))

  test('a deleted speelreeks is refused', async () => {
    const id = await reeks()
    softDelete('speelreeks', id)
    await refused(editor('PATCH', '/api/rows/activiteit/1', { speelreeks_id: id }), 'Speelreeks bestaat niet.')
  })

  test('is a relation to speelreeks', () => {
    expect(theatre.datasets.find((d) => d.name === 'activiteit')?.columns.speelreeks_id?.relation).toBe('speelreeks')
  })
})

describe('Rol rates', () => {
  const TARIEVEN = 'Alleen een beheerder wijzigt tarieven.'

  test("an editor's dagtarief PATCH is 403", () =>
    denied(editor('PATCH', '/api/rows/rol/1', { dagtarief: 999 }), 403, 'forbidden', TARIEVEN))

  test("an editor's POST with uurtarief is 403", () =>
    denied(
      editor('POST', '/api/rows/rol', { naam: 'Kostumier', categorie: 'artistiek', uurtarief: 30 }),
      403,
      'forbidden',
      TARIEVEN,
    ))

  test('an administrator writes both', async () => {
    expect((await admin('PATCH', '/api/rows/rol/1', { dagtarief: 999 })).status).toBe(200)
    expect(
      (await admin('POST', '/api/rows/rol', { naam: 'Kostumier', categorie: 'artistiek', uurtarief: 30 })).status,
    ).toBe(201)
  })

  test("an editor's naam edit is 200", async () => {
    expect((await editor('PATCH', '/api/rows/rol/1', { naam: 'Hoofdrol' })).status).toBe(200)
  })

  test('a kleur that is not #rrggbb is refused', () =>
    refused(editor('PATCH', '/api/rows/rol/1', { kleur: 'rood' }), 'Ongeldige kleur.'))
})

describe('validateItems refuses', () => {
  const ITEM = {
    soort: 'maaltijd',
    omschrijving: 'Lunch',
    offset_dag: 0,
    start_tijd: '13:00',
    duur: 60,
    locatie_regel: 'speelreeks',
  }
  const message = (items: unknown) => {
    try {
      validateItems(items)
    } catch (err) {
      return (err as Error).message
    }
    return 'accepted'
  }

  test('a good item is accepted', () => expect(message([ITEM])).toBe('accepted'))
  test('a bad soort', () => expect(message([{ ...ITEM, soort: 'feest' }])).toBe('Item 1: ongeldige soort.'))
  test('an offset_dag of -1', () => expect(message([{ ...ITEM, offset_dag: -1 }])).toBe('Item 1: ongeldige dag.'))
  test('a start_tijd of 25:00', () =>
    expect(message([{ ...ITEM, start_tijd: '25:00' }])).toBe('Item 1: ongeldige starttijd.'))
  test('a duur without start_tijd', () => {
    const { start_tijd: _, ...untimed } = ITEM
    expect(message([untimed])).toBe('Item 1: een duur heeft een starttijd nodig.')
  })
  test('a locatie_regel other than speelreeks', () =>
    expect(message([ITEM, { ...ITEM, locatie_regel: 'eigen' }])).toBe('Item 2: ongeldige locatieregel.'))
})

describe('the seeds', () => {
  const seeded = (dataset: string) => {
    const found: Body[] = []
    theatre.seed((name, rows) => {
      if (name === dataset) found.push(...rows)
    })
    return found
  }

  test('every seeded Sjabloon passes validateItems', () => {
    expect(seeded('sjabloon').length).toBeGreaterThan(0)
    for (const row of seeded('sjabloon')) validateItems(row.items)
  })

  test('every seeded Rol row passes the Rol writer', () => {
    expect(seeded('rol')).toHaveLength(4)
    for (const row of seeded('rol')) rolWriter.create?.({ ...row }, ctxOf('administrator'))
  })
})

test('/api/schema marks sjabloon not writable', async () => {
  const sources = (await editor('GET', '/api/schema')).body.sources as Record<string, { writable: boolean }>
  expect(sources.sjabloon?.writable).toBe(false)
  expect(sources.speelreeks?.writable).toBe(true)
})

describe('the inherited locatie', () => {
  const dag = (id: number) =>
    sqlite.query('SELECT locatie_id, locatie_bron FROM dagplanning WHERE id = ?').get(id) as Body

  async function inReeks(body: Body = {}): Promise<number> {
    const id = await reeks()
    const res = await editor('POST', '/api/rows/activiteit', {
      productie_id: 1,
      soort: 'voorstelling',
      start_at: '2026-11-02T20:00',
      status: 'bevestigd',
      speelreeks_id: id,
      ...body,
    })
    expect(res.status).toBe(201)
    return res.body.id as number
  }

  test('dagplanning: from the speelreeks without its own', async () => {
    expect(dag(await inReeks())).toEqual({ locatie_id: 3, locatie_bron: 'speelreeks' })
  })

  test('dagplanning: its own wins', async () => {
    expect(dag(await inReeks({ locatie_id: 2 }))).toEqual({ locatie_id: 2, locatie_bron: 'eigen' })
    expect(dag(1)).toEqual({ locatie_id: 2, locatie_bron: 'eigen' })
  })

  test('dagplanning: neither leaves both empty', async () => {
    const res = await editor('POST', '/api/rows/activiteit', { productie_id: 1, soort: 'andere', datum: '2026-11-02' })
    expect(dag(res.body.id as number)).toEqual({ locatie_id: null, locatie_bron: null })
  })

  test('voorstellingen shows the inherited venue', async () => {
    const id = await inReeks()
    expect(sqlite.query('SELECT venue FROM voorstellingen WHERE id = ?').get(id)).toEqual({
      venue: 'Theater Het Anker',
    })
  })
})
