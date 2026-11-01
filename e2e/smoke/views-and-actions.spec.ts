import { expect, test } from '@playwright/test'
import { STUDIO } from '../auth'
import { shot } from '../shots'

// Read-only and without a session: safe on any running studio, Stefan's own included.
test.use({ baseURL: STUDIO.app, storageState: { cookies: [], origins: [] } })

test('views and actions: the grid serves the dock, its run lines and the column lines before sign-in @smoke', async ({
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
  for (const selector of ['.nv-dock', '.nv-run__open', '[data-lines="on"]'])
    expect(
      rules.some((rule) => rule.includes(selector)),
      selector,
    ).toBe(true)
  await shot(page, 'smoke-aanmelden')
  await expect(page.locator('body')).not.toContainText(/error|exception|stack/i)
})

test('views and actions: the saved views ask a visitor without a session to sign in @smoke', async ({ request }) => {
  const response = await request.get('http://127.0.0.1:4313/api/views')
  expect(response.status()).toBe(401)
  expect(await response.json()).toEqual({ code: 'unauthenticated', message: 'Sign in first' })
})
