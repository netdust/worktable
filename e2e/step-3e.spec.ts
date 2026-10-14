import { expect, type Locator, type Page, test } from '@playwright/test'
import { shot } from './shots'
import { openView, openWeek } from './tree'

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

test.describe('step 3e: Groep chooses on every skin', () => {
  test.describe.configure({ timeout: 120_000 })
  const groep = (page: Page) => bar(page).getByRole('button', { name: /^Groep: / })

  test('groep-everywhere @e2e', async ({ page }) => {
    await page.goto('/')
    for (const [view, model] of [
      ['Planning', 'Activiteiten'],
      ['Per status', 'Activiteiten'],
      ['Galerij activiteiten', 'Activiteiten'],
      ['Kalender activiteiten', 'Activiteiten'],
      ['Tijdlijn tourstops', 'Tourstops'],
      ['Toewijzingen per activiteit', 'Activiteiten'],
    ]) {
      await openView(page, view, model)
      await expect(page.getByRole('heading', { level: 1 })).toHaveText(view)
      await groep(page).click()
      await expect(page.getByRole('dialog', { name: 'Groeperen' }).getByRole('button').first()).toBeVisible()
      await page.keyboard.press('Escape')
    }

    // The board regroups its columns by the option field chosen.
    await openView(page, 'Per status', 'Activiteiten')
    await expect(page.getByRole('grid', { name: 'Optie' })).toBeVisible()
    await groep(page).click()
    await page.getByRole('dialog', { name: 'Groeperen' }).getByRole('button', { name: 'Soort' }).click()
    await expect(groep(page)).toHaveText('Groep: soort')
    await expect(page.getByRole('grid', { name: 'Voorstelling' })).toBeVisible()
    await expect(page.getByRole('grid', { name: 'Optie' })).toHaveCount(0)
  })
})

test.describe('step 3e: the board drags', () => {
  test.describe.configure({ timeout: 120_000 })
  // Every column on screen: a drop needs its target in view.
  test.use({ viewport: { width: 1600, height: 900 } })
  type Api = Page['request']
  const DRAG_WEEK = '2028-10-02'
  async function made(api: Api, dataset: string, data: Record<string, unknown>): Promise<number> {
    const response = await api.post(`/api/rows/${dataset}`, { data })
    expect(response.status(), await response.text()).toBe(201)
    return ((await response.json()) as { id: number }).id
  }
  async function nachtwacht(api: Api): Promise<number> {
    const rows = (
      (await (await api.get('/api/rows/productie?limit=500')).json()) as { rows: { id: number; titel: string }[] }
    ).rows
    return rows.find((r) => r.titel === 'Nachtwacht')?.id as number
  }
  const card = (page: Page, column: string, title: string) =>
    page.getByRole('grid', { name: column }).getByRole('row', { name: new RegExp(title) })

  test('board-drag @e2e', async ({ page }) => {
    const api = page.request
    const title = 'e2e sleep mij'
    const id = await made(api, 'activiteit', {
      productie_id: await nachtwacht(api),
      soort: 'repetitie',
      status: 'optie',
      datum: '2028-10-03',
      omschrijving: title,
    })
    try {
      await openWeek(page, 'Per status', 'Activiteiten', 'plandag', DRAG_WEEK)
      await expect(card(page, 'Optie', title)).toBeVisible()

      // Mouse: the card lifts out of Optie and lands in Bevestigd; ⌘Z puts it back.
      await card(page, 'Optie', title).dragTo(page.getByRole('grid', { name: 'Bevestigd' }))
      await expect(card(page, 'Bevestigd', title)).toBeVisible()
      await expect(card(page, 'Optie', title)).toHaveCount(0)
      await expect
        .poll(
          async () =>
            (
              (await (
                await api.get(`/api/rows/activiteit?filter=${encodeURIComponent(JSON.stringify({ id }))}`)
              ).json()) as { rows: { status: string }[] }
            ).rows[0]?.status,
        )
        .toBe('bevestigd')
      await card(page, 'Bevestigd', title).focus()
      await page.keyboard.press('ControlOrMeta+z')
      await expect(card(page, 'Optie', title)).toBeVisible()

      // Keyboard: Enter on the drag button lifts it onto the first column that takes it (Tab goes on to the next); Enter drops it.
      await card(page, 'Optie', title)
        .getByRole('button', { name: `${title} verslepen` })
        .focus()
      await page.keyboard.press('Enter')
      await page.keyboard.press('Enter')
      await expect(card(page, 'Bevestigd', title)).toBeVisible()
      await expect(card(page, 'Optie', title)).toHaveCount(0)
    } finally {
      await api.delete(`/api/rows/activiteit/${id}`)
    }
  })

  test('board-drag-refused @e2e', async ({ page }) => {
    const api = page.request
    const activiteit = await made(api, 'activiteit', {
      productie_id: await nachtwacht(api),
      soort: 'repetitie',
      datum: '2028-10-04',
      omschrijving: 'e2e weiger mij',
    })
    const naam = 'e2e bevestigd blijft'
    const id = await made(api, 'toewijzing', { activiteit_id: activiteit, naam, state: 'bevestigd' })
    try {
      await page.goto('/')
      await openView(page, 'Bord toewijzingen', 'Toewijzingen')
      await expect(card(page, 'Bevestigd', naam)).toBeVisible()
      // Bevestigd never goes back to Open: the writer refuses, the card snaps back and the refusal shows.
      await card(page, 'Bevestigd', naam).dragTo(page.getByRole('grid', { name: 'Open' }))
      await expect(page.locator('.nv-toolbar').getByRole('status')).toContainText('Niet')
      await expect(card(page, 'Bevestigd', naam)).toBeVisible()
      await expect(card(page, 'Open', naam)).toHaveCount(0)
    } finally {
      await api.delete(`/api/rows/toewijzing/${id}`)
      await api.delete(`/api/rows/activiteit/${activiteit}`)
    }
  })

  test('board-column-plus @e2e', async ({ page }) => {
    const api = page.request
    await openWeek(page, 'Per status', 'Activiteiten', 'plandag', DRAG_WEEK)
    await page.getByRole('button', { name: 'Nieuw in Geannuleerd' }).click()
    const dialog = page.getByRole('dialog')
    await expect(dialog).toBeVisible()
    await expect(dialog.getByLabel('Status')).toHaveCount(0)
    await dialog.getByLabel('Productie').selectOption({ label: 'Nachtwacht' })
    await dialog.getByLabel('Datum').fill('2028-10-05')
    await dialog.getByRole('button', { name: 'Aanmaken' }).click()
    await expect(dialog).toHaveCount(0)
    const found = (
      (await (
        await api.get(
          `/api/rows/activiteit?limit=500&filter=${encodeURIComponent(JSON.stringify({ datum: '2028-10-05' }))}`,
        )
      ).json()) as { rows: { id: number; status: string }[] }
    ).rows
    try {
      expect(found.map((r) => r.status)).toEqual(['geannuleerd'])
    } finally {
      for (const r of found) await api.delete(`/api/rows/activiteit/${r.id}`)
    }
  })
})

