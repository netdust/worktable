import { expect, test } from '@playwright/test'

// Read-only and without a session: safe on any running instance.
test.use({ storageState: { cookies: [], origins: [] } })

test('the shell carries the prototype tokens @smoke', async ({ page }) => {
  const response = await page.goto('/')
  expect(response?.status()).toBe(200)
  await expect(page.getByRole('textbox', { name: 'E-mailadres' })).toBeVisible()
  const tokens = await page.evaluate(() => {
    const style = getComputedStyle(document.documentElement)
    return ['--today', '--color-bg-column'].map((name) => style.getPropertyValue(name).trim())
  })
  expect(tokens.every((value) => value !== '')).toBe(true)
  await expect(page.locator('body')).not.toContainText(/error|exception|stack/i)
})

test('a timeline view link lands on the sign-in page @smoke', async ({ page }) => {
  const response = await page.goto('/#view=speelreeks')
  expect(response?.status()).toBe(200)
  await expect(page.getByRole('textbox', { name: 'E-mailadres' })).toBeVisible()
  await expect(page.locator('body')).not.toContainText(/error|exception|stack/i)
})
