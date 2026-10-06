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

describe('dagplanning', () => {
  test('serves writes on status and start_at in /schema', async () => {
    const { body } = await request('GET', '/api/schema')
    const query = body.sources.dagplanning
    expect(query.writable).toBe(true)
    expect(query.columns.status.writes).toEqual({ dataset: 'activiteit', field: 'status', key: 'activiteit_id' })
    expect(query.columns.start_at.writes).toEqual({ dataset: 'activiteit', field: 'start_at', key: 'activiteit_id' })
  })

  test('the theatre domain passes validateDomain with dagplanning writes', () => {
    expect(() => validateDomain(theatre)).not.toThrow()
  })

  const dagRows = async () => {
    const res = await request('GET', '/api/rows/dagplanning?limit=500')
    return res.body.rows as { id: number; activiteit_id: number; start_at: string; plandag: string }[]
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
})
