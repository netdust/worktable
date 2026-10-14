import { type APIRequestContext, expect, type Locator, type Page, test } from '@playwright/test'
import { openLooks } from './editor'
import { shot } from './shots'
import { modelNode, openView, openWeek } from './tree'

// Weeks the seed and the other specs leave empty, one per flow, so the shared database never moves a flow's rows.
const WEEK = {
  drawer: '2028-07-03',
  chips: '2028-07-10',
  quick: '2028-07-17',
  matrix: '2028-07-24',
  gallery: '2028-07-31',
  period: '2028-09-04',
}
// A month no other flow uses, for the timeline's packed lane.
const MONTH = { from: '2028-08-01', to: '2028-08-31' }

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
const summary = (page: Page) => page.locator('.nv-toolbar__summary')
const groupChip = (page: Page) =>
  bar(page)
    .locator('.nv-chip')
    .filter({ hasText: /^Groep: / })

/** The chip row's slots in the order the page draws them, each by a short name. */
async function slotsOf(page: Page): Promise<string[]> {
  await expect(bar(page)).toHaveCount(1)
  // The condition chips and Filter come once the view's rows name their fields; a page with none (a dashboard) has no Filter to wait for.
  await bar(page)
    .getByRole('button', { name: /^Filter/ })
    .waitFor({ timeout: 10_000 })
    .catch(() => undefined)
  return bar(page).evaluate((row) => {
    const said: string[] = []
    for (const el of row.querySelectorAll<HTMLElement>('*')) {
      const text = (el.textContent ?? '').trim()
      const own = el.children.length === 0 || el.matches('button, .nv-chip, .nv-bar__count')
      if (!own) continue
      if (el.matches('.nv-chip--scope')) said.push('scope')
      else if (el.matches('.nv-chip--filter')) said.push('condition')
      else if (el.matches('button') && /^Filter\s*\d*$/.test(text)) said.push('filter')
      else if (el.matches('.nv-chip') && text.startsWith('Groep:')) said.push('groep')
      else if (el.matches('button') && text === 'Vandaag') said.push('vandaag')
      else if (el.getAttribute('aria-label') === 'Vorige periode') said.push('prev')
      else if (el.getAttribute('aria-label') === 'Volgende periode') said.push('next')
      else if (el.matches('[role="radio"]')) said.push(text.toLowerCase())
      else if (el.matches('button') && text === '+ Kolom') said.push('kolom')
      else if (el.matches('.nv-bar__count')) said.push('count')
      else if (el.getAttribute('aria-label') === 'Kolommen') said.push('kolommen')
    }
    return said.filter((s, i) => s !== said[i - 1])
  })
}

/** Each named slot comes after the one before it. */
function inOrder(slots: string[], expected: string[]) {
  const at = expected.map((name) => slots.indexOf(name))
  expect(at, `slots ${slots.join(' · ')}`).not.toContain(-1)
  expect(
    [...at].sort((a, b) => a - b),
    `slots ${slots.join(' · ')}`,
  ).toEqual(at)
}

async function openGroep(page: Page): Promise<Locator> {
  await groupChip(page).click()
  const list = page.getByRole('group', { name: 'Groeperen' })
  await expect(list).toBeVisible()
  return list
}

async function openDashboard(page: Page) {
  await page
    .getByRole('navigation', { name: 'Views' })
    .getByRole('group', { name: 'Dashboard', exact: true })
    .getByRole('button', { name: 'Overzicht', exact: true })
    .click()
  await expect(heading(page)).toHaveText('Overzicht')
}

