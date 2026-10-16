import { expect, test } from '@playwright/test'
import { state } from './auth'
import { shot } from './shots'
import { openWeek } from './tree'

test.use({ storageState: state('admin'), viewport: { width: 1280, height: 800 } })

test('title-line-reads-in-full @e2e', async ({ page }) => {
  await openWeek(page, 'Planning', 'Activiteiten', 'plandag', '2026-10-12')
  const title = page.getByRole('heading', { level: 1, name: 'Planning' })
  await expect(title).toBeVisible()
  await expect(page.locator('.nv-toolbar__summary')).toHaveText(/^Week \d+ · /)
  const { scrollWidth, clientWidth } = await title.evaluate((el) => ({
    scrollWidth: el.scrollWidth,
    clientWidth: el.clientWidth,
  }))
  expect(scrollWidth).toBeLessThanOrEqual(clientWidth)
  await shot(page, 'title-line')
})

// Shake-out row 20: at 1280px Dagplanning's toolbar must not overflow; "Nieuwe activiteit" stays on screen.
test('title-line-fits-at-1280 @e2e', async ({ page }) => {
  await openWeek(page, 'Planning', 'Activiteiten', 'plandag', '2026-10-12')
  await expect(page.locator('tbody tr.nv-tr').first()).toBeVisible()
  const toolbar = page.locator('header.nv-toolbar')
  await expect(page.getByRole('button', { name: 'Nieuwe activiteit' })).toBeInViewport({ ratio: 1, timeout: 2000 })
  expect(await toolbar.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true)
})

// With a record drawer open at 1280 the bar's end gives way first: the name reads whole and the period pill stays.
for (const [view, model, open] of [
  ['Planning', 'Activiteiten', 'row'],
  ['Per status', 'Activiteiten', 'card'],
] as const) {
  test(`title-line-fits-with-a-drawer-open on ${view} @e2e`, async ({ page }) => {
    await openWeek(page, view, model, 'plandag', '2026-10-12')
    if (open === 'row') await page.locator('tbody tr.nv-tr').first().getByRole('button', { name: 'Openen' }).click()
    else await page.locator('.nv-board__card').first().click()
    await expect(page.locator('.nv-drawer')).toBeVisible()
    const title = page.getByRole('heading', { level: 1, name: view })
    const fit = await title.evaluate((h1) => {
      const name = h1.parentElement as HTMLElement
      const pill = name.querySelector('.nv-toolbar__summary') as HTMLElement | null
      return {
        h1Right: h1.getBoundingClientRect().right,
        nameRight: name.getBoundingClientRect().right,
        pillWidth: pill?.getBoundingClientRect().width ?? 0,
        pillClipped: pill ? pill.scrollWidth > pill.clientWidth : true,
      }
    })
    expect(fit.h1Right).toBeLessThanOrEqual(fit.nameRight)
    expect(fit.pillWidth).toBeGreaterThan(0)
    expect(fit.pillClipped).toBe(false)
    await expect(page.getByRole('button', { name: /^Nieuwe/ })).toBeInViewport({ ratio: 1 })
    await shot(page, `title-line-drawer-${open}`)
  })
}
