import { expect, type Locator, type Page, test } from '@playwright/test'
import { state } from './auth'
import { pressInMenu } from './drawer'
import { shot } from './shots'
import { openView } from './tree'

type Api = Page['request']
type Values = Record<string, unknown>

// An empty week of 2028, Monday 5 to Sunday 11 June: the shifts below stay inside it.
const MONDAY = '2028-06-05'
const ACTION = 'Tourstop verschuiven'

async function rowsOf<T = Values>(api: Api, dataset: string, filter?: Values): Promise<T[]> {
  const query = filter ? `&filter=${encodeURIComponent(JSON.stringify(filter))}` : ''
  const response = await api.get(`/api/rows/${dataset}?limit=500${query}`)
  expect(response.status()).toBe(200)
  return ((await response.json()) as { rows: T[] }).rows
}

async function idOf(api: Api, dataset: string, values: Values): Promise<number> {
  const response = await api.post(`/api/rows/${dataset}`, { data: values })
  expect(response.status(), await response.text()).toBe(201)
  return ((await response.json()) as { id: number }).id
}

const idByName = async (api: Api, dataset: string, column: string, name: string) =>
  (await rowsOf<Values & { id: number }>(api, dataset)).find((r) => r[column] === name)?.id as number

interface Made {
  activiteit: number[]
  speelreeks: number[]
  productie: number[]
  organisatie: number[]
}

const nothing = (): Made => ({ activiteit: [], speelreeks: [], productie: [], organisatie: [] })

/** Deletes what a flow made, whatever happened: the specs share one database. */
async function cleanUp(api: Api, made: Made) {
  for (const id of made.activiteit) await api.delete(`/api/rows/activiteit/${id}`)
  for (const id of made.speelreeks) await api.delete(`/api/rows/speelreeks/${id}`)
  for (const id of made.productie) await api.delete(`/api/rows/productie/${id}`)
  for (const id of made.organisatie) await api.delete(`/api/rows/organisatie/${id}`)
}

/** Wednesday to Friday, with three activities: a day without a time, an evening, and one past midnight. */
async function tourstopWithActivities(api: Api, made: Made, naam: string, productie: number) {
  const reeks = await idOf(api, 'speelreeks', {
    naam,
    productie_id: productie,
    locatie_id: await idByName(api, 'organisatie', 'naam', 'Theater Het Anker'),
    start_datum: '2028-06-07',
    eind_datum: '2028-06-09',
  })
  made.speelreeks.push(reeks)
  const base = { productie_id: productie, speelreeks_id: reeks, soort: 'repetitie' }
  for (const values of [
    { omschrijving: `${naam} opbouw`, datum: '2028-06-07' },
    { omschrijving: `${naam} avond`, start_at: '2028-06-08T20:00', eind_at: '2028-06-08T22:00' },
    { omschrijving: `${naam} nacht`, start_at: '2028-06-09T01:00', eind_at: '2028-06-09T02:30' },
  ]) {
    made.activiteit.push(await idOf(api, 'activiteit', { ...base, ...values }))
  }
  return reeks
}

/** The tourstop and its activities as the server holds them, in one comparable line each. */
async function datesOf(api: Api, reeks: number): Promise<string[]> {
  const stop = (await rowsOf<Values>(api, 'speelreeks')).find((r) => r.id === reeks) as Values
  const activities = await rowsOf<Values>(api, 'activiteit', { speelreeks_id: reeks })
  return [
    `tourstop ${stop.start_datum}..${stop.eind_datum}`,
    ...activities
      .map(
        (a) =>
          `${String(a.omschrijving).split(' ').pop()} ${a.datum} ${a.start_at ?? '-'} ${a.eind_at ?? '-'} ${a.plandag}`,
      )
      .sort(),
  ]
}

const AT_START = [
  'tourstop 2028-06-07..2028-06-09',
  'avond 2028-06-08 2028-06-08T20:00 2028-06-08T22:00 2028-06-08',
  'nacht 2028-06-09 2028-06-09T01:00 2028-06-09T02:30 2028-06-08',
  'opbouw 2028-06-07 - - 2028-06-07',
]

