import { expect, test } from '@playwright/test'
import { STUDIO } from '../auth'
import { shot } from '../shots'

// Read-only and without a session: safe on any running studio, Stefan's own included.
test.use({ baseURL: STUDIO.app, storageState: { cookies: [], origins: [] } })

test('action row: the grid serves the drawer’s action row and the table’s pinned totals before sign-in @smoke', async ({
  page,
}) => {
  const response = await page.goto('/')
  expect(response?.status()).toBe(200)
  await expect(page.getByRole('form', { name: 'Aanmelden' })).toBeVisible()
  const rules = await page.evaluate(() =>
    [...document.styleSheets].flatMap((sheet) => {
      try {
        return [...sheet.cssRules].map((rule) => rule.cssText)
      } catch {
        return []
      }
    }),
  )
  for (const selector of ['.nv-dw-actions__row', '.nv-grid__foot', 'tbody::after'])
    expect(
      rules.some((rule) => rule.includes(selector)),
      selector,
    ).toBe(true)
  await shot(page, 'smoke-actierij')
  await expect(page.locator('body')).not.toContainText(/error|exception|stack/i)
})

test('action row: a site’s address is not served to a visitor without a session @smoke', async ({ request }) => {
  const response = await request.get('http://127.0.0.1:4313/api/rows/site?limit=1')
  expect(response.status()).toBe(401)
  expect(((await response.json()) as { code: string }).code).toBe('unauthenticated')
})
