import { expect, test } from '@playwright/test'
import { state } from './auth'
import { shot } from './shots'
import { openView, openWeek } from './tree'

test.use({ storageState: state('admin'), viewport: { width: 1280, height: 800 } })

// Shake-out row 20: at 1280px Dagplanning's toolbar must not overflow; the title reads in full and "Nieuwe activiteit" stays on screen.
test('title-line-fits-at-1280 @e2e', async ({ page }) => {
  await openWeek(page, 'Planning', 'Activiteiten', 'plandag', '2026-10-12')
  const title = page.getByRole('heading', { level: 1, name: 'Planning' })
  await expect(title).toBeVisible()
  await expect(page.locator('.nv-toolbar__summary')).toHaveText(/^Week \d+ · /)
  const { scrollWidth, clientWidth } = await title.evaluate((el) => ({
    scrollWidth: el.scrollWidth,
    clientWidth: el.clientWidth,
  }))
  expect(scrollWidth).toBeLessThanOrEqual(clientWidth)
  await expect(page.locator('tbody tr.nv-tr').first()).toBeVisible()
  const toolbar = page.locator('header.nv-toolbar')
  await expect(page.getByRole('button', { name: 'Nieuwe activiteit' })).toBeInViewport({ ratio: 1, timeout: 2000 })
  expect(await toolbar.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true)
  await shot(page, 'title-line')
})

// With a record drawer open at 1280 the bar's end gives way first: the name reads whole and the period pill stays.
for (const [view, model, open] of [
  ['Planning', 'Activiteiten', 'row'],
  ['Per status', 'Activiteiten', 'card'],
] as const) {
  test(`title-line-fits-with-a-drawer-open on ${view} @e2e`, async ({ page }) => {
    await openWeek(page, view, model, 'plandag', '2026-10-12')
    if (open === 'row') await page.locator('tbody tr.nv-tr').first().getByRole('button', { name: 'Openen' }).click()
    else await page.locator('.nv-board__card').first().click()
    await expect(page.locator('.nv-drawer')).toBeVisible()
    const title = page.getByRole('heading', { level: 1, name: view })
    const fit = await title.evaluate((h1) => {
      const name = h1.parentElement as HTMLElement
      const pill = name.querySelector('.nv-toolbar__summary') as HTMLElement | null
      return {
        h1Right: h1.getBoundingClientRect().right,
        nameRight: name.getBoundingClientRect().right,
        pillWidth: pill?.getBoundingClientRect().width ?? 0,
        pillClipped: pill ? pill.scrollWidth > pill.clientWidth : true,
      }
    })
    expect(fit.h1Right).toBeLessThanOrEqual(fit.nameRight)
    expect(fit.pillWidth).toBeGreaterThan(0)
    expect(fit.pillClipped).toBe(false)
    await expect(page.getByRole('button', { name: /^Nieuwe/ })).toBeInViewport({ ratio: 1 })
    await shot(page, `title-line-drawer-${open}`)
  })
}

// Studio-polish R10: one pill per tone, bad before warn. Toewijzing has two bad options, named together on the red pill.
test.describe('two-tone title pill at 1440', () => {
  test.use({ viewport: { width: 1440, height: 900 } })

  test('title-pill-two-tones @e2e: Toewijzingen reads Geweigerd · Geannuleerd in red before Uitgenodigd', async ({
    page,
  }) => {
    const api = page.request
    const made: number[] = []
    const add = async (naam: string, to: string) => {
      const created = await api.post('/api/rows/toewijzing', {
        data: { activiteit_id: 5, naam, state: 'uitgenodigd' },
      })
      expect(created.status(), await created.text()).toBe(201)
      const id = ((await created.json()) as { id: number }).id
      made.push(id)
      const moved = await api.patch(`/api/rows/toewijzing/${id}`, { data: { state: to } })
      expect(moved.status(), await moved.text()).toBe(200)
    }
    try {
      await add('e2e Gast geweigerd', 'geweigerd')
      await add('e2e Gast geannuleerd', 'geannuleerd')
      const listed = await api.get('/api/rows/toewijzing?limit=500')
      const rows = ((await listed.json()) as { rows: { state: string }[] }).rows
      const held = (...states: string[]) => rows.filter((row) => states.includes(row.state)).length

      await page.goto('/')
      await openView(page, 'Toewijzingen', 'Toewijzingen')
      await expect(page.getByRole('heading', { level: 1 })).toHaveText('Toewijzingen')
      const pills = page.locator('.nv-toolbar__insight')
      await expect(pills).toHaveText([
        `Geweigerd · Geannuleerd${held('geweigerd', 'geannuleerd')}`,
        `Uitgenodigd${held('uitgenodigd')}`,
      ])
      await expect(pills.nth(0).locator('.nv-pill')).toHaveClass(/nv-pill--bad/)
      await expect(pills.nth(1).locator('.nv-pill')).toHaveClass(/nv-pill--warn/)
      await shot(page, 'theatre-toewijzingen-pil')
    } finally {
      for (const id of made) await api.delete(`/api/rows/toewijzing/${id}`)
    }
  })
})
