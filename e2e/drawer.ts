import { expect, type Page } from '@playwright/test'

const tools = (page: Page) => page.locator('.nv-drawer__head').getByRole('button', { name: 'Acties' }).last()
const row = (page: Page) => page.locator('.nv-dw-actions__row').last()
const more = (page: Page) => row(page).getByRole('button', { name: 'Meer' })
const menu = (page: Page, name: string) => page.getByRole('menu', { name })
const TOOLS = /^(Link kopiëren|Nieuwe link|Verwijderen)$/

/** A record's actions are one row in its drawer's body: a button each, what does not fit behind Meer. Its link and delete are in the head's ⋮. */
export async function pressInMenu(page: Page, name: string | RegExp): Promise<void> {
  const title = typeof name === 'string' ? name : (name.source.match(/[\p{L} ]+/u)?.[0] ?? '')
  if (TOOLS.test(title)) {
    await tools(page).click()
    return page.getByRole('menuitem', typeof name === 'string' ? { name, exact: true } : { name }).click()
  }
  const button = row(page).getByRole('button', typeof name === 'string' ? { name, exact: true } : { name })
  if ((await button.count()) > 0) return button.click()
  await more(page).click()
  await page.getByRole('menuitem', typeof name === 'string' ? { name, exact: true } : { name }).click()
}

/** What a drawer's action row offers: its buttons in order, then what Meer holds; empty where the drawer has no row. */
export async function offered(page: Page): Promise<string[]> {
  if ((await row(page).count()) === 0) return []
  const shown = (await row(page).locator(':scope > .nv-button').allTextContents()).map((text) => text.trim())
  if ((await more(page).count()) === 0) return shown
  await more(page).click({ timeout: 2000 })
  const folded = await page.getByRole('menuitem').allTextContents()
  await page.keyboard.press('Escape')
  await expect(menu(page, 'Meer')).toHaveCount(0)
  return [...shown, ...folded]
}
