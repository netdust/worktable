import { expect, type Page, test } from '@playwright/test'
import { modelNode, openView } from './tree'

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

test('run-from-drawer: the open record alone, and the parent holds exactly that one', async ({ page }) => {
  await open(page, 'All members', 'Members')
  await page.getByRole('row', { name: /Bob/ }).getByRole('button', { name: 'Openen' }).click()
  const group = page.getByRole('group', { name: 'Gather' })
  await group.getByRole('textbox', { name: 'Name' }).fill('Solo')
  await group.getByRole('button', { name: 'Gather', exact: true }).click()

  await expect(page.getByRole('status', { name: 'Gather uitgevoerd.' })).toBeVisible()
  const made = (await rows<{ id: number; name: string }>(page, 'bundle')).filter((b) => b.name === 'Solo')
  expect(made).toHaveLength(1)
  const ties = (await rows<{ bundle_id: number; member_id: number }>(page, 'tie')).filter(
    (t) => t.bundle_id === made[0]?.id,
  )
  expect(ties.map((t) => t.member_id)).toEqual([2])
})

test('link-opens-record: a link item opens its record to read, and the links cell removes it', async ({ page }) => {
  const run = await page.request.post('/api/actions/gather', { data: { ids: [2], input: { name: 'Linked' } } })
  expect(run.status()).toBe(201)
  const linked = async () => {
    const bundle = (await rows<{ id: number; name: string }>(page, 'bundle')).find((b) => b.name === 'Linked')
    return (await rows<{ bundle_id: number }>(page, 'tie')).filter((t) => t.bundle_id === bundle?.id).length
  }
  expect(await linked()).toBe(1)

  await open(page, 'All bundles', 'Bundles')
  await page
    .getByRole('row', { name: /Linked/ })
    .getByRole('button', { name: 'Openen' })
    .click()
  await page.getByRole('complementary', { name: 'Linked' }).getByRole('button', { name: 'Bob' }).click()
  const record = page.getByRole('complementary', { name: 'Linked' })
  await expect(record.getByText('Ties')).toBeVisible()
  await expect(record.getByRole('definition').filter({ hasText: 'Bob' })).toBeVisible()
  await expect(record.getByText('Linked', { exact: true })).toHaveCount(3)
  await expect(page.getByRole('textbox')).toHaveCount(0)

  await record.getByRole('button', { name: 'Sluiten' }).click()
  const cell = page
    .getByRole('row', { name: /Linked/ })
    .getByRole('gridcell')
    .nth(1)
  await cell.click()
  await cell.press('Enter')
  await page.getByRole('button', { name: 'Bob verwijderen' }).click()
  await expect.poll(linked).toBe(0)
})

test('tree-hides-link-table: the link dataset is not in the tree', async ({ page }) => {
  await page.goto('/')
  await expect(modelNode(page, 'Members')).toBeVisible()
  await expect(modelNode(page, 'Ties')).toHaveCount(0)
})

test('add-from-query: + Nieuw on the query calendar asks the title, fills the day, and Undo removes it', async ({
  page,
}) => {
  await page.goto('/')
  await openView(page, 'Calendar', 'Roster')
  await page.getByRole('button', { name: 'Nieuw Slots' }).click()
  const dialog = page.getByRole('dialog', { name: 'Nieuw Slots' })
  await dialog.getByRole('textbox', { name: 'Name' }).fill('Kick-off')
  await dialog.getByRole('button', { name: 'Aanmaken' }).click()

  await expect(dialog).toHaveCount(0)
  const made = () =>
    rows<{ id: number; name: string; day: string }>(page, 'slot').then((all) =>
      all.filter((s) => s.name === 'Kick-off'),
    )
  const [slot] = await made()
  expect(slot?.day).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  await expect(page.getByText('Kick-off').first()).toBeVisible()

  await page.keyboard.press('Control+z')
  await expect.poll(async () => (await made()).length).toBe(0)
})

test('the bar reserves its strip: no row moves on the first tick, a second tick or Selectie wissen', async ({
  page,
}) => {
  await open(page, 'All members', 'Members')
  const row = page.getByRole('row', { name: /Cy/ })
  const top = async () => (await row.boundingBox())?.y
  const before = await top()

  await tick(page, 'Ann')
  expect(await top()).toBe(before)
  await tick(page, 'Bob')
  expect(await top()).toBe(before)
  await page.getByRole('button', { name: 'Selectie wissen' }).click()
  await expect(page.getByRole('region', { name: /geselecteerd/ })).toHaveCount(0)
  expect(await top()).toBe(before)
})

test('Tab reaches the active row box and the header box, not every row box', async ({ page }) => {
  await open(page, 'All members', 'Members')
  await page.getByRole('row', { name: /Bob/ }).locator('td[data-cell]').first().click()
  const focused = () =>
    page.evaluate(() => (document.activeElement as HTMLInputElement | null)?.getAttribute('aria-label') ?? '')
  const stops = await page.evaluate(
    () =>
      [...document.querySelectorAll<HTMLInputElement>('tbody input[type=checkbox]')].filter((box) => box.tabIndex >= 0)
        .length,
  )
  expect(stops).toBe(1)

  await page.keyboard.press('Shift+Tab')
  expect(await focused()).toBe('Bob selecteren')
  await page.keyboard.press('Shift+Tab')
  expect(await focused()).not.toMatch(/ selecteren$/)
})

test('row numbers of three digits fit beside the box', async ({ page }) => {
  await open(page, 'Beta members', 'Members')
  const last = page.locator('tbody tr.nv-tr').last()
  const cell = last.locator('td.nv-num')
  await expect(cell.locator('span')).toHaveText('111')
  const [box, number, width] = await Promise.all([
    cell.locator('input').boundingBox(),
    cell.locator('span').boundingBox(),
    cell.evaluate((td) => ({ scroll: td.scrollWidth, client: td.clientWidth })),
  ])
  expect(box && number && box.x + box.width <= number.x).toBe(true)
  expect(width.scroll).toBeLessThanOrEqual(width.client)
})
