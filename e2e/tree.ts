import { expect, type Locator, type Page } from '@playwright/test'

/** A model's node in the rail's tree, by its label alone. */
export function modelNode(page: Page, model: string): Locator {
  return page.getByRole('navigation', { name: 'Views' }).getByRole('treeitem', { name: model, exact: true })
}

/** Opens a model by its name: it unfolds and shows its last-used view. Its row comes before its views. */
export async function openModel(page: Page, model: string): Promise<void> {
  await modelNode(page, model).getByRole('button', { name: model, exact: true }).first().click()
}

/** Opens a view by its name inside its model's node; a view under another model passes that model. */
export async function openView(page: Page, view: string, model = view): Promise<void> {
  const node = modelNode(page, model)
  if ((await node.getAttribute('aria-expanded')) !== 'true') await openModel(page, model)
  await node.getByRole('group', { name: 'View type' }).getByRole('button', { name: view, exact: true }).click()
}

const plusDays = (day: string, n: number) => {
  const d = new Date(`${day}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}

/**
 * Opens a view on one week, keeping its own conditions: Link kopiëren gives the view's address, its date
 * condition becomes "ligt tussen" that week, and the page lands on that address.
 */
export async function openWeek(
  page: Page,
  view: string,
  model: string,
  field: string,
  monday: string,
  span = 6,
): Promise<void> {
  await page.context().grantPermissions(['clipboard-read', 'clipboard-write'])
  await page.goto('/')
  await openView(page, view, model)
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(view)
  await page.locator('.nv-toolbar').getByRole('button', { name: 'Exporteren / delen' }).click()
  await page.getByRole('menu', { name: 'Exporteren / delen' }).getByRole('menuitem', { name: 'Link kopiëren' }).click()
  await expect(page.getByText('Link gekopieerd')).toBeVisible()
  const copied = new URL(await page.evaluate(() => navigator.clipboard.readText()))
  const params = new URLSearchParams(copied.hash.slice(1))
  const kept = (JSON.parse(params.get('f') ?? '[]') as { field: string }[]).filter((c) => c.field !== field)
  params.set('f', JSON.stringify([{ field, op: 'between', values: [monday, plusDays(monday, span)] }, ...kept]))
  await page.goto(`/#${params.toString()}`)
  await page.reload()
  // The landing waits for the saved views; under a full run's load that can take a while.
  await expect
    .poll(() => new URLSearchParams(new URL(page.url()).hash.slice(1)).get('f'), { timeout: 15_000 })
    .toBeNull()
}

/** Adds "<field> is <value>" through the filter builder: a new condition, its field, then the value from its list. */
export async function addCondition(page: Page, field: string, value: string): Promise<void> {
  await page
    .locator('.nv-bar')
    .getByRole('button', { name: /^Filter\s*\d*$/ })
    .click()
  await page.getByRole('button', { name: 'Voorwaarde toevoegen' }).click()
  const row = page.getByRole('group', { name: /^Voorwaarde \d/ }).last()
  await pickIn(row, 'Veld', field)
  await row.getByRole('searchbox', { name: `${field} zoeken` }).click()
  await row.getByRole('option', { name: value, exact: true }).click()
  await page.keyboard.press('Escape')
}

/** Picks in one of a condition's pickers (Veld, Vergelijking): its button, then the option. */
export async function pickIn(row: Locator, label: string, option: string): Promise<void> {
  await row.getByRole('button', { name: new RegExp(`^${label}:`) }).click()
  await row.getByRole('listbox', { name: label }).getByRole('option', { name: option, exact: true }).click()
}

/** One's own views by these names, gone through the API: a test that makes them starts without another's leftovers. */
export async function dropViews(page: Page, names: string[]): Promise<void> {
  const { views } = (await (await page.request.get('/api/views')).json()) as {
    views: { id: number; name: string; mine: boolean }[]
  }
  for (const view of views.filter((v) => v.mine && names.includes(v.name)))
    await page.request.delete(`/api/views/${view.id}`)
}

/**
 * "Kopie maken" on a rail view, then a rename of the copy, once the copy is open, one's own, loaded and settled.
 * Its ⋯ is scrolled fully into the rail first and pressed a frame later: scrolled and clicked in one frame, the scroll
 * event lands after the menu opens, and React Aria closes a menu whose trigger scrolls (step-0e, 2026-10-17).
 */
export async function copyAndRename(page: Page, view: string, name: string): Promise<void> {
  const copy = `${view} (kopie)`
  await page.getByRole('button', { name: `More actions: ${view}`, exact: true }).click()
  await page.getByRole('menuitem', { name: 'Kopie maken' }).click()
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(copy)
  const row = page.locator('[data-view]').filter({ has: page.getByRole('button', { name: copy, exact: true }) })
  await expect(row.getByRole('img', { name: 'Alleen voor jou' })).toBeVisible()
  await expect(page.locator('.nv-bar__count')).toBeVisible()
  await page.waitForLoadState('networkidle')
  const more = page.getByRole('button', { name: `More actions: ${copy}`, exact: true })
  await more.scrollIntoViewIfNeeded()
  await expect(more).toBeInViewport({ ratio: 1 })
  await page.evaluate(() => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done))))
  await more.click()
  await page.getByRole('menuitem', { name: 'Naam wijzigen' }).click()
  await page.getByRole('textbox', { name: 'Nieuwe naam' }).fill(name)
  await page.getByRole('textbox', { name: 'Nieuwe naam' }).press('Enter')
}
