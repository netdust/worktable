import { describe, expect, test } from 'bun:test'
import { createEngine } from '../src'
import { domain, freshDb } from './fixture'

const app = createEngine(freshDb(), domain, { port: 4310 })
const schema = (host?: string) => app.request('/api/schema', { headers: host ? { host } : {} })

describe('host allowlist', () => {
  test('a rebound name is 403 forbidden_host', async () => {
    const res = await schema('evil.example')
    expect(res.status).toBe(403)
    expect(((await res.json()) as { code: string }).code).toBe('forbidden_host')
  })

  test('a request without a Host is 403', async () => expect((await schema()).status).toBe(403))
  test('the right name on another port is 403', async () => expect((await schema('127.0.0.1:4311')).status).toBe(403))

  test('127.0.0.1 and localhost on the engine port are served', async () => {
    expect((await schema('127.0.0.1:4310')).status).toBe(200)
    expect((await schema('localhost:4310')).status).toBe(200)
  })

  test('every response carries nosniff', async () => {
    expect((await schema('127.0.0.1:4310')).headers.get('x-content-type-options')).toBe('nosniff')
    expect((await schema('evil.example')).headers.get('x-content-type-options')).toBe('nosniff')
  })
})
