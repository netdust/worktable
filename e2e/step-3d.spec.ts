import { type APIRequestContext, expect, type Locator, type Page, test } from '@playwright/test'
import { cardIn } from './board'
import { openLooks } from './editor'
import { shot } from './shots'
import { modelNode, openView, openWeek } from './tree'

// Weeks the seed and the other specs leave empty, one per flow, so the shared database never moves a flow's rows.
const WEEK = {
  drawer: '2028-07-03',
  quick: '2028-07-17',
}
const SEED_WEEK = '2026-10-12'

type Api = APIRequestContext
type Values = Record<string, unknown>

const plusDays = (day: string, n: number) => {
  const d = new Date(`${day}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}
const pad = (n: number) => String(n).padStart(2, '0')
const localDay = (d = new Date()) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`

async function rowsOf<T = Values>(api: Api, source: string, filter?: Values): Promise<T[]> {
  const query = filter ? `&filter=${encodeURIComponent(JSON.stringify(filter))}` : ''
  const response = await api.get(`/api/rows/${source}?limit=500${query}`)
  expect(response.status()).toBe(200)
  return ((await response.json()) as { rows: T[] }).rows
}

async function idOf(api: Api, dataset: string, values: Values): Promise<number> {
  const response = await api.post(`/api/rows/${dataset}`, { data: values })
  expect(response.status(), await response.text()).toBe(201)
  return ((await response.json()) as { id: number }).id
}

const idByName = async (api: Api, dataset: string, column: string, name: string) =>
  (await rowsOf<Values & { id: number }>(api, dataset)).find((r) => r[column] === name)?.id as number

const nachtwacht = (api: Api) => idByName(api, 'productie', 'titel', 'Nachtwacht')

async function activity(api: Api, omschrijving: string, day: string, status = 'bevestigd') {
  return idOf(api, 'activiteit', {
    productie_id: await nachtwacht(api),
    soort: 'repetitie',
    status,
    omschrijving,
    datum: day,
    start_at: `${day}T10:00`,
    eind_at: `${day}T12:00`,
  })
}

async function removeActivity(api: Api, id: number) {
  for (const t of await rowsOf<{ id: number }>(api, 'toewijzing', { activiteit_id: id }))
    await api.delete(`/api/rows/toewijzing/${t.id}`)
  await api.delete(`/api/rows/activiteit/${id}`)
}

const heading = (page: Page) => page.getByRole('heading', { level: 1 })
const bar = (page: Page) => page.locator('.nv-bar')
const groupChip = (page: Page) =>
  bar(page)
    .locator('.nv-chip')
    .filter({ hasText: /^Groep: / })

async function openGroep(page: Page): Promise<Locator> {
  await groupChip(page).click()
  const list = page.getByRole('group', { name: 'Groeperen' })
  await expect(list).toBeVisible()
  return list
}

test.describe('step 3d', () => {
  test('looks-gridlines @e2e', async ({ page }) => {
    const root = page.locator('#root')
    const cell = () => page.locator('.nv-grid:not(.nv-mx) tbody .nv-td').first()
    const lineWidth = () => cell().evaluate((el) => getComputedStyle(el).borderRightWidth)
    try {
      // The seed's week: the looks need rows, and the seed's activities are fixed in that week.
      await openWeek(page, 'Planning', 'Activiteiten', 'plandag', SEED_WEEK)
      await expect(cell()).toBeVisible()
      // Folded by default: the card's rows are not on the page, yet its looks already apply.
      await expect(page.getByRole('button', { name: 'Bijstellen' })).toHaveAttribute('aria-expanded', 'false')
      await expect(page.getByRole('radiogroup', { name: 'Rasterlijnen' })).toHaveCount(0)
      await expect(root).toHaveAttribute('data-lines', 'off')
      expect(await lineWidth()).toBe('0px')

      await openLooks(page)
      for (const name of ['Rijhoogte', 'Dagkop', 'Rasterlijnen', 'Zebrarijen', 'Thema'])
        await expect(page.getByRole('radiogroup', { name })).toBeVisible()
      const lines = page.getByRole('radiogroup', { name: 'Rasterlijnen' })
      await expect(lines.getByRole('radio', { name: 'Uit' })).toBeChecked()
      await lines.getByRole('radio', { name: 'Aan' }).click()
      await expect(root).toHaveAttribute('data-lines', 'on')
      await expect.poll(lineWidth).toBe('1px')
      await shot(page, 'looks-gridlines')

      // Re-entry: the choice outlives a reload and a folded card.
      await page.getByRole('button', { name: 'Bijstellen' }).click()
      await page.reload()
      await expect(page.getByRole('button', { name: 'Bijstellen' })).toHaveAttribute('aria-expanded', 'false')
      await expect(root).toHaveAttribute('data-lines', 'on')
      await expect.poll(lineWidth).toBe('1px')

      // A matrix keeps its own lines whatever the choice.
      await openWeek(page, 'Toewijzingen per activiteit', 'Activiteiten', 'plandag', SEED_WEEK)
      const matrixCell = page.locator('.nv-mx tbody td.nv-mx__cell').first()
      const ownLines = () =>
        matrixCell.evaluate((el) => `${getComputedStyle(el).borderLeftWidth} ${getComputedStyle(el).borderRightWidth}`)
      await expect(matrixCell).toBeVisible()
      await expect(root).toHaveAttribute('data-lines', 'on')
      const withLines = await ownLines()
      expect(withLines).not.toBe('0px 0px')
      await openLooks(page)
      await page.getByRole('radiogroup', { name: 'Rasterlijnen' }).getByRole('radio', { name: 'Uit' }).click()
      await expect(root).toHaveAttribute('data-lines', 'off')
      expect(await ownLines()).toBe(withLines)
    } finally {
      await page.evaluate(() => {
        localStorage.removeItem('ntdst-views/lines')
        localStorage.removeItem('ntdst-views/looks-open')
      })
    }
  })

  test('drawer-in-slot @e2e', async ({ page }) => {
    const api = page.request
    const title = 'e2e lade in de kolom'
    const id = await activity(api, title, plusDays(WEEK.drawer, 1))
    try {
      await page.setViewportSize({ width: 1600, height: 900 })
      await openWeek(page, 'Per status', 'Activiteiten', 'plandag', WEEK.drawer)
      const main = page.locator('main.nv-main')
      const before = await main.evaluate((el) => el.getBoundingClientRect().width)
      await cardIn(page, 'Bevestigd', title).click()

      const drawer = page.getByRole('complementary', { name: title })
      await expect(drawer).toBeVisible()
      // The drawer is the app's third column: in the slot beside main, full height, 392px, and the work narrows.
      expect(await drawer.evaluate((el) => el.parentElement?.className)).toBe('nv-drawer-slot')
      expect(await drawer.evaluate((el) => el.parentElement?.previousElementSibling?.matches('main.nv-main'))).toBe(
        true,
      )
      const box = await drawer.evaluate((el) => {
        const r = el.getBoundingClientRect()
        return { width: r.width, top: r.top, height: r.height, right: r.right }
      })
      // 392px and its 1px left border: the app's drawer is content-box, the prototype's border-box.
      expect(box).toMatchObject({ top: 0, height: 900, right: 1600 })
      expect(box.width).toBeGreaterThanOrEqual(392)
      expect(box.width).toBeLessThanOrEqual(393)
      await expect.poll(() => main.evaluate((el) => el.getBoundingClientRect().width)).toBe(before - box.width)
      await shot(page, 'drawer-in-slot')

      // Escape inside the drawer reaches its handler through the portal; the work takes its width back.
      // A skin opens its drawer without moving focus (useOpenRow), so focus goes in first.
      await drawer.getByRole('button', { name: 'Sluiten' }).focus()
      await page.keyboard.press('Escape')
      await expect(drawer).toHaveCount(0)
      await expect.poll(() => main.evaluate((el) => el.getBoundingClientRect().width)).toBe(before)

      // Boundary: narrow, the slot overlays the work rather than narrowing it.
      await page.setViewportSize({ width: 820, height: 900 })
      const narrow = await main.evaluate((el) => el.getBoundingClientRect().width)
      await cardIn(page, 'Bevestigd', title).click()
      await expect(drawer).toBeVisible()
      expect(await page.locator('.nv-drawer-slot').evaluate((el) => getComputedStyle(el).position)).toBe('fixed')
      expect(await main.evaluate((el) => el.getBoundingClientRect().width)).toBe(narrow)
      await shot(page, 'drawer-overlay-narrow')
      // Below 760px the drawer takes the whole width.
      await page.setViewportSize({ width: 700, height: 900 })
      await expect.poll(() => drawer.evaluate((el) => el.getBoundingClientRect().width)).toBe(700)
      await drawer.getByRole('button', { name: 'Sluiten' }).click()
      await expect(drawer).toHaveCount(0)
    } finally {
      await removeActivity(api, id)
    }
  })

  test('quick-create-calendar @e2e', async ({ page }) => {
    const api = page.request
    await page.goto('/')
    await openView(page, 'Kalender activiteiten', 'Activiteiten')
    const add = page.locator('.nv-toolbar').getByRole('button', { name: 'Nieuwe activiteit' })
    const dialog = page.getByRole('dialog', { name: 'Nieuwe activiteit' })
    const date = dialog.getByRole('textbox', { name: 'Datum', exact: true })
    // This week on screen: the date starts on today.
    await expect(add).toBeEnabled()
    await add.click()
    await expect(date).toHaveValue(localDay())
    await dialog.getByRole('button', { name: 'Annuleren' }).click()
    await expect(dialog).toHaveCount(0)

    // A week without today: the date starts on its first day.
    await openWeek(page, 'Kalender activiteiten', 'Activiteiten', 'plandag', WEEK.quick)
    await add.click()
    await expect(date).toHaveValue(WEEK.quick)
    await dialog.getByRole('combobox', { name: 'Productie', exact: true }).selectOption({ label: 'Nachtwacht' })
    await dialog.getByRole('combobox', { name: 'Soort', exact: true }).selectOption('repetitie')
    await shot(page, 'quick-create-calendar')
    // Double submit: one row.
    await dialog.getByRole('button', { name: 'Aanmaken' }).dblclick()
    await expect(dialog).toHaveCount(0)
    const made = await rowsOf<Values & { id: number }>(api, 'activiteit', { plandag: WEEK.quick })
    try {
      expect(made).toHaveLength(1)
      expect(made[0]).toMatchObject({ soort: 'repetitie', plandag: WEEK.quick })
      // It lands on the calendar without a reload: the dialog asks no time, so in the day's band.
      const event = page.getByRole('group', { name: 'Hele dag ma 17', exact: true }).getByRole('button')
      await expect(event).toHaveCount(1)
      // What was made can be read where it was made: a name, and the height of a line of text.
      await expect(event).not.toHaveAccessibleName('')
      expect((await event.boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(16)
      await expect(bar(page).locator('.nv-bar__count')).toHaveText('1 rij')
      await shot(page, 'quick-create-calendar-made')
    } finally {
      for (const row of made) await removeActivity(api, row.id)
    }

    // The same quick create on the board, the timeline and the gallery.
    await openView(page, 'Per status', 'Activiteiten')
    await expect(page.locator('.nv-toolbar').getByRole('button', { name: 'Nieuwe activiteit' })).toBeEnabled()
    await openView(page, 'Galerij activiteiten', 'Activiteiten')
    await expect(page.locator('.nv-toolbar').getByRole('button', { name: 'Nieuwe activiteit' })).toBeEnabled()
    await openView(page, 'Tijdlijn tourstops', 'Tourstops')
    await expect(page.locator('.nv-toolbar').getByRole('button', { name: 'Nieuwe tourstop' })).toBeEnabled()
  })

  test('new-timeline-defaults @e2e', async ({ page }) => {
    const api = page.request
    const name = 'e2e nieuwe tijdlijn'
    try {
      await page.goto('/')
      const node = modelNode(page, 'Tourstops')
      if ((await node.getAttribute('aria-expanded')) !== 'true')
        await node.getByRole('button', { name: 'Tourstops', exact: true }).first().click()
      const row = node.locator('.nv-model')
      await row.hover()
      await row.getByRole('button', { name: 'Weergave toevoegen aan Tourstops' }).click()
      await page
        .getByRole('menu', { name: 'Weergave toevoegen aan Tourstops' })
        .getByRole('menuitem', { name: 'Tijdlijn' })
        .click()
      const dialog = page.getByRole('dialog', { name: /^Nieuwe .*weergave$/ })
      await dialog.getByRole('textbox', { name: 'Naam' }).fill(name)
      await dialog.getByRole('button', { name: 'Weergave maken' }).click()
      await expect(dialog).toHaveCount(0)
      await expect(heading(page)).toHaveText(name)

      // This month, in lanes by the table's first lane.
      await expect(
        page.getByRole('radiogroup', { name: 'Periode' }).getByRole('radio', { name: 'Maand' }),
      ).toBeChecked()
      await expect(groupChip(page)).toHaveText('Groep: productie')
      const now = new Date()
      const length = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate()
      await expect(page.locator('.nv-tl__days > div')).toHaveCount(length)
      await expect(page.locator('.nv-tl__corner .nv-tl__count')).toBeVisible()
      await shot(page, 'new-timeline-defaults')

      // Re-entry: opened again, it keeps both.
      await page.reload()
      await openView(page, name, 'Tourstops')
      await expect(groupChip(page)).toHaveText('Groep: productie')
      await expect(page.locator('.nv-tl__days > div')).toHaveCount(length)
    } finally {
      const views = ((await (await api.get('/api/views')).json()) as { views: { id: number; name: string }[] }).views
      for (const v of views.filter((v) => v.name === name)) await api.delete(`/api/views/${v.id}`)
    }
  })

  test('timeline-scroll-holds @e2e', async ({ page }) => {
    // Mid-month: the sheet scrolls to today only from its fourth day on, so the 1st to the 3rd would prove nothing.
    const now = new Date()
    await page.clock.setFixedTime(new Date(now.getFullYear(), now.getMonth(), 15, 12))
    await page.goto('/')
    await openView(page, 'Tijdlijn tourstops', 'Tourstops')
    const sheet = page.locator('.nv-tl')
    const left = () => sheet.evaluate((el) => el.scrollLeft)
    // This month holds today: the sheet scrolls to it once.
    await expect.poll(left).toBeGreaterThan(0)
    await sheet.evaluate((el) => {
      el.scrollLeft = 0
    })
    // A reload of the same window (the rows read again under another Groep) keeps where the reader is.
    const list = await openGroep(page)
    await list.getByRole('button', { name: 'Geen' }).click()
    await page.keyboard.press('Escape')
    await expect(page.locator('.nv-tl__lane')).toHaveCount(1)
    expect(await left()).toBe(0)
    // A new window scrolls to today again once it holds today.
    await bar(page).getByRole('button', { name: 'Volgende periode' }).click()
    await bar(page).getByRole('button', { name: 'Vorige periode' }).click()
    await expect.poll(left).toBeGreaterThan(0)
    await page.mouse.move(0, 0)
    await shot(page, 'timeline-scroll-holds')
    const back = await openGroep(page)
    await back.getByRole('button', { name: 'Productie' }).click()
    await page.keyboard.press('Escape')
  })
})
