import { expect, type Page, test } from '@playwright/test'
import { shot } from './shots'
import { modelNode, openView, pickIn } from './tree'

type Api = Page['request']
type Values = Record<string, unknown>

// The engine resolves a period in the server's local date; the harness runs it on this machine, as the browser.
const pad = (n: number) => String(n).padStart(2, '0')
const localDay = (offset: number) => {
  const at = new Date()
  at.setDate(at.getDate() + offset)
  return `${at.getFullYear()}-${pad(at.getMonth() + 1)}-${pad(at.getDate())}`
}

async function rowsOf(api: Api, filter: Values): Promise<Values[]> {
  const response = await api.get(`/api/rows/activiteit?limit=500&filter=${encodeURIComponent(JSON.stringify(filter))}`)
  expect(response.status(), await response.text()).toBe(200)
  return ((await response.json()) as { rows: Values[] }).rows
}

interface Made {
  views: number[]
  activiteit: number[]
}

/** Deletes what a flow made, whatever happened: the specs share one database. */
async function cleanUp(api: Api, made: Made) {
  for (const id of made.views) await api.delete(`/api/views/${id}`)
  for (const id of made.activiteit) await api.delete(`/api/rows/activiteit/${id}`)
}

async function activity(api: Api, made: Made, omschrijving: string, datum: string) {
  const productie = (
    ((await (await api.get('/api/rows/productie?limit=500')).json()) as { rows: Values[] }).rows.find(
      (r) => r.titel === 'Nachtwacht',
    ) as { id: number }
  ).id
  const response = await api.post('/api/rows/activiteit', {
    data: { productie_id: productie, soort: 'repetitie', datum, omschrijving },
  })
  expect(response.status(), await response.text()).toBe(201)
  made.activiteit.push(((await response.json()) as { id: number }).id)
}

async function newView(page: Page, made: Made, name: string): Promise<void> {
  const row = modelNode(page, 'Activiteiten').locator('.nv-model')
  await row.hover()
  await row.getByRole('button', { name: 'Weergave toevoegen aan Activiteiten' }).click()
  await page
    .getByRole('menu', { name: 'Weergave toevoegen aan Activiteiten' })
    .getByRole('menuitem', { name: 'Grid' })
    .click()
  const dialog = page.getByRole('dialog', { name: 'Nieuwe gridweergave' })
  await dialog.getByRole('textbox', { name: 'Naam' }).fill(name)
  await dialog.getByRole('radio', { name: 'Alleen ik' }).check()
  const created = page.waitForResponse(
    (res) => res.request().method() === 'POST' && new URL(res.url()).pathname === '/api/views',
  )
  await dialog.getByRole('button', { name: 'Weergave maken' }).click()
  const response = await created
  expect(response.status()).toBe(201)
  made.views.push(((await response.json()) as { id: number }).id)
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(name)
}

const filterButton = (page: Page) => page.locator('.nv-bar').getByRole('button', { name: /^Filter\s*\d*$/ })

/** The condition on a field in the open builder, by the field its Veld button names. */
const conditionOn = (page: Page, label: string) =>
  page
    .getByRole('group', { name: /^Voorwaarde \d/ })
    .filter({ has: page.getByRole('button', { name: `Veld: ${label}` }) })

/** Makes the view's Plandag condition "is vandaag" in the builder, adding one if the view has none. */
async function chooseToday(page: Page): Promise<void> {
  await filterButton(page).click()
  if ((await conditionOn(page, 'Plandag').count()) === 0) {
    await page.getByRole('button', { name: 'Voorwaarde toevoegen' }).click()
    await pickIn(page.getByRole('group', { name: /^Voorwaarde \d/ }).last(), 'Veld', 'Plandag')
  }
  await pickIn(conditionOn(page, 'Plandag'), 'Vergelijking', 'is vandaag')
}

const gridTitles = (page: Page) =>
  page.locator('tbody tr.nv-tr').evaluateAll((trs) => trs.map((tr) => tr.getAttribute('data-title')))

const savedFilter = async (api: Api, name: string) => {
  const all = (await (await api.get('/api/views')).json()) as { views: Values[] }
  return all.views.find((v) => v.name === name)?.filters
}

