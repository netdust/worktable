import { Database } from 'bun:sqlite'
import { beforeEach, describe, expect, test } from 'bun:test'
import { createEngine, migrate, seedDomain } from '@worktable/engine'
import theatre from '../src'

type Body = Record<string, any>

let sqlite: Database
let request: (method: string, path: string, body?: unknown) => Promise<{ status: number; body: Body }>

beforeEach(() => {
  sqlite = new Database(':memory:')
  migrate(sqlite, theatre)
  seedDomain(sqlite, theatre)
  const app = createEngine(sqlite, theatre, { port: 4310 })
  request = async (method, path, body) => {
    const headers: Record<string, string> = { host: '127.0.0.1:4310' }
    if (body !== undefined) headers['content-type'] = 'application/json'
    const res = await app.request(path, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    })
    return { status: res.status, body: (await res.json()) as Body }
  }
})

const patch = (id: number, body: unknown) => request('PATCH', `/api/rows/toewijzing/${id}`, body)
const post = (body: unknown) => request('POST', '/api/rows/toewijzing', body)
const stored = (id: number) => sqlite.query('SELECT * FROM toewijzing WHERE id = ?').get(id) as Body

// toewijzing 1: persoon 1 on activiteit 4; 3: the name 'Gastmuzikant' on activiteit 4

describe('the assignee switch', () => {
  test('picking a person on a name row clears the name', async () => {
    const res = await patch(3, { persoon_id: 3 })
    expect(res.status).toBe(200)
    expect(stored(3)).toMatchObject({ persoon_id: 3, naam: null })
  })

  test('typing a name on a person row clears the person', async () => {
    const res = await patch(1, { naam: 'Invaller' })
    expect(res.status).toBe(200)
    expect(stored(1)).toMatchObject({ persoon_id: null, naam: 'Invaller' })
  })

  test('a body that sets both is still refused', async () => {
    const res = await patch(3, { persoon_id: 3, naam: 'Beide' })
    expect(res.status).toBe(422)
    expect(res.body.message).toBe('Kies een persoon of een naam, niet allebei.')
  })

  test('clearing the person without a name is still refused', async () => {
    const res = await patch(1, { persoon_id: null })
    expect(res.status).toBe(422)
    expect(res.body.message).toBe('Kies een persoon of een naam.')
  })

  test('switching onto a person already on the activiteit is a duplicate', async () => {
    const res = await patch(3, { persoon_id: 1 })
    expect(res.status).toBe(422)
    expect(res.body.message).toBe('Deze persoon is al toegewezen aan deze activiteit.')
  })
})

describe('titles through the person', () => {
  const cells = async () => (await request('GET', '/api/rows/activiteit?cells=1&from=2026-10-12&to=2026-10-18')).body

  test('?cells=1 titles toewijzingen by persoon, else by naam', async () => {
    const row = (await cells()).rows.find((r: Body) => r.id === 4)
    expect(row.cells.map((c: Body) => c.title).sort()).toEqual(['Bram De Wilde', 'Gastmuzikant', 'Lotte Verhaegen'])
  })

  test('renaming a persoon changes those titles', async () => {
    await request('PATCH', '/api/rows/persoon/1', { voornaam: 'Lot' })
    const row = (await cells()).rows.find((r: Body) => r.id === 4)
    expect(row.cells.map((c: Body) => c.title)).toContain('Lot Verhaegen')
  })

  test('an afwezigheid is titled by the persoon', async () => {
    const res = await request('GET', '/api/rows/beschikbaarheid')
    expect(res.body.rows.map((r: Body) => r.title)).toContain('Noor Claes')
  })
})

describe('the matrix view', () => {
  test('GET /api/views serves Toewijzingen per activiteit as a matrix', async () => {
    const { body } = await request('GET', '/api/views')
    const view = body.views.find((v: Body) => v.name === 'Toewijzingen per activiteit')
    expect(view).toMatchObject({ source: 'activiteit', skin: 'matrix', shared: true })
  })

  test('the persoon-away window is seeded across a Monday', () => {
    const spanning = sqlite
      .query(
        "SELECT 1 FROM beschikbaarheid WHERE start_at < '2026-10-12' AND eind_at > '2026-10-12' AND persoon_id = 1",
      )
      .get()
    expect(spanning).not.toBeNull()
  })

  test('/schema marks activiteit as the matrix down source', async () => {
    const { body } = await request('GET', '/api/schema')
    expect(body.sources.activiteit.matrix_join).toBe('toewijzing')
  })
})
