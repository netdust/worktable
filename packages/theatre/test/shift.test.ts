import { Database } from 'bun:sqlite'
import { beforeEach, describe, expect, test } from 'bun:test'
import { migrate, seedDomain } from '@worktable/engine'
import { signIn, testEngine } from '@worktable/engine/test/sign-in'
import theatre from '../src'

type Body = Record<string, unknown>
type Request = (method: string, path: string, body?: unknown) => Promise<{ status: number; body: Body }>

let sqlite: Database
let editor: Request

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
})

// A tour of two days with one timed and one untimed activity, and an activity outside it.
async function tour(): Promise<{ reeks: number; timed: number; untimed: number; other: number }> {
  const made = async (path: string, values: Body) => {
    const res = await editor('POST', path, values)
    expect(res.status).toBe(201)
    return res.body.id as number
  }
  const reeks = await made('/api/rows/speelreeks', {
    productie_id: 1,
    naam: 'Tournee Oost',
    locatie_id: 3,
    start_datum: '2026-11-09',
    eind_datum: '2026-11-10',
  })
  const activity = (values: Body) => made('/api/rows/activiteit', { productie_id: 1, soort: 'repetitie', ...values })
  return {
    reeks,
    timed: await activity({
      speelreeks_id: reeks,
      datum: '2026-11-09',
      start_at: '2026-11-09T20:30',
      eind_at: '2026-11-10T01:00',
      omschrijving: 'avond',
    }),
    untimed: await activity({ speelreeks_id: reeks, datum: '2026-11-10', omschrijving: 'dag' }),
    other: await activity({ datum: '2026-11-09', omschrijving: 'elders' }),
  }
}

const row = async (dataset: string, id: number) =>
  (
    (await editor('GET', `/api/rows/${dataset}?filter=${encodeURIComponent(JSON.stringify({ id }))}`)).body
      .rows as Body[]
  )[0] as Body

describe('tourstop_verschuiven', () => {
  test('is served on the tourstop as "Tourstop verschuiven"', async () => {
    const schema = (await editor('GET', '/api/schema')).body as { sources: Record<string, { actions: Body[] }> }
    const names = (schema.sources.speelreeks?.actions ?? []).map((a) => [a.name, a.label])
    expect(names).toContainEqual(['tourstop_verschuiven', 'Tourstop verschuiven'])
    expect(names.map(([name]) => name)).not.toContain('tour_verschuiven')
  })

  test('moves the tourstop and every activity in it by N days, in one batch that one undo reverses', async () => {
    const { reeks, timed, untimed, other } = await tour()
    const res = await editor('POST', '/api/actions/tourstop_verschuiven', { id: reeks, input: { dagen: 3 } })
    expect(res.status).toBe(201)

    expect(await row('speelreeks', reeks)).toMatchObject({ start_datum: '2026-11-12', eind_datum: '2026-11-13' })
    expect(await row('activiteit', timed)).toMatchObject({
      datum: '2026-11-12',
      start_at: '2026-11-12T20:30',
      eind_at: '2026-11-13T01:00',
      plandag: '2026-11-12',
    })
    expect(await row('activiteit', untimed)).toMatchObject({ datum: '2026-11-13', plandag: '2026-11-13' })
    expect(await row('activiteit', other)).toMatchObject({ datum: '2026-11-09' })

    const undo = await editor('POST', `/api/batches/${res.body.batch_id}/undo`, {})
    expect(undo.status).toBe(200)
    expect(await row('speelreeks', reeks)).toMatchObject({ start_datum: '2026-11-09', eind_datum: '2026-11-10' })
    expect(await row('activiteit', timed)).toMatchObject({ datum: '2026-11-09', start_at: '2026-11-09T20:30' })
  })

  test('moves back with a negative number', async () => {
    const { reeks, untimed } = await tour()
    expect(
      (await editor('POST', '/api/actions/tourstop_verschuiven', { id: reeks, input: { dagen: -2 } })).status,
    ).toBe(201)
    expect(await row('activiteit', untimed)).toMatchObject({ datum: '2026-11-08' })
  })

  test.each<[string, unknown]>([
    ['more than a year', 366],
    ['a fraction', 1.5],
    ['a number given as text', '3'],
  ])('refuses %s, and moves nothing', async (_, dagen) => {
    const { reeks } = await tour()
    const res = await editor('POST', '/api/actions/tourstop_verschuiven', { id: reeks, input: { dagen } })
    expect(res.status).toBe(400)
    expect(res.body.message).toContain('input.dagen')
    expect(await row('speelreeks', reeks)).toMatchObject({ start_datum: '2026-11-09', eind_datum: '2026-11-10' })
  })
})
