import { expect, test } from '@playwright/test'

// Read-only and without a session: safe on any running instance. No token is offered, so no limiter counts a failure.
test.use({ storageState: { cookies: [], origins: [] } })

test('the sign-in page is Dutch, Plex, unindexed and in its own colours @smoke', async ({ page }) => {
  const f = encodeURIComponent(JSON.stringify([{ field: 'soort', op: 'in', values: ['reis'] }]))
  const response = await page.goto(`/#view=activiteit&f=${f}`)
  expect(response?.status()).toBe(200)
  await expect(page.getByRole('form', { name: 'Aanmelden' })).toBeVisible()
  await expect(page.locator('html')).toHaveAttribute('lang', 'nl')
  expect(await page.locator('body').evaluate((el) => getComputedStyle(el).fontFamily)).toMatch(/^"?IBM Plex Sans/)
  await expect(page.locator('meta[name="referrer"]')).toHaveAttribute('content', 'no-referrer')
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', /noindex/)
  const own = await page.evaluate(() => {
    const style = getComputedStyle(document.documentElement)
    return {
      tokens: ['--today', '--color-bg-column'].map((name) => style.getPropertyValue(name).trim()),
      sakani: [...document.querySelectorAll('[class]')].filter((el) => /sakani/i.test(el.className.toString())).length,
      sheets: [...document.styleSheets].filter((s) => /sakani/i.test(s.href ?? '')).length,
      page: getComputedStyle(document.querySelector('.nv-auth-page')!).backgroundColor,
    }
  })
  expect(own.tokens.every((value) => value !== '')).toBe(true)
  expect([own.sakani, own.sheets]).toEqual([0, 0])
  expect(own.page).not.toBe('rgba(0, 0, 0, 0)')
  const button = page.getByRole('button', { name: 'Stuur me een link' })
  await expect(button).toBeDisabled()
  await page.getByRole('textbox', { name: 'E-mailadres' }).fill('iemand@voorbeeld.test')
  await expect(button).toBeEnabled()
  await expect(page.locator('body')).not.toContainText(/error|exception|stack/i)
})

test('a record link is copied only with a session, never cached @smoke', async ({ request }) => {
  const response = await request.get('/api/record-links/persoon/1')
  expect(response.status()).toBe(401)
  expect(response.headers()['cache-control']).toBe('no-store')
  expect(response.headers()['referrer-policy']).toBe('no-referrer')
  expect(response.headers()['x-robots-tag']).toBe('noindex')
})
