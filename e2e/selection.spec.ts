import { expect, type Page, test } from '@playwright/test'
import { offered, pressInMenu } from './drawer'
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

test('select-and-run @e2e: tick two rows, run once, one notice, and Undo takes the run back', async ({ page }) => {
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

test('select-all-in-view @e2e: the header box takes the filtered rows, and the parent holds exactly those', async ({
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

test('run-from-drawer @e2e: the open record alone, and the parent holds exactly that one', async ({ page }) => {
  await open(page, 'All members', 'Members')
  await page.getByRole('row', { name: /Bob/ }).getByRole('button', { name: 'Openen' }).click()
  await pressInMenu(page, 'Gather')
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

test('link-opens-record @e2e: a link item opens its record to read, and the links cell removes it', async ({
  page,
}) => {
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

test('tree-hides-link-table @e2e: the link dataset is not in the tree', async ({ page }) => {
  await page.goto('/')
  await expect(modelNode(page, 'Members')).toBeVisible()
  await expect(modelNode(page, 'Ties')).toHaveCount(0)
})

test('add-from-query @e2e: + Nieuw on the query calendar asks the title, fills the day, and Undo removes it', async ({
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

test('bar-reserves-its-strip @e2e: the bar reserves its strip: no row moves on the first tick, a second tick or Selectie wissen', async ({
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

test('tab-stops @e2e: Tab reaches the active row box and the header box, not every row box', async ({ page }) => {
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

test('three-digit-numbers @e2e: row numbers of three digits fit beside the box', async ({ page }) => {
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

test('selection-clear-and-empty-input @e2e: the run waits for its input, and Selectie wissen takes the bar away', async ({
  page,
}) => {
  await open(page, 'All members', 'Members')
  await tick(page, 'Ann')
  await expect(page.getByRole('button', { name: 'Gather', exact: true })).toBeDisabled()
  await page.getByRole('textbox', { name: 'Name' }).fill('Gevuld')
  await expect(page.getByRole('button', { name: 'Gather', exact: true })).toBeEnabled()
  await page.getByRole('button', { name: 'Selectie wissen' }).click()
  await expect(page.getByRole('region', { name: /geselecteerd/ })).toHaveCount(0)
  await expect(page.locator('tbody input[type=checkbox]:checked')).toHaveCount(0)
})

test('double-submit-run @e2e: a double click on the action button runs it once', async ({ page }) => {
  await open(page, 'All members', 'Members')
  await tick(page, 'Bob')
  await page.getByRole('textbox', { name: 'Name' }).fill('Eenmaal')
  await page.getByRole('button', { name: 'Gather', exact: true }).dblclick()
  await expect(page.getByRole('status', { name: 'Gather uitgevoerd.' })).toHaveCount(1)
  await page.waitForTimeout(500)
  expect((await rows<{ name: string }>(page, 'bundle')).filter((b) => b.name === 'Eenmaal')).toHaveLength(1)
})

test('refused-run @e2e: a refusal mid-run writes nothing, says why, and keeps the selection', async ({ page }) => {
  const before = (await rows(page, 'bundle')).length
  await open(page, 'All members', 'Members')
  await tick(page, 'Ann')
  await tick(page, 'Bob')
  await gather(page, 'refused')
  await expect(page.getByRole('alert')).toHaveText('that note is refused')
  await expect(page.getByRole('region', { name: '2 geselecteerd' })).toBeVisible()
  expect(await rows(page, 'bundle')).toHaveLength(before)
})

test('stale-id-run @e2e: a ticked row gone before the run gives the Dutch notice, a re-read and a run that works', async ({
  page,
}) => {
  const made = await page.request.post('/api/rows/member', { data: { name: 'Weg', bundle_id: 2 } })
  expect(made.status()).toBe(201)
  const { id } = (await made.json()) as { id: number }
  try {
    await open(page, 'All members', 'Members')
    await tick(page, 'Weg')
    await tick(page, 'Ann')
    expect((await page.request.delete(`/api/rows/member/${id}`)).status()).toBe(200)
    await page.getByRole('button', { name: 'Touch', exact: true }).click()
    await expect(page.getByRole('alert')).toHaveText('Een of meer rijen bestaan niet meer; de lijst is bijgewerkt.')
    await expect(page.getByRole('row', { name: /Weg/ })).toHaveCount(0)
    await expect(page.getByRole('region', { name: '1 geselecteerd' })).toBeVisible()
    await page.getByRole('button', { name: 'Touch', exact: true }).click()
    await expect(page.getByRole('status', { name: 'Touch uitgevoerd.' })).toHaveCount(1)
  } finally {
    await page.request.delete(`/api/rows/member/${id}`)
  }
})

test('drawer-escape @e2e: Escape closes the drawer that carries the run', async ({ page }) => {
  await open(page, 'All members', 'Members')
  await page.getByRole('row', { name: /Bob/ }).getByRole('button', { name: 'Openen' }).click()
  await expect.poll(() => offered(page)).toContain('Gather')
  await page.keyboard.press('Escape')
  await expect(page.getByRole('complementary')).toHaveCount(0)
})

test('add-from-query-refusals @e2e: an empty title is refused in the dialog, and a double submit adds one record', async ({
  page,
}) => {
  await page.goto('/')
  await openView(page, 'Calendar', 'Roster')
  await page.getByRole('button', { name: 'Nieuw Slots' }).click()
  const dialog = page.getByRole('dialog', { name: 'Nieuw Slots' })
  await dialog.getByRole('button', { name: 'Aanmaken' }).click()
  await expect(dialog.getByRole('alert')).toBeVisible()
  expect((await rows<{ name: string }>(page, 'slot')).filter((s) => s.name === '')).toHaveLength(0)
  await dialog.getByRole('textbox', { name: 'Name' }).fill('Tweemaal')
  await dialog.getByRole('button', { name: 'Aanmaken' }).dblclick()
  await expect(dialog).toHaveCount(0)
  await page.waitForTimeout(500)
  expect((await rows<{ name: string }>(page, 'slot')).filter((s) => s.name === 'Tweemaal')).toHaveLength(1)
})

test('checkbox-column-aligned @e2e: every row box sits at one x, whatever digits its row number has', async ({
  page,
}) => {
  await open(page, 'All members', 'Members')
  const xs = await page
    .locator('tbody td.nv-num input')
    .evaluateAll((boxes) => [...new Set(boxes.map((box) => Math.round(box.getBoundingClientRect().x)))])
  expect(xs).toHaveLength(1)
})

test('transport-failures-run @e2e: a dropped request, a 500 and a lost session each say so and lose no selection', async ({
  page,
  context,
}) => {
  await open(page, 'All members', 'Members')
  await tick(page, 'Ann')
  const touch = page.getByRole('button', { name: 'Touch', exact: true })
  await page.route('**/api/actions/touch', (route) => route.abort('failed'))
  await touch.click()
  await expect(page.getByRole('alert')).toBeVisible()
  await expect(page.getByRole('region', { name: '1 geselecteerd' })).toBeVisible()
  await page.unroute('**/api/actions/touch')
  await page.route('**/api/actions/touch', (route) =>
    route.fulfill({ status: 500, contentType: 'application/json', body: '{"code":"boom","message":"Internal error"}' }),
  )
  await touch.click()
  await expect(page.getByRole('alert')).toHaveText('Internal error')
  await expect(page.getByRole('region', { name: '1 geselecteerd' })).toBeVisible()
  await page.unroute('**/api/actions/touch')
  await touch.click()
  await expect(page.getByRole('status', { name: 'Touch uitgevoerd.' })).toHaveCount(1)

  await tick(page, 'Bob')
  await context.clearCookies()
  await touch.click()
  await expect(page.getByRole('form', { name: 'Aanmelden' })).toBeVisible()
})
