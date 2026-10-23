import { expect, test } from '@playwright/test'
import { STUDIO } from '../auth'
import { shot } from '../shots'

// Read-only and without a session: safe on any running studio, Stefan's own included.
test.use({ baseURL: STUDIO.app, storageState: { cookies: [], origins: [] } })

test('studio surface: the grid without a session shows the Dutch sign-in page, no dashboard @smoke', async ({
  page,
}) => {
  const response = await page.goto('/')
  expect(response?.status()).toBe(200)
  const form = page.getByRole('form', { name: 'Aanmelden' })
  await expect(form).toBeVisible()
  await expect(form.getByRole('textbox', { name: 'E-mailadres' })).toBeVisible()
  await expect(form.getByRole('button', { name: 'Stuur me een link' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Overzicht' })).toHaveCount(0)
  await shot(page, 'smoke-signin')
  await expect(page.locator('body')).not.toContainText(/error|exception|stack/i)
})

test('studio schema asks a visitor without a session to sign in @smoke', async ({ request }) => {
  const response = await request.get('http://127.0.0.1:4313/api/schema')
  expect(response.status()).toBe(401)
  expect(await response.json()).toEqual({ code: 'unauthenticated', message: 'Sign in first' })
})
