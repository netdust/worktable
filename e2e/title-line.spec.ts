import { expect, test } from '@playwright/test'
import { state } from './auth'
import { shot } from './shots'
import { openView } from './tree'

test.use({ storageState: state('admin'), viewport: { width: 1280, height: 800 } })

test('title-line-reads-in-full @e2e', async ({ page }) => {
  await page.goto('/#from=2026-10-12')
  await page.reload()
  await openView(page, 'Dagplanning', 'Activiteiten')
  const title = page.getByRole('heading', { level: 1, name: 'Dagplanning' })
  await expect(title).toBeVisible()
  await expect(page.getByText(/^\d+ rijen · \d+ groepen$/)).toBeVisible()
  const { scrollWidth, clientWidth } = await title.evaluate((el) => ({
    scrollWidth: el.scrollWidth,
    clientWidth: el.clientWidth,
  }))
  expect(scrollWidth).toBeLessThanOrEqual(clientWidth)
  await shot(page, 'title-line')
})

// Shake-out row 20: at 1280px Dagplanning's toolbar must not overflow; "Nieuwe activiteit" stays on screen.
test('title-line-fits-at-1280 @e2e', async ({ page }) => {
  await page.goto('/#from=2026-10-12')
  await page.reload()
  await openView(page, 'Dagplanning', 'Activiteiten')
  await expect(page.locator('tbody tr.nv-tr').first()).toBeVisible()
  const toolbar = page.locator('header.nv-toolbar')
  await expect(page.getByRole('button', { name: 'Nieuwe activiteit' })).toBeInViewport({ ratio: 1, timeout: 2000 })
  expect(await toolbar.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true)
})
