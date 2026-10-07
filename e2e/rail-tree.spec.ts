import { expect, test } from '@playwright/test'
import { modelNode } from './tree'

test('tree-scrolls-in-rail', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 700 })
  await page.goto('/#from=2026-10-12')
  const tree = page.getByRole('tree', { name: 'Views' })
  await expect(modelNode(page, 'Activiteiten')).toHaveAttribute('aria-expanded', 'true')

  const folded = tree.getByRole('button', { name: 'Uitklappen' })
  while ((await folded.count()) > 0) await folded.first().click()

  expect(await page.evaluate(() => (document.scrollingElement?.scrollHeight ?? 0) <= window.innerHeight)).toBe(true)
  expect(await tree.evaluate((el) => el.scrollHeight > el.clientHeight)).toBe(true)

  const last = modelNode(page, 'Voorstellingen')
  await last.scrollIntoViewIfNeeded()
  await last.getByRole('button', { name: 'Weergave toevoegen aan Voorstellingen' }).click()
  const menu = page.getByRole('menu', { name: 'Weergave toevoegen aan Voorstellingen' })
  await expect(menu.getByRole('menuitem', { name: 'Grid' })).toBeInViewport({ ratio: 1 })
  expect(await tree.evaluate((el, m) => el.contains(m), await menu.elementHandle())).toBe(false)
})
