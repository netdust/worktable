import { expect, test } from '@playwright/test'

// Read-only and without a session: safe on any running instance.
test.use({ storageState: { cookies: [], origins: [] } })

for (const hash of ['#period=all', '#from=2026-12-21&to=2027-02-20']) {
  test(`a period in the address lands on the sign-in page (${hash}) @smoke`, async ({ page }) => {
    const response = await page.goto(`/${hash}`)
    expect(response?.status()).toBe(200)
    await expect(page.getByRole('textbox', { name: 'E-mailadres' })).toBeVisible()
    await expect(page.locator('body')).not.toContainText(/error|exception|stack/i)
  })
}

for (const path of ['/api/rows/toewijzing', '/api/rows/dagplanning?from=2026-12-21&to=2026-12-27']) {
  test(`${path} asks for a session @smoke`, async ({ request }) => {
    const response = await request.get(path)
    expect(response.status()).toBe(401)
    expect(await response.json()).toEqual({ code: 'unauthenticated', message: 'Sign in first' })
  })
}
