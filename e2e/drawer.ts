import { expect, type Page } from '@playwright/test'

const trigger = (page: Page) => page.locator('.nv-drawer__head').getByRole('button', { name: 'Acties' }).last()
const menu = (page: Page) => page.getByRole('menu', { name: 'Acties' })

/** A record's actions are in its drawer's head: the primary button in view, every other one behind Acties. */
export async function pressInMenu(page: Page, name: string | RegExp): Promise<void> {
  await trigger(page).click()
  await page.getByRole('menuitem', typeof name === 'string' ? { name, exact: true } : { name }).click()
}

/** What the Acties menu offers, opened and closed again; empty where the drawer has none. */
export async function offered(page: Page): Promise<string[]> {
  if ((await trigger(page).count()) === 0) return []
  await trigger(page).click({ timeout: 2000 })
  const names = await page.getByRole('menuitem').allTextContents()
  await page.keyboard.press('Escape')
  await expect(menu(page)).toHaveCount(0)
  return names
}
