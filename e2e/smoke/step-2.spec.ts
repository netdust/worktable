import { expect, test } from '@playwright/test'

// Read-only and without a session: safe on any running instance. No token is offered, so no limiter counts a failure.
test.use({ storageState: { cookies: [], origins: [] } })

test('the page sends no referrer and asks not to be indexed @smoke', async ({ page }) => {
  const response = await page.goto('/#/signin')
  expect(response?.status()).toBe(200)
  await expect(page.locator('meta[name="referrer"]')).toHaveAttribute('content', 'no-referrer')
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', /noindex/)
  await expect(page.getByRole('textbox', { name: 'E-mailadres' })).toBeVisible()
  await expect(page.locator('body')).not.toContainText(/error|exception|stack/i)
})

test('a record link is copied only with a session, never cached @smoke', async ({ request }) => {
  const response = await request.get('/api/record-links/persoon/1')
  expect(response.status()).toBe(401)
  expect(response.headers()['cache-control']).toBe('no-store')
  expect(response.headers()['referrer-policy']).toBe('no-referrer')
  expect(response.headers()['x-robots-tag']).toBe('noindex')
})

for (const path of ['/api/rows/mijn_producties', '/api/schema?format=openapi']) {
  test(`${path} asks for a session @smoke`, async ({ request }) => {
    const response = await request.get(path)
    expect(response.status()).toBe(401)
    expect(await response.json()).toEqual({ code: 'unauthenticated', message: 'Sign in first' })
  })
}
