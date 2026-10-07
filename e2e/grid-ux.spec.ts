import { expect, type Locator, type Page, test } from '@playwright/test'
import { modelNode, openModel, openView } from './tree'

// One empty week per flow that applies a speeldag, so no flow sees another's rows.
const FOLD_WEEK = '2027-03-01'
const FACTS_WEEK = '2027-03-08'
const INHERIT_WEEK = '2027-03-15'
const DETAILS_WEEK = '2027-03-22'
const SEED_WEEK = '2026-10-12'
const VENUE = 'Theater Het Anker'
const OWN_VENUE = 'Repetitiekot De Loods'

// The shake-out's screenshots, one per surface, only when asked for.
const SHOTS = process.env.GRID_UX_SHOTS
const shot = async (target: Page | Locator, name: string) => {
  if (SHOTS) await target.screenshot({ path: `${SHOTS}/grid-ux-gate-${name}.png` })
}

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

interface SavedView {
  id: number
  name: string
  shared: boolean
  mine: boolean
}

async function views(api: Api): Promise<SavedView[]> {
  const response = await api.get('/api/views')
  expect(response.status()).toBe(200)
  return ((await response.json()) as { views: SavedView[] }).views
}

const plusDays = (iso: string, days: number) => {
  const at = new Date(`${iso}T12:00:00Z`)
  at.setUTCDate(at.getUTCDate() + days)
  return at.toISOString().slice(0, 10)
}

/** An invented four-day Speelreeks of Nachtwacht at the venue, with "speeldag op locatie" applied: 28 activities. */
async function speeldagen(api: Api, naam: string, monday: string): Promise<number> {
  const id = await idOf(api, 'speelreeks', {
    naam,
    productie_id: await idByName(api, 'productie', 'titel', 'Nachtwacht'),
    locatie_id: await idByName(api, 'organisatie', 'naam', VENUE),
    start_datum: monday,
    eind_datum: plusDays(monday, 3),
  })
  const applied = await api.post('/api/actions/sjabloon_toepassen', {
    data: { id, input: { sjabloon_id: await idByName(api, 'sjabloon', 'naam', 'speeldag op locatie') } },
  })
  expect(applied.status(), await applied.text()).toBe(201)
  return id
}

/** The grid reads the hash once, on load: a hash-only goto needs the reload. */
async function land(page: Page, hash: string) {
  await page.goto(hash)
  await page.reload()
}

async function pick(page: Page, view: string, model = view) {
  await openView(page, view, model)
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(view)
}

const gridRows = (page: Page) => page.locator('tbody tr.nv-tr')
const bands = (page: Page) => page.locator('tbody tr.nv-group')
const named = (page: Page, title: string) => page.locator(`tbody tr.nv-tr[data-title="${title}"]`)

async function columnIndex(page: Page, label: string): Promise<number> {
  const index = await page
    .locator('thead th')
    .evaluateAll(
      (heads, wanted) => heads.findIndex((th) => (th.textContent ?? '').replace(/\s*[↑↓]$/, '').trim() === wanted),
      label,
    )
  expect(index, `column ${label}`).toBeGreaterThanOrEqual(0)
  return index
}

/** The distinct values a column shows over the loaded rows. */
async function shownIn(page: Page, label: string): Promise<string[]> {
  const at = await columnIndex(page, label)
  const values = await gridRows(page).evaluateAll(
    (trs, i) => trs.map((tr) => (tr.children[i]?.textContent ?? '').trim()),
    at,
  )
  return [...new Set(values)].sort()
}

/** The space condition on the rows request `act` makes for a source. */
async function scopeAsked(page: Page, source: string, act: () => Promise<void>): Promise<unknown> {
  const asked = page.waitForRequest((req) => new URL(req.url()).pathname === `/api/rows/${source}`)
  await act()
  const filter = new URL((await asked).url()).searchParams.get('filter')
  return filter ? JSON.parse(filter).productie_id : undefined
}

async function switchTo(page: Page, from: string, to: string) {
  await page.getByRole('button', { name: from, exact: true }).click()
  await page.getByRole('listbox', { name: 'Producties' }).getByRole('option', { name: to, exact: true }).click()
  await expect(page.getByRole('button', { name: to, exact: true })).toBeVisible()
}

async function filterMenu(page: Page): Promise<Locator> {
  await page.getByRole('button', { name: 'Filter', exact: true }).click()
  return page.locator('.nv-filters__menu')
}

