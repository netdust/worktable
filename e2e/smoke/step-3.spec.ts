import { expect, test } from '@playwright/test'

// Read-only and without a session: safe on any running instance.
test.use({ storageState: { cookies: [], origins: [] } })

test('/api/rows/conflicten asks for a session @smoke', async ({ request }) => {
  const response = await request.get('/api/rows/conflicten')
  expect(response.status()).toBe(401)
  expect(await response.json()).toEqual({ code: 'unauthenticated', message: 'Sign in first' })
})

test('a calendar link lands on the sign-in page @smoke', async ({ page }) => {
  const response = await page.goto('/#view=persoon_dag')
  expect(response?.status()).toBe(200)
  await expect(page.getByRole('textbox', { name: 'E-mailadres' })).toBeVisible()
  await expect(page.locator('body')).not.toContainText(/error|exception|stack/i)
})
