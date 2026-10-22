import { expect, type Page, test } from '@playwright/test'
import { openView } from './tree'

const APP = 'http://127.0.0.1:5177'

test.use({ baseURL: APP, storageState: 'e2e/.tmp/state/selection-editor.json' })

async function rows<T>(page: Page, dataset: string): Promise<T[]> {
  const response = await page.request.get(`/api/rows/${dataset}?limit=500`)
  expect(response.status()).toBe(200)
  return ((await response.json()) as { rows: T[] }).rows
}

async function open(page: Page, view: string, model: string) {
  await page.goto('/')
  await openView(page, view, model)
  await expect(page.locator('tbody tr.nv-tr').first()).toBeVisible()
}

const tick = (page: Page, name: string) => page.getByRole('checkbox', { name: `${name} selecteren` }).check()

async function gather(page: Page, name: string) {
  await page.getByRole('textbox', { name: 'Name' }).fill(name)
  await page.getByRole('button', { name: 'Gather', exact: true }).click()
}

test('select-and-run: tick two rows, run once, one notice, and Undo takes the run back', async ({ page }) => {
  await open(page, 'All members', 'Members')
  await tick(page, 'Ann')
  await tick(page, 'Cy')
  await expect(page.getByRole('region', { name: '2 geselecteerd' })).toBeVisible()
  await page.screenshot({ path: 'e2e/.tmp/selection-bar.png' })

  await gather(page, 'Duo')

  const notice = page.getByRole('status', { name: 'Gather uitgevoerd.' })
  await expect(notice).toHaveCount(1)
  await expect(page.getByRole('region', { name: /geselecteerd/ })).toHaveCount(0)
  const made = (await rows<{ id: number; name: string }>(page, 'bundle')).filter((b) => b.name === 'Duo')
  expect(made).toHaveLength(1)
  const ties = (await rows<{ bundle_id: number; member_id: number }>(page, 'tie')).filter(
    (t) => t.bundle_id === made[0]?.id,
  )
  expect(ties.map((t) => t.member_id).sort()).toEqual([1, 3])

  await open(page, 'All bundles', 'Bundles')
  await expect(page.getByRole('row', { name: /Duo/ })).toHaveCount(1)
  await page.goto('/')
  await openView(page, 'All members', 'Members')
  await tick(page, 'Bob')
  await gather(page, 'Even')
  await page.getByRole('status', { name: 'Gather uitgevoerd.' }).getByRole('button', { name: 'Ongedaan maken' }).click()
  await expect
    .poll(async () => (await rows<{ name: string }>(page, 'bundle')).filter((b) => b.name === 'Even').length)
    .toBe(0)
})

test('select-all-in-view: the header box takes the filtered rows, and the parent holds exactly those', async ({
  page,
}) => {
  await open(page, 'Alpha members', 'Members')
  await page.getByRole('checkbox', { name: 'Alle rijen selecteren' }).check()
  await expect(page.getByRole('region', { name: '3 geselecteerd' })).toBeVisible()

  await gather(page, 'Alpha-set')

  await expect(page.getByRole('status', { name: 'Gather uitgevoerd.' })).toBeVisible()
  const made = (await rows<{ id: number; name: string }>(page, 'bundle')).filter((b) => b.name === 'Alpha-set')
  expect(made).toHaveLength(1)
  const ties = (await rows<{ bundle_id: number; member_id: number }>(page, 'tie')).filter(
    (t) => t.bundle_id === made[0]?.id,
  )
  expect(ties).toHaveLength(3)
})
