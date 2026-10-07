import { expect, type Locator, type Page, test } from '@playwright/test'
import { openView } from './tree'

const WEEK = '2026-12-21'
const VENUE = 'Theater Het Anker'
const OTHER_VENUE = 'Repetitiekot De Loods'

type Api = Page['request']
type Values = Record<string, unknown>

async function rowsOf<T = Values>(api: Api, dataset: string, filter?: Values): Promise<T[]> {
  const query = filter ? `&filter=${encodeURIComponent(JSON.stringify(filter))}` : ''
  const response = await api.get(`/api/rows/${dataset}?limit=500${query}`)
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

async function columnIndex(page: Page, label: string): Promise<number> {
  const index = await page
    .locator('thead th')
    .evaluateAll(
      (heads, wanted) => heads.findIndex((th) => (th.textContent ?? '').replace(/\s*[↑↓]$/, '').trim() === wanted),
      label,
    )
  expect(index, `column ${label}`).toBeGreaterThanOrEqual(0)
  return index
}

const named = (page: Page, title: string) => page.locator(`tbody tr.nv-tr[data-title="${title}"]`)
const cellOf = async (page: Page, title: string, label: string): Promise<Locator> =>
  named(page, title)
    .locator('td')
    .nth(await columnIndex(page, label))

async function openDagplanning(page: Page) {
  await page.goto(`/#from=${WEEK}`)
  await page.reload()
  await openView(page, 'Dagplanning', 'Activiteiten')
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Dagplanning')
}

async function pickRelation(cell: Locator, page: Page, search: string, option: string) {
  await cell.click()
  await cell.press('Enter')
  await page.getByRole('combobox', { name: 'Locatie' }).fill(search)
  await page.getByRole('option', { name: option }).click()
}

test('edit-dagplanning @e2e', async ({ page }) => {
  const api = page.request
  await idOf(api, 'activiteit', {
    productie_id: await idByName(api, 'productie', 'titel', 'Nachtwacht'),
    soort: 'repetitie',
    datum: WEEK,
    start_at: `${WEEK}T10:00`,
    omschrijving: 'dagplanning bewerken',
  })
  await openDagplanning(page)

  const omschrijving = await cellOf(page, 'dagplanning bewerken', 'Omschrijving')
  await omschrijving.click()
  await omschrijving.press('Enter')
  await omschrijving.locator('input').fill('dagplanning bewerkt')
  await omschrijving.locator('input').press('Enter')
  await expect(named(page, 'dagplanning bewerkt')).toHaveCount(1)

  const soort = await cellOf(page, 'dagplanning bewerkt', 'Soort')
  await soort.click()
  await soort.press('Enter')
  await soort.getByRole('option', { name: 'Opbouw' }).click()
  await expect(soort).toHaveText('Opbouw')

  await page.reload()
  await openView(page, 'Dagplanning', 'Activiteiten')
  await expect(await cellOf(page, 'dagplanning bewerkt', 'Soort')).toHaveText('Opbouw')
  const [stored] = await rowsOf<Values>(api, 'activiteit', { omschrijving: 'dagplanning bewerkt' })
  expect(stored).toMatchObject({ soort: 'opbouw', omschrijving: 'dagplanning bewerkt' })
})

test('locatie-own-and-back @e2e', async ({ page }) => {
  const api = page.request
  const reeks = await idOf(api, 'speelreeks', {
    naam: 'Speelreeks e2e dagplanning',
    productie_id: await idByName(api, 'productie', 'titel', 'Nachtwacht'),
    locatie_id: await idByName(api, 'organisatie', 'naam', VENUE),
    start_datum: WEEK,
    eind_datum: WEEK,
  })
  await idOf(api, 'activiteit', {
    productie_id: await idByName(api, 'productie', 'titel', 'Nachtwacht'),
    soort: 'repetitie',
    datum: WEEK,
    omschrijving: 'locatie eigen en terug',
    speelreeks_id: reeks,
  })
  await openDagplanning(page)

  const cell = () => cellOf(page, 'locatie eigen en terug', 'Locatie')
  await expect((await cell()).locator('.nv-inherited .nv-cell__text')).toHaveText(VENUE)

  await pickRelation(await cell(), page, 'Loods', OTHER_VENUE)
  await expect((await cell()).locator('.nv-cell__text')).toHaveText(OTHER_VENUE)
  await expect((await cell()).locator('.nv-via, .nv-inherited')).toHaveCount(0)

  const clear = await cell()
  await clear.click()
  await clear.press('Delete')
  await expect((await cell()).locator('.nv-inherited .nv-cell__text')).toHaveText(VENUE)
  await expect((await cell()).locator('.nv-via')).toHaveText('via tourstop')
  const [held] = await rowsOf<Values>(api, 'activiteit', { omschrijving: 'locatie eigen en terug' })
  expect(held.locatie_id ?? null).toBeNull()
})

test('period-chip @e2e', async ({ page }) => {
  const api = page.request
  const productie = await idByName(api, 'productie', 'titel', 'Nachtwacht')
  const [near, far] = ['periode in december', 'periode in februari']
  await idOf(api, 'activiteit', { productie_id: productie, soort: 'repetitie', datum: WEEK, omschrijving: near })
  await idOf(api, 'activiteit', { productie_id: productie, soort: 'repetitie', datum: '2027-02-15', omschrijving: far })
  await openDagplanning(page)

  const chip = page.getByRole('group', { name: 'Periode' })
  const value = chip.locator('.nv-chip__value')
  await expect(value).toHaveText('Week 52 · 21–27 dec')
  await chip.getByRole('button', { name: 'Volgende periode' }).click()
  await expect(value).toHaveText('Week 53 · 28 dec–3 jan')

  await value.click()
  await page.getByRole('button', { name: 'Deze maand' }).click()
  await expect(value).toHaveText(/^[a-z]+ \d{4}$/)
  const month = await value.innerText()
  await page.reload()
  await expect(value).toHaveText(month)

  await value.click()
  await page.getByRole('button', { name: 'Alles' }).click()
  await expect(value).toHaveText('Alles')
  await expect(chip.getByRole('button', { name: 'Volgende periode' })).toHaveCount(0)
  await expect(named(page, near)).toHaveCount(1)
  await expect(named(page, far)).toHaveCount(1)

  await value.click()
  await page.getByLabel('Van', { exact: true }).fill('2026-12-21')
  await page.getByLabel('Tot', { exact: true }).fill('2027-02-20')
  await page.getByRole('button', { name: 'Toepassen' }).click()
  await expect(value).toHaveText('21 dec – 20 feb')
  await expect(named(page, near)).toHaveCount(1)
  await value.click()
  await page.getByRole('button', { name: 'Alles' }).click()
  await expect(value).toHaveText('Alles')

  await openView(page, 'Toewijzingen per activiteit', 'Activiteiten')
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Toewijzingen per activiteit')
  await expect(value).toHaveText(/^Week \d+ · /)
  await expect(page.getByRole('alert')).toHaveCount(0)
  await value.click()
  await expect(page.getByRole('button', { name: 'Deze maand' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Alles' })).toHaveCount(0)
})
