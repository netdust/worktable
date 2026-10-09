import { expect, test } from '@playwright/test'

// Read-only and without a session: safe on any running instance. Nothing is submitted.
test.use({ storageState: { cookies: [], origins: [] } })

test('the sign-in button waits for an address @smoke', async ({ page }) => {
  const response = await page.goto('/#/signin')
  expect(response?.status()).toBe(200)
  const button = page.getByRole('button', { name: 'Stuur me een link' })
  await expect(button).toBeDisabled()
  await page.getByRole('textbox', { name: 'E-mailadres' }).fill('iemand@voorbeeld.test')
  await expect(button).toBeEnabled()
  await expect(page.locator('body')).not.toContainText(/error|exception|stack/i)
})

test('the page carries no Sakani markup and paints its own colours @smoke', async ({ page }) => {
  await page.goto('/#/signin')
  await expect(page.getByRole('form', { name: 'Aanmelden' })).toBeVisible()
  const sakani = await page.evaluate(() => ({
    sheets: [...document.styleSheets].filter((s) => /sakani/i.test(s.href ?? '')).length,
    classes: [...document.querySelectorAll('[class]')].filter((el) => /sakani/i.test(el.className.toString())).length,
  }))
  expect(sakani).toEqual({ sheets: 0, classes: 0 })
  const colours = await page.locator('.nv-auth-page').evaluate((el) => ({
    page: getComputedStyle(el).backgroundColor,
    accent: getComputedStyle(document.documentElement).getPropertyValue('--color-accent-default').trim(),
  }))
  expect(colours.page).not.toBe('rgba(0, 0, 0, 0)')
  expect(colours.accent).not.toBe('')
})
