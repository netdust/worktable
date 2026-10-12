import { expect, type Locator, type Page, test } from '@playwright/test'
import { openEditor } from './editor'
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
  await page.getByRole('button', { name: 'Verwijderen' }).click()
  const answered = page.waitForResponse((res) => res.request().method() === 'DELETE')
  await page.getByRole('button', { name: 'Zeker?' }).click()
  return answered
}

for (const { view, dataset, title, link } of [
  { view: 'Organisaties', dataset: 'organisatie', title: 'Zaal De Spiegel', link: 'locatie_id' },
  { view: 'Producties', dataset: 'productie', title: 'De Kersentuin', link: 'productie_id' },
]) {
  test(`referenced-delete-refused: ${dataset}`, async ({ page }) => {
    const before = (await rows<{ id: number; titel?: string; naam?: string }>(page, dataset)).find(
      (found) => (found.naam ?? found.titel) === title,
    )
    expect(before, title).toBeDefined()
    const id = before?.id as number
    const linked = (await rows<Record<string, number | null>>(page, 'activiteit')).filter((a) => a[link] === id)
    expect(linked.length).toBeGreaterThan(0)
    const by = { label: 'Activiteiten', count: linked.length }
    const history = await revisions(page, dataset, id)

    const response = await pressDelete(page, view, title)
    expect(response.status()).toBe(409)
    const body = (await response.json()) as InUse
    expect(body.code).toBe('in_use')
    expect(body.by).toEqual([by])

    await expect(page.locator('.nv-toolbar')).toContainText(`Nog in gebruik door ${by.label} (${by.count}).`)
    await expect(row(page, title)).toBeVisible()
    expect((await rows<{ id: number }>(page, dataset)).map((found) => found.id)).toContain(id)
    expect(await revisions(page, dataset, id)).toEqual(history)
  })
}

test('duplicate-assignment-refused', async ({ page }) => {
  const key = (r: { activiteit_id: number; persoon_id: number | null }) => `${r.activiteit_id}/${r.persoon_id}`
  const before = await rows<{ id: number; activiteit_id: number; persoon_id: number | null }>(page, 'toewijzing')
  const bram = before.find((r) => r.id === 2)
  expect(bram?.persoon_id).toBe(2)
  await open(page, 'Toewijzingen')

  const target = page.locator('tbody tr.nv-tr', { hasText: 'Bram De Wilde' })
  const persoon = target.locator('td').nth(await columnIndex(page, 'Persoon'))
  await persoon.click()
  await persoon.press('Enter')
  await page.getByRole('combobox', { name: 'Persoon' }).fill('Lotte')
  await page.getByRole('option', { name: 'Lotte Verhaegen' }).click()

  await expect(page.locator('tbody').getByRole('alert')).toContainText(
    'Deze persoon is al toegewezen aan deze activiteit.',
  )
  const after = await rows<{ id: number; activiteit_id: number; persoon_id: number | null }>(page, 'toewijzing')
  expect(after.map(key)).toEqual(before.map(key))
  expect(await revisions(page, 'toewijzing', 2)).toEqual([])
})

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
})

test('select-clear-null', async ({ page }) => {
  const persoon = () => rows<{ id: number; weergavenaam: string; contract_type: string | null }>(page, 'persoon')
  const name = 'Sam Peeters'
  expect((await persoon()).find((p) => p.weergavenaam === name)?.contract_type).toBe('freelance')
  await open(page, 'Personen')

  const contract = await cell(page, name, 'Contract')
  await contract.click()
  await contract.press('Delete')
  await expect(contract).toHaveText('')
  await expect.poll(async () => (await persoon()).find((p) => p.weergavenaam === name)?.contract_type).toBeNull()

  await page.reload()
  await expect(page.locator('tbody tr.nv-tr').first()).toBeVisible()
  await expect(await cell(page, name, 'Contract')).toHaveText('')
})

test('select-clear-refused', async ({ page }) => {
  const before = await rows<{ id: number; state: string }>(page, 'toewijzing')
  expect(before.find((r) => r.id === 5)?.state).toBe('uitgenodigd')
  await open(page, 'Toewijzingen')

  const target = page.locator('tbody tr.nv-tr', { hasText: 'Sam Peeters' }).filter({ hasText: 'Uitgenodigd' })
  const state = target.locator('td').nth(await columnIndex(page, 'Status'))
  // State may not be empty (not nullable, with a default): the grid offers no clear, so none is sent to be refused.
  const patches: string[] = []
  page.on('request', (request) => request.method() === 'PATCH' && patches.push(request.url()))
  await state.click()
  await state.press('Delete')
  await state.press('Enter')
  const list = openEditor(page).getByRole('listbox')
  await expect(list.getByRole('option').first()).toBeVisible()
  await expect(list.getByRole('option', { name: '—' })).toHaveCount(0)
  await list.press('Escape')
  await page.waitForTimeout(400)

  expect(patches).toEqual([])
  await expect(state).toContainText('Uitgenodigd')
  expect((await rows<{ id: number; state: string }>(page, 'toewijzing')).find((r) => r.id === 5)?.state).toBe(
    'uitgenodigd',
  )
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
