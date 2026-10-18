import { expect, test } from '@playwright/test'
import { shot } from './shots'
import { modelNode, openModel } from './tree'

test('tree-scrolls-in-rail @e2e', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 700 })
  await page.goto('/')
  const tree = page.getByRole('tree', { name: 'Views' })
  // The grid lands on the dashboard; Activiteiten opens on a click.
  await openModel(page, 'Activiteiten')
  await expect(modelNode(page, 'Activiteiten')).toHaveAttribute('aria-expanded', 'true')

  const folded = tree.getByRole('button', { name: 'Uitklappen' })
  while ((await folded.count()) > 0) await folded.first().click()

  expect(await page.evaluate(() => (document.scrollingElement?.scrollHeight ?? 0) <= window.innerHeight)).toBe(true)
  expect(await tree.evaluate((el) => el.scrollHeight > el.clientHeight)).toBe(true)

  const last = modelNode(page, 'Sjablonen')
  await last.scrollIntoViewIfNeeded()
  await last.getByRole('button', { name: 'Weergave toevoegen aan Sjablonen' }).click()
  const menu = page.getByRole('menu', { name: 'Weergave toevoegen aan Sjablonen' })
  await expect(menu.getByRole('menuitem', { name: 'Grid' })).toBeInViewport({ ratio: 1 })
  expect(await tree.evaluate((el, m) => el.contains(m), await menu.elementHandle())).toBe(false)
  await shot(page, 'tree-scrolled-menu')
})
