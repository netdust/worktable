import { expect, test } from '@playwright/test'

// Read-only and without a session: safe on any running instance.
test.use({ storageState: { cookies: [], origins: [] } })

const week = encodeURIComponent(
  JSON.stringify([{ field: 'plandag', op: 'between', values: ['2026-12-21', '2027-02-20'] }]),
)
for (const hash of [`#view=activiteit&f=${week}`, '#view=activiteit&f=%7Bnot']) {
  test(`a link with conditions lands on the sign-in page (${hash.slice(0, 24)}) @smoke`, async ({ page }) => {
    const response = await page.goto(`/${hash}`)
    expect(response?.status()).toBe(200)
    await expect(page.getByRole('textbox', { name: 'E-mailadres' })).toBeVisible()
    await expect(page.locator('body')).not.toContainText(/error|exception|stack/i)
  })
}

for (const path of ['/api/rows/toewijzing', '/api/rows/activiteit?from=2026-12-21&to=2026-12-27']) {
  test(`${path} asks for a session @smoke`, async ({ request }) => {
    const response = await request.get(path)
    expect(response.status()).toBe(401)
    expect(await response.json()).toEqual({ code: 'unauthenticated', message: 'Sign in first' })
  })
}
