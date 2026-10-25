import { expect, test } from '@playwright/test'
import { STUDIO } from '../auth'
import { shot } from '../shots'

// Read-only and without a session: safe on any running studio, Stefan's own included.
test.use({ baseURL: STUDIO.app, storageState: { cookies: [], origins: [] } })

test('studio row lines: the grid serves its own row-line token, apart from the subtle border, before sign-in @smoke', async ({
  page,
}) => {
  const response = await page.goto('/')
  expect(response?.status()).toBe(200)
  await expect(page.getByRole('form', { name: 'Aanmelden' })).toBeVisible()
  const [row, subtle] = await page.evaluate(() => {
    const root = getComputedStyle(document.documentElement)
    return [root.getPropertyValue('--color-border-row').trim(), root.getPropertyValue('--color-border-subtle').trim()]
  })
  expect(row).toMatch(/^#[0-9a-f]{6}$/i)
  expect(row).not.toBe(subtle)
  await shot(page, 'smoke-rijlijn-token')
  await expect(page.locator('body')).not.toContainText(/error|exception|stack/i)
})
