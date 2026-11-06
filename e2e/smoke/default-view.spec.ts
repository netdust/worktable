import { expect, test } from '@playwright/test'
import { STUDIO } from '../auth'
import { shot } from '../shots'

// Read-only and without a session: safe on any running studio, Stefan's own included.
test.use({ baseURL: STUDIO.app, storageState: { cookies: [], origins: [] } })

test('default view: the grid serves the rail’s second mark, the house beside a lock, before sign-in @smoke', async ({
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
  expect(rules.some((rule) => rule.includes('.nv-view__mark > :nth-child(2)'))).toBe(true)
  await shot(page, 'smoke-aanmelden')
  await expect(page.locator('body')).not.toContainText(/error|exception|stack/i)
})

test('default view: a visitor without a session is refused the mark before anything is written @smoke', async ({
  request,
}) => {
  for (const method of ['put', 'delete'] as const) {
    const response = await request[method]('http://127.0.0.1:4313/api/views/1/default', { data: {} })
    expect(response.status(), method).toBe(401)
    expect(await response.json()).toEqual({ code: 'unauthenticated', message: 'Sign in first' })
  }
})
