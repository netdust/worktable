import { expect, test } from '@playwright/test'

// Read-only and without a session: safe on any running instance, production included.
test.use({ storageState: { cookies: [], origins: [] } })

test('selection surface: a table view without a session shows the sign-in page, no selection column @smoke', async ({
  page,
}) => {
  const response = await page.goto('/#view=members')
  expect(response?.status()).toBe(200)
  await expect(page.getByRole('form', { name: 'Aanmelden' })).toBeVisible()
  await expect(page.getByRole('checkbox', { name: 'Alle rijen selecteren' })).toHaveCount(0)
  await expect(page.locator('body')).not.toContainText(/error|exception|stack/i)
})

test('selection actions are not declared to a visitor without a session @smoke', async ({ request }) => {
  const response = await request.get('/api/schema')
  expect(response.status()).toBe(401)
  expect(await response.json()).toEqual({ code: 'unauthenticated', message: 'Sign in first' })
})
