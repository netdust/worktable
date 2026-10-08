import { expect, test } from '@playwright/test'
import { shot } from './shots'
import { modelNode, openView } from './tree'

test('tree-scrolls-in-rail @e2e', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 700 })
  await page.goto('/')
  const tree = page.getByRole('tree', { name: 'Views' })
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

test('query-views-under-model @e2e', async ({ page }) => {
  await page.goto('/')
  const node = modelNode(page, 'Activiteiten')
  await expect(node).toHaveAttribute('aria-expanded', 'true')
  // The views' own buttons: each row also holds its drag button, "Verplaats <view>".
  const names = node.getByRole('group', { name: 'View type' }).getByRole('button', { name: /^(?!Verplaats )/ })
  const queries = ['Dagplanning', 'Per productie per dag', 'Voorstellingen']
  await expect(names.last()).toHaveText('Voorstellingen')
  expect((await names.allTextContents()).slice(-3)).toEqual(queries)

  for (const query of queries) await expect(modelNode(page, query)).toHaveCount(0)
  const nodes = page.getByRole('tree', { name: 'Views' }).getByRole('treeitem')
  await expect(nodes.last()).toHaveAccessibleName('Sjablonen')

  const rows = page.waitForResponse((res) => new URL(res.url()).pathname === '/api/rows/dagplanning')
  await openView(page, 'Dagplanning', 'Activiteiten')
  expect((await rows).status()).toBe(200)
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Dagplanning')
  await expect(page.locator('.nv-bar .nv-chip--filter')).toHaveText(['Plandag deze week'])
  await shot(page, 'query-views-under-model')
})