test('filter-is-vandaag @e2e', async ({ page }) => {
  const api = page.request
  const made: Made = { views: [], activiteit: [] }
  const name = 'Eigen e2e vandaag'
  const [today, tomorrow, yesterday] = ['vandaag e2e periode', 'morgen e2e periode', 'gisteren e2e periode']
  try {
    await activity(api, made, today, localDay(0))
    await activity(api, made, tomorrow, localDay(1))
    await activity(api, made, yesterday, localDay(-1))

    await page.setViewportSize({ width: 1600, height: 900 })
    await page.goto('/')
    await newView(page, made, name)
    await chooseToday(page)

    // The builder asks no value of today: no picker, no date box, no search.
    const row = conditionOn(page, 'Plandag')
    await expect(row.getByRole('button', { name: 'Vergelijking: is vandaag' })).toBeVisible()
    await expect(row.locator('.nv-fb__value')).toBeEmpty()
    await expect(row.getByRole('searchbox')).toHaveCount(0)
    await expect(row.getByRole('textbox')).toHaveCount(0)
    await expect(row.getByRole('spinbutton')).toHaveCount(0)
    await shot(page, 'builder-is-vandaag')
    await page.keyboard.press('Escape')

    // Today is the view's period: named by its day in the title line, never a chip.
    await expect(page.locator('.nv-toolbar__summary')).toHaveText(/^\d{1,2} \p{L}+$/u)
    await expect(page.locator('.nv-bar .nv-chip--filter')).toHaveCount(0)
    // Boundary: yesterday and tomorrow fall outside the one day.
    await expect.poll(() => gridTitles(page)).toContain(today)
    const titles = await gridTitles(page)
    expect(titles).not.toContain(tomorrow)
    expect(titles).not.toContain(yesterday)
    const days = await rowsOf(api, { plandag: { $period: 'today' } })
    expect(days.map((r) => r.plandag).every((d) => d === localDay(0))).toBe(true)
    expect(days.map((r) => r.omschrijving)).toContain(today)
    expect(titles.length).toBe(days.length)
    await shot(page, 'only-today')

    // Boundary (wire): a period not in the list is still refused.
    const unknown = await api.get(
      `/api/rows/activiteit?filter=${encodeURIComponent(JSON.stringify({ plandag: { $period: 'yesterday' } }))}`,
    )
    expect(unknown.status()).toBe(400)
  } finally {
    await cleanUp(api, made)
  }
})

test('vandaag-kept-after-reload @e2e', async ({ page }) => {
  const api = page.request
  const made: Made = { views: [], activiteit: [] }
  const name = 'Eigen e2e vandaag bewaard'
  const today = 'vandaag e2e bewaard'
  try {
    await activity(api, made, today, localDay(0))
    await page.setViewportSize({ width: 1600, height: 900 })
    await page.goto('/')
    await newView(page, made, name)
    await chooseToday(page)
    await page.keyboard.press('Escape')

    // The own view stores the period, not the day: it reads the current day on every load.
    await expect.poll(() => savedFilter(api, name)).toMatchObject({ plandag: { $period: 'today' } })
    await page.reload()
    await openView(page, name, 'Activiteiten')
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(name)
    // Today is the view's period: named by its day in the title line, never a chip.
    await expect(page.locator('.nv-toolbar__summary')).toHaveText(/^\d{1,2} \p{L}+$/u)
    await expect(page.locator('.nv-bar .nv-chip--filter')).toHaveCount(0)
    await expect.poll(() => gridTitles(page)).toContain(today)
    await filterButton(page).click()
    await expect(conditionOn(page, 'Plandag').getByRole('button', { name: 'Vergelijking: is vandaag' })).toBeVisible()
    await page.keyboard.press('Escape')

    // Empty: a text nobody wrote narrows today to nothing; the hint prints the one day once.
    await filterButton(page).click()
    await page.getByRole('button', { name: 'Voorwaarde toevoegen' }).click()
    const text = page.getByRole('group', { name: /^Voorwaarde \d/ }).last()
    await pickIn(text, 'Veld', 'Omschrijving')
    await text.getByRole('textbox').fill('e2e niemand schreef dit')
    await page.keyboard.press('Escape')
    const empty = page.locator('.nv-empty')
    await expect(empty).toBeVisible()
    const day = await page.evaluate(() => {
      const now = new Date()
      const month = new Intl.DateTimeFormat(document.documentElement.lang || 'nl', { month: 'short' })
        .format(now)
        .replace(/\.$/, '')
      return `${now.getDate()} ${month}`
    })
    await expect(empty.locator('.nv-empty__desc')).toHaveText(day)
    await shot(page, 'one-day-empty')
  } finally {
    await cleanUp(api, made)
  }
})

test('new-date-condition-starts-at-deze-week @e2e', async ({ page }) => {
  const api = page.request
  const made: Made = { views: [], activiteit: [] }
  const name = 'Eigen e2e nieuwe datum'
  try {
    await page.setViewportSize({ width: 1600, height: 900 })
    await page.goto('/')
    await newView(page, made, name)
    await filterButton(page).click()
    await page.getByRole('button', { name: 'Voorwaarde toevoegen' }).click()
    const row = page.getByRole('group', { name: /^Voorwaarde \d/ }).last()
    await pickIn(row, 'Veld', 'Datum')
    await expect(row.getByRole('button', { name: 'Vergelijking: is deze week' })).toBeVisible()
    await row.getByRole('button', { name: /^Vergelijking:/ }).click()
    const offered = await row.getByRole('listbox', { name: 'Vergelijking' }).getByRole('option').allTextContents()
    expect(offered.map((o) => o.trim())).toEqual([
      'is vandaag',
      'is deze week',
      'is volgende week',
      'is deze maand',
      'ligt tussen',
    ])
    await shot(page, 'new-date-deze-week')
    await page.keyboard.press('Escape')
    await page.keyboard.press('Escape')
    await expect(page.locator('.nv-bar .nv-chip--filter').filter({ hasText: /^Datum/ })).toHaveText('Datum deze week')
  } finally {
    await cleanUp(api, made)
  }
})