test.describe('step 3e: the drawer as the prototypes draw it', () => {
  test.describe.configure({ timeout: 120_000 })
  test.use({ viewport: { width: 1600, height: 900 } })
  const WEEK = '2028-10-09'

  test('drawer-anatomy @e2e', async ({ page }) => {
    const api = page.request
    const productie = (
      (await (await api.get('/api/rows/productie?limit=500')).json()) as { rows: { id: number; titel: string }[] }
    ).rows.find((r) => r.titel === 'Nachtwacht')?.id
    const made: number[] = []
    for (const [title, start] of [
      ['e2e lade eerst', '10:00'],
      ['e2e lade tweede', '14:00'],
    ]) {
      const response = await api.post('/api/rows/activiteit', {
        data: {
          productie_id: productie,
          soort: 'repetitie',
          status: 'bevestigd',
          datum: '2028-10-10',
          omschrijving: title,
          start_at: `2028-10-10T${start}`,
          eind_at: `2028-10-10T${start === '10:00' ? '12:00' : '16:00'}`,
        },
      })
      expect(response.status(), await response.text()).toBe(201)
      made.push(((await response.json()) as { id: number }).id)
    }
    try {
      await openWeek(page, 'Planning', 'Activiteiten', 'plandag', WEEK)
      const row = page.locator('tbody tr.nv-tr[data-title="e2e lade eerst"]')
      await row.hover()
      await row.getByRole('button', { name: 'Openen' }).click()
      const drawer = page.getByRole('complementary', { name: 'e2e lade eerst' })
      await expect(drawer).toBeVisible()

      // The head: kind · dataset, the place in the view, the steps.
      await expect(drawer.locator('.nv-dw-head__kind')).toHaveText(/Repetitie\s*·\s*Activiteiten/)
      await expect(drawer.locator('.nv-dw-head__pos')).toHaveText('1 van 2')
      // The title, the space in the subline, the fields with one Tijd and the day in full.
      await expect(drawer.getByRole('heading', { level: 2 })).toHaveText('e2e lade eerst')
      await expect(drawer.locator('.nv-dw-sub')).toContainText('Nachtwacht')
      const field = (label: string) =>
        drawer
          .locator('.nv-drawer__field', { has: page.locator('dt', { hasText: new RegExp(`^${label}$`) }) })
          .locator('dd')
      await expect(field('Tijd')).toHaveText('10:00–12:00')
      await expect(field('Plandag')).toHaveText('di 10 okt 2028')
      await expect(drawer.getByRole('button', { name: /^\+ \d+ andere velden$/ })).toBeVisible()
      // The sections: the people, the history.
      await expect(drawer.getByRole('region', { name: 'Mensen' })).toBeVisible()
      await expect(drawer.getByRole('region', { name: 'Geschiedenis' })).toBeVisible()
      await shot(page, 'drawer-anatomy')

      // ↓ steps to the next row of the view; expand widens over the work and Escape gives it back.
      await drawer.getByRole('button', { name: 'Volgende' }).click()
      const second = page.getByRole('complementary', { name: 'e2e lade tweede' })
      await expect(second.locator('.nv-dw-head__pos')).toHaveText('2 van 2')
      await second.getByRole('button', { name: 'Volledig openen' }).click()
      await expect(second).toHaveClass(/nv-drawer--wide/)
      await page.keyboard.press('Escape')
      await expect(second).not.toHaveClass(/nv-drawer--wide/)
      await expect(second).toBeVisible()
    } finally {
      for (const id of made) await api.delete(`/api/rows/activiteit/${id}`)
    }
  })
})
