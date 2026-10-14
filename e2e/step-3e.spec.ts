import { expect, type Locator, type Page, test } from '@playwright/test'
import { openView } from './tree'

const bar = (page: Page) => page.locator('.nv-bar')
const pill = (page: Page) => page.locator('.nv-toolbar__summary')
const radio = (page: Page, name: 'Maand' | 'Week') =>
  bar(page).getByRole('radiogroup', { name: 'Periode' }).getByRole('radio', { name })
/** Which chip is lit: one, or none at all. */
async function lit(page: Page, chip: 'Maand' | 'Week' | null) {
  await expect(radio(page, 'Maand')).toHaveAttribute('aria-checked', String(chip === 'Maand'))
  await expect(radio(page, 'Week')).toHaveAttribute('aria-checked', String(chip === 'Week'))
}
const weekNo = async (page: Page) => Number((await pill(page).textContent())?.match(/^Week (\d+)/)?.[1])

/** The period is never also a condition chip: no chip names a week, a month or a day of it. */
async function noPeriodChip(page: Page) {
  for (const chip of await bar(page).locator('.nv-chip--filter').all()) {
    await expect(chip).not.toHaveText(/\d{4}-\d{2}-\d{2}|deze week|deze maand|Week \d+|tussen/)
  }
}

async function press(page: Page, control: Locator) {
  await test.step(`press ${(await control.textContent()) || (await control.getAttribute('aria-label'))}`, async () => {
    await control.click()
    await noPeriodChip(page)
  })
}

const SKINS = [
  { view: 'Planning', model: 'Activiteiten', optional: true },
  { view: 'Per status', model: 'Activiteiten', optional: true },
  { view: 'Galerij activiteiten', model: 'Activiteiten', optional: true },
  { view: 'Kalender activiteiten', model: 'Activiteiten', optional: false },
  { view: 'Tijdlijn tourstops', model: 'Tourstops', optional: false },
  { view: 'Toewijzingen per activiteit', model: 'Activiteiten', optional: false },
]

test.describe('step 3e: one period, used the same way on every skin', () => {
  // Seven presses, each reading the view's rows again.
  test.describe.configure({ timeout: 120_000 })

  for (const { view, model, optional } of SKINS) {
    test(`period-sequence on ${view} @e2e`, async ({ page }) => {
      await page.goto('/')
      await openView(page, view, model)
      await expect(page.getByRole('heading', { level: 1 })).toHaveText(view)
      await expect(radio(page, 'Maand')).toBeVisible()
      await noPeriodChip(page)

      // Maand: the month, named in the title line.
      if ((await radio(page, 'Maand').getAttribute('aria-checked')) === 'true') await press(page, radio(page, 'Week'))
      await press(page, radio(page, 'Maand'))
      await lit(page, 'Maand')
      await expect(pill(page)).toHaveText(/^[a-z]+ \d{4}$/)

      // Maand again: every date where the skin can show them, else it stays lit.
      await press(page, radio(page, 'Maand'))
      await lit(page, optional ? null : 'Maand')
      if (optional) await expect(bar(page).getByRole('button', { name: 'Volgende periode' })).toBeDisabled()

      // Week, then one week on.
      await press(page, radio(page, 'Week'))
      await lit(page, 'Week')
      await expect(pill(page)).toHaveText(/^Week \d+ · /)
      const thisWeek = await weekNo(page)
      await press(page, bar(page).getByRole('button', { name: 'Volgende periode' }))
      await expect.poll(() => weekNo(page)).not.toBe(thisWeek)

      // Vandaag: back to this week, which the view keeps following.
      await press(page, bar(page).getByRole('button', { name: 'Vandaag' }))
      await expect.poll(() => weekNo(page)).toBe(thisWeek)

      // Removing the period: pressing the lit Week clears it where the skin allows every date.
      await press(page, radio(page, 'Week'))
      await lit(page, optional ? null : 'Week')
      await expect(radio(page, 'Maand')).toBeVisible()
    })
  }

  test('a view whose table has no date shows no period control @e2e', async ({ page }) => {
    await page.goto('/')
    await openView(page, 'Bord toewijzingen', 'Toewijzingen')
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Bord toewijzingen')
    await expect(bar(page).getByRole('button', { name: /^Filter/ })).toBeVisible()
    await expect(bar(page).getByRole('radiogroup', { name: 'Periode' })).toHaveCount(0)
    await expect(bar(page).getByRole('button', { name: 'Vandaag' })).toHaveCount(0)
  })
})