/**
 * Opens a view with conditions, as a link carries them: Link kopiëren gives the view's address, the conditions
 * replace the ones on these fields, and the page lands on that address.
 */
async function openWith(page: Page, view: string, model: string, conditions: Values[]) {
  await page.context().grantPermissions(['clipboard-read', 'clipboard-write'])
  await page.goto('/')
  await openView(page, view, model)
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(view)
  await page.locator('.nv-toolbar').getByRole('button', { name: 'Exporteren / delen' }).click()
  await page.getByRole('menu', { name: 'Exporteren / delen' }).getByRole('menuitem', { name: 'Link kopiëren' }).click()
  await expect(page.getByText('Link gekopieerd')).toBeVisible()
  const copied = new URL(await page.evaluate(() => navigator.clipboard.readText()))
  const params = new URLSearchParams(copied.hash.slice(1))
  const fields = conditions.map((c) => c.field)
  const kept = (JSON.parse(params.get('f') ?? '[]') as Values[]).filter((c) => !fields.includes(c.field))
  params.set('f', JSON.stringify([...conditions, ...kept]))
  await page.goto(`/#${params.toString()}`)
  await page.reload()
  await expect
    .poll(() => new URLSearchParams(new URL(page.url()).hash.slice(1)).get('f'), { timeout: 15_000 })
    .toBeNull()
}

const named = (page: Page, title: string) => page.locator(`tbody tr.nv-tr[data-title="${title}"]`)

async function columnIndex(page: Page, label: string): Promise<number> {
  const find = () =>
    page
      .locator('thead th')
      .evaluateAll(
        (heads, wanted) => heads.findIndex((th) => (th.textContent ?? '').replace(/\s*[↑↓]$/, '').trim() === wanted),
        label,
      )
  await expect.poll(find, { message: `column ${label}` }).toBeGreaterThanOrEqual(0)
  return find()
}

const cellOf = async (page: Page, title: string, label: string): Promise<Locator> =>
  named(page, title)
    .locator('td')
    .nth(await columnIndex(page, label))

/** The day band each of the tourstop's rows sits under in Planning, by the row's last word. */
const bandsOf = (page: Page, naam: string) =>
  page.locator('tbody tr').evaluateAll((trs, prefix) => {
    const found: string[] = []
    let band = ''
    for (const tr of trs) {
      if (tr.classList.contains('nv-group'))
        band = (tr.textContent ?? '').trim().match(/^\p{L}+ \d+ \p{L}+/u)?.[0] ?? ''
      const title = tr.getAttribute('data-title') ?? ''
      if (tr.classList.contains('nv-tr') && title.startsWith(prefix)) found.push(`${title.split(' ').pop()} ${band}`)
    }
    return found.sort()
  }, naam)

const actionOf = (page: Page) => page.getByRole('group', { name: ACTION })
const runOf = (page: Page) => actionOf(page).getByRole('button', { name: ACTION, exact: true })
const daysOf = (page: Page) => actionOf(page).getByRole('spinbutton', { name: 'Dagen' })

const answerOf = (page: Page) =>
  page.waitForResponse(
    (res) => res.request().method() === 'POST' && new URL(res.url()).pathname === '/api/actions/tourstop_verschuiven',
  )

const undoOf = (page: Page) =>
  page.waitForResponse(
    (res) => res.request().method() === 'POST' && /^\/api\/batches\/[^/]+\/undo$/.test(new URL(res.url()).pathname),
  )

async function openDrawer(page: Page, naam: string) {
  await named(page, naam).getByRole('button', { name: 'Openen' }).click()
  await pressInMenu(page, ACTION)
  await expect(actionOf(page)).toBeVisible()
}

