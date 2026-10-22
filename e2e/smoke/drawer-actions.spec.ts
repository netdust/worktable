import { expect, test } from '@playwright/test'
import { shot } from '../shots'

// Read-only and without a session: safe on any running instance, production included.
test.use({ storageState: { cookies: [], origins: [] } })

test('drawer surface: the dashboard without a session shows the sign-in page, no drawer @smoke', async ({ page }) => {
  const response = await page.goto('/')
  expect(response?.status()).toBe(200)
  await expect(page.getByRole('form', { name: 'Aanmelden' })).toBeVisible()
  await expect(page.getByRole('complementary')).toHaveCount(0)
  await shot(page, 'smoke-signin')
  await expect(page.locator('body')).not.toContainText(/error|exception|stack/i)
})

test('drawer buttons and their marks are not served to a visitor without a session @smoke', async ({ request }) => {
  const response = await request.get('/api/rows/member')
  expect(response.status()).toBe(401)
  expect(await response.json()).toEqual({ code: 'unauthenticated', message: 'Sign in first' })
})
