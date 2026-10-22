import { expect, type Page, test } from '@playwright/test'
import { shot } from './shots'
import { openView } from './tree'

const APP = 'http://127.0.0.1:5177'

test.use({ baseURL: APP, storageState: 'e2e/.tmp/state/selection-editor.json' })

async function open(page: Page, view: string, model: string) {
  await page.goto('/')
  await openView(page, view, model)
  await expect(page.locator('tbody tr.nv-tr').first()).toBeVisible()
}

const drawerOf = async (page: Page, title: string) => {
  await page.getByRole('row', { name: new RegExp(title) }).getByRole('button', { name: 'Openen' }).click()
  return page.getByRole('complementary', { name: title })
}

test('press-a-button @e2e: a declared transition is a button, the drawer shows the next one, and Undo takes it back', async ({ page }) => {
  await open(page, 'All members', 'Members')
  const drawer = await drawerOf(page, 'Ann')
  await expect(drawer.getByRole('button', { name: 'Start', exact: true })).toBeVisible()
  await expect(drawer.getByRole('button', { name: 'Finish', exact: true })).toHaveCount(0)
  await expect(drawer.getByRole('button', { name: 'Reopen' })).toHaveCount(0)
  await shot(page, 'drawer-buttons')

  await drawer.getByRole('button', { name: 'Start', exact: true }).click()

  await expect(drawer.getByRole('button', { name: 'Finish', exact: true })).toBeVisible()
  await expect(drawer.getByRole('button', { name: 'Start', exact: true })).toHaveCount(0)
  await expect(drawer.getByRole('button', { name: 'Back', exact: true })).toHaveCount(0)
  const notice = page.getByRole('status', { name: 'Start gedaan.' })
  await expect(notice).toHaveCount(1)

  await notice.getByRole('button', { name: 'Ongedaan maken' }).click()
  await expect(drawer.getByRole('button', { name: 'Start', exact: true })).toBeVisible()
  await expect(drawer.getByRole('button', { name: 'Finish', exact: true })).toHaveCount(0)
})

test('link-item-button @e2e: a link item offers its record’s button and detail, and the list shows its new state', async ({ page }) => {
  await open(page, 'All bundles', 'Bundles')
  const drawer = await drawerOf(page, 'Alpha')
  const entries = drawer.getByRole('region', { name: /Entries/ })
  await expect(entries.getByText('Bring a pen')).toBeVisible()
  await expect(entries.getByRole('button', { name: 'Decline' })).toBeVisible()
  await shot(page, 'drawer-link-item-button')

  await entries.getByRole('button', { name: 'Confirm' }).click()

  await expect(entries.getByText('Confirmed')).toBeVisible()
  await expect(entries.getByRole('button', { name: 'Confirm' })).toHaveCount(0)
})
