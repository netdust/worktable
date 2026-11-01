import { expect, type Locator, type Page, test } from '@playwright/test'
import { state, THEATRE } from './auth'
import { openTab } from './drawer'
import { openLooks } from './editor'
import { shot } from './shots'
import { openModel } from './tree'

// The theatre instance's seed (invented): Personen Noor Claes, Bram De Wilde, Jef Maes first; De Kersentuin a voorstelling.
test.use({ baseURL: THEATRE.app, storageState: state('admin'), viewport: { width: 1600, height: 900 } })

const bar = (drawer: Locator) => drawer.getByRole('toolbar', { name: 'Onderdelen' })
const checked = (drawer: Locator) => bar(drawer).locator('[role="radio"][aria-checked="true"]')
const titleOf = (drawer: Locator) => drawer.locator('header').getByRole('heading', { level: 2 })

async function firstDrawer(page: Page, model: string): Promise<Locator> {
  await page.goto('/')
  await openModel(page, model)
  const row = page.locator('tbody tr.nv-tr').first()
  await row.hover()
  await row.getByRole('button', { name: 'Openen' }).click()
  const drawer = page.locator('.nv-drawer')
  await expect(drawer).toHaveCount(1)
  return drawer
}

async function setTheme(page: Page, theme: 'Licht' | 'Donker') {
  await openLooks(page)
  await page.getByRole('radiogroup', { name: 'Thema' }).getByRole('radio', { name: theme }).click()
  await expect(page.locator('#root')).toHaveAttribute('data-theme', theme === 'Donker' ? 'dark' : 'light')
  await page.getByRole('button', { name: 'Bijstellen' }).click()
}

async function shotBoth(page: Page, name: string) {
  try {
    await setTheme(page, 'Licht')
    await shot(page, `${name}-licht`)
    await setTheme(page, 'Donker')
    await shot(page, `${name}-donker`)
  } finally {
    await setTheme(page, 'Licht')
  }
}

test.describe('drawer-tabs, the theatre', () => {
  test('theatre-drawer-tabs @e2e: a person’s drawer has the same tabs as studio’s, the rows pointing at it as icons, and j and k open each person on Gegevens', async ({
    page,
  }) => {
    const person = await firstDrawer(page, 'Personen')
    const first = (await titleOf(person).textContent()) ?? ''
    await expect(checked(person)).toHaveAccessibleName('Gegevens')
    await expect(bar(person).getByRole('radio')).toHaveText(['', '', ''])
    expect(
      await bar(person)
        .getByRole('radio')
        .evaluateAll((els) => els.map((el) => el.getAttribute('aria-label'))),
    ).toEqual(['Gegevens', 'Beschikbaarheden', 'Taken'])
    await bar(person).getByRole('button', { name: 'Meer tabbladen' }).click()
    await expect(page.getByRole('menu', { name: 'Meer tabbladen' }).getByRole('menuitemradio')).toHaveText([
      'Geschiedenis',
    ])
    await page.keyboard.press('Escape')

    await openTab(page, 'Beschikbaarheden')
    await expect(person.getByRole('region', { name: 'Beschikbaarheden' })).toBeVisible()
    await expect(person.locator('.nv-drawer__fields')).toHaveCount(0)
    await shotBoth(page, 'drawer-tabs-theatre-persoon')

    await person.getByRole('button', { name: 'Sluiten' }).focus()
    await page.keyboard.press('j')
    await expect(titleOf(person)).not.toHaveText(first)
    await expect(checked(person)).toHaveAccessibleName('Gegevens')
    await openTab(page, 'Geschiedenis')
    await expect(person.getByRole('region', { name: 'Geschiedenis' })).toBeVisible()
    await person.getByRole('button', { name: 'Sluiten' }).focus()
    await page.keyboard.press('k')
    await expect(titleOf(person)).toHaveText(first)
    await expect(checked(person)).toHaveAccessibleName('Gegevens')
    await expect(person.getByRole('region', { name: 'Beschikbaarheden' })).toHaveCount(0)
  })

  test('theatre-only-fields-no-bar @e2e: a voorstelling’s drawer has only fields, so its head shows no tab bar and its fields show', async ({
    page,
  }) => {
    const play = await firstDrawer(page, 'Voorstellingen')
    await expect(titleOf(play)).not.toHaveText('')
    await expect(play.locator('.nv-drawer__fields').first()).toBeVisible()
    await expect(bar(play)).toHaveCount(0)
    await expect(play.getByRole('radio')).toHaveCount(0)
    await expect(play.getByRole('button', { name: 'Meer tabbladen' })).toHaveCount(0)
    await shotBoth(page, 'drawer-tabs-theatre-alleen-velden')
  })
})