async function closeFilterMenu(page: Page) {
  await page.keyboard.press('Escape')
  await expect(page.locator('.nv-filters__menu')).toBeHidden()
}

test('switch-production @e2e', async ({ page }) => {
  await land(page, `/#from=${SEED_WEEK}`)
  await pick(page, 'Planning', 'Activiteiten')
  await expect(gridRows(page).first()).toBeVisible()
  expect((await shownIn(page, 'Productie')).length).toBeGreaterThan(1)
  await expect((await filterMenu(page)).getByRole('button', { name: 'Productie: Nachtwacht' })).toBeVisible()
  await closeFilterMenu(page)

  await page.getByRole('button', { name: 'Alle producties', exact: true }).click()
  await expect(page.getByRole('listbox', { name: 'Producties' }).getByRole('option')).toHaveText([
    'Alle producties',
    'De Kersentuin',
    'Nachtwacht',
    'Zomerstorm',
  ])
  await shot(page, 'switcher-open')
  await page.getByRole('option', { name: 'Nachtwacht', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Nachtwacht', exact: true })).toBeVisible()

  // Under the scope every row is Nachtwacht's: a tinted chip says so and cannot be removed, and the Productie column is hidden (R10.7).
  const scopeChip = page.locator('.nv-bar .nv-chip--scope')
  await expect(scopeChip).toHaveText('Productie is Nachtwacht')
  await expect(scopeChip).toHaveClass(/nv-chip--set/)
  await expect(scopeChip.getByRole('button')).toHaveCount(0)
  await expect(page.locator('thead th', { hasText: 'Productie' })).toHaveCount(0)
  await expect(gridRows(page).first()).toBeVisible()
  await expect(page.locator('.nv-chip--filter', { hasText: 'Productie' })).toHaveCount(0)
  await expect((await filterMenu(page)).getByRole('button', { name: /^Productie:/ })).toHaveCount(0)
  await closeFilterMenu(page)

  // Dagplanning no longer shows Productie (R10), so the scope is read off the rows request.
  const nachtwacht = { $eq: await idByName(page.request, 'productie', 'titel', 'Nachtwacht') }
  expect(await scopeAsked(page, 'dagplanning', () => pick(page, 'Dagplanning'))).toEqual(nachtwacht)
  await expect(gridRows(page).first()).toBeVisible()

  // Kept in this browser: a reload still works in Nachtwacht.
  const reload = async () => {
    await page.reload()
    await expect(page.getByRole('button', { name: 'Nachtwacht', exact: true })).toBeVisible()
    await pick(page, 'Dagplanning')
  }
  expect(await scopeAsked(page, 'dagplanning', reload)).toEqual(nachtwacht)
  await expect(gridRows(page).first()).toBeVisible()

  const scoped = await gridRows(page).count()
  await expect(page.locator('.nv-bar .nv-chip--scope')).toHaveText('Productie is Nachtwacht')
  await switchTo(page, 'Nachtwacht', 'Alle producties')
  await expect(page.locator('.nv-bar .nv-chip--scope')).toHaveCount(0)
  await expect.poll(() => gridRows(page).count()).toBeGreaterThan(scoped)
  await pick(page, 'Planning', 'Activiteiten')
  await expect.poll(async () => (await shownIn(page, 'Productie')).length).toBeGreaterThan(1)
  await page.reload()
  await expect(page.getByRole('button', { name: 'Alle producties', exact: true })).toBeVisible()
})

test('tree-fold-and-hover @e2e', async ({ page }) => {
  await land(page, `/#from=${SEED_WEEK}`)
  await pick(page, 'Dagplanning')
  const node = modelNode(page, 'Speelreeksen')
  const row = node.locator('.nv-model')
  const tools = row.locator('.nv-model__tools')

  await page.mouse.move(0, 0)
  await expect(tools).toHaveCSS('opacity', '0')
  await expect(row.locator('.nv-model__chevron')).toHaveCount(0)
  await row.hover()
  await expect(row.locator('.nv-model__chevron')).toBeVisible()
  await expect(tools).toHaveCSS('opacity', '1')
  await expect(row.getByRole('button', { name: 'Weergave toevoegen aan Speelreeksen' })).toBeVisible()
  await expect(row.getByRole('button', { name: 'Meer voor Speelreeksen' })).toBeVisible()
  await shot(page.getByRole('navigation', { name: 'Views' }), 'tree-hover')

  // The chevron folds and unfolds; the view stays Dagplanning.
  const views = node.getByRole('group', { name: 'View type' })
  if ((await node.getAttribute('aria-expanded')) !== 'true') {
    await row.getByRole('button', { name: 'Uitklappen' }).click()
  }
  await expect(node).toHaveAttribute('aria-expanded', 'true')
  await expect(views.getByRole('button', { name: 'Speelreeksen', exact: true })).toBeVisible()
  await row.getByRole('button', { name: 'Inklappen' }).click()
  await expect(node).toHaveAttribute('aria-expanded', 'false')
  await expect(views).toHaveCount(0)
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Dagplanning')
  await row.getByRole('button', { name: 'Uitklappen' }).click()
  await expect(node).toHaveAttribute('aria-expanded', 'true')
  await expect(views.getByRole('button', { name: 'Speelreeksen', exact: true })).toBeVisible()
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Dagplanning')

  // The name opens the model's view.
  await openModel(page, 'Speelreeksen')
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Speelreeksen')
})

async function newView(page: Page, model: string, name: string, who: 'Het team' | 'Alleen ik', snap?: string) {
  const row = modelNode(page, model).locator('.nv-model')
  await row.hover()
  await row.getByRole('button', { name: `Weergave toevoegen aan ${model}` }).click()
  await page
    .getByRole('menu', { name: `Weergave toevoegen aan ${model}` })
    .getByRole('menuitem', { name: 'Grid' })
    .click()
  const dialog = page.getByRole('dialog', { name: 'Nieuwe gridweergave' })
  await expect(dialog.getByRole('textbox', { name: 'Naam' })).toHaveValue('Grid')
  await dialog.getByRole('textbox', { name: 'Naam' }).fill(name)
  await dialog.getByRole('radio', { name: who }).check()
  if (snap) await shot(page, snap)
  const created = page.waitForResponse(
    (res) => res.request().method() === 'POST' && new URL(res.url()).pathname === '/api/views',
  )
  await dialog.getByRole('button', { name: 'Weergave maken' }).click()
  expect((await created).status()).toBe(201)
  await expect(dialog).toHaveCount(0)
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(name)
}

const viewRow = (page: Page, model: string, name: string) =>
  modelNode(page, model)
    .getByRole('group', { name: 'View type' })
    .locator('.nv-view', { has: page.getByRole('button', { name, exact: true }) })

test('create-team-and-personal-view @e2e', async ({ page }) => {
  const team = 'Team e2e weergave'
  const own = 'Eigen e2e weergave'
  await page.goto('/')
  await pick(page, 'Planning', 'Activiteiten')

  await newView(page, 'Activiteiten', team, 'Het team', 'dialog')
  await expect(viewRow(page, 'Activiteiten', team)).toHaveCount(1)
  await expect(viewRow(page, 'Activiteiten', team).getByRole('img', { name: 'Alleen voor jou' })).toHaveCount(0)

  await newView(page, 'Activiteiten', own, 'Alleen ik')
  await expect(viewRow(page, 'Activiteiten', own).getByRole('img', { name: 'Alleen voor jou' })).toBeVisible()

  const held = await views(page.request)
  expect(held.find((v) => v.name === team)).toMatchObject({ shared: true, mine: true })
  expect(held.find((v) => v.name === own)).toMatchObject({ shared: false, mine: true })

  await page.reload()
  await pick(page, team, 'Activiteiten')
  await pick(page, own, 'Activiteiten')
  await expect(viewRow(page, 'Activiteiten', own).getByRole('img', { name: 'Alleen voor jou' })).toBeVisible()
})

test('copy-rename-delete-view @e2e', async ({ page }) => {
  const copy = 'Speelreeksen (kopie)'
  const renamed = 'Reeksen e2e hernoemd'
  await page.goto('/')
  await pick(page, 'Speelreeksen')

  await page.getByRole('button', { name: 'More actions: Speelreeksen' }).click()
  await page.getByRole('menuitem', { name: 'Kopie maken' }).click()
  await expect(viewRow(page, 'Speelreeksen', copy)).toHaveCount(1)
  await expect.poll(async () => (await views(page.request)).find((v) => v.name === copy)?.mine).toBe(true)
  const made = (await views(page.request)).find((v) => v.name === copy) as SavedView

  await page.getByRole('button', { name: `More actions: ${copy}` }).click()
  await page.getByRole('menuitem', { name: 'Naam wijzigen' }).click()
  await page.getByRole('textbox', { name: 'Nieuwe naam' }).fill(renamed)
  await page.getByRole('textbox', { name: 'Nieuwe naam' }).press('Enter')
  await expect(viewRow(page, 'Speelreeksen', renamed)).toHaveCount(1)
  await expect(viewRow(page, 'Speelreeksen', copy)).toHaveCount(0)
  await expect.poll(async () => (await views(page.request)).find((v) => v.id === made.id)?.name).toBe(renamed)

  await page.getByRole('button', { name: `More actions: ${renamed}` }).click()
  const deleted = page.waitForResponse(
    (res) => res.request().method() === 'DELETE' && new URL(res.url()).pathname === `/api/views/${made.id}`,
  )
  await page.getByRole('menuitem', { name: 'Verwijderen' }).click()
  expect((await deleted).status()).toBe(200)
  await expect(viewRow(page, 'Speelreeksen', renamed)).toHaveCount(0)
  expect((await views(page.request)).some((v) => v.id === made.id)).toBe(false)

  const restored = page.waitForResponse((res) => new URL(res.url()).pathname === `/api/views/${made.id}/restore`)
  await page
    .getByRole('status', { name: 'Weergave verwijderd' })
    .getByRole('button', { name: 'Ongedaan maken' })
    .click()
  expect((await restored).status()).toBe(200)
  await expect(viewRow(page, 'Speelreeksen', renamed)).toHaveCount(1)
  expect((await views(page.request)).find((v) => v.id === made.id)?.name).toBe(renamed)
  await page.reload()
  await pick(page, renamed, 'Speelreeksen')
})

const facts = (band: Locator) => band.locator('.nv-group__fact')

test('fold-day-band @e2e', async ({ page }) => {
  await speeldagen(page.request, 'Speelreeks e2e vouwen', FOLD_WEEK)
  await land(page, `/#from=${FOLD_WEEK}`)
  await pick(page, 'Dagplanning')
  await expect(gridRows(page)).toHaveCount(28)
  await expect(bands(page)).toHaveCount(4)
  // Row numbers lead every row, and subtle dividers stand between the cells (Stefan, 2026-10-07).
  await expect(gridRows(page).first().locator('td').first()).toHaveText('1')
  await expect(gridRows(page).nth(7).locator('td').first()).toHaveText('8')
  await expect(gridRows(page).first().locator('td').nth(2)).not.toHaveCSS('border-right-width', '0px')

  const first = bands(page).first()
  await expect(first).toHaveAttribute('aria-expanded', 'true')
  await first.click()
  await expect(first).toHaveAttribute('aria-expanded', 'false')
  await expect(gridRows(page)).toHaveCount(21)
  await expect(gridRows(page).first().locator('td').first()).toHaveText('1')
  await expect(first.locator('.nv-group__count')).toHaveText('7')
  await expect(facts(first)).toHaveText(['● voorstelling 20:00', '1 zonder tijd'])
  await expect(bands(page).nth(1)).toHaveAttribute('aria-expanded', 'true')

  // Kept per view in this browser.
  await page.reload()
  await pick(page, 'Dagplanning')
  await expect(bands(page)).toHaveCount(4)
  await expect(bands(page).first()).toHaveAttribute('aria-expanded', 'false')
  await expect(gridRows(page)).toHaveCount(21)
  await expect(bands(page).first().locator('.nv-group__count')).toHaveText('7')

  // Enter unfolds it again.
  await bands(page).first().focus()
  await page.keyboard.press('Enter')
  await expect(bands(page).first()).toHaveAttribute('aria-expanded', 'true')
  await expect(gridRows(page)).toHaveCount(28)
})

test('band-facts @e2e', async ({ page }) => {
  await speeldagen(page.request, 'Speelreeks e2e feiten', FACTS_WEEK)
  await land(page, `/#from=${FACTS_WEEK}`)
  await pick(page, 'Dagplanning')
  await expect(gridRows(page)).toHaveCount(28)
  await expect(bands(page)).toHaveCount(4)
  for (const band of await bands(page).all()) {
    await expect(band.locator('.nv-group__count')).toHaveText('7')
    await expect(facts(band)).toHaveText(['● voorstelling 20:00', '1 zonder tijd'])
  }
})

test('inherited-venue @e2e', async ({ page }) => {
  const reeks = await speeldagen(page.request, 'Speelreeks e2e erven', INHERIT_WEEK)
  const own = 'Repetitie e2e eigen zaal'
  const day = plusDays(INHERIT_WEEK, 1)
  await idOf(page.request, 'activiteit', {
    productie_id: await idByName(page.request, 'productie', 'titel', 'Nachtwacht'),
    soort: 'repetitie',
    datum: day,
    start_at: `${day}T10:00`,
    omschrijving: own,
    locatie_id: await idByName(page.request, 'organisatie', 'naam', OWN_VENUE),
  })
  // The template leaves the venue to inherit: the server holds none on its activities.
  for (const a of await rowsOf<Values>(page.request, 'activiteit', { speelreeks_id: reeks })) {
    expect(a.locatie_id ?? null).toBeNull()
  }

  await land(page, `/#from=${INHERIT_WEEK}`)
  await pick(page, 'Dagplanning')
  await expect(gridRows(page)).toHaveCount(29)
  const locatie = await columnIndex(page, 'Locatie')

  const inherited = named(page, 'Voorstelling')
  await expect(inherited).toHaveCount(4)
  for (const tr of await inherited.all()) {
    const cell = tr.locator('td').nth(locatie)
    await expect(cell.locator('.nv-inherited .nv-cell__text')).toHaveText(VENUE)
    await expect(cell.locator('.nv-via')).toHaveText('via speelreeks')
    // Never clipped: the venue gives way, the tag keeps its full width.
    const fits = await cell.locator('.nv-via').evaluate((tag) => {
      const td = tag.closest('td')?.getBoundingClientRect()
      return tag.scrollWidth <= tag.clientWidth && td !== undefined && tag.getBoundingClientRect().right <= td.right
    })
    expect(fits).toBe(true)
    await expect(cell.locator('.nv-inherited')).toHaveCSS('font-style', 'italic')
  }

  const ownCell = named(page, own).locator('td').nth(locatie)
  await expect(ownCell.locator('.nv-cell__text')).toHaveText(OWN_VENUE)
  await expect(ownCell.locator('.nv-inherited, .nv-via')).toHaveCount(0)
  await expect(ownCell.locator('.nv-cell__text')).toHaveCSS('font-style', 'normal')
  const grey = await inherited
    .first()
    .locator('td')
    .nth(locatie)
    .locator('.nv-inherited')
    .evaluate((el) => getComputedStyle(el).color)
  const plain = await ownCell.locator('.nv-cell__text').evaluate((el) => getComputedStyle(el).color)
  expect(grey).not.toBe(plain)

  // The surface Stefan reads: one band folded, the others with their facts and the venue via the Speelreeks.
  await page.setViewportSize({ width: 1440, height: 1200 })
  await bands(page).nth(2).click()
  await expect(bands(page).nth(2)).toHaveAttribute('aria-expanded', 'false')
  await expect(facts(bands(page).nth(2))).toHaveText(['● voorstelling 20:00', '1 zonder tijd'])
  await shot(page, 'dagplanning')
})

const rowHeight = async (page: Page) => (await gridRows(page).first().boundingBox())?.height ?? 0

test('dark-and-density @e2e', async ({ page }) => {
  await land(page, `/#from=${SEED_WEEK}`)
  await pick(page, 'Planning', 'Activiteiten')
  await expect(gridRows(page).first()).toBeVisible()
  const root = page.locator('#root')
  const theme = page.getByRole('group', { name: 'Thema' })
  const density = page.getByRole('group', { name: 'Dichtheid' })

  const light = await root.evaluate((el) => getComputedStyle(el).backgroundColor)
  await theme.getByRole('tab', { name: 'Donker' }).click()
  await expect(root).toHaveAttribute('data-theme', 'dark')
  await expect.poll(() => root.evaluate((el) => getComputedStyle(el).backgroundColor)).not.toBe(light)
  const dark = await root.evaluate((el) => getComputedStyle(el).backgroundColor)
  expect(dark).toBe('rgb(22, 23, 26)')

  expect(Math.round(await rowHeight(page))).toBe(40)
  await density.getByRole('tab', { name: 'Compact' }).click()
  await expect.poll(async () => Math.round(await rowHeight(page))).toBe(32)
  await expect(density.getByRole('tab', { name: 'Compact' })).toHaveAttribute('aria-selected', 'true')
  await shot(page, 'dark')
  await density.getByRole('tab', { name: 'Ruim' }).click()
  await expect.poll(async () => Math.round(await rowHeight(page))).toBe(46)

  await page.reload()
  await pick(page, 'Planning', 'Activiteiten')
  await expect(gridRows(page).first()).toBeVisible()
  await expect(root).toHaveAttribute('data-theme', 'dark')
  expect(await root.evaluate((el) => getComputedStyle(el).backgroundColor)).toBe(dark)
  await expect.poll(async () => Math.round(await rowHeight(page))).toBe(46)
  await expect(density.getByRole('tab', { name: 'Ruim' })).toHaveAttribute('aria-selected', 'true')
  await expect(theme.getByRole('tab', { name: 'Donker' })).toHaveAttribute('aria-selected', 'true')

  await theme.getByRole('tab', { name: 'Licht' }).click()
  await expect.poll(() => root.evaluate((el) => getComputedStyle(el).backgroundColor)).toBe(light)
})

test('dagplanning-details @e2e', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await speeldagen(page.request, 'Speelreeks e2e details', DETAILS_WEEK)
  await land(page, `/#from=${DETAILS_WEEK}`)
  await expect(page.locator('html')).toHaveAttribute('lang', 'nl')
  await switchTo(page, 'Alle producties', 'Nachtwacht')
  await pick(page, 'Dagplanning')
  await expect(gridRows(page)).toHaveCount(28)

  // R10.9: one bordered week control with the ISO week.
  await expect(page.locator('.nv-window__week')).toHaveText('Week 12 · 22–28 mrt')
  await expect(page.getByRole('heading', { level: 1 })).toHaveCSS('font-size', '19px')

  // R10.4 and R10.2: #, Tijd, Omschrijving, Soort, Locatie, Status; a time range with its end muted.
  const heads = await page.locator('thead th').allTextContents()
  expect(heads.map((h) => h.replace(/\s*[↑↓]$/, '').trim())).toEqual([
    '#',
    'Tijd',
    'Omschrijving',
    'Soort',
    'Locatie',
    'Status',
  ])
  const lunch = named(page, 'Lunch').first()
  await expect(lunch.locator('td').nth(1)).toHaveText('13:00–14:00')
  await expect(lunch.locator('.nv-time__end')).toHaveText('–14:00')
  await expect(named(page, 'Overnachting').first().locator('.nv-blank')).toHaveText('zonder tijd')

  // R10.3: Maaltijd in its colour, status pills toned.
  const soort = lunch.locator('td').nth(3).locator('.nv-dot')
  await expect(soort).toHaveText('Maaltijd')
  expect(await soort.evaluate((el) => getComputedStyle(el, '::before').backgroundColor)).toBe('rgb(47, 138, 87)')
  await expect(lunch.locator('.nv-pill')).toHaveClass(/nv-pill--warn/)

  // R10.7: the scope chip.
  await expect(page.locator('.nv-bar .nv-chip--scope')).toHaveText('Productie is Nachtwacht')

  // R10.5: a model reads stronger than its views.
  const node = modelNode(page, 'Dagplanning')
  await expect(node.locator('.nv-model__name')).toHaveCSS('font-weight', '500')
  const view = node.getByRole('group', { name: 'View type' }).getByRole('button', { name: 'Dagplanning', exact: true })
  await expect(view).toHaveCSS('font-size', '13.5px')
  expect(Math.round((await view.boundingBox())?.height ?? 0)).toBe(28)
  await shot(page, 'details')

  // R10.10: + Nieuw on the query creates an activity, and the query reads again.
  const created = page.waitForResponse(
    (res) => res.request().method() === 'POST' && new URL(res.url()).pathname === '/api/rows/activiteit',
  )
  await page.getByRole('button', { name: 'Nieuwe activiteit' }).click()
  expect((await created).status()).toBe(201)
  await expect(gridRows(page)).toHaveCount(29)

  // The compact rail foot leaves the tree its height at 720px: the gate's dark shot cut it after Gegevens.
  await page.setViewportSize({ width: 1440, height: 720 })
  const foot = (await page.locator('.nv-rail__foot').boundingBox())?.height ?? 0
  const tree = (await page.getByRole('tree', { name: 'Views' }).boundingBox())?.height ?? 0
  expect(foot).toBeLessThan(120)
  expect(tree).toBeGreaterThan(480)
})