test('shift-tourstop @e2e', async ({ page }) => {
  // One run, one undo, three views: under a full run's load it can outgrow the default 30 s.
  test.setTimeout(60_000)
  const api = page.request
  const made = nothing()
  const naam = 'Tourstop e2e verschuiven'
  try {
    const reeks = await tourstopWithActivities(api, made, naam, await idByName(api, 'productie', 'titel', 'Nachtwacht'))
    expect(await datesOf(api, reeks)).toEqual(AT_START)

    await page.setViewportSize({ width: 1600, height: 900 })
    // Planning landed on the week first: the week stays with it when the rail comes back to it.
    await openWith(page, 'Planning', 'Activiteiten', [
      { field: 'plandag', op: 'between', values: [MONDAY, '2028-06-11'] },
    ])
    await expect
      .poll(() => bandsOf(page, naam))
      .toEqual(['avond Donderdag 8 juni', 'nacht Donderdag 8 juni', 'opbouw Woensdag 7 juni'])

    await openWith(page, 'Tourstops', 'Tourstops', [{ field: 'naam', op: 'eq', values: [naam] }])
    await expect(named(page, naam)).toHaveCount(1)
    await openDrawer(page, naam)

    // Boundary: the run waits for a whole number in -365..365.
    await expect(daysOf(page)).toBeVisible()
    await expect(daysOf(page)).toHaveValue('')
    await expect(runOf(page)).toBeDisabled()
    for (const wrong of ['400', '-366', '366', '1.5']) {
      await daysOf(page).fill(wrong)
      await expect(runOf(page), `Dagen ${wrong}`).toBeDisabled()
    }
    await daysOf(page).fill('')
    await expect(runOf(page)).toBeDisabled()
    await daysOf(page).fill('3')
    await expect(runOf(page)).toBeEnabled()
    await shot(page, 'drawer-dagen')

    // Three days later: the tourstop and its activities, plandag recomputed past the day line.
    const answered = answerOf(page)
    await runOf(page).click()
    const reply = await answered
    expect(reply.status(), await reply.text()).toBe(201)
    const moved = [
      'tourstop 2028-06-10..2028-06-12',
      'avond 2028-06-11 2028-06-11T20:00 2028-06-11T22:00 2028-06-11',
      'nacht 2028-06-12 2028-06-12T01:00 2028-06-12T02:30 2028-06-11',
      'opbouw 2028-06-10 - - 2028-06-10',
    ]
    await expect.poll(() => datesOf(api, reeks)).toEqual(moved)
    await expect(page.getByRole('status', { name: `${ACTION} uitgevoerd.` })).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(await cellOf(page, naam, 'Start')).toHaveText('10-06-2028')
    await expect(await cellOf(page, naam, 'Einde')).toHaveText('12-06-2028')
    await shot(page, 'tourstop-moved')

    // In Planning, each activity sits under its new day.
    await openView(page, 'Planning', 'Activiteiten')
    await expect
      .poll(() => bandsOf(page, naam))
      .toEqual(['avond Zondag 11 juni', 'nacht Zondag 11 juni', 'opbouw Zaterdag 10 juni'])
    await shot(page, 'planning-moved')

    // One Ctrl+Z, from a cell, puts everything back in one batch.
    await named(page, `${naam} opbouw`).locator('td').nth(1).click()
    const undone = undoOf(page)
    await page.keyboard.press('ControlOrMeta+z')
    expect((await undone).status()).toBe(200)
    await expect.poll(() => datesOf(api, reeks)).toEqual(AT_START)
    await expect
      .poll(() => bandsOf(page, naam))
      .toEqual(['avond Donderdag 8 juni', 'nacht Donderdag 8 juni', 'opbouw Woensdag 7 juni'])
  } finally {
    await cleanUp(api, made)
  }
})

