import { expect, type Locator, type Page } from '@playwright/test'

export interface Pointer {
  x: number
  y: number
}

/** A board's column: a section named by its label. */
export const lane = (page: Page, label: string): Locator => page.getByRole('region', { name: label, exact: true })

/** A card in a column, by text it holds. */
export const cardIn = (page: Page, label: string, text: string | RegExp): Locator =>
  lane(page, label).locator('[data-card]').filter({ hasText: text })

/** A card wherever it sits, by its record's id. */
export const card = (page: Page, id: number): Locator => page.locator(`.nv-board__list [data-card="${id}"]`)

/** What the drag last said: dnd-kit's live region, in Dutch. */
export const said = (page: Page): Locator => page.locator('[id^="DndLiveRegion"]')

/** Every column's card ids, top to bottom, by the column's label. */
export function orders(page: Page): Promise<Record<string, number[]>> {
  return page
    .locator('section.nv-board__column')
    .evaluateAll((columns) =>
      Object.fromEntries(
        columns.map((column) => [
          column.getAttribute('aria-label') ?? '',
          [...column.querySelectorAll<HTMLElement>('[data-card]')].map((one) => Number(one.dataset.card)),
        ]),
      ),
    )
}

/**
 * Presses on a card and moves it sideways past dnd-kit's 5px: one move is taken as the activation only, so the card
 * would drop in place; sideways gives the board no reason to scroll up or down.
 */
export async function lift(page: Page, held: Locator): Promise<Pointer> {
  await held.scrollIntoViewIfNeeded()
  const box = await held.boundingBox()
  if (!box) throw new Error('the card is not on the page')
  const at = { x: box.x + box.width / 2, y: box.y + box.height / 2 }
  await page.mouse.move(at.x, at.y)
  await page.mouse.down()
  await page.mouse.move(at.x + 8, at.y, { steps: 4 })
  await expect(page.locator('.nv-board__card--lifted')).toBeVisible()
  return { x: at.x + 8, y: at.y }
}

/** The pointer to `to` in steps of about 8px, as a hand moves it. */
export async function glide(page: Page, from: Pointer, to: Pointer): Promise<Pointer> {
  const steps = Math.max(1, Math.ceil(Math.hypot(to.x - from.x, to.y - from.y) / 8))
  await page.mouse.move(to.x, to.y, { steps })
  return to
}
