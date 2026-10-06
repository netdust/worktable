import { Database } from 'bun:sqlite'
import { beforeEach, describe, expect, test } from 'bun:test'
import { migrate, seedDomain, validateDomain } from '@worktable/engine'
import { signIn, testEngine } from '@worktable/engine/test/sign-in'
import fiche from '../src'

type Body = Record<string, unknown>

let sqlite: Database
let request: (method: string, path: string, body?: unknown) => Promise<{ status: number; body: Body }>

beforeEach(async () => {
  sqlite = new Database(':memory:')
  migrate(sqlite, fiche)
  seedDomain(sqlite, fiche)
  const app = testEngine(sqlite, fiche)
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

const all = (table: string) => sqlite.query(`SELECT * FROM ${table} ORDER BY id`).all()
const rows = (body: Body) => body.rows as Body[]

const NEW = { titel: 'Nieuw', type: 'hulp', gemeente: 'Voorbeeldstad', postcode: '9999' }

async function refused(write: () => Promise<{ status: number; body: Body }>, message: string) {
  const before = [all('fiche'), all('revision')]
  const res = await write()
  expect({ status: res.status, code: res.body.code, message: res.body.message }).toEqual({
    status: 422,
    code: 'refused',
    message,
  })
  expect([all('fiche'), all('revision')]).toEqual(before)
}

describe('the fiche writer refuses', () => {
  test('a missing titel', () => {
    const { titel: _, ...without } = NEW
    return refused(() => request('POST', '/api/rows/fiche', without), 'Titel is verplicht.')
  })

  test('a type outside its options', () =>
    refused(() => request('POST', '/api/rows/fiche', { ...NEW, type: 'wellness' }), 'Ongeldig type.'))

  test('a postcode that is not four digits', () =>
    refused(() => request('PATCH', '/api/rows/fiche/1', { postcode: '12' }), 'Postcode moet vier cijfers hebben.'))

  test('a website without http:// or https://', async () => {
    const message = 'Website moet met http:// of https:// beginnen.'
    await refused(() => request('POST', '/api/rows/fiche', { ...NEW, website: 'javascript:alert(1)' }), message)
    await refused(() => request('PATCH', '/api/rows/fiche/1', { website: 'voorbeeld.invalid' }), message)
  })

  test('an email without @', async () => {
    await refused(() => request('POST', '/api/rows/fiche', { ...NEW, email: 'geen-adres' }), 'Ongeldig e-mailadres.')
    await refused(() => request('PATCH', '/api/rows/fiche/1', { email: 'geen-adres' }), 'Ongeldig e-mailadres.')
  })
})

describe('the fiche writer accepts', () => {
  test.each([
    ['filled', { website: 'http://voorbeeld.invalid', email: 'info@voorbeeld.invalid' }],
    ['empty', { website: '', email: '' }],
    ['null', { website: null, email: null }],
  ])('a %s website and email', async (_, values) => {
    expect((await request('POST', '/api/rows/fiche', { ...NEW, ...values })).status).toBe(201)
    expect((await request('PATCH', '/api/rows/fiche/1', values)).status).toBe(200)
  })
})

describe('the fiche domain', () => {
  test('a PATCH of gemeente persists and is revised', async () => {
    const res = await request('PATCH', '/api/rows/fiche/1', { gemeente: 'Testdorp' })
    expect(res.status).toBe(200)
    expect(sqlite.query('SELECT gemeente FROM fiche WHERE id = 1').get()).toEqual({ gemeente: 'Testdorp' })
    const revision = sqlite.query(
      "SELECT old, new FROM revision WHERE entity = 'fiche' AND record_id = 1 AND field = 'gemeente'",
    )
    expect(revision.all()).toEqual([{ old: '"Voorbeeldstad"', new: '"Testdorp"' }])
  })

  test('zichtbare_fiches hides verborgen fiches, by prioriteit descending then titel', async () => {
    const res = await request('GET', '/api/rows/zichtbare_fiches')
    expect(rows(res.body).map((r) => r.titel)).toEqual([
      'Crisisopvang De Haven',
      'Praatcafe Voorbeeld',
      'Vroegsignaal Testdorp',
      'Buurtpunt Proefhoven',
    ])
  })

  test('a custom filter returns only the crisis fiches', async () => {
    const filter = encodeURIComponent(JSON.stringify({ 'custom.crisisopvang': true }))
    const res = await request('GET', `/api/rows/fiche?filter=${filter}`)
    expect(rows(res.body).map((r) => r.titel)).toEqual(['Crisisopvang De Haven', 'Vroegsignaal Testdorp'])
  })

  test('the schema serves fiche writable and zichtbare_fiches read-only', async () => {
    const { body } = await request('GET', '/api/schema')
    const sources = body.sources as Record<string, { writable: boolean }>
    expect(Object.entries(sources).map(([name, s]) => [name, s.writable])).toEqual([
      ['fiche', true],
      ['zichtbare_fiches', false],
    ])
  })

  test('the domain passes validateDomain', () => {
    expect(() => validateDomain(fiche)).not.toThrow()
  })
})

// A seeded view belongs to no account; saving each as a new view runs it through the saved-view rules.
test('the seeded views are shared, owned by no account, and pass the saved-view rules', async () => {
  const views = (await request('GET', '/api/views')).body.views as Body[]
  expect(views.length).toBe(fiche.views.length)
  expect(views.every((v) => v.shared === true && v.owner_id === -1 && v.mine === false)).toBe(true)
  for (const v of views) {
    const res = await request('POST', '/api/views', v)
    expect({ name: v.name, status: res.status }).toEqual({ name: v.name, status: 201 })
  }
})
