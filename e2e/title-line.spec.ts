import { expect, test } from '@playwright/test'
import { state } from './auth'
import { openView } from './tree'

test.use({ storageState: state('admin'), viewport: { width: 1280, height: 800 } })

test('title-line-reads-in-full @e2e', async ({ page }) => {
  await page.goto('/#from=2026-10-12')
  await page.reload()
  await openView(page, 'Dagplanning')
  const title = page.getByRole('heading', { level: 1, name: 'Dagplanning' })
  await expect(title).toBeVisible()
  await expect(page.getByText(/^\d+ rijen · \d+ groepen$/)).toBeVisible()
  const { scrollWidth, clientWidth } = await title.evaluate((el) => ({
    scrollWidth: el.scrollWidth,
    clientWidth: el.clientWidth,
  }))
  expect(scrollWidth).toBeLessThanOrEqual(clientWidth)
  await page.locator('header.nv-toolbar').screenshot({ path: process.env.TITLE_SHOT ?? 'test-results/title-line.png' })
})
