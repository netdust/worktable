import { expect, type Locator, type Page, test } from '@playwright/test'
import { state } from './auth'
import { shot } from './shots'
import { addCondition, modelNode, openView, openWeek } from './tree'

// One empty week per flow that makes a tourstop, so no flow sees another's rows.
const PICKER_WEEK = '2028-05-01'
const OVERRIDE_WEEK = '2028-05-08'
const QUERY_WEEK = '2028-05-15'
const VENUE = 'Theater Het Anker'
const OTHER_VENUE = 'Repetitiekot De Loods'
const THIRD_VENUE = 'Zaal De Spiegel'
const EMPTY_VENUE = 'Zaal e2e zonder activiteit'

type Api = Page['request']
type Values = Record<string, unknown>

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

const plusDays = (iso: string, days: number) => {
  const at = new Date(`${iso}T12:00:00Z`)
  at.setUTCDate(at.getUTCDate() + days)
  return at.toISOString().slice(0, 10)
}

interface Made {
  views: number[]
  toewijzing: number[]
  activiteit: number[]
  speelreeks: number[]
  organisatie: number[]
}

const nothing = (): Made => ({ views: [], toewijzing: [], activiteit: [], speelreeks: [], organisatie: [] })

/** Deletes what a flow made, whatever happened: the specs share one database. */
async function cleanUp(api: Api, made: Made) {
  for (const id of made.views) await api.delete(`/api/views/${id}`)
  for (const id of made.toewijzing) await api.delete(`/api/rows/toewijzing/${id}`)
  for (const id of made.activiteit) await api.delete(`/api/rows/activiteit/${id}`)
  for (const id of made.speelreeks) await api.delete(`/api/rows/speelreeks/${id}`)
  for (const id of made.organisatie) await api.delete(`/api/rows/organisatie/${id}`)
}

/** A tourstop of Nachtwacht at the venue, made on the API as the planner would in its drawer. */
async function tourstop(api: Api, made: Made, naam: string, monday: string, venue = VENUE): Promise<number> {
  const id = await idOf(api, 'speelreeks', {
    naam,
    productie_id: await idByName(api, 'productie', 'titel', 'Nachtwacht'),
    locatie_id: await idByName(api, 'organisatie', 'naam', venue),
    start_datum: monday,
    eind_datum: plusDays(monday, 3),
  })
  made.speelreeks.push(id)
  return id
}

async function activity(api: Api, made: Made, omschrijving: string, datum: string, rest: Values = {}) {
  const id = await idOf(api, 'activiteit', {
    productie_id: await idByName(api, 'productie', 'titel', 'Nachtwacht'),
    soort: 'repetitie',
    datum,
    omschrijving,
    ...rest,
  })
  made.activiteit.push(id)
  return id
}

async function assign(api: Api, made: Made, activiteit: number, person: string) {
  const persoon = await idByName(api, 'persoon', 'weergavenaam', person)
  made.toewijzing.push(
    await idOf(api, 'toewijzing', { activiteit_id: activiteit, persoon_id: persoon, state: 'bevestigd' }),
  )
}

async function newView(page: Page, made: Made, model: string, name: string): Promise<void> {
  const row = modelNode(page, model).locator('.nv-model')
  await row.hover()
  await row.getByRole('button', { name: `Weergave toevoegen aan ${model}` }).click()
  await page
    .getByRole('menu', { name: `Weergave toevoegen aan ${model}` })
    .getByRole('menuitem', { name: 'Grid' })
    .click()
  const dialog = page.getByRole('dialog', { name: 'Nieuwe gridweergave' })
  await dialog.getByRole('textbox', { name: 'Naam' }).fill(name)
  await dialog.getByRole('radio', { name: 'Alleen ik' }).check()
  const created = page.waitForResponse(
    (res) => res.request().method() === 'POST' && new URL(res.url()).pathname === '/api/views',
  )
  await dialog.getByRole('button', { name: 'Weergave maken' }).click()
  const response = await created
  expect(response.status()).toBe(201)
  made.views.push(((await response.json()) as { id: number }).id)
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(name)
}

const headers = (page: Page) =>
  page
    .locator('thead th')
    .evaluateAll((heads) => heads.map((th) => (th.textContent ?? '').replace(/\s*[↑↓]$/, '').trim()))

// The header may still be laying out its columns: wait for the one asked for.
async function columnIndex(page: Page, label: string): Promise<number> {
  let index = -1
  await expect
    .poll(
      async () => {
        index = (await headers(page)).indexOf(label)
        return index
      },
      { message: `column ${label}` },
    )
    .toBeGreaterThanOrEqual(0)
  return index
}

