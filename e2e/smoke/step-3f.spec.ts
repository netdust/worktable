import { expect, test } from '@playwright/test'

// Read-only and without a session: safe on any running instance.
test.use({ storageState: { cookies: [], origins: [] } })

test('/api/schema asks for a session before it serves flags, tones and ranks @smoke', async ({ request }) => {
  const response = await request.get('/api/schema')
  expect(response.status()).toBe(401)
  expect(await response.json()).toEqual({ code: 'unauthenticated', message: 'Sign in first' })
})

for (const dataset of ['activiteit', 'toewijzing']) {
  test(`/api/rows/${dataset} sorted on position asks for a session @smoke`, async ({ request }) => {
    const response = await request.get(`/api/rows/${dataset}?sort=position&limit=1`)
    expect(response.status()).toBe(401)
    expect(await response.json()).toEqual({ code: 'unauthenticated', message: 'Sign in first' })
  })
}
