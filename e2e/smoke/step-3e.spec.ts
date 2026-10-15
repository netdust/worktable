import { expect, test } from '@playwright/test'

// Read-only and without a session: safe on any running instance.
test.use({ storageState: { cookies: [], origins: [] } })

test('a drawer link with a condition lands on the sign-in page @smoke', async ({ page }) => {
  const f = encodeURIComponent(JSON.stringify([{ field: 'productie_id', op: 'eq', values: [1] }]))
  const response = await page.goto(`/#view=activiteit&f=${f}`)
  expect(response?.status()).toBe(200)
  await expect(page.getByRole('textbox', { name: 'E-mailadres' })).toBeVisible()
  await expect(page.locator('body')).not.toContainText(/error|exception|stack/i)
})

for (const query of ['kandidaten', 'werklijst']) {
  test(`/api/rows/${query} asks for a session @smoke`, async ({ request }) => {
    const response = await request.get(`/api/rows/${query}?limit=1`)
    expect(response.status()).toBe(401)
    expect(await response.json()).toEqual({ code: 'unauthenticated', message: 'Sign in first' })
  })
}
