import { expect, type Page, request, test } from '@playwright/test'
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
  await page
    .getByRole('row', { name: new RegExp(title) })
    .getByRole('button', { name: 'Openen' })
    .click()
  return page.getByRole('complementary', { name: title })
}

test('press-a-button @e2e: a declared transition is a button, the drawer shows the next one, and Undo takes it back', async ({
  page,
}) => {
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

test('link-item-button @e2e: a link item offers its record’s button and detail, and the list shows its new state', async ({
  page,
}) => {
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

test('action-opens-its-result @e2e: tick rows, run, and the record the run made opens in the drawer', async ({
  page,
}) => {
  await open(page, 'All members', 'Members')
  await page.getByRole('checkbox', { name: 'Ann selecteren' }).check()
  await page.getByRole('checkbox', { name: 'Bob selecteren' }).check()

  await page.getByRole('button', { name: 'Sweep', exact: true }).click()

  const drawer = page.getByRole('complementary', { name: 'Swept 2' })
  await expect(drawer).toBeVisible()
  await expect(page.getByRole('region', { name: /geselecteerd/ })).toHaveCount(0)
  await shot(page, 'drawer-action-result')
})

test('drawer-follows-an-outside-change @e2e: with the drawer open, a second account moves the record and the drawer follows', async ({
  page,
}) => {
  const outside = await request.newContext({ baseURL: APP, storageState: 'e2e/.tmp/state/selection-admin.json' })
  const move = async (to: string, from: string) => {
    const reply = await outside.patch('/api/rows/member/4', { data: { stage: to, expect: { stage: from } } })
    expect(reply.status()).toBe(200)
  }
  await move('active', 'new')
  await open(page, 'All members', 'Members')
  const drawer = await drawerOf(page, 'Di')
  await expect(drawer.getByRole('button', { name: 'Finish', exact: true })).toBeVisible()
  await expect(drawer.getByText('Bezig…')).toBeVisible()
  await shot(page, 'drawer-live')

  await move('done', 'active')

  await expect(drawer.getByRole('button', { name: 'Finish', exact: true })).toHaveCount(0, { timeout: 5000 })
  await expect(drawer.getByText('Bezig…')).toHaveCount(0)
  await expect(drawer.getByRole('button', { name: 'Park', exact: true })).toBeVisible()
  await outside.dispose()
})

test('dashboard-row-opens-drawer @e2e: a list row opens its record on the dashboard, a press moves it, and the tile’s count follows', async ({
  page,
}) => {
  await page.goto('/')
  const tile = page.getByRole('region', { name: 'Waiting members' })
  const total = async () =>
    Number(
      (await tile.getByRole('button', { name: /^Waiting members · \d+$/ }).getAttribute('aria-label'))?.split('· ')[1],
    )
  await expect(tile.getByRole('listitem').first()).toBeVisible()
  const before = await total()

  await tile
    .getByRole('listitem')
    .first()
    .getByRole('button', { name: /^Open / })
    .click()
  const drawer = page.getByRole('complementary')
  await expect(drawer.getByRole('button', { name: 'Start', exact: true })).toBeVisible()
  await shot(page, 'dashboard-row-drawer')
  await drawer.getByRole('button', { name: 'Start', exact: true }).click()

  await expect(drawer.getByRole('button', { name: 'Finish', exact: true })).toBeVisible()
  await expect.poll(total).toBe(before - 1)
  await page
    .getByRole('status', { name: /gedaan\./ })
    .getByRole('button', { name: 'Ongedaan maken' })
    .click()
  await expect(drawer.getByRole('button', { name: 'Start', exact: true })).toBeVisible()
  await expect.poll(total).toBe(before)
})
