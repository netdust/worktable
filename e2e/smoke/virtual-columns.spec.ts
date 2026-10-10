import { expect, test } from '@playwright/test'

// Read-only and without a session: safe on any running instance.
test.use({ storageState: { cookies: [], origins: [] } })

test('a link with a Locatie condition lands on the sign-in page @smoke', async ({ page }) => {
  const condition = encodeURIComponent(JSON.stringify([{ field: 'locatie', op: 'is', values: [1] }]))
  const response = await page.goto(`/#view=activiteit&f=${condition}`)
  expect(response?.status()).toBe(200)
  await expect(page.getByRole('textbox', { name: 'E-mailadres' })).toBeVisible()
  await expect(page.locator('body')).not.toContainText(/error|exception|stack/i)
})

const byVenue = `filter=${encodeURIComponent(JSON.stringify({ locatie: 1 }))}&sort=locatie&group=locatie`
for (const path of [`/api/rows/activiteit?${byVenue}`, '/api/schema']) {
  test(`${path.split('?')[0]} ${path.includes('?') ? 'by Locatie ' : ''}asks for a session @smoke`, async ({
    request,
  }) => {
    const response = await request.get(path)
    expect(response.status()).toBe(401)
    expect(await response.json()).toEqual({ code: 'unauthenticated', message: 'Sign in first' })
  })
}