const gridRows = (page: Page) => page.locator('tbody tr.nv-tr')
const named = (page: Page, title: string) => page.locator(`tbody tr.nv-tr[data-title="${title}"]`)
const cellOf = async (page: Page, title: string, label: string): Promise<Locator> =>
  named(page, title)
    .locator('td')
    .nth(await columnIndex(page, label))

const undoOf = (page: Page) =>
  page.waitForResponse(
    (res) => res.request().method() === 'POST' && /^\/api\/batches\/[^/]+\/undo$/.test(new URL(res.url()).pathname),
  )
const patchOf = (page: Page, id: number) =>
  page.waitForResponse(
    (res) => res.request().method() === 'PATCH' && new URL(res.url()).pathname === `/api/rows/activiteit/${id}`,
  )

test('new-view-offers-locatie-and-mensen @e2e', async ({ page, browser }) => {
  const api = page.request
  const made = nothing()
  const name = 'Nieuw e2e Locatie en Mensen'
  try {
    const reeks = await tourstop(api, made, 'Tourstop e2e kolomkiezer', PICKER_WEEK)
    const id = await activity(api, made, 'kolomkiezer via tourstop', PICKER_WEEK, { speelreeks_id: reeks })
    await assign(api, made, id, 'Noor Claes')
    await activity(api, made, 'kolomkiezer zonder tourstop', PICKER_WEEK)
    await page.setViewportSize({ width: 2560, height: 800 })
    await page.goto('/')
    await newView(page, made, 'Activiteiten', name)
    await openWeek(page, name, 'Activiteiten', 'plandag', PICKER_WEEK)
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(name)

    await page.locator('.nv-bar').getByRole('button', { name: 'Kolommen' }).click()
    const picker = page.getByRole('dialog', { name: 'Kolommen' }).getByRole('group', { name: 'Kolommen' })
    const offered = await picker
      .getByRole('checkbox')
      .evaluateAll((boxes) => boxes.map((b) => (b.closest('label')?.textContent ?? '').trim()))
    for (const label of ['Tourstop', 'Locatie', 'Mensen']) expect(offered).toContain(label)
    for (const label of ['Eigen locatie', 'Plaats']) expect(offered).not.toContain(label)
    for (const label of ['Tourstop', 'Locatie', 'Mensen'])
      await expect(picker.getByRole('checkbox', { name: label, exact: true })).toBeChecked()
    await shot(page, 'picker')
    await page.keyboard.press('Escape')

    const shown = await headers(page)
    for (const label of ['Tourstop', 'Locatie', 'Mensen']) expect(shown).toContain(label)
    for (const label of ['Eigen locatie', 'Plaats']) expect(shown).not.toContain(label)
    const cell = await cellOf(page, 'kolomkiezer via tourstop', 'Locatie')
    await expect(cell.locator('.nv-inherited .nv-cell__text')).toHaveText(VENUE)
    await expect(await cellOf(page, 'kolomkiezer via tourstop', 'Tourstop')).toHaveText('Tourstop e2e kolomkiezer')
    await expect((await cellOf(page, 'kolomkiezer via tourstop', 'Mensen')).locator('.nv-names')).toHaveText(
      'Noor Claes',
    )
    await shot(page, 'new-view-columns')

    // Empty edge: no tourstop, no venue of its own, nobody on it.
    const bare = await cellOf(page, 'kolomkiezer zonder tourstop', 'Locatie')
    await expect(bare).toHaveText('')
    await expect(bare.locator('.nv-via, .nv-inherited')).toHaveCount(0)
    await expect(await cellOf(page, 'kolomkiezer zonder tourstop', 'Mensen')).toHaveText('')

    // Denied actor: an owner reads no activiteit at all, so no lookup either.
    const owner = await browser.newContext({ storageState: state('owner') })
    try {
      expect((await owner.request.get('/api/rows/activiteit')).status()).toBe(404)
      const schema = (await (await owner.request.get('/api/schema')).json()) as { sources: Record<string, unknown> }
      expect(Object.keys(schema.sources)).not.toContain('activiteit')
    } finally {
      await owner.close()
    }
  } finally {
    await cleanUp(api, made)
  }
})

async function pickVenue(cell: Locator, page: Page, search: string, option: string) {
  await cell.click()
  await cell.press('Enter')
  await page.getByRole('combobox', { name: 'Locatie' }).fill(search)
  await page.getByRole('option', { name: option }).click()
}

const venueOf = async (api: Api, dataset: string, id: number) =>
  ((await rowsOf<Values & { id: number }>(api, dataset, { id }))[0]?.locatie_id ?? null) as number | null

