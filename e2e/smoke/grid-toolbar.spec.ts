import { expect, test } from '@playwright/test'

// Read-only and without a session: safe on any running instance.
test.use({ storageState: { cookies: [], origins: [] } })

const or = encodeURIComponent(
  JSON.stringify([
    { field: 'soort', op: 'in', values: ['reis'] },
    { field: 'omschrijving', op: 'like', values: ['studio'] },
  ]),
)
test('a link joined by Of lands on the sign-in page @smoke', async ({ page }) => {
  const response = await page.goto(`/#view=activiteit&f=${or}&j=or`)
  expect(response?.status()).toBe(200)
  await expect(page.getByRole('textbox', { name: 'E-mailadres' })).toBeVisible()
  await expect(page.locator('body')).not.toContainText(/error|exception|stack/i)
})

for (const path of ['/api/history/activiteit', '/api/history/toewijzing']) {
  test(`${path} asks for a session @smoke`, async ({ request }) => {
    const response = await request.get(path)
    expect(response.status()).toBe(401)
    expect(await response.json()).toEqual({ code: 'unauthenticated', message: 'Sign in first' })
  })
}

test('an unknown public view token is not found @smoke', async ({ request }) => {
  const response = await request.get('/api/public/views/not-a-token')
  expect(response.status()).toBe(404)
  expect(await response.text()).not.toMatch(/exception|stack/i)
})
