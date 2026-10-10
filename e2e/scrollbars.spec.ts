import { expect, test } from '@playwright/test'
import { shot } from './shots'
import { openWeek } from './tree'

// R9: thin, arrowless scrollbars from the theme's tokens, in light and in dark. Headless Chromium hides scrollbars unless told not to.
test.use({ launchOptions: { ignoreDefaultArgs: ['--hide-scrollbars'] } })

test('minimal-scrollbars @e2e', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 520 })
  await openWeek(page, 'Bevestigd', 'Activiteiten', 'plandag', '2026-10-12')
  await page.locator('.nv-bar').getByRole('button', { name: 'Filter Plandag wissen' }).click()
  await page.locator('.nv-bar').getByRole('button', { name: 'Filter Status wissen' }).click()
  const scroller = page.locator('.nv-scroll').first()
  await expect.poll(() => scroller.evaluate((el) => el.scrollHeight > el.clientHeight)).toBe(true)
  const look = () =>
    scroller.evaluate((el) => {
      const style = getComputedStyle(el)
      return { width: style.scrollbarWidth, colour: style.scrollbarColor, gutter: el.offsetWidth - el.clientWidth }
    })
  const light = await look()
  console.log('light', JSON.stringify(light))
  expect(light.width).toBe('thin')
  expect(light.gutter).toBeGreaterThan(0)
  expect(light.gutter).toBeLessThanOrEqual(12)

  // The thumb, at the top of the vertical bar: a quiet colour that darkens under the pointer.
  const box = (await scroller.boundingBox()) as { x: number; y: number; width: number; height: number }
  const thumb = { x: box.x + box.width - light.gutter, y: box.y + 4, width: light.gutter, height: 24 }
  const quiet = await page.screenshot({ clip: thumb, animations: 'disabled' })
  await shot(page, 'scrollbars')
  await page.mouse.move(thumb.x + light.gutter / 2, thumb.y + 12)
  await page.waitForTimeout(300)
  const hovered = await page.screenshot({ clip: thumb, animations: 'disabled' })
  expect(hovered.equals(quiet), 'the thumb changes under the pointer').toBe(false)

  const theme = page.getByRole('radiogroup', { name: 'Thema' })
  try {
    await theme.getByRole('radio', { name: 'Donker' }).click()
    await expect(page.locator('#root')).toHaveAttribute('data-theme', 'dark')
    const dark = await look()
    console.log('dark', JSON.stringify(dark))
    expect(dark.width).toBe('thin')
    expect(dark.colour).not.toBe(light.colour)
    await shot(page, 'scrollbars-dark')
  } finally {
    await theme.getByRole('radio', { name: 'Licht' }).click()
    await expect(page.locator('#root')).not.toHaveAttribute('data-theme', 'dark')
  }
})
