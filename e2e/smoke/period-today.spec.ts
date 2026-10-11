import { expect, test } from '@playwright/test'

// Read-only and without a session: safe on any running instance.
test.use({ storageState: { cookies: [], origins: [] } })

test('a link with an is-vandaag condition lands on the sign-in page @smoke', async ({ page }) => {
  const condition = encodeURIComponent(JSON.stringify([{ field: 'plandag', op: 'today', values: [] }]))
  const response = await page.goto(`/#view=activiteit&f=${condition}`)
  expect(response?.status()).toBe(200)
  await expect(page.getByRole('textbox', { name: 'E-mailadres' })).toBeVisible()
  await expect(page.locator('body')).not.toContainText(/error|exception|stack/i)
})

test('/api/rows/activiteit for today asks for a session @smoke', async ({ request }) => {
  const today = encodeURIComponent(JSON.stringify({ plandag: { $period: 'today' } }))
  const response = await request.get(`/api/rows/activiteit?filter=${today}`)
  expect(response.status()).toBe(401)
  expect(await response.json()).toEqual({ code: 'unauthenticated', message: 'Sign in first' })
})
