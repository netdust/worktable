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

/** The address that opens a view on one week: its key, and "ligt tussen" on its date column. */
export function weekLink(key: string, field: string, monday: string): string {
  const f = [{ field, op: 'between', values: [monday, plusDays(monday, 6)] }]
  return `/#view=${encodeURIComponent(key)}&f=${encodeURIComponent(JSON.stringify(f))}`
}

/** Opens a view, then lands on it again on one week: the link's date condition replaces the view's own. */
export async function openWeek(page: Page, view: string, model: string, field: string, monday: string): Promise<void> {
  await page.goto('/')
  await openView(page, view, model)
  await expect.poll(() => new URLSearchParams(new URL(page.url()).hash.slice(1)).get('view')).not.toBeNull()
  const key = new URLSearchParams(new URL(page.url()).hash.slice(1)).get('view') as string
  await page.goto(weekLink(key, field, monday))
  await page.reload()
  await expect.poll(() => new URLSearchParams(new URL(page.url()).hash.slice(1)).get('f')).toBeNull()
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