test('override-and-clear-venue @e2e', async ({ page }) => {
  const api = page.request
  const made = nothing()
  const own = 'Repetitie e2e eigen zaal'
  const sibling = 'Repetitie e2e zuster'
  try {
    const anker = await idByName(api, 'organisatie', 'naam', VENUE)
    const loods = await idByName(api, 'organisatie', 'naam', OTHER_VENUE)
    const reeks = await tourstop(api, made, 'Tourstop e2e overschrijven', OVERRIDE_WEEK)
    const target = await activity(api, made, own, OVERRIDE_WEEK, { speelreeks_id: reeks })
    const other = await activity(api, made, sibling, plusDays(OVERRIDE_WEEK, 1), { speelreeks_id: reeks })
    await assign(api, made, target, 'Noor Claes')
    await assign(api, made, other, 'Sam Peeters')

    await page.setViewportSize({ width: 1920, height: 800 })
    await openWeek(page, 'Planning', 'Activiteiten', 'plandag', OVERRIDE_WEEK)
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Planning')
    await expect(gridRows(page)).toHaveCount(2)
    const shown = await headers(page)
    // Planning's order since step 3d: Locatie with the facts, Tourstop and Mensen after Status.
    expect(shown.indexOf('Locatie')).toBeGreaterThanOrEqual(0)
    expect(shown.indexOf('Locatie')).toBeLessThan(shown.indexOf('Tourstop'))
    expect(shown).toContain('Mensen')
    for (const label of ['Eigen locatie', 'Plaats']) expect(shown).not.toContain(label)

    const cell = () => cellOf(page, own, 'Locatie')
    const siblingCell = () => cellOf(page, sibling, 'Locatie')
    const inherits = async (at: Locator) => {
      await expect(at.locator('.nv-inherited .nv-cell__text')).toHaveText(VENUE)
      await expect(at.locator('.nv-via')).toHaveText('via tourstop')
    }
    const owns = async (at: Locator, venue: string) => {
      await expect(at.locator('.nv-cell__text')).toHaveText(venue)
      await expect(at.locator('.nv-via, .nv-inherited')).toHaveCount(0)
      await expect(at.locator('.nv-cell__text')).toHaveCSS('font-style', 'normal')
    }
    await inherits(await cell())
    await inherits(await siblingCell())
    await expect(await cellOf(page, own, 'Tourstop')).toHaveText('Tourstop e2e overschrijven')
    await expect((await cellOf(page, own, 'Mensen')).locator('.nv-names')).toHaveText('Noor Claes')
    await shot(page, 'planning-inherited')

    // Mid-flow failure: the write never lands; the cell goes back to what the server holds.
    await page.route(`**/api/rows/activiteit/${target}`, (route) =>
      route.request().method() === 'PATCH' ? route.abort('connectionreset') : route.fallback(),
    )
    await pickVenue(await cell(), page, 'Loods', OTHER_VENUE)
    await inherits(await cell())
    await expect(page.locator('.nv-toolbar')).toContainText('Niet opgeslagen')
    expect(await venueOf(api, 'activiteit', target)).toBeNull()
    await page.unroute(`**/api/rows/activiteit/${target}`)

    // Override: the activity's own venue; the tourstop and its other activity keep theirs.
    const overridden = patchOf(page, target)
    await pickVenue(await cell(), page, 'Loods', OTHER_VENUE)
    expect((await overridden).status()).toBe(200)
    await owns(await cell(), OTHER_VENUE)
    await inherits(await siblingCell())
    expect(await venueOf(api, 'activiteit', target)).toBe(loods)
    expect(await venueOf(api, 'activiteit', other)).toBeNull()
    expect(await venueOf(api, 'speelreeks', reeks)).toBe(anker)
    await page.reload()
    await openView(page, 'Planning', 'Activiteiten')
    await owns(await cell(), OTHER_VENUE)
    await inherits(await siblingCell())
    await shot(page, 'venue-overridden')

    // Clear: it inherits again.
    const cleared = patchOf(page, target)
    const clear = await cell()
    await clear.click()
    await clear.press('Delete')
    expect((await cleared).status()).toBe(200)
    await inherits(await cell())
    expect(await venueOf(api, 'activiteit', target)).toBeNull()
    expect(await venueOf(api, 'speelreeks', reeks)).toBe(anker)

    // One undo brings the override back.
    const undone = undoOf(page)
    await page.keyboard.press('ControlOrMeta+z')
    expect((await undone).status()).toBe(200)
    await owns(await cell(), OTHER_VENUE)
    await inherits(await siblingCell())
    expect(await venueOf(api, 'activiteit', target)).toBe(loods)
    expect(await venueOf(api, 'activiteit', other)).toBeNull()
    expect(await venueOf(api, 'speelreeks', reeks)).toBe(anker)

    // Boundary on the wire: naming the lookup and its own column at once is refused and writes nothing.
    const both = await api.patch(`/api/rows/activiteit/${target}`, { data: { locatie: anker, locatie_id: loods } })
    expect(both.status()).toBe(400)
    expect(await venueOf(api, 'activiteit', target)).toBe(loods)
  } finally {
    await cleanUp(api, made)
  }
})

