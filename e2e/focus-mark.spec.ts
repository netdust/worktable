import { expect, type Locator, type Page, test } from '@playwright/test'
import { openLooks } from './editor'
import { shot } from './shots'
import { modelNode, openWeek } from './tree'

// The seed's activities sit in this week; the engine reads "this week" from its own clock, so the page names the week.
const SEED_WEEK = '2026-10-12'
const inSeedWeek = (page: Page, view: string) => openWeek(page, view, 'Activiteiten', 'plandag', SEED_WEEK)

// The text colour where an element sits; a new element has no transition, so this is the settled value.
function inkAt(target: Locator): Promise<string> {
  return target.evaluate(
    (el) => {
      const probe = document.createElement('span')
      probe.style.color = 'var(--color-fg-default)'
      ;(el.parentElement ?? document.body).appendChild(probe)
      const ink = getComputedStyle(probe).color
      probe.remove()
      return ink
    },
    undefined,
    { timeout: 10_000 },
  )
}

// Retried: colours crossfade, so a value read at once can still be on its way.
async function expectMark(target: Locator): Promise<void> {
  const ink = await inkAt(target)
  await expect(target).toHaveCSS('outline-style', 'solid')
  await expect(target).toHaveCSS('outline-width', '1px')
  await expect(target).toHaveCSS('outline-color', ink)
  await expect.poll(() => target.evaluate((el) => getComputedStyle(el).boxShadow)).not.toMatch(/0px 0px 0px [24]px/)
}

// A key first, so the browser counts the focus as the keyboard's and shows :focus-visible.
async function keyboardFocus(page: Page, target: Locator): Promise<void> {
  await page.keyboard.press('Shift')
  await target.focus({ timeout: 10_000 })
  await expect.poll(() => target.evaluate((el) => el.matches(':focus-visible'))).toBe(true)
}

async function setTheme(page: Page, theme: 'Licht' | 'Donker') {
  await openLooks(page)
  await page.getByRole('radiogroup', { name: 'Thema' }).getByRole('radio', { name: theme }).click()
}

for (const theme of ['Licht', 'Donker'] as const) {
  test(`focus-mark in ${theme} @e2e`, async ({ page }) => {
    test.setTimeout(120_000)
    const name = (surface: string) => `focus-${surface}-${theme === 'Licht' ? 'light' : 'dark'}`
    await page.goto('/')
    await setTheme(page, theme)
    try {
      // The grid's cell cursor: the same thin line in the text colour, inside the cell.
      await inSeedWeek(page, 'Planning')
      const first = page.locator('tbody tr.nv-tr').first().locator('td').nth(2)
      await first.click()
      await page.keyboard.press('ArrowRight')
      const active = page.locator('.nv-td--active')
      await expect(active).toHaveCount(1)
      await expect(active).toHaveCSS('box-shadow', `${await inkAt(active)} 0px 0px 0px 1px inset`)
      await shot(page, name('grid-cell'))

      // A toolbar chip, reached by Tab.
      const chip = page.getByRole('button', { name: 'Filter', exact: true })
      await keyboardFocus(page, chip)
      await expectMark(chip)
      await shot(page, name('toolbar-chip'))

      // A board card lifted by the keyboard keeps the mark while it moves; Escape puts it back.
      await inSeedWeek(page, 'Per status')
      const card = page.locator('.nv-board__list [data-card]').first()
      await keyboardFocus(page, card)
      await page.keyboard.press('Space')
      await expectMark(card)
      await shot(page, name('board-card-drag'))
      await page.keyboard.press('Escape')

      // A control in the record drawer.
      await inSeedWeek(page, 'Planning')
      const row = page.locator('tbody tr.nv-tr').first()
      await row.hover()
      await row.getByRole('button', { name: 'Openen' }).click()
      const drawer = page.getByRole('complementary', { name: (await row.getAttribute('data-title')) ?? '' })
      await expect(drawer).toBeVisible()
      const close = drawer.getByRole('button', { name: 'Sluiten' })
      await keyboardFocus(page, close)
      await expectMark(close)
      await shot(page, name('drawer'))
      await page.keyboard.press('Escape')

      // A dialog: its field and its buttons.
      const model = modelNode(page, 'Activiteiten').locator('.nv-model')
      await model.hover()
      await model.getByRole('button', { name: 'Weergave toevoegen aan Activiteiten' }).click()
      await page
        .getByRole('menu', { name: 'Weergave toevoegen aan Activiteiten' })
        .getByRole('menuitem', { name: 'Grid' })
        .click()
      const dialog = page.getByRole('dialog', { name: 'Nieuwe gridweergave' })
      const field = dialog.getByRole('textbox', { name: 'Naam' })
      await field.focus()
      await expectMark(field)
      // On the field's own border, not a second frame outside it.
      await expect(field).toHaveCSS('outline-offset', '-1px')
      await shot(page, name('dialog'))

      // A radio in its label: the label carries the mark, the small circle none of its own.
      await page.keyboard.press('Tab')
      const radio = dialog.getByRole('radio', { name: 'Het team' })
      await expect(radio).toBeFocused()
      await expectMark(dialog.locator('label').filter({ has: page.getByRole('radio', { name: 'Het team' }) }))
      await expect(radio).toHaveCSS('outline-style', 'none')
      await expect(dialog.locator('label').filter({ has: page.getByRole('radio', { name: 'Het team' }) })).toHaveCSS(
        'outline-offset',
        '-1px',
      )
      await shot(page, name('dialog-choice'))
      await page.keyboard.press('Escape')
      await expect(dialog).toHaveCount(0)
    } finally {
      // The theme is the account's: the next flow starts in light.
      await setTheme(page, 'Licht')
    }
  })
}
