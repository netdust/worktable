import { expect, test } from '@playwright/test'

// Read-only and without a session: safe on any running instance.
test.use({ storageState: { cookies: [], origins: [] } })

test('a tourstop link lands on the sign-in page @smoke', async ({ page }) => {
  const response = await page.goto('/#view=speelreeks')
  expect(response?.status()).toBe(200)
  await expect(page.getByRole('textbox', { name: 'E-mailadres' })).toBeVisible()
  await expect(page.locator('body')).not.toContainText(/error|exception|stack/i)
})

// A GET runs no action: the route only takes a POST, and every route asks a session first.
test('/api/actions/tourstop_verschuiven asks for a session @smoke', async ({ request }) => {
  const response = await request.get('/api/actions/tourstop_verschuiven')
  expect(response.status()).toBe(401)
  expect(await response.json()).toEqual({ code: 'unauthenticated', message: 'Sign in first' })
})
