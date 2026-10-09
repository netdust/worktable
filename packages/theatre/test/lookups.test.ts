import { Database } from 'bun:sqlite'
import { describe, expect, test } from 'bun:test'
import { migrate, seedDomain } from '@worktable/engine'
import { signIn, testEngine } from '@worktable/engine/test/sign-in'
import theatre from '../src'

// biome-ignore lint/suspicious/noExplicitAny: response bodies are asserted structurally
type Body = Record<string, any>

async function editor() {
  const sqlite = new Database(':memory:')
  migrate(sqlite, theatre)
  seedDomain(sqlite, theatre)
  const app = testEngine(sqlite, theatre)
  const cookie = await signIn(app, 'editor')
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

  test('mensen is a link on activiteit', async () => {
    const as = await editor()
    const { body } = await as('GET', '/api/schema')
    expect(body.sources.activiteit.links.mensen.dataset).toBe('toewijzing')
  })
})