test('shift-refused-in-dutch @e2e', async ({ page, browser }) => {
  test.setTimeout(60_000)
  const api = page.request
  const made = nothing()
  const naam = 'Tourstop e2e geweigerd'
  try {
    // Its own producer, whose cap on a tourstop's days the administrator lowers after the tourstop was made.
    const admin = await browser.newContext({ storageState: state('admin') })
    const eigen = await idOf(admin.request, 'organisatie', {
      naam: 'Gezelschap e2e kort',
      soort: 'eigen',
      parameters: { max_speelreeks_dagen: 5 },
    })
    made.organisatie.push(eigen)
    const productie = await idOf(api, 'productie', { titel: 'Productie e2e kort', organisatie_id: eigen })
    made.productie.push(productie)
    const reeks = await tourstopWithActivities(api, made, naam, productie)
    const lowered = await admin.request.patch(`/api/rows/organisatie/${eigen}`, {
      data: { parameters: { max_speelreeks_dagen: 2 } },
    })
    expect(lowered.status(), await lowered.text()).toBe(200)
    await admin.close()

    await page.setViewportSize({ width: 1600, height: 900 })
    await openWith(page, 'Tourstops', 'Tourstops', [{ field: 'naam', op: 'eq', values: [naam] }])
    await openDrawer(page, naam)
    await daysOf(page).fill('3')
    const answered = answerOf(page)
    await runOf(page).click()
    const reply = await answered
    expect(reply.status()).toBe(422)

    // The writer's refusal, in Dutch, under the action; nothing moved, and the run can be tried again.
    const said = actionOf(page).getByRole('alert')
    await expect(said).toHaveText('Een tourstop duurt hoogstens 2 dagen.')
    const box = await said.boundingBox()
    const button = await runOf(page).boundingBox()
    expect(box && button && box.y >= button.y + button.height - 1).toBe(true)
    await expect(runOf(page)).toBeEnabled()
    await shot(page, 'refused-in-dutch')
    expect(await datesOf(api, reeks)).toEqual(AT_START)

    // Denied actor: an owner cannot see a tourstop, so cannot move one.
    const owner = await browser.newContext({ storageState: state('owner') })
    const denied = await owner.request.post('/api/actions/tourstop_verschuiven', {
      data: { id: reeks, input: { dagen: 1 } },
    })
    expect(denied.status(), await denied.text()).toBe(404)
    await owner.close()
    expect(await datesOf(api, reeks)).toEqual(AT_START)

    // Concurrent: someone else deletes the tourstop while the drawer is open.
    for (const id of await rowsOf<{ id: number }>(api, 'activiteit', { speelreeks_id: reeks })) {
      expect((await api.delete(`/api/rows/activiteit/${id.id}`)).status()).toBe(200)
    }
    expect((await api.delete(`/api/rows/speelreeks/${reeks}`)).status()).toBe(200)
    const gone = answerOf(page)
    await runOf(page).click()
    expect((await gone).status()).toBe(404)
    await expect(said).toBeVisible()
    await expect(said).not.toHaveText('Een tourstop duurt hoogstens 2 dagen.')
    await expect(runOf(page)).toBeEnabled()
    await shot(page, 'refused-deleted')
  } finally {
    await cleanUp(api, made)
  }
})

test('inputs-panel-under-the-row @e2e: an action with inputs opens its panel under the action row, focused on its first input and with its close button, in light and dark; Escape closes it back onto the action’s button', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.goto('/')
  await openView(page, 'Tourstops', 'Tourstops')
  await page.locator('tbody tr.nv-tr').first().getByRole('button', { name: 'Openen' }).click()
  const drawer = page.getByRole('complementary')
  await expect(drawer).toBeVisible()
  const actionRow = drawer.locator('.nv-dw-actions__row')
  await pressInMenu(page, ACTION)
  await expect(actionOf(page)).toBeVisible()
  await expect(daysOf(page)).toBeFocused()
  const panel = page.locator('.nv-dw-ask--inline')
  const close = panel.getByRole('button', { name: 'Sluiten' })
  await expect(close).toBeInViewport()
  const [above, under] = [await actionRow.boundingBox(), await panel.boundingBox()]
  expect(under?.y ?? 0).toBeGreaterThanOrEqual((above?.y ?? 0) + (above?.height ?? 0) - 1)
  for (const scheme of ['light', 'dark'] as const) {
    await page.emulateMedia({ colorScheme: scheme })
    await shot(page, `invoerpaneel-${scheme === 'light' ? 'licht' : 'donker'}`)
  }
  await page.keyboard.press('Escape')
  await expect(panel).toHaveCount(0)
  await expect(buttonOf(drawer, ACTION)).toBeFocused()
  await expect(drawer).toBeVisible()
})

