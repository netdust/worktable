import { expect, type Page, test } from '@playwright/test'
import { state, THEATRE } from './auth'
import { modelNode } from './tree'

const MODEL = 'Organisaties'
const RENAMED = 'Adresboek'
const SHOTS = process.env.MODEL_MENU_SHOTS

const modelMenu = async (page: Page, model: string) => {
  const node = modelNode(page, model)
  await node.locator('.nv-model').first().hover()
  await node.getByRole('button', { name: `Meer voor ${model}`, exact: true }).click()
  return page.getByRole('menu', { name: `Meer voor ${model}` })
}

test.describe('the model menu as an administrator', () => {
  test.use({ storageState: state('admin'), viewport: { width: 1280, height: 800 } })

  // The e2e database is shared by every flow: the declared name and icon come back whatever happens here.
  test.afterEach(async ({ page }) => {
    const reset = await page.request.put(`${THEATRE.app}/api/sources/organisatie/display`, {
      data: { label: null, icon: null },
    })
    expect(reset.status()).toBe(200)
  })

  test('the-open-models-menu-exports @e2e', async ({ page }) => {
    await page.goto('/')
    const open = 'Activiteiten'
    const menu = await modelMenu(page, open)
    await expect(menu.getByRole('menuitem')).toHaveText(['Naam wijzigen', 'Icoon wijzigen', 'Exporteren', 'Inklappen'])
    if (SHOTS) await page.screenshot({ path: `${SHOTS}/menu.png`, clip: { x: 0, y: 0, width: 520, height: 400 } })
    const download = page.waitForEvent('download')
    await menu.getByRole('menuitem', { name: 'Exporteren' }).click()
    expect((await download).suggestedFilename()).toMatch(/\.xlsx$/)

    await (await modelMenu(page, open)).getByRole('menuitem', { name: 'Icoon wijzigen' }).click()
    const icons = modelNode(page, open).getByRole('group', { name: `Icoon voor ${open}` })
    await expect(icons.getByRole('button')).toHaveCount(12)
    if (SHOTS) await page.screenshot({ path: `${SHOTS}/icons.png`, clip: { x: 0, y: 0, width: 520, height: 400 } })
    await page.keyboard.press('Escape')
    await expect(icons).toHaveCount(0)
  })

  test('rename-and-icon-a-model @e2e', async ({ page }) => {
    await page.goto('/')
    const menu = await modelMenu(page, MODEL)
    await expect(menu.getByRole('menuitem')).toHaveText([
      'Naam wijzigen',
      'Icoon wijzigen',
      /^Exporteren/,
      'Uitklappen',
    ])
    await menu.getByRole('menuitem', { name: 'Naam wijzigen' }).click()
    const field = page.getByRole('textbox', { name: `Nieuwe naam voor ${MODEL}` })
    await field.fill(RENAMED)
    await field.press('Enter')
    await expect(modelNode(page, RENAMED)).toBeVisible()

    await (await modelMenu(page, RENAMED)).getByRole('menuitem', { name: 'Icoon wijzigen' }).click()
    const icons = modelNode(page, RENAMED).getByRole('group', { name: `Icoon voor ${RENAMED}` })
    await icons.getByRole('button', { name: 'Ster' }).click()
    await expect(icons).toHaveCount(0)

    // Stored by the engine, for everyone: a reload serves the new name and icon.
    await page.reload()
    const node = modelNode(page, RENAMED)
    await page.mouse.move(900, 700)
    await expect(node.locator('.nv-model__lead .lucide-star')).toBeVisible()
  })
})

test.describe('the model menu as an editor', () => {
  test.use({ storageState: state('editor') })

  test('name-and-icon-are-for-administrators @e2e', async ({ page }) => {
    await page.goto('/')
    const menu = await modelMenu(page, MODEL)
    const reason = 'Alleen een beheerder kan dit wijzigen'
    for (const item of ['Naam wijzigen', 'Icoon wijzigen']) {
      await expect(menu.getByRole('menuitem', { name: new RegExp(`^${item}`) })).toHaveAttribute(
        'aria-disabled',
        'true',
      )
    }
    await expect(menu.getByText(reason)).toHaveCount(2)
    const refused = await page.request.put(`${THEATRE.app}/api/sources/organisatie/display`, { data: { label: 'X' } })
    expect(refused.status()).toBe(403)
  })
})
