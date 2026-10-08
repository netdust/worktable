import { expect, test } from '@playwright/test'

// Read-only and without a session: safe on any running instance.
test.use({ storageState: { cookies: [], origins: [] } })

test('the grid shell speaks Dutch in Plex @smoke', async ({ page }) => {
  const response = await page.goto('/#/signin')
  expect(response?.status()).toBe(200)
  await expect(page.getByRole('textbox', { name: 'E-mailadres' })).toBeVisible()
  await expect(page.locator('html')).toHaveAttribute('lang', 'nl')
  expect(await page.locator('body').evaluate((el) => getComputedStyle(el).fontFamily)).toMatch(/^"?IBM Plex Sans/)
  await expect(page.locator('body')).not.toContainText(/error|exception|stack/i)
})

for (const path of ['/api/schema', '/api/views', '/api/rows/productie', '/api/rows/activiteit']) {
  test(`${path} asks for a session @smoke`, async ({ request }) => {
    const response = await request.get(path)
    expect(response.status()).toBe(401)
    expect(await response.json()).toEqual({ code: 'unauthenticated', message: 'Sign in first' })
  })
}