test('filter-sort-group-on-locatie @e2e', async ({ page }) => {
  // Three passes over one view, two reloads: under a full run's load it outgrows the default 30 s.
  test.setTimeout(60_000)
  const api = page.request
  const made = nothing()
  const name = 'Eigen e2e Locatie zoeken'
  const [viaTourstop, ownInTourstop, ownAlone, none] = [
    'zoek anker via tourstop',
    'zoek loods eigen',
    'zoek spiegel zonder tourstop',
    'zoek zonder locatie',
  ]
  try {
    const reeks = await tourstop(api, made, 'Tourstop e2e zoeken', QUERY_WEEK)
    await activity(api, made, viaTourstop, QUERY_WEEK, { speelreeks_id: reeks })
    await activity(api, made, ownInTourstop, QUERY_WEEK, {
      speelreeks_id: reeks,
      locatie_id: await idByName(api, 'organisatie', 'naam', OTHER_VENUE),
    })
    await activity(api, made, ownAlone, QUERY_WEEK, {
      locatie_id: await idByName(api, 'organisatie', 'naam', THIRD_VENUE),
    })
    await activity(api, made, none, QUERY_WEEK)

    await page.setViewportSize({ width: 2560, height: 800 })
    await page.goto('/')
    await newView(page, made, 'Activiteiten', name)
    await openWeek(page, name, 'Activiteiten', 'plandag', QUERY_WEEK)
    await expect(gridRows(page)).toHaveCount(4)
    const titles = () => gridRows(page).evaluateAll((trs) => trs.map((tr) => tr.getAttribute('data-title')))

    // Filter: the builder offers Locatie; the inherited venue matches, an own venue in the same tourstop does not.
    await addCondition(page, 'Locatie', VENUE)
    const bar = page.locator('.nv-bar')
    await expect(bar.locator('.nv-chip--filter').last()).toHaveText(`Locatie is ${VENUE}`)
    await expect.poll(titles).toEqual([viaTourstop])
    await shot(page, 'locatie-filtered')
    await bar.getByRole('button', { name: 'Filter Locatie wissen' }).click()
    await expect(gridRows(page)).toHaveCount(4)

    // Sort: by the venue's name, inherited and own alike.
    const sortOnLocatie = () =>
      page
        .locator('thead th')
        .filter({ hasText: /^Locatie/ })
        .getByRole('button')
        .click()
    await sortOnLocatie()
    await expect.poll(titles).toEqual([none, ownInTourstop, viaTourstop, ownAlone])
    await sortOnLocatie()
    await expect.poll(titles).toEqual([ownAlone, viaTourstop, ownInTourstop, none])

    // Group: one band per venue.
    await page.getByRole('button', { name: /^Groep/ }).click()
    await page.getByRole('group', { name: 'Groeperen' }).getByRole('button', { name: 'Locatie' }).click()
    await page.keyboard.press('Escape')
    const bands = page.locator('tbody tr.nv-group')
    await expect(bands).toHaveCount(4)
    const labels = await bands.allTextContents()
    // Bands run by their label whatever the sort, as on any column; the empty band comes last.
    const band = /^(Repetitiekot De Loods|Theater Het Anker|Zaal De Spiegel|Geen waarde)/
    expect(labels.map((l) => l.match(band)?.[1])).toEqual([OTHER_VENUE, VENUE, THIRD_VENUE, 'Geen waarde'])
    await shot(page, 'locatie-grouped')

    // Re-entry: the own view kept its grouping and sort on the server, by the lookup's name.
    await expect
      .poll(async () => {
        const all = (await (await api.get('/api/views')).json()) as { views: Values[] }
        const mine = all.views.find((v) => v.name === name)
        return [mine?.group_by, mine?.sort]
      })
      .toEqual(['locatie', ['-locatie']])
    await page.reload()
    await openView(page, name, 'Activiteiten')
    await expect(page.getByRole('button', { name: 'Groep: locatie' })).toBeVisible()

    // Empty edge: a venue nobody plays at filters to nothing. Its own, since another spec deletes a seeded one.
    made.organisatie.push(await idOf(api, 'organisatie', { naam: EMPTY_VENUE, soort: 'venue' }))
    await page.reload()
    await openView(page, name, 'Activiteiten')
    await addCondition(page, 'Locatie', EMPTY_VENUE)
    await expect(gridRows(page)).toHaveCount(0)
  } finally {
    await cleanUp(api, made)
  }
})