/** The action's button in the drawer's row, or Meer when the row folded it. */
const buttonOf = (drawer: Locator, action: string) =>
  drawer
    .locator('.nv-dw-actions__row')
    .getByRole('button', { name: action, exact: true })
    .or(drawer.locator('.nv-dw-actions__row').getByRole('button', { name: 'Meer' }))

/** The first tourstop's drawer with an action's inputs open under its head; answers the drawer and the record it shows. */
async function inputsOpen(page: Page, action: string): Promise<{ drawer: Locator; record: string | null }> {
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.goto('/')
  await openView(page, 'Tourstops', 'Tourstops')
  await page.locator('tbody tr.nv-tr').first().getByRole('button', { name: 'Openen' }).click()
  const drawer = page.getByRole('complementary')
  await expect(drawer).toBeVisible()
  await pressInMenu(page, action)
  await expect(page.getByRole('group', { name: action })).toBeVisible()
  return { drawer, record: await drawer.getAttribute('aria-label') }
}

test('keys-in-the-inputs-panel-stay-there @e2e: a letter typed in the Sjabloon search and ↓ in Dagen edit the input, never step the drawer to the next tourstop', async ({
  page,
}) => {
  const picked = await inputsOpen(page, 'Sjabloon toepassen')
  await page
    .getByRole('group', { name: 'Sjabloon toepassen' })
    .getByRole('button', { name: /^Sjabloon: / })
    .click()
  const search = page.getByRole('combobox', { name: 'Sjabloon' })
  await search.pressSequentially('j')
  await expect(picked.drawer, 'the drawer keeps its tourstop').toHaveAttribute('aria-label', picked.record ?? '')
  await expect(search).toHaveValue('j')

  const shifted = await inputsOpen(page, ACTION)
  await daysOf(page).fill('2')
  await page.keyboard.press('ArrowDown')
  await expect(shifted.drawer, 'the drawer keeps its tourstop').toHaveAttribute('aria-label', shifted.record ?? '')
  await expect(daysOf(page)).toHaveValue('1')
})

test('escape-after-the-picker @e2e: Escape closes the Sjabloon picker back into the panel, a second Escape closes the panel onto the action’s button in the row', async ({
  page,
}) => {
  const { drawer } = await inputsOpen(page, 'Sjabloon toepassen')
  const panel = page.locator('.nv-dw-ask--inline')
  await page
    .getByRole('group', { name: 'Sjabloon toepassen' })
    .getByRole('button', { name: /^Sjabloon: / })
    .click()
  await expect(page.getByRole('combobox', { name: 'Sjabloon' })).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(page.getByRole('combobox', { name: 'Sjabloon' })).toHaveCount(0)
  await expect(panel).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(panel, 'the second Escape closes the panel').toHaveCount(0)
  await expect(buttonOf(drawer, 'Sjabloon toepassen')).toBeFocused()
})

test('focused-input-shows-its-mark @e2e: the Dagen field the panel focuses shows a focus mark', async ({ page }) => {
  await inputsOpen(page, ACTION)
  await expect(daysOf(page)).toBeFocused()
  const mark = await daysOf(page).evaluate((el) => {
    const style = getComputedStyle(el)
    return { outline: style.outlineStyle, shadow: style.boxShadow, border: style.borderTopWidth }
  })
  expect(
    mark.outline !== 'none' || mark.shadow !== 'none' || mark.border !== '0px',
    `a focus mark on the field: ${JSON.stringify(mark)}`,
  ).toBe(true)
})
