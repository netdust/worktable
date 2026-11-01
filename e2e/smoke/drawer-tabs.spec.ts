import { expect, test } from '@playwright/test'
import { STUDIO } from '../auth'
import { shot } from '../shots'

// Read-only and without a session: safe on any running studio, Stefan's own included.
test.use({ baseURL: STUDIO.app, storageState: { cookies: [], origins: [] } })

test('drawer tabs: the grid serves the drawer’s tab bar and no position text before sign-in @smoke', async ({
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
  for (const selector of ['.nv-dw-tabs__group', '.nv-dw-tab[data-selected]', '.nv-dw-tabs__more[data-current]'])
    expect(
      rules.some((rule) => rule.includes(selector)),
      selector,
    ).toBe(true)
  expect(
    rules.some((rule) => rule.includes('.nv-dw-head__pos')),
    'no "N van M" left in the head',
  ).toBe(false)
  await shot(page, 'smoke-tabbladen')
  await expect(page.locator('body')).not.toContainText(/error|exception|stack/i)
})

test('drawer tabs: a record’s history, behind its Geschiedenis tab, is not served to a visitor without a session @smoke', async ({
  request,
}) => {
  const filter = encodeURIComponent(JSON.stringify({ id: 1 }))
  const response = await request.get(`http://127.0.0.1:4313/api/history/site?filter=${filter}`)
  expect(response.status()).toBe(401)
  const body = (await response.json()) as { code: string; entries?: unknown }
  expect(body.code).toBe('unauthenticated')
  expect(body.entries).toBeUndefined()
})
