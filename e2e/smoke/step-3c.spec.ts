import { expect, test } from '@playwright/test'

// Read-only and without a session: safe on any running instance.
test.use({ storageState: { cookies: [], origins: [] } })

test('/api/views asks for a session @smoke', async ({ request }) => {
  const response = await request.get('/api/views')
  expect(response.status()).toBe(401)
  expect(await response.json()).toEqual({ code: 'unauthenticated', message: 'Sign in first' })
})

test('the landing page shows the sign-in @smoke', async ({ page }) => {
  const response = await page.goto('/')
  expect(response?.status()).toBe(200)
  await expect(page.getByRole('textbox', { name: 'E-mailadres' })).toBeVisible()
  await expect(page.locator('body')).not.toContainText(/error|exception|stack/i)
})

test('/api/attachments/activiteit batch asks for a session @smoke', async ({ request }) => {
  const response = await request.get('/api/attachments/activiteit?kind=foto&ids=1,2')
  expect(response.status()).toBe(401)
  expect(await response.json()).toEqual({ code: 'unauthenticated', message: 'Sign in first' })
})

test('a skin view link lands on the sign-in page @smoke', async ({ page }) => {
  const response = await page.goto('/#view=activiteit')
  expect(response?.status()).toBe(200)
  await expect(page.getByRole('textbox', { name: 'E-mailadres' })).toBeVisible()
  await expect(page.locator('body')).not.toContainText(/error|exception|stack/i)
})
