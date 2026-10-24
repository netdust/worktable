import { expect, type Locator, type Page, test } from '@playwright/test'
import { pressInMenu } from './drawer'
import { openView } from './tree'

const FICHE = 'http://127.0.0.1:5175'

test.use({ storageState: 'e2e/.tmp/state/fiche-editor.json' })

interface InUse {
  code: string
  by: { label: string; count: number }[]
}

interface Revision {
  field: string
  old: unknown
  new: unknown
}

async function open(page: Page, view: string, base = '', model = view) {
  await page.goto(`${base}/`)
  await openView(page, view, model)
  await expect(page.locator('tbody tr.nv-tr').first()).toBeVisible()
}

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

const row = (page: Page, title: string) => page.locator(`tbody tr.nv-tr[data-title="${title}"]`)

async function cell(page: Page, title: string, label: string): Promise<Locator> {
  return row(page, title)
    .locator('td')
    .nth(await columnIndex(page, label))
}

async function typeInto(target: Locator, value: string) {
  await target.click()
  await target.press('Enter')
  const input = target.locator('input')
  await input.fill(value)
  await input.press('Enter')
}

async function rows<T>(page: Page, dataset: string, base = ''): Promise<T[]> {
  const response = await page.request.get(`${base}/api/rows/${dataset}?limit=500`)
  expect(response.status()).toBe(200)
  return ((await response.json()) as { rows: T[] }).rows
}

async function revisions(page: Page, dataset: string, id: number): Promise<Revision[]> {
  const response = await page.request.get(`/api/revisions/${dataset}/${id}`)
  expect(response.status()).toBe(200)
  return ((await response.json()) as { revisions: Revision[] }).revisions
}

test('fiche-edits', async ({ page }) => {
  const fiches = () => rows<{ id: number; titel: string; gemeente: string; postcode: string }>(page, 'fiche', FICHE)
  const title = 'Buurtpunt Proefhoven'
  const before = (await fiches()).find((fiche) => fiche.titel === title)
  expect(before?.gemeente).toBe('Proefhoven')
  await open(page, 'Fiches', FICHE)

  const gemeente = await cell(page, title, 'Gemeente')
  await expect(gemeente).toHaveText('Proefhoven')
  await typeInto(gemeente, 'Nieuwstad')
  await expect(gemeente).toHaveText('Nieuwstad')
  await expect.poll(async () => (await fiches()).find((fiche) => fiche.titel === title)?.gemeente).toBe('Nieuwstad')

  await page.reload()
  await expect(page.locator('tbody tr.nv-tr').first()).toBeVisible()
  await expect(await cell(page, title, 'Gemeente')).toHaveText('Nieuwstad')

  await typeInto(await cell(page, title, 'Postcode'), '12')
  await expect(row(page, title).getByRole('alert')).toContainText('Postcode moet vier cijfers hebben.')
  expect((await fiches()).find((fiche) => fiche.titel === title)?.postcode).toBe('7777')
})

async function pressDelete(page: Page, view: string, title: string) {
  await open(page, view)
  await row(page, title).getByRole('button', { name: 'Openen' }).click()
  await pressInMenu(page, 'Verwijderen')
  const answered = page.waitForResponse((res) => res.request().method() === 'DELETE')
  await page.getByRole('button', { name: 'Zeker?' }).click()
  return answered
}

for (const { view, dataset, title, link } of [
  { view: 'Organisaties', dataset: 'organisatie', title: 'Zaal De Spiegel', link: 'locatie_id' },
]) {
  test(`referenced-delete-refused: ${dataset}`, async ({ page }) => {
    const before = (await rows<{ id: number; titel?: string; naam?: string }>(page, dataset)).find(
      (found) => (found.naam ?? found.titel) === title,
    )
    expect(before, title).toBeDefined()
    const id = before?.id as number
    const linked = (await rows<Record<string, number | null>>(page, 'activiteit')).filter((a) => a[link] === id)
    expect(linked.length).toBeGreaterThan(0)
    // The seeded tourstops point at the same productie and venue; they are named first, as the writer lists them.
    const stops = (await rows<Record<string, number | null>>(page, 'speelreeks')).filter((s) => s[link] === id)
    const by = [
      ...(stops.length > 0 ? [{ label: 'Tourstops', count: stops.length }] : []),
      { label: 'Activiteiten', count: linked.length },
    ]
    const history = await revisions(page, dataset, id)

    const response = await pressDelete(page, view, title)
    expect(response.status()).toBe(409)
    const body = (await response.json()) as InUse
    expect(body.code).toBe('in_use')
    expect(body.by).toEqual(by)

    const named = by.map(({ label, count }) => `${label} (${count})`)
    await expect(page.locator('.nv-toolbar')).toContainText(`Nog in gebruik door ${named.join(' en ')}.`)
    await expect(row(page, title)).toBeVisible()
    expect((await rows<{ id: number }>(page, dataset)).map((found) => found.id)).toContain(id)
    expect(await revisions(page, dataset, id)).toEqual(history)
  })
}

test('voorstellingen-public', async ({ page }) => {
  const activiteiten = await rows<{ id: number; soort: string; status: string }>(page, 'activiteit')
  const confirmed = activiteiten.filter((a) => a.soort === 'voorstelling' && a.status === 'bevestigd')
  expect(confirmed.length).toBeGreaterThan(0)
  expect(activiteiten.length).toBeGreaterThan(confirmed.length)
  expect(activiteiten.some((a) => a.soort === 'voorstelling' && a.status !== 'bevestigd')).toBe(true)

  const shown = await rows<Record<string, unknown>>(page, 'voorstellingen')
  expect(shown.map((one) => one.id).sort()).toEqual(confirmed.map((a) => a.id).sort())
  for (const one of shown) {
    expect(Object.keys(one).sort()).toEqual([
      'adres',
      'custom',
      'datum',
      'id',
      'lookups',
      'productie',
      'start',
      'title',
      'venue',
    ])
  }

  await open(page, 'Voorstellingen')
  await expect(page.locator('tbody tr.nv-tr')).toHaveCount(confirmed.length)
  await expect(page.locator('tbody')).toContainText('Zaal De Spiegel')
  await expect(page.locator('thead th', { hasText: 'Aanvang' })).toBeVisible()
})

test('unreferenced-delete', async ({ page }) => {
  const title = 'Lichtwerk Verhuur'
  const before = (await rows<{ id: number; naam: string }>(page, 'organisatie')).find((o) => o.naam === title)
  expect(before?.id).toBe(5)

  const response = await pressDelete(page, 'Organisaties', title)
  expect(response.status()).toBe(200)
  await expect(row(page, title)).toHaveCount(0)
  expect((await rows<{ naam: string }>(page, 'organisatie')).map((o) => o.naam)).not.toContain(title)
})
