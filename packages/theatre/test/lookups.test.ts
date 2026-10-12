import { Database } from 'bun:sqlite'
import { describe, expect, test } from 'bun:test'
import { migrate, seedDomain } from '@worktable/engine'
import { signIn, testEngine } from '@worktable/engine/test/sign-in'
import theatre from '../src'

// biome-ignore lint/suspicious/noExplicitAny: response bodies are asserted structurally
type Body = Record<string, any>

async function editor(...as: Parameters<typeof signIn> extends [unknown, ...infer R] ? R : never) {
  const sqlite = new Database(':memory:')
  migrate(sqlite, theatre)
  seedDomain(sqlite, theatre)
  const app = testEngine(sqlite, theatre)
  const cookie = await signIn(app, ...as)
  return async (method: string, path: string, body?: unknown): Promise<{ status: number; body: Body }> => {
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

describe('activiteit carries the venue and the people', () => {
  test('activiteit reads its venue through the tourstop', async () => {
    const as = await editor()
    const reeks = await as('POST', '/api/rows/speelreeks', {
      productie_id: 1,
      naam: 'Tournee West',
      locatie_id: 3,
      start_datum: '2026-11-01',
      eind_datum: '2026-11-04',
    })
    expect(reeks.status).toBe(201)
    const made = await as('POST', '/api/rows/activiteit', {
      productie_id: 1,
      speelreeks_id: reeks.body.id,
      soort: 'opbouw',
      datum: '2026-11-01',
      status: 'optie',
    })
    expect(made.status).toBe(201)
    const filter = encodeURIComponent(JSON.stringify({ speelreeks_id: reeks.body.id }))
    const { body } = await as('GET', `/api/rows/activiteit?filter=${filter}`)
    expect(body.rows).toHaveLength(1)
    expect(body.rows[0].locatie_id).toBeNull()
    expect(body.rows[0].locatie).toBe(reeks.body.locatie_id)
    expect(body.rows[0].inherited).toContain('locatie')
  })

  test('overriding the venue leaves the tourstop', async () => {
    const as = await editor()
    const reeks = await as('POST', '/api/rows/speelreeks', {
      productie_id: 1,
      naam: 'Tournee West',
      locatie_id: 3,
      start_datum: '2026-11-01',
      eind_datum: '2026-11-04',
    })
    const day = (datum: string) =>
      as('POST', '/api/rows/activiteit', {
        productie_id: 1,
        speelreeks_id: reeks.body.id,
        soort: 'opbouw',
        datum,
        status: 'optie',
      })
    const first = await day('2026-11-01')
    const sibling = await day('2026-11-02')
    const patched = await as('PATCH', `/api/rows/activiteit/${first.body.id}`, { locatie: 2 })
    expect(patched.status).toBe(200)
    expect(patched.body.locatie).toBe(2)
    expect(patched.body.inherited ?? []).not.toContain('locatie')
    const one = async (source: string, id: number) =>
      (await as('GET', `/api/rows/${source}?filter=${encodeURIComponent(JSON.stringify({ id }))}`)).body.rows[0]
    expect((await one('speelreeks', reeks.body.id)).locatie_id).toBe(3)
    expect((await one('activiteit', sibling.body.id)).locatie).toBe(3)
  })

  test('mensen is a link on activiteit', async () => {
    const as = await editor()
    const { body } = await as('GET', '/api/schema')
    expect(body.sources.activiteit.links.mensen.dataset).toBe('toewijzing')
  })
})

describe('a view may show every field of its source', () => {
  test('activiteit with all its columns, the lookup and the link is accepted', async () => {
    const as = await editor()
    const { body: schema } = await as('GET', '/api/schema')
    const source = schema.sources.activiteit
    const visible_fields = [
      ...Object.keys(source.columns),
      ...Object.keys(source.lookups),
      ...Object.keys(source.links),
    ]
    expect(visible_fields.length).toBeGreaterThan(16)
    const made = await as('POST', '/api/views', { name: 'Alles', source: 'activiteit', visible_fields })
    expect(made.status).toBe(201)
  })
})

describe('toewijzing carries the activity it is for', () => {
  test("an editor reads the activity's date, times and production; Lotte reads none of them", async () => {
    const staff = await editor()
    const { body } = await staff('GET', '/api/rows/toewijzing?sort=datum')
    const row = body.rows.find((r: Body) => r.persoon_id === 1)
    const activiteit = (
      await staff('GET', `/api/rows/activiteit?filter=${encodeURIComponent(JSON.stringify({ id: row.activiteit_id }))}`)
    ).body.rows[0]
    expect(row.datum).toBe(activiteit.datum)
    expect(row.start_at).toBe(activiteit.start_at)
    expect(row.eind_at).toBe(activiteit.eind_at)
    expect(row.productie).toBe(activiteit.productie_id)
    expect(row.lookups.productie.id).toBe(activiteit.productie_id)

    const lotte = await editor('owner', { dataset: 'persoon', id: 1 })
    const own = await lotte('GET', '/api/rows/toewijzing')
    expect(own.status).toBe(200)
    expect(own.body.rows.length).toBeGreaterThan(0)
    for (const r of own.body.rows) {
      for (const name of ['datum', 'start_at', 'eind_at', 'productie']) expect(Object.hasOwn(r, name)).toBe(false)
      expect(Object.hasOwn(r.lookups, 'productie')).toBe(false)
    }
    const probe = await lotte(
      'GET',
      `/api/rows/toewijzing?filter=${encodeURIComponent(JSON.stringify({ datum: '2026-10-12' }))}`,
    )
    expect([probe.status, probe.body.code]).toEqual([400, 'bad_filter'])
    expect((await lotte('GET', '/api/rows/toewijzing?sort=datum')).body.code).toBe('bad_sort')
  })
})