test.describe('step 3d', () => {
  test('looks-gridlines @e2e', async ({ page }) => {
    const root = page.locator('#root')
    const cell = () => page.locator('.nv-grid:not(.nv-mx) tbody .nv-td').first()
    const lineWidth = () => cell().evaluate((el) => getComputedStyle(el).borderRightWidth)
    try {
      await page.goto('/')
      await openView(page, 'Planning', 'Activiteiten')
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
      await openView(page, 'Toewijzingen per activiteit', 'Activiteiten')
      await expect(root).toHaveAttribute('data-lines', 'on')
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
      await page
        .getByRole('grid', { name: 'Bevestigd' })
        .getByRole('row', { name: new RegExp(title) })
        .click()

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
      await page
        .getByRole('grid', { name: 'Bevestigd' })
        .getByRole('row', { name: new RegExp(title) })
        .click()
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

  test('one-chip-row @e2e', async ({ page }) => {
    test.setTimeout(90_000)
    const api = page.request
    const id = await activity(api, 'e2e een rij chips', plusDays(WEEK.chips, 1))
    try {
      // Step 3e: the period is no chip, the same chips on every dated view, Groep chooses everywhere, Kolommen wherever records show.
      const PERIOD = ['vandaag', 'prev', 'next', 'maand', 'week']
      await openWeek(page, 'Planning', 'Activiteiten', 'plandag', WEEK.chips)
      inOrder(await slotsOf(page), ['filter', 'groep', ...PERIOD, 'count', 'kolommen'])
      expect(await slotsOf(page)).not.toContain('condition')
      await shot(page, 'one-chip-row')

      await openWeek(page, 'Per status', 'Activiteiten', 'plandag', WEEK.chips)
      inOrder(await slotsOf(page), ['filter', 'groep', ...PERIOD, 'count', 'kolommen'])
      await expect(groupChip(page)).toHaveText('Groep: status')
      expect(await groupChip(page).evaluate((el) => el.tagName)).toBe('BUTTON')

      await openWeek(page, 'Galerij activiteiten', 'Activiteiten', 'plandag', WEEK.chips)
      inOrder(await slotsOf(page), ['filter', 'groep', ...PERIOD, 's', 'm', 'l', 'count', 'kolommen'])
      await expect(groupChip(page)).toHaveText('Groep: plandag')

      await openWeek(page, 'Kalender activiteiten', 'Activiteiten', 'plandag', WEEK.chips)
      inOrder(await slotsOf(page), ['filter', 'groep', ...PERIOD, 'kolommen'])

      await openWeek(page, 'Tijdlijn tourstops', 'Tourstops', 'start_datum', WEEK.chips)
      inOrder(await slotsOf(page), ['filter', 'groep', ...PERIOD, 'kolommen'])

      await openWeek(page, 'Toewijzingen per activiteit', 'Activiteiten', 'plandag', WEEK.chips)
      inOrder(await slotsOf(page), ['filter', 'groep', ...PERIOD, 'kolom'])
      expect(await slotsOf(page)).not.toContain('kolommen')
      await expect(groupChip(page)).toHaveText('Groep: plandag')

      // A table with no date: no period chips, the rest in place.
      await openView(page, 'Producties')
      const plain = await slotsOf(page)
      inOrder(plain, ['filter', 'groep', 'count', 'kolommen'])
      expect(plain).not.toContain('vandaag')

      // The dashboard is no view of rows: no Groep, period or count.
      await openDashboard(page)
      const dash = await bar(page).count()
      if (dash > 0) {
        const slots = await slotsOf(page)
        for (const absent of ['groep', 'vandaag', 'count']) expect(slots).not.toContain(absent)
      }
    } finally {
      await removeActivity(api, id)
    }
  })

  test('calendar-lanes-in-groep @e2e', async ({ page }) => {
    await page.goto('/')
    await openView(page, 'Kalender activiteiten', 'Activiteiten')
    await expect(groupChip(page)).toHaveText('Groep: geen')
    let list = await openGroep(page)
    await expect(list.getByRole('button')).toHaveText(['Productie', 'Tourstop', 'Geen'])
    await expect(list.getByRole('button', { name: 'Geen' })).toHaveAttribute('aria-pressed', 'true')
    await list.getByRole('button', { name: 'Productie' }).click()
    await expect(groupChip(page)).toHaveText('Groep: productie')
    await expect(page.getByRole('list', { name: 'Rijen' })).toBeVisible()
    await shot(page, 'calendar-lanes-in-groep')

    // Re-entry: a pick closes the panel; the choice is the view's, and Geen takes it back.
    await expect(list).toHaveCount(0)
    list = await openGroep(page)
    await list.getByRole('button', { name: 'Geen' }).click()
    await expect(groupChip(page)).toHaveText('Groep: geen')
    await expect(page.getByRole('list', { name: 'Rijen' })).toHaveCount(0)

    // The timeline's Groep offers its declared lanes and Geen.
    await page.keyboard.press('Escape')
    await openView(page, 'Tijdlijn tourstops', 'Tourstops')
    list = await openGroep(page)
    await expect(list.getByRole('button')).toHaveText(['Productie', 'Geen'])
    await page.keyboard.press('Escape')
  })

  test('grid-period-steps @e2e', async ({ page }) => {
    const api = page.request
    const next = 'e2e periode volgende week'
    const id = await activity(api, next, plusDays(WEEK.period, 8))
    const row = page.locator(`tbody tr.nv-tr[data-title="${next}"]`)
    try {
      await openWeek(page, 'Planning', 'Activiteiten', 'plandag', WEEK.period)
      const period = page.getByRole('radiogroup', { name: 'Periode' })
      await expect(period.getByRole('radio', { name: 'Week' })).toBeChecked()
      await expect(page.locator('.nv-toolbar__summary')).toHaveText(/· 4–10 sep$/)
      await expect(row).toHaveCount(0)

      await bar(page).getByRole('button', { name: 'Volgende periode' }).click()
      await expect(page.locator('.nv-toolbar__summary')).toHaveText(/· 11–17 sep$/)
      await expect(row).toHaveCount(1)
      await shot(page, 'grid-period-steps')

      await bar(page).getByRole('button', { name: 'Vorige periode' }).click()
      await bar(page).getByRole('button', { name: 'Vorige periode' }).click()
      await expect(page.locator('.nv-toolbar__summary')).toHaveText(/· 28 aug–3 sep$/)

      // Boundary: the week across a month's end names the month of its Thursday; a month steps by months.
      await period.getByRole('radio', { name: 'Maand' }).click()
      await expect(period.getByRole('radio', { name: 'Maand' })).toBeChecked()
      await expect(page.locator('.nv-toolbar__summary')).toHaveText('augustus 2028')
      await bar(page).getByRole('button', { name: 'Volgende periode' }).click()
      await expect(page.locator('.nv-toolbar__summary')).toHaveText('september 2028')
      await expect(row).toHaveCount(1)
      await period.getByRole('radio', { name: 'Week' }).click()
      await expect(page.locator('.nv-toolbar__summary')).toHaveText(/· 28 aug–3 sep$/)

      // Vandaag lands on this week.
      await bar(page).getByRole('button', { name: 'Vandaag' }).click()
      await expect(page.locator('.nv-toolbar__summary')).not.toHaveText(/· 28 aug–3 sep$/)
      await expect(period.getByRole('radio', { name: 'Week' })).toBeChecked()
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
      await expect(page.getByRole('group', { name: 'Hele dag ma 17', exact: true }).getByRole('button')).toHaveCount(1)
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

  // Defect found by this shake-out: the dialog asks no title and no time, so the new row lands in the day's band
  // as a 4px button with no text and no accessible name. Expected to fail until the fix pass.
  test('quick-create-calendar-readable @e2e', async ({ page }) => {
    const api = page.request
    const day = plusDays(WEEK.quick, 2)
    await openWeek(page, 'Kalender activiteiten', 'Activiteiten', 'plandag', WEEK.quick)
    await page.locator('.nv-toolbar').getByRole('button', { name: 'Nieuwe activiteit' }).click()
    const dialog = page.getByRole('dialog', { name: 'Nieuwe activiteit' })
    await dialog.getByRole('combobox', { name: 'Productie', exact: true }).selectOption({ label: 'Nachtwacht' })
    await dialog.getByRole('combobox', { name: 'Soort', exact: true }).selectOption('repetitie')
    await dialog.getByRole('textbox', { name: 'Datum', exact: true }).fill(day)
    await dialog.getByRole('button', { name: 'Aanmaken' }).click()
    await expect(dialog).toHaveCount(0)
    const made = await rowsOf<Values & { id: number }>(api, 'activiteit', { plandag: day })
    try {
      expect(made).toHaveLength(1)
      const event = page.getByRole('group', { name: 'Hele dag wo 19', exact: true }).locator('button')
      await expect(event).toHaveCount(1)
      await shot(page, 'quick-create-calendar-readable')
      // What was made can be read where it was made: a name, and the height of a line of text.
      await expect(event).not.toHaveAccessibleName('')
      expect((await event.boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(16)
    } finally {
      for (const row of made) await removeActivity(api, row.id)
    }
  })

  test('no-add-on-query-calendar @e2e', async ({ page }) => {
    await page.goto('/')
    for (const [view, model] of [
      ['Persoonskalender', 'Per persoon per dag'],
      ['Bedrijfsweek', 'Per productie per dag'],
    ]) {
      await openView(page, view, model)
      await expect(heading(page)).toHaveText(view)
      const toolbar = page.locator('.nv-toolbar')
      await expect(toolbar.getByRole('button', { name: /^Nieuw/ })).toHaveCount(0)
      await expect(toolbar.locator('.nv-toolbar__note--hint')).toHaveCount(0)
      await expect(toolbar).not.toContainText(/alleen-lezen/i)
      if (view === 'Persoonskalender') await shot(page, 'no-add-on-query-calendar')
    }
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

  test('unlaned-timeline-one-lane @e2e', async ({ page }) => {
    const api = page.request
    const productie_id = await nachtwacht(api)
    const stops = [
      ['e2e pak een', '2028-08-07', '2028-08-12'],
      ['e2e pak twee', '2028-08-10', '2028-08-15'],
      ['e2e pak drie', '2028-08-21', '2028-08-23'],
    ]
    const ids: number[] = []
    try {
      for (const [naam, start_datum, eind_datum] of stops)
        ids.push(await idOf(api, 'speelreeks', { productie_id, naam, start_datum, eind_datum }))
      await openWeek(page, 'Tijdlijn tourstops', 'Tourstops', 'start_datum', MONTH.from, 30)
      await expect(groupChip(page)).toHaveText('Groep: productie')
      await expect(page.getByRole('row', { name: 'Nachtwacht' })).toBeVisible()
      await expect(page.locator('.nv-tl__corner .nv-tl__count')).toHaveText('1')

      const list = await openGroep(page)
      await list.getByRole('button', { name: 'Geen' }).click()
      await page.keyboard.press('Escape')
      await expect(groupChip(page)).toHaveText('Groep: geen')
      // One shared lane, its head the count alone; the corner counts no lanes.
      const lanes = page.locator('.nv-tl__lane')
      await expect(lanes).toHaveCount(1)
      await expect(lanes.getByRole('rowheader')).toHaveText('3')
      await expect(lanes.locator('.nv-tl__head strong')).toHaveCount(0)
      await expect(page.locator('.nv-tl__corner .nv-tl__count')).toHaveCount(0)
      // Packed by overlap: the two that overlap on two rows, the third back on the first.
      const top = (name: string) =>
        page.getByRole('button', { name: new RegExp(name) }).evaluate((el) => (el as HTMLElement).style.top)
      expect(await top('e2e pak een')).toBe('9px')
      expect(await top('e2e pak twee')).toBe('57px')
      expect(await top('e2e pak drie')).toBe('9px')
      await page.mouse.move(0, 0)
      await shot(page, 'unlaned-timeline-one-lane')
    } finally {
      for (const id of ids) await api.delete(`/api/rows/speelreeks/${id}`)
    }
  })

  test('timeline-scroll-holds @e2e', async ({ page }) => {
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

  test('matrix-heads-and-legend @e2e', async ({ page }) => {
    const api = page.request
    const title = 'e2e matrix koppen'
    const id = await activity(api, title, plusDays(WEEK.matrix, 1))
    const people: number[] = []
    try {
      for (const [voornaam, achternaam] of [
        ['Zelda', 'Proef'],
        ['Zelda', 'Anders'],
        ['Quirijn', 'Proef'],
      ])
        people.push(await idOf(api, 'persoon', { voornaam, achternaam }))
      await idOf(api, 'toewijzing', { activiteit_id: id, persoon_id: people[0], state: 'bevestigd' })
      await idOf(api, 'toewijzing', { activiteit_id: id, persoon_id: people[1], state: 'voorlopig' })
      await idOf(api, 'toewijzing', { activiteit_id: id, persoon_id: people[2], state: 'uitgenodigd' })
      await openWeek(page, 'Toewijzingen per activiteit', 'Activiteiten', 'plandag', WEEK.matrix)

      const head = (full: string) => page.locator(`thead th.nv-mx__head[title="${full}"] .nv-th__label`)
      // First names in the heads, the whole name where two first names meet.
      await expect(head('Quirijn Proef')).toHaveText('Quirijn')
      await expect(head('Zelda Proef')).toHaveText('Zelda Proef')
      await expect(head('Zelda Anders')).toHaveText('Zelda Anders')

      // Statuses tinted: an assigned cell carries its tone.
      const row = page.locator(`tbody tr.nv-tr[data-title="${title}"]`)
      await expect(row.locator('td.nv-mx__cell--on').first()).toBeVisible()
      expect(await row.locator('td.nv-mx__cell--on').count()).toBeGreaterThanOrEqual(2)

      // The legend in the foot.
      const legend = page.locator('footer.nv-foot').getByRole('list', { name: 'Legende' })
      await expect(legend).toBeVisible()
      expect(await legend.getByRole('listitem').count()).toBeGreaterThanOrEqual(2)
      await shot(page, 'matrix-heads-and-legend')

      // Leaving the matrix takes the legend with it.
      await openView(page, 'Planning', 'Activiteiten')
      await expect(page.locator('footer.nv-foot').getByRole('list', { name: 'Legende' })).toHaveCount(0)
    } finally {
      await removeActivity(api, id)
      for (const p of people) await api.delete(`/api/rows/persoon/${p}`)
    }
  })

  test('gallery-placeholder @e2e', async ({ page }) => {
    const api = page.request
    const day = plusDays(WEEK.gallery, 1)
    const two = await activity(api, 'opbouw Gent', day)
    const one = await activity(api, 'Zonnewende', day)
    const pictured = await activity(api, 'e2e met foto', day)
    try {
      const upload = await api.post(`/api/attachments/activiteit/${pictured}?kind=foto&name=pixel.png`, {
        headers: { 'content-type': 'application/octet-stream' },
        data: Buffer.from(
          'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
          'base64',
        ),
      })
      expect(upload.status(), await upload.text()).toBe(201)
      await openWeek(page, 'Galerij activiteiten', 'Activiteiten', 'plandag', WEEK.gallery)
      const card = (name: string) => page.locator('.nv-gallery__card', { hasText: name })
      // Word initials where a row has no picture; a one-word title its first two letters.
      await expect(card('opbouw Gent').locator('.nv-gallery__mark')).toHaveText('OG')
      await expect(card('Zonnewende').locator('.nv-gallery__mark')).toHaveText('Zo')
      await expect(page.getByRole('img', { name: 'e2e met foto' })).toBeVisible()
      await expect(card('e2e met foto').locator('.nv-gallery__mark')).toHaveCount(0)
      // The count counts the pictures; the title line names the period.
      await expect(bar(page).locator('.nv-bar__count')).toContainText('1 met beeld')
      await shot(page, 'gallery-placeholder')
    } finally {
      for (const id of [two, one, pictured]) await removeActivity(api, id)
    }
  })

  test('summary-per-view @e2e', async ({ page }) => {
    await page.goto('/')
    await openView(page, 'Kalender activiteiten', 'Activiteiten')
    await expect(summary(page)).toBeVisible()
    const told = await summary(page).textContent()

    // A dashboard opened after the calendar shows none.
    await openDashboard(page)
    await expect(summary(page)).toHaveCount(0)
    await shot(page, 'summary-per-view')

    // Re-entry: back on the calendar it tells its own again; a board after it tells the board's.
    await openView(page, 'Kalender activiteiten', 'Activiteiten')
    await expect(summary(page)).toHaveText(told ?? '')
    // The title line names the period on both; the board's count says its columns.
    await openView(page, 'Per status', 'Activiteiten')
    await expect(summary(page)).toHaveText(/^Week \d+ · /)
    await expect(bar(page).locator('.nv-bar__count')).toContainText(/rij.* · \d+ kolommen/)
  })
})
