import { Database } from 'bun:sqlite'
import { beforeEach, describe, expect, test } from 'bun:test'
import { migrate, seedDomain } from '@worktable/engine'
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
    const headers: Record<string, string> = { host: '127.0.0.1:4310', cookie, 'content-type': 'application/json' }
    const res = await app.request(path, { method, headers, body: JSON.stringify(body) })
    return { status: res.status, body: (await res.json()) as Body }
  }
})

const first = (table: string) =>
  (sqlite.query(`SELECT id FROM ${table} ORDER BY id LIMIT 1`).get() as { id: number }).id
const snapshot = (table: string) => [
  sqlite.query(`SELECT * FROM ${table}`).all(),
  sqlite.query('SELECT * FROM revision').all(),
]

async function refusedInDutch(table: string, body: Body, message: string) {
  const id = first(table)
  const before = snapshot(table)
  const res = await request('PATCH', `/api/rows/${table}/${id}`, body)
  expect({ status: res.status, code: res.body.code, message: res.body.message }).toEqual({
    status: 422,
    code: 'refused',
    message,
  })
  expect(snapshot(table)).toEqual(before)
}

describe('a writer refuses in Dutch, never the engine in English', () => {
  test('an activity without a production', () =>
    refusedInDutch('activiteit', { productie_id: null }, 'Productie is verplicht.'))
  test('an activity with a bron outside its options', () =>
    refusedInDutch('activiteit', { bron: 'elders' }, 'Ongeldige bron.'))
  test('a person with a contract outside its options', () =>
    refusedInDutch('persoon', { contract_type: 'tijdelijk' }, 'Ongeldig contracttype.'))
  test('an assignment without an activity', () =>
    refusedInDutch('toewijzing', { activiteit_id: null }, 'Activiteit is verplicht.'))
  test('an absence without a person', () =>
    refusedInDutch('beschikbaarheid', { persoon_id: null }, 'Persoon is verplicht.'))
  test('an absence without a start', () => refusedInDutch('beschikbaarheid', { start_at: null }, 'Start is verplicht.'))
  test('an absence without an end', () => refusedInDutch('beschikbaarheid', { eind_at: null }, 'Einde is verplicht.'))
})

test('a person may still clear the contract', async () => {
  const res = await request('PATCH', `/api/rows/persoon/${first('persoon')}`, { contract_type: null })
  expect(res.status).toBe(200)
})
