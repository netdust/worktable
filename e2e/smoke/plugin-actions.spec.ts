import { expect, test } from '@playwright/test'
import { STUDIO } from '../auth'

// Read-only and without a session: safe on any running studio, Stefan's own included.
test.use({ baseURL: STUDIO.app, storageState: { cookies: [], origins: [] } })

const ENGINE = 'http://127.0.0.1:4313'

test('plugin actions: a handoff is never read or planted by a visitor without a session @smoke', async ({
  request,
}) => {
  for (const path of ['/api/handoff/site/1', '/api/handoff/actie/1']) {
    const read = await request.get(`${ENGINE}${path}`)
    expect(read.status(), `GET ${path}`).toBe(401)
    const body = (await read.json()) as Record<string, unknown>
    expect(body.code, `GET ${path}`).toBe('unauthenticated')
    expect(body, `GET ${path} hands out no value`).not.toHaveProperty('value')
    expect(read.headers()['cache-control'] ?? '', `GET ${path}`).not.toContain('public')
  }
  // An empty body: the refusal comes before any value is read, and none is written.
  const plant = await request.put(`${ENGINE}/api/handoff/site/1`, { data: {} })
  expect(plant.status(), 'PUT without a session').toBe(401)
  expect(((await plant.json()) as Record<string, unknown>).code).toBe('unauthenticated')
})

test('plugin actions: the schema with its head actions asks a visitor without a session to sign in @smoke', async ({
  request,
}) => {
  const response = await request.get(`${ENGINE}/api/schema`)
  expect(response.status()).toBe(401)
  const text = await response.text()
  expect(text).not.toContain('handoff')
  expect(JSON.parse(text)).toEqual({ code: 'unauthenticated', message: 'Sign in first' })
})
