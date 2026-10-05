import type { Database } from 'bun:sqlite'
import { beforeEach, describe, expect, test } from 'bun:test'
import { createEngine } from '../src'
import { contents, domain, freshDb, type Sent, send } from './fixture'

let sqlite: Database
let request: ReturnType<typeof send>

beforeEach(() => {
  sqlite = freshDb()
  request = send(createEngine(sqlite, domain, { port: 4310 }))
})

const state = () => ({ notitie: contents(sqlite, 'notitie'), revision: contents(sqlite, 'revision') })
const json = (value: unknown) => JSON.stringify(value)

const writes: [string, string, Sent][] = [
  ['POST', '/api/rows/notitie', { body: json({ project_id: 1, tekst: 'nieuw' }) }],
  ['PATCH', '/api/rows/notitie/1', { body: json({ tekst: 'anders' }) }],
  ['DELETE', '/api/rows/notitie/1', { type: null }],
]

async function denied(method: string, path: string, sent: Sent, status: number, code: string) {
  const before = state()
  const res = await request(method, path, sent)
  expect({ status: res.status, code: res.body.code }).toEqual({ status, code })
  expect(state()).toEqual(before)
}

describe('write guard denials', () => {
  test('text/plain POST is 415', () =>
    denied('POST', '/api/rows/notitie', { ...writes[0]?.[2], type: 'text/plain' }, 415, 'bad_content_type'))
  test('text/plain PATCH is 415', () =>
    denied('PATCH', '/api/rows/notitie/1', { ...writes[1]?.[2], type: 'text/plain' }, 415, 'bad_content_type'))
  test('a POST without a content type is 415', () =>
    denied('POST', '/api/rows/notitie', { ...writes[0]?.[2], type: null }, 415, 'bad_content_type'))

  for (const site of ['cross-site', 'same-site']) {
    test.each(writes)(`Sec-Fetch-Site: ${site} is 403 forbidden_site on %s`, (method, path, sent) =>
      denied(method, path, { ...sent, site }, 403, 'forbidden_site'),
    )
  }

  test.each(['Cross-Site', 'SAME-SITE'])('Sec-Fetch-Site: %s in any case is 403 forbidden_site', (site) =>
    denied('PATCH', '/api/rows/notitie/1', { ...writes[1]?.[2], site }, 403, 'forbidden_site'),
  )

  test.each(writes)('Origin without Sec-Fetch-Site is 403 forbidden_site on %s', (method, path, sent) =>
    denied(method, path, { ...sent, origin: 'http://localhost:3999' }, 403, 'forbidden_site'),
  )

  test('a cross-site POST /api/views is 403 forbidden_site, not 404', () =>
    denied('POST', '/api/views', { body: json({ name: 'x' }), site: 'cross-site' }, 403, 'forbidden_site'))

  test('body over 64 kB is 413', () =>
    denied('POST', '/api/rows/notitie', { body: json({ tekst: 'a'.repeat(70_000) }) }, 413, 'body_too_large'))

  test.each(writes)('a request with Host evil.example is still 403 forbidden_host on %s', (method, path, sent) =>
    denied(method, path, { ...sent, host: 'evil.example' }, 403, 'forbidden_host'),
  )
})

describe('write guard passes', () => {
  test('application/json; charset=utf-8 is accepted', async () => {
    const res = await request('POST', '/api/rows/notitie', {
      ...writes[0]?.[2],
      type: 'application/json; charset=utf-8',
    })
    expect(res.status).toBe(201)
  })

  test.each([
    ['same-origin', 'same-origin'],
    ['absent', undefined],
  ])('Sec-Fetch-Site %s is accepted', async (_, site) => {
    expect((await request('PATCH', '/api/rows/notitie/1', { ...writes[1]?.[2], site })).status).toBe(200)
  })

  test('Origin with Sec-Fetch-Site same-origin is accepted', async () => {
    const sent = { ...writes[1]?.[2], site: 'same-origin', origin: 'http://127.0.0.1:4310' }
    expect((await request('PATCH', '/api/rows/notitie/1', sent)).status).toBe(200)
  })

  test('a body-less DELETE needs no content type', async () => {
    expect(await request('DELETE', '/api/rows/notitie/1', { type: null })).toEqual({ status: 200, body: { id: 1 } })
  })
})
