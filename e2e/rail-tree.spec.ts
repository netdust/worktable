import { expect, test } from '@playwright/test'
import { shot } from './shots'
import { modelNode } from './tree'

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

test('dagplanning-is-gone @e2e', async ({ page }) => {
  const rows = page.waitForResponse((res) => new URL(res.url()).pathname === '/api/rows/activiteit')
  await page.goto('/')
  const node = modelNode(page, 'Activiteiten')
  await expect(node).toHaveAttribute('aria-expanded', 'true')
  // The landing view is Planning on Activiteiten, first under it.
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Planning')
  // The views' own buttons: each row also holds its drag button, "Verplaats <view>".
  const names = node.getByRole('group', { name: 'View type' }).getByRole('button', { name: /^(?!Verplaats )/ })
  await expect(names.first()).toHaveText('Planning')
  expect(await names.allTextContents()).toContain('Toewijzingen per activiteit')
  expect(await names.allTextContents()).not.toContain('Voorstellingen')
  expect(await names.allTextContents()).not.toContain('Per productie per dag')

  // No Dagplanning anywhere in the rail; the queries sit under Overzichten.
  const rail = page.getByRole('navigation', { name: 'Views' })
  await expect(rail.getByText('Dagplanning')).toHaveCount(0)
  expect((await page.request.get('/api/rows/dagplanning')).status()).toBe(404)
  await expect(modelNode(page, 'Planning')).toHaveCount(0)
  const overzichten = rail.getByRole('group', { name: 'Overzichten', exact: true })
  for (const query of ['Per productie per dag', 'Voorstellingen', 'Mijn producties'])
    await expect(overzichten.getByRole('treeitem', { name: query, exact: true })).toHaveCount(1)

  expect((await rows).status()).toBe(200)
  await expect(page.locator('.nv-bar .nv-chip--filter')).toHaveText(['Plandag deze week'])
  await overzichten.scrollIntoViewIfNeeded()
  await shot(page, 'dagplanning-is-gone')
})
