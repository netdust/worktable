import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { type APIRequestContext, expect, type Locator, type Page, type Route, request, test } from '@playwright/test'
import { STUDIO, STUDIO_SERVICE, state } from './auth'
import { card, lane, orders } from './board'
import { shot } from './shots'
import { openView } from './tree'

// Studio's own instance (invented fixtures, packages/studio/src/seed.ts), driven as Stefan, the administrator.
// The seed: sites 1 testmans-winkel (ok), 2 testmans-bestel (let op), 3 voorbeeld-site (ok), 4 voorbeeld-blog
// (storing), 5 oud-archief (not in the registry); opdracht 1 "Bijwerken · 2 sites" in voorbereid on sites 2 and 3.
const ENGINE = 'http://127.0.0.1:4313'

test.use({ baseURL: STUDIO.app, storageState: state('studio-admin'), viewport: { width: 1440, height: 900 } })

type Api = APIRequestContext
type Values = Record<string, unknown>
type Row = Values & { id: number }

async function rowsOf(api: Api, source: string, filter?: Values): Promise<{ rows: Row[]; total: number }> {
  const query = filter ? `&filter=${encodeURIComponent(JSON.stringify(filter))}` : ''
  const response = await api.get(`/api/rows/${source}?limit=500${query}`)
  expect(response.status()).toBe(200)
  return (await response.json()) as { rows: Row[]; total: number }
}

const rowOf = async (api: Api, source: string, id: number) =>
  (await rowsOf(api, source)).rows.find((row) => row.id === id) as Row
const newest = async (api: Api, source: string) => Math.max(0, ...(await rowsOf(api, source)).rows.map((r) => r.id))
const exists = async (api: Api, source: string, id: number) => (await rowsOf(api, source)).rows.some((r) => r.id === id)

/** The studio worker's account: a real service token (kind service), straight to the engine, as the worker calls it. */
const worker = () =>
  request.newContext({
    baseURL: ENGINE,
    extraHTTPHeaders: { Authorization: `Bearer ${readFileSync(STUDIO_SERVICE, 'utf8').trim()}` },
  })

/** Runs an action on sites as the signed-in person; answers the opdracht it made and its links. */
async function run(api: Api, action: string, ids: number[]): Promise<{ actie: number; links: number[] }> {
  const response = await api.post(`/api/actions/${action}`, { data: { ids } })
  expect(response.status(), await response.text()).toBe(201)
  const { created } = (await response.json()) as { created: { dataset: string; id: number }[] }
  return {
    actie: created.find((c) => c.dataset === 'actie')?.id as number,
    links: created.filter((c) => c.dataset === 'actie_site').map((c) => c.id),
  }
}

/** What the worker does to a Bijwerken just requested: claim, a voorstel per site, then voorbereid. */
async function prepare(made: { actie: number; links: number[] }): Promise<void> {
  const service = await worker()
  const patch = async (path: string, data: Values) => {
    const response = await service.patch(path, { data })
    expect(response.status(), await response.text()).toBe(200)
  }
  await patch(`/api/rows/actie/${made.actie}`, { status: 'voorbereiden', expect: { status: 'aangevraagd' } })
  for (const link of made.links) {
    await patch(`/api/rows/actie_site/${link}`, {
      state: 'te_bevestigen',
      voorstel: JSON.stringify({ core: null, plugins: [{ slug: 'e2e-plugin', from: '1.0.0', to: '1.0.1' }] }),
      samenvatting: '1 plugin: e2e-plugin 1.0.0 → 1.0.1',
      expect: { state: 'wacht' },
    })
  }
  await patch(`/api/rows/actie/${made.actie}`, { status: 'voorbereid', expect: { status: 'voorbereiden' } })
  await service.dispose()
}

/** A fresh Bijwerken preview made the way the worker makes one. */
async function preview(api: Api, ids: number[]): Promise<{ actie: number; links: number[] }> {
  const made = await run(api, 'bijwerken', ids)
  await prepare(made)
  return made
}

const pad = (n: number) => String(n).padStart(2, '0')
const localTime = (d: Date) =>
  `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}:00`
const today = () => localTime(new Date()).slice(0, 10)

/** Moves a preview's clock back: voorbereid_op is the writer's, so only the database can age it. */
function age(actie: number, hours: number): void {
  const script = `import { Database } from 'bun:sqlite'
    const db = new Database(${JSON.stringify(STUDIO.db)})
    db.exec('PRAGMA busy_timeout = 5000')
    db.query('UPDATE actie SET voorbereid_op = ? WHERE id = ?').run(...${JSON.stringify([localTime(new Date(Date.now() - hours * 3_600_000)), actie])})`
  execFileSync('bun', ['-e', script])
}

const tile = (page: Page, name: string) => page.locator('.nv-tile').and(page.getByRole('region', { name, exact: true }))
const statValue = (page: Page, name: string) => tile(page, name).getByTestId('stat-value')
const countIn = async (page: Page, name: string) =>
  Number((await tile(page, name).locator('.nv-tile__title').textContent())?.split('·')[1]?.trim())

async function landing(page: Page) {
  await page.goto('/')
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Overzicht')
}

async function chooseSpace(page: Page, name: string) {
  await page.getByRole('button', { name: 'Alle organisaties', exact: true }).click()
  await page.getByRole('option', { name, exact: true }).click()
  await expect(page.getByRole('button', { name, exact: true })).toBeVisible()
}

async function open(page: Page, view: string, model: string) {
  await page.goto('/')
  await openView(page, view, model)
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(view)
}

/** Opens the newest row by this title (Opdrachten sorts newest first) in the drawer. */
async function drawerOf(page: Page, title: string): Promise<Locator> {
  await page
    .getByRole('row', { name: new RegExp(title) })
    .first()
    .getByRole('button', { name: 'Openen' })
    .click()
  const drawer = page.getByRole('complementary', { name: title })
  await expect(drawer).toBeVisible()
  return drawer
}

const siteLine = (drawer: Locator, site: string) =>
  drawer.getByRole('region', { name: /Sites/ }).getByRole('listitem').filter({ hasText: site })

test.describe('studio', () => {
  test('dashboard-opens-on-monday-questions @e2e: Overzicht opens on four sections, two quick creates, and the worst site first', async ({
    page,
  }) => {
    const api = page.request
    await landing(page)
    await expect(page.getByRole('heading', { level: 2 })).toHaveText(['Nu', 'Waar we stopten', 'Deze week', 'Op tafel'])
    await expect(page.locator('.nv-bar > button.nv-chip')).toHaveText(['Nieuwe taak', 'Nieuw agendapunt'])
    await expect(page.getByRole('button', { name: /Nieuwe actie|Nieuwe opdracht/ })).toHaveCount(0)

    const live = { in_registry: true }
    const count = async (source: string, filter?: Values) => (await rowsOf(api, source, filter)).total
    await expect(statValue(page, 'Storing')).toHaveText(String(await count('site', { ...live, gezondheid: 'storing' })))
    await expect(statValue(page, 'Let op')).toHaveText(String(await count('site', { ...live, gezondheid: 'let_op' })))
    await expect(statValue(page, 'Wacht op jou')).toHaveText(String(await count('op_tafel')))
    await expect(tile(page, 'Sites in orde')).toContainText(
      new RegExp(`${await count('sites_in_orde')}\\s*van\\s*${await count('site', live)}`),
    )
    await shot(page, 'overzicht')

    const aandacht = tile(page, 'Sites met aandacht')
    await aandacht.scrollIntoViewIfNeeded()
    await expect(aandacht.getByRole('listitem')).toHaveText([
      /Storing\s*voorbeeld-blog/,
      /Let op\s*testmans-bestel/,
      /Niet in registry\s*oud-archief/,
    ])
    await open(page, 'Sites met aandacht', 'Sites')
    await expect(page.locator('tbody tr.nv-tr')).toHaveText([/voorbeeld-blog/, /testmans-bestel/, /oud-archief/])
    await shot(page, 'sites-met-aandacht')
  })

  test('space-narrows-dashboard @e2e: a client narrows every scoped tile; Te bevestigen stays fleet-wide', async ({
    page,
  }) => {
    const api = page.request
    const klant = (await rowsOf(api, 'organisatie')).rows.find((o) => o.naam === 'Bakkerij Testmans')?.id as number
    const scoped = { organisatie_id: klant }
    const count = async (source: string, filter?: Values) => (await rowsOf(api, source, filter)).total
    const waiting = await count('actie', { status: 'voorbereid' })
    await landing(page)
    await expect(statValue(page, 'Storing')).toHaveText(/^[1-9]\d*$/)
    await expect(tile(page, 'Storing')).toHaveClass(/nv-stat--bad/)

    await chooseSpace(page, 'Bakkerij Testmans')

    const live = { in_registry: true, ...scoped }
    await expect(statValue(page, 'Storing')).toHaveText(String(await count('site', { ...live, gezondheid: 'storing' })))
    await expect(statValue(page, 'Storing')).toHaveText('0')
    await expect(tile(page, 'Storing')).not.toHaveClass(/nv-stat--bad/)
    await expect(statValue(page, 'Let op')).toHaveText(String(await count('site', { ...live, gezondheid: 'let_op' })))
    await expect(statValue(page, 'Wacht op jou')).toHaveText(String(await count('op_tafel', scoped)))
    await expect(tile(page, 'Sites in orde')).toContainText(
      new RegExp(`${await count('sites_in_orde', scoped)}\\s*van\\s*${await count('site', live)}`),
    )
    await expect(tile(page, 'Sites met aandacht').getByRole('listitem')).toHaveText([/Let op\s*testmans-bestel/])
    await expect
      .poll(() => countIn(page, 'Features'))
      .toBe(await count('werkpakket', { ...scoped, fase: { $nin: ['klaar', 'geparkeerd'] } }))
    await expect.poll(() => countIn(page, 'Te bevestigen')).toBe(waiting)
    await shot(page, 'overzicht-klant')
  })

  test('request-health-check-for-selected-sites @e2e: ticked sites make one opdracht that opens live; a retired site is skipped; Undo removes it', async ({
    page,
  }) => {
    const api = page.request
    await open(page, 'Sites', 'Sites')
    await page.getByRole('checkbox', { name: 'testmans-winkel selecteren' }).check()
    await page.getByRole('checkbox', { name: 'oud-archief selecteren' }).check()
    const bar = page.getByRole('region', { name: '2 geselecteerd' })
    await expect(bar).toBeVisible()
    for (const label of ['Gezondheid checken', 'Malware scannen', 'Bijwerken', 'Smoketest draaien'])
      await expect(bar.getByRole('button', { name: label, exact: true })).toBeVisible()
    await shot(page, 'sites-selection-bar')
    const before = await newest(api, 'actie')

    await bar.getByRole('button', { name: 'Gezondheid checken', exact: true }).click()

    const drawer = page.getByRole('complementary', { name: 'Gezondheidscheck · 2 sites' })
    await expect(drawer).toBeVisible()
    await expect(drawer.getByText('Aangevraagd', { exact: true })).toBeVisible()
    await expect(drawer.getByText('Volgt live')).toBeVisible()
    await expect(siteLine(drawer, 'oud-archief')).toContainText('Niet meer in de registry')
    await expect(siteLine(drawer, 'oud-archief')).toContainText('Overgeslagen')
    await expect(siteLine(drawer, 'testmans-winkel')).toContainText('Niet gestart')
    await expect(page.getByRole('region', { name: /geselecteerd/ })).toHaveCount(0)
    await shot(page, 'opdracht-drawer-live')

    const actie = await newest(api, 'actie')
    expect(actie).toBe(before + 1)
    expect(await rowOf(api, 'actie', actie)).toMatchObject({ soort: 'gezondheidscheck', status: 'aangevraagd' })
    const links = (await rowsOf(api, 'actie_site', { actie_id: actie })).rows
    expect(links.map((l) => [l.site_id, l.state, l.resultaat]).sort()).toEqual([
      [1, 'wacht', null],
      [5, 'overgeslagen', 'niet in registry'],
    ])

    await page
      .getByRole('status', { name: 'Gezondheid checken aangevraagd.' })
      .getByRole('button', { name: 'Ongedaan maken' })
      .click()
    await expect.poll(() => exists(api, 'actie', actie)).toBe(false)
    expect((await rowsOf(api, 'actie_site', { actie_id: actie })).total).toBe(0)
    await expect(drawer).toHaveCount(0)
  })

  test('tick-and-run-from-the-panel @e2e: the tick box shows on hover, ticking raises the floating panel and moves no row, the panel runs the action, and the column lines show in both themes', async ({
    page,
  }) => {
    const api = page.request
    await open(page, 'Sites', 'Sites')
    const box = (site: string) => page.getByRole('checkbox', { name: `${site} selecteren` })
    const rowOf1 = page.getByRole('row').filter({ has: box('testmans-winkel') })
    await rowOf1.hover()
    await expect(box('testmans-winkel')).toHaveCSS('opacity', '1')
    await expect(box('testmans-bestel')).toHaveCSS('opacity', '0')
    await page.emulateMedia({ colorScheme: 'dark' })
    await shot(page, 'sites-hover-dark')
    const top = (await rowOf1.boundingBox())?.y

    await box('testmans-winkel').check()
    await box('testmans-bestel').check()

    const panel = page.getByRole('region', { name: '2 geselecteerd' })
    await expect(panel).toBeVisible()
    await expect(page.locator('.nv-dock').getByRole('region', { name: '2 geselecteerd' })).toBeVisible()
    await expect(page.locator('.nv-dock')).toHaveCSS('position', 'absolute')
    expect((await rowOf1.boundingBox())?.y).toBe(top)
    const button = await panel.getByRole('button', { name: 'Smoketest draaien', exact: true }).boundingBox()
    expect((await panel.boundingBox())?.height).toBeLessThan((button?.height ?? 0) + 28)
    await page.mouse.move(0, 0)
    const lineOf = () =>
      page
        .locator('th.nv-th:not(.nv-num)')
        .first()
        .evaluate((el) => getComputedStyle(el).borderRightColor)
    await expect.poll(() => lineOf()).toBe('rgb(58, 61, 68)')
    await shot(page, 'sites-panel-lines-dark')
    await page.emulateMedia({ colorScheme: 'light' })
    await expect.poll(() => lineOf()).toBe('rgb(196, 203, 211)')
    await shot(page, 'sites-panel-lines-light')
    const before = await newest(api, 'actie')

    await panel.getByRole('button', { name: 'Gezondheid checken', exact: true }).click()

    const drawer = page.getByRole('complementary', { name: 'Gezondheidscheck · 2 sites' })
    await expect(drawer).toBeVisible()
    const actie = await newest(api, 'actie')
    expect(actie).toBeGreaterThan(before)
    try {
      expect((await rowsOf(api, 'actie_site', { actie_id: actie })).rows.map((l) => l.site_id).sort()).toEqual([1, 2])
    } finally {
      await page
        .getByRole('status', { name: 'Gezondheid checken aangevraagd.' })
        .getByRole('button', { name: 'Ongedaan maken' })
        .click()
      await expect.poll(() => exists(api, 'actie', actie)).toBe(false)
    }
  })

  test('request-shows-running-then-result @e2e: a requested opdracht shows running in the dock on every page, ends by itself with its result, and waits on Bevestigen with a link', async ({
    page,
  }) => {
    const api = page.request
    const service = await worker()
    const winkel = (await rowOf(api, 'site', 1)).gezondheid
    const made: number[] = []
    const dashboard = page.locator('.nv-tree__dashboards').getByRole('button', { name: 'Overzicht' })
    const patch = async (path: string, data: Values) => {
      const response = await service.patch(path, { data })
      expect(response.status(), await response.text()).toBe(200)
    }
    const request = async (site: string, action: string) => {
      await page.getByRole('checkbox', { name: `${site} selecteren` }).check()
      await page
        .getByRole('region', { name: '1 geselecteerd' })
        .getByRole('button', { name: action, exact: true })
        .click()
    }
    try {
      await open(page, 'Sites', 'Sites')
      await request('testmans-winkel', 'Gezondheid checken')
      const actie = await newest(api, 'actie')
      made.push(actie)
      await expect(page.getByRole('region', { name: 'Gezondheid checken · Aangevraagd' })).toHaveAttribute(
        'aria-busy',
        'true',
      )
      await expect(page.locator('tr[data-running]')).toHaveCount(1)
      const toast = page.getByRole('status', { name: 'Gezondheid checken aangevraagd.' })
      await expect(toast).toBeVisible()
      const [line, notice] = [
        await page.getByRole('region', { name: 'Gezondheid checken · Aangevraagd' }).boundingBox(),
        await toast.boundingBox(),
      ]
      expect(line && notice && notice.y + notice.height <= line.y).toBe(true)
      await shot(page, 'opdracht-loopt-in-dock')

      await dashboard.click()
      await expect(page.getByRole('heading', { level: 1 })).toHaveText('Overzicht')
      await expect(statValue(page, 'Storing')).toHaveText(/^\d+$/)
      const storing = Number(await statValue(page, 'Storing').textContent())
      await patch('/api/rows/site/1', { gezondheid: 'storing' })
      await patch(`/api/rows/actie/${actie}`, { status: 'bezig', expect: { status: 'aangevraagd' } })
      await patch(`/api/rows/actie/${actie}`, { status: 'klaar', expect: { status: 'bezig' } })
      const done = page.getByRole('region', { name: 'Gezondheid checken · Klaar' })
      await expect(done).toBeVisible({ timeout: 15_000 })
      await expect(done).toHaveAttribute('aria-busy', 'false')
      await expect(statValue(page, 'Storing')).toHaveText(String(storing + 1))
      await shot(page, 'opdracht-klaar-in-dock')
      await expect(done).toHaveCount(0, { timeout: 10_000 })

      await open(page, 'Sites', 'Sites')
      await request('voorbeeld-site', 'Bijwerken')
      const update = await newest(api, 'actie')
      made.push(update)
      const busy = page.getByRole('region', { name: 'Bijwerken · Aangevraagd' })
      await expect(busy).toHaveAttribute('aria-busy', 'true')
      await page.waitForTimeout(3500)
      await expect(busy).toHaveAttribute('aria-busy', 'true')

      await prepare({
        actie: update,
        links: (await rowsOf(api, 'actie_site', { actie_id: update })).rows.map((l) => l.id),
      })
      const waiting = page.getByRole('button', { name: 'Bijwerken · Voorbereid — openen' })
      await expect(waiting).toBeVisible({ timeout: 15_000 })
      await waiting.click()
      await expect(page.getByRole('complementary', { name: /Bijwerken/ })).toBeVisible()
      await expect(waiting).toHaveCount(0)
    } finally {
      await patch('/api/rows/site/1', { gezondheid: winkel }).catch(() => undefined)
      for (const actie of made) {
        for (const link of (await rowsOf(api, 'actie_site', { actie_id: actie })).rows)
          await api.delete(`/api/rows/actie_site/${link.id}`)
        await api.delete(`/api/rows/actie/${actie}`)
      }
      await service.dispose()
    }
  })

  test('tick-on-a-query-view @e2e: in Sites met aandacht, two ticked sites run Gezondheid checken and the opdracht opens with exactly those two', async ({
    page,
  }) => {
    const api = page.request
    await open(page, 'Sites met aandacht', 'Sites')
    const sites = (await rowsOf(api, 'sites_aandacht')).rows
    expect(sites.length).toBeGreaterThanOrEqual(2)
    const [first, second] = sites
    await page.getByRole('checkbox', { name: `${first.naam} selecteren` }).check()
    await page.getByRole('checkbox', { name: `${second.naam} selecteren` }).check()
    const bar = page.getByRole('region', { name: '2 geselecteerd' })
    await expect(bar).toBeVisible()
    for (const label of ['Gezondheid checken', 'Malware scannen', 'Bijwerken', 'Smoketest draaien'])
      await expect(bar.getByRole('button', { name: label, exact: true })).toBeVisible()
    await shot(page, 'sites-aandacht-aangevinkt')
    const before = await newest(api, 'actie')

    await bar.getByRole('button', { name: 'Gezondheid checken', exact: true }).click()

    const drawer = page.getByRole('complementary', { name: 'Gezondheidscheck · 2 sites' })
    await expect(drawer).toBeVisible()
    await expect(siteLine(drawer, String(first.naam))).toBeVisible()
    await expect(siteLine(drawer, String(second.naam))).toBeVisible()
    const actie = await newest(api, 'actie')
    expect(actie).toBeGreaterThan(before)
    const links = (await rowsOf(api, 'actie_site', { actie_id: actie })).rows
    expect(links.map((l) => l.site_id).sort()).toEqual([first.id, second.id].sort())

    await page
      .getByRole('status', { name: 'Gezondheid checken aangevraagd.' })
      .getByRole('button', { name: 'Ongedaan maken' })
      .click()
    await expect.poll(() => exists(api, 'actie', actie)).toBe(false)
  })

  test('request-only-retired-sites-refused @e2e: a selection of sites no longer in the registry makes no opdracht', async ({
    page,
  }) => {
    const api = page.request
    await open(page, 'Sites', 'Sites')
    const before = await newest(api, 'actie')
    await page.getByRole('checkbox', { name: 'oud-archief selecteren' }).check()
    await page
      .getByRole('region', { name: '1 geselecteerd' })
      .getByRole('button', { name: 'Smoketest draaien', exact: true })
      .click()
    await expect(page.getByText('Geen van deze sites staat nog in de registry.').first()).toBeVisible()
    await shot(page, 'alleen-oud-archief')
    await expect(page.getByRole('complementary')).toHaveCount(0)
    expect(await newest(api, 'actie')).toBe(before)
  })

  test('request-from-a-site-drawer @e2e: a site drawer runs an action on that site alone, titled "<Soort> · <naam>"', async ({
    page,
  }) => {
    const api = page.request
    await open(page, 'Sites', 'Sites')
    const site = await drawerOf(page, 'voorbeeld-site')
    await expect(site.getByRole('group', { name: 'Gezondheid checken' })).toBeAttached()

    await site
      .getByRole('group', { name: 'Smoketest draaien' })
      .getByRole('button', { name: 'Smoketest draaien' })
      .click()

    const drawer = page.getByRole('complementary', { name: 'Smoketest · voorbeeld-site' })
    await expect(drawer).toBeVisible()
    await expect(siteLine(drawer, 'voorbeeld-site')).toContainText('Niet gestart')
    await shot(page, 'site-drawer-request')
    const actie = await newest(api, 'actie')
    expect(await rowOf(api, 'actie', actie)).toMatchObject({ titel: 'Smoketest · voorbeeld-site', soort: 'smoketest' })
    expect((await rowsOf(api, 'actie_site', { actie_id: actie })).rows.map((l) => l.site_id)).toEqual([3])
    await page
      .getByRole('status', { name: 'Smoketest draaien aangevraagd.' })
      .getByRole('button', { name: 'Ongedaan maken' })
      .click()
    await expect.poll(() => exists(api, 'actie', actie)).toBe(false)
  })

  test('preview-opens-from-request @e2e: the seeded opdracht shows each site’s preview summary on its line', async ({
    page,
  }) => {
    await open(page, 'Opdrachten', 'Opdrachten')
    const drawer = await drawerOf(page, 'Bijwerken · 2 sites')
    await expect(siteLine(drawer, 'testmans-bestel')).toContainText('WordPress 6.7.2 → 6.8.3 · 1 plugin')
    await expect(siteLine(drawer, 'voorbeeld-site')).toContainText('1 plugin: cache-plugin 1.9.0 → 1.9.2')
    for (const site of ['testmans-bestel', 'voorbeeld-site']) {
      await expect(siteLine(drawer, site)).toContainText('Preview klaar')
      await expect(siteLine(drawer, site).getByRole('button', { name: 'Niet nu' })).toBeVisible()
    }
    await expect(drawer.getByRole('button', { name: 'Bevestigen' })).toBeVisible()
    await shot(page, 'te-bevestigen-drawer')
  })

  test('drop-site-before-confirm @e2e: Niet nu skips a site, Toch wel brings it back, Undo takes a press back', async ({
    page,
  }) => {
    const api = page.request
    const link = (await rowsOf(api, 'actie_site', { actie_id: 1, site_id: 2 })).rows[0] as Row
    const stateOf = async () => (await rowOf(api, 'actie_site', link.id)).state
    await open(page, 'Opdrachten', 'Opdrachten')
    const drawer = await drawerOf(page, 'Bijwerken · 2 sites')
    const line = siteLine(drawer, 'testmans-bestel')

    await line.getByRole('button', { name: 'Niet nu' }).click()
    await expect(line).toContainText('Overgeslagen')
    await expect(line.getByRole('button', { name: 'Toch wel' })).toBeVisible()
    await expect.poll(stateOf).toBe('overgeslagen')
    await shot(page, 'niet-nu')

    await page.getByRole('status', { name: 'Niet nu gedaan.' }).getByRole('button', { name: 'Ongedaan maken' }).click()
    await expect(line.getByRole('button', { name: 'Niet nu' })).toBeVisible()
    await expect.poll(stateOf).toBe('te_bevestigen')

    await line.getByRole('button', { name: 'Niet nu' }).click()
    await line.getByRole('button', { name: 'Toch wel' }).click()
    await expect(line).toContainText('Preview klaar')
    await expect(line.getByRole('button', { name: 'Niet nu' })).toBeVisible()
    await expect.poll(stateOf).toBe('te_bevestigen')
  })

  test('confirm-update-from-dashboard @e2e: the Te bevestigen row opens the drawer, Bevestigen confirms, the count drops, Annuleren stays', async ({
    page,
  }) => {
    const api = page.request
    await landing(page)
    const list = tile(page, 'Te bevestigen')
    await list.scrollIntoViewIfNeeded()
    await expect(list.getByRole('listitem').first()).toBeVisible()
    const before = await countIn(page, 'Te bevestigen')

    await list
      .getByRole('listitem')
      .filter({ hasText: 'Bijwerken · 2 sites' })
      .getByRole('button', { name: /^Open / })
      .click()
    const drawer = page.getByRole('complementary', { name: 'Bijwerken · 2 sites' })
    await expect(siteLine(drawer, 'testmans-bestel')).toContainText('WordPress 6.7.2 → 6.8.3')
    await drawer.getByRole('button', { name: 'Bevestigen' }).click()

    await expect(drawer.getByText('Bevestigd', { exact: true })).toBeVisible()
    await expect(drawer.getByRole('button', { name: 'Niet nu' })).toHaveCount(0)
    await expect(drawer.getByRole('button', { name: 'Bevestigen' })).toHaveCount(0)
    await expect(drawer.getByRole('button', { name: 'Annuleren' })).toBeVisible()
    await expect.poll(() => countIn(page, 'Te bevestigen')).toBe(before - 1)
    expect((await rowOf(api, 'actie', 1)).status).toBe('bevestigd')
    await shot(page, 'na-bevestigen')
  })

  test('confirm-refused-on-an-expired-preview @e2e: a preview older than 24 hours is not confirmed, and says why', async ({
    page,
  }) => {
    const api = page.request
    const { actie } = await preview(api, [1])
    age(actie, 30)
    await open(page, 'Opdrachten', 'Opdrachten')
    const drawer = await drawerOf(page, 'Bijwerken · testmans-winkel')

    await drawer.getByRole('button', { name: 'Bevestigen' }).click()

    await expect(page.getByText('Deze preview is verlopen. De worker maakt een nieuwe.').first()).toBeVisible()
    await shot(page, 'preview-verlopen')
    expect((await rowOf(api, 'actie', actie)).status).toBe('voorbereid')
  })

  test('confirm-survives-a-dropped-request @e2e: Bevestigen whose request never arrives changes nothing, and a second press confirms', async ({
    page,
  }) => {
    const api = page.request
    const { actie } = await preview(api, [2])
    await open(page, 'Opdrachten', 'Opdrachten')
    const drawer = await drawerOf(page, 'Bijwerken · testmans-bestel')
    const drop = (route: Route) => (route.request().method() === 'PATCH' ? route.abort() : route.continue())
    await page.route(`**/api/rows/actie/${actie}`, drop)

    await drawer.getByRole('button', { name: 'Bevestigen' }).click()

    await expect(drawer.getByRole('button', { name: 'Bevestigen' })).toBeVisible()
    expect((await rowOf(api, 'actie', actie)).status).toBe('voorbereid')
    await shot(page, 'bevestigen-weggevallen')
    await page.unroute(`**/api/rows/actie/${actie}`, drop)
    await drawer.getByRole('button', { name: 'Bevestigen' }).click()
    await expect(drawer.getByText('Bevestigd', { exact: true })).toBeVisible()
    await expect.poll(async () => (await rowOf(api, 'actie', actie)).status).toBe('bevestigd')
  })

  test('service-cannot-confirm @e2e: a real service token is refused Bevestigen, a fresh rewind and a new voorstel; the row is unchanged', async ({
    page,
  }) => {
    const api = page.request
    const { actie, links } = await preview(api, [3])
    const before = { actie: await rowOf(api, 'actie', actie), link: await rowOf(api, 'actie_site', links[0] as number) }
    const service = await worker()
    try {
      const confirm = await service.patch(`/api/rows/actie/${actie}`, {
        data: { status: 'bevestigd', expect: { status: 'voorbereid' } },
      })
      expect(confirm.status()).toBe(422)
      expect(((await confirm.json()) as { code: string }).code).toBe('transition_not_allowed')

      const rewind = await service.patch(`/api/rows/actie/${actie}`, {
        data: { status: 'aangevraagd', expect: { status: 'voorbereid' } },
      })
      expect(rewind.status()).toBe(422)
      expect(((await rewind.json()) as { message: string }).message).toBe('Deze preview is nog niet verlopen.')

      const rewrite = await service.patch(`/api/rows/actie_site/${links[0]}`, { data: { voorstel: '{"core":null}' } })
      expect(rewrite.status()).toBe(422)
      expect(((await rewrite.json()) as { message: string }).message).toBe('Het voorstel ligt vast sinds de preview.')
    } finally {
      await service.dispose()
    }
    const after = { actie: await rowOf(api, 'actie', actie), link: await rowOf(api, 'actie_site', links[0] as number) }
    expect(after.actie.status).toBe('voorbereid')
    expect(after.actie.voorbereid_op).toBe(before.actie.voorbereid_op)
    expect(after.link.voorstel).toBe(before.link.voorstel)
    expect(after.link.state).toBe('te_bevestigen')
  })

  test('sites-board-and-gallery @e2e: the board shows the four health columns and does not drag, the gallery shows the live sites', async ({
    page,
  }) => {
    const api = page.request
    await open(page, 'Sites per gezondheid', 'Sites')
    await expect.poll(async () => Object.keys(await orders(page))).toEqual(['In orde', 'Let op', 'Storing', 'Onbekend'])
    const first = await orders(page)
    await shot(page, 'sites-per-gezondheid')

    await expect(card(page, 1)).not.toHaveClass(/nv-board__card--drags/)
    await card(page, 1).focus()
    await page.keyboard.press('Space')
    await expect(page.locator('.nv-board__card--lifted')).toHaveCount(0)
    await expect.poll(() => orders(page)).toEqual(first)
    expect((await rowOf(api, 'site', 1)).gezondheid).toBe('ok')

    await openView(page, 'Sites in beeld', 'Sites')
    await expect(page.locator('.nv-gallery__card .nv-gallery__title')).toHaveText([
      'testmans-bestel',
      'testmans-winkel',
      'voorbeeld-blog',
      'voorbeeld-site',
    ])
    await shot(page, 'sites-in-beeld')
  })

  test('add-to-the-agenda @e2e: + Nieuw agendapunt asks title and day, the item shows, Undo removes it; a planned opdracht shows as Opdracht', async ({
    page,
  }) => {
    const api = page.request
    await open(page, 'Agenda', 'Agenda')
    await page.getByRole('button', { name: 'Nieuw agendapunt' }).click()
    const dialog = page.getByRole('dialog', { name: 'Nieuw agendapunt' })
    await expect(dialog.locator('input')).toHaveCount(2)
    await expect(dialog.getByLabel('Titel')).toHaveValue('')
    await expect(dialog.getByLabel('Datum')).toHaveValue(today())
    await dialog.getByRole('button', { name: 'Aanmaken' }).click()
    await expect(dialog.getByText('Een agendapunt heeft een titel.')).toBeVisible()

    await dialog.getByLabel('Titel').fill('e2e overleg agenda')
    await dialog.getByRole('button', { name: 'Aanmaken' }).click()
    await expect(dialog).toHaveCount(0)
    await expect(page.getByText('e2e overleg agenda').first()).toBeVisible()
    const made = async () => (await rowsOf(api, 'agendapunt')).rows.filter((r) => r.titel === 'e2e overleg agenda')
    expect((await made()).map((r) => r.datum)).toEqual([today()])
    await shot(page, 'agenda')
    await page.keyboard.press('Control+z')
    await expect.poll(async () => (await made()).length).toBe(0)

    const planned = await api.post('/api/rows/actie', {
      data: { soort: 'gezondheidscheck', titel: 'e2e gepland', gepland_op: `${today()}T14:00:00` },
    })
    expect(planned.status(), await planned.text()).toBe(201)
    const id = ((await planned.json()) as { id: number }).id
    try {
      await open(page, 'Vandaag', 'Agenda')
      await expect(page.getByRole('row', { name: /e2e gepland/ })).toContainText('Opdracht')
      await openView(page, 'Agenda', 'Agenda')
      await expect(page.getByText('e2e gepland').first()).toBeVisible()
    } finally {
      await api.delete(`/api/rows/actie/${id}`)
    }
  })

  test('op-tafel @e2e: Op tafel lists the open tasks due this week, and the dashboard’s Gedaan makes a line leave', async ({
    page,
  }) => {
    const api = page.request
    const made = await api.post('/api/rows/taak', { data: { titel: 'e2e op tafel', deadline: today() } })
    expect(made.status(), await made.text()).toBe(201)
    const id = ((await made.json()) as { id: number }).id
    try {
      await open(page, 'Op tafel', 'Taken')
      const titles = (await rowsOf(api, 'op_tafel')).rows.map((r) => r.titel as string)
      expect(titles).toContain('e2e op tafel')
      expect(titles).not.toContain('Dashboard-plan nalezen')
      for (const titel of titles) await expect(page.getByRole('row', { name: new RegExp(titel) })).toBeVisible()
      await expect(page.getByRole('row', { name: /Dashboard-plan nalezen/ })).toHaveCount(0)
      await shot(page, 'op-tafel')

      await landing(page)
      const list = tile(page, 'Op tafel')
      await list.scrollIntoViewIfNeeded()
      const row = list.getByRole('listitem').filter({ hasText: 'e2e op tafel' })
      await expect(row).toBeVisible()
      const before = await countIn(page, 'Op tafel')
      await row.getByRole('button', { name: 'Gedaan' }).click()
      await expect(row).toHaveCount(0)
      await expect.poll(() => countIn(page, 'Op tafel')).toBe(before - 1)
      expect((await rowOf(api, 'taak', id)).status).toBe('gedaan')
    } finally {
      await api.delete(`/api/rows/taak/${id}`)
    }
  })
})

test.describe('studio, the editor', () => {
  test.use({ storageState: state('studio-editor') })

  test('editor-cannot-confirm @e2e: an editor reads the preview and may drop a site, but is never offered Bevestigen, and the write is refused', async ({
    page,
  }) => {
    const api = page.request
    const { actie } = await preview(api, [4])
    await open(page, 'Opdrachten', 'Opdrachten')
    const drawer = await drawerOf(page, 'Bijwerken · voorbeeld-blog')
    await expect(siteLine(drawer, 'voorbeeld-blog').getByRole('button', { name: 'Niet nu' })).toBeVisible()
    await expect(drawer.getByRole('button', { name: 'Annuleren' })).toBeVisible()
    await expect(drawer.getByRole('button', { name: 'Bevestigen' })).toHaveCount(0)
    await shot(page, 'redacteur-drawer')

    const confirm = await api.patch(`/api/rows/actie/${actie}`, { data: { status: 'bevestigd' } })
    expect(confirm.status()).toBe(422)
    expect((await rowOf(api, 'actie', actie)).status).toBe('voorbereid')
  })
})

// The hunt's confirmed bugs (specs/studio-domain/shakeout.md), RED at c43bd3e and fixed by b08381e.
test.describe('studio, the hunt', () => {
  test('person-cannot-take-worker-steps @e2e: the Opdrachten board does not drag, so no opdracht reaches the worker’s Voorbereiden', async ({
    page,
  }) => {
    const api = page.request
    const { actie } = await run(api, 'bijwerken', [4])
    await open(page, 'Opdrachten per status', 'Opdrachten')
    await expect(lane(page, 'Aangevraagd').locator(`[data-card="${actie}"]`)).toBeVisible()
    await expect(card(page, actie)).not.toHaveClass(/nv-board__card--drags/)
    await card(page, actie).focus()
    await page.keyboard.press('Space')
    await expect(page.locator('.nv-board__card--lifted')).toHaveCount(0)
    await expect(lane(page, 'Aangevraagd').locator(`[data-card="${actie}"]`)).toBeVisible()
    await shot(page, 'opdracht-sleep-voorbereiden')
    expect((await rowOf(api, 'actie', actie)).status).toBe('aangevraagd')
  })

  test('decided-request-lines @e2e: once Stefan decides, no site line still reads Te bevestigen (confirmed) or Wacht (cancelled)', async ({
    page,
  }) => {
    const api = page.request
    await preview(api, [1])
    await open(page, 'Opdrachten', 'Opdrachten')
    let drawer = await drawerOf(page, 'Bijwerken · testmans-winkel')
    await drawer.getByRole('button', { name: 'Bevestigen' }).click()
    await expect(drawer.getByText('Bevestigd', { exact: true })).toBeVisible()
    await expect(siteLine(drawer, 'testmans-winkel').getByText('Te bevestigen', { exact: true })).toHaveCount(0)
    await expect(siteLine(drawer, 'testmans-winkel')).toContainText('Preview klaar')
    await shot(page, 'bevestigd-regels')

    await run(api, 'gezondheidscheck', [3])
    await open(page, 'Opdrachten', 'Opdrachten')
    drawer = await drawerOf(page, 'Gezondheidscheck · voorbeeld-site')
    await drawer.getByRole('button', { name: 'Annuleren' }).click()
    await expect(drawer.getByText('Geannuleerd', { exact: true })).toBeVisible()
    await expect(siteLine(drawer, 'voorbeeld-site').getByText('Wacht', { exact: true })).toHaveCount(0)
    await expect(siteLine(drawer, 'voorbeeld-site')).toContainText('Niet gestart')
  })

  test('op-tafel-offers-new-task @e2e: Op tafel’s header offers Nieuwe taak, not a disabled "Nieuw Op tafel" on a list that writes', async ({
    page,
  }) => {
    await open(page, 'Op tafel', 'Taken')
    const add = page.locator('.nv-toolbar .nv-button--primary')
    await expect(add).toHaveText(/Nieuwe taak/)
    await expect(add).toBeEnabled()
    await shot(page, 'op-tafel-knop')
    await add.click()
    const dialog = page.getByRole('dialog', { name: 'Nieuwe taak' })
    await dialog.getByLabel('Titel').fill('e2e vanaf op tafel')
    await dialog.getByRole('button', { name: 'Aanmaken' }).click()
    await expect(dialog).toHaveCount(0)
    await expect(page.getByRole('row', { name: /e2e vanaf op tafel/ })).toBeVisible()
    const made = (await rowsOf(page.request, 'taak')).rows.find((r) => r.titel === 'e2e vanaf op tafel') as Row
    expect(made.deadline).toBe(today())
    await page.request.delete(`/api/rows/taak/${made.id}`)
  })

  test('recent-moment-not-late @e2e: a check from yesterday and a feature updated two days ago are not marked late on the dashboard', async ({
    page,
  }) => {
    await landing(page)
    const check = tile(page, 'Sites met aandacht').getByRole('listitem').filter({ hasText: 'testmans-bestel' })
    const feature = tile(page, 'Features').getByRole('listitem').filter({ hasText: 'Kassakoppeling' })
    await expect(check).toBeVisible()
    await expect(feature).toBeVisible()
    await expect(check.locator('.nv-list__day--late')).toHaveCount(0)
    await expect(feature.locator('.nv-list__day--late')).toHaveCount(0)
    await expect(check.locator('.nv-list__on')).toBeVisible()
    await expect(feature.locator('.nv-list__on')).toBeVisible()
    await shot(page, 'tegel-rode-dagen')
  })

  test('delete-a-request-explains @e2e: Verwijderen on an opdracht says, in studio’s words, to cancel it instead', async ({
    page,
  }) => {
    const api = page.request
    const { actie } = await run(api, 'malwarescan', [3])
    await open(page, 'Opdrachten', 'Opdrachten')
    const drawer = await drawerOf(page, 'Malwarescan · voorbeeld-site')
    await drawer.getByRole('button', { name: 'Verwijderen' }).click()
    await drawer.getByRole('button', { name: 'Zeker?' }).click()
    const refusal = page.getByRole('status').filter({ hasText: 'Niet opgeslagen' })
    await expect(refusal).toBeVisible()
    await shot(page, 'opdracht-verwijderen')
    await expect(refusal).toContainText(/annuleer/i)
    expect(await exists(api, 'actie', actie)).toBe(true)
  })
})

test.describe('studio, the hunt at 1280 by 720', () => {
  test.use({ viewport: { width: 1280, height: 720 } })

  test('today-keeps-its-titles @e2e: with a drawer open, the Vandaag tile still shows a timed item’s title', async ({
    page,
  }) => {
    await landing(page)
    await tile(page, 'Features')
      .getByRole('listitem')
      .first()
      .getByRole('button', { name: /^Open / })
      .click()
    await expect(page.getByRole('complementary')).toBeVisible()
    const item = tile(page, 'Vandaag').getByRole('listitem').filter({ hasText: 'Overleg Testmans' })
    await item.scrollIntoViewIfNeeded()
    await expect(item).toBeVisible()
    await shot(page, 'vandaag-smal')
    await expect(item.getByText('Overleg Testmans')).toBeVisible()
    const line = await item.boundingBox()
    const title = await item.locator('.nv-list__title').boundingBox()
    expect((title?.x ?? 0) + (title?.width ?? 0)).toBeLessThanOrEqual((line?.x ?? 0) + (line?.width ?? 0))
  })
})

test.describe('studio, what a person is offered', () => {
  const readOnly = async (page: Page, grid: string, headers: string[]) => {
    const table = page.getByRole('grid', { name: grid, exact: true })
    const names = await table.getByRole('columnheader').allTextContents()
    const cells = table
      .getByRole('row')
      .filter({ has: page.getByRole('gridcell') })
      .first()
      .getByRole('gridcell')
    expect(await cells.count()).toBe(names.length)
    for (const header of headers) {
      const at = names.findIndex((name) => name.includes(header))
      expect(at, header).toBeGreaterThanOrEqual(0)
      await expect(cells.nth(at), header).toHaveAttribute('aria-readonly', 'true')
    }
  }

  test('no-edit-on-worker-columns @e2e: the worker’s columns are read-only on Sites and the log, and an opdracht’s Status is no inline select', async ({
    page,
  }) => {
    await open(page, 'Sites', 'Sites')
    await readOnly(page, 'Sites', [
      'Gezondheid',
      'HTTP',
      'WordPress',
      'PHP',
      'Updates plugins',
      'TLS',
      'Laatste check',
      'In registry',
    ])
    await expect(page.getByRole('row', { name: /testmans-winkel/ })).toBeVisible()
    await shot(page, 'sites-worker-kolommen')

    await openView(page, 'Onderhoudslog', 'Onderhoudslog')
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Onderhoudslog')
    await expect(
      page.getByRole('grid', { name: 'Onderhoudslog', exact: true }).locator('[role=gridcell]:not([aria-readonly])'),
    ).toHaveCount(0)

    await openView(page, 'Opdrachten', 'Opdrachten')
    await readOnly(page, 'Opdrachten', ['Status'])
  })

  test('no-new-where-not-allowed @e2e: Sites and the log offer no + Nieuw, and a query view that creates nothing offers none', async ({
    page,
  }) => {
    for (const [view, model] of [
      ['Sites', 'Sites'],
      ['Sites per gezondheid', 'Sites'],
      ['Sites met aandacht', 'Sites'],
      ['Onderhoudslog', 'Onderhoudslog'],
    ]) {
      await open(page, view, model)
      await expect(page.locator('.nv-toolbar .nv-button--primary'), view).toHaveCount(0)
      await expect(page.getByRole('button', { name: /^Nieuw/ }), view).toHaveCount(0)
    }
    await open(page, 'Opdrachten per status', 'Opdrachten')
    await expect(page.getByRole('button', { name: /^Nieuw in/ })).toHaveCount(0)
    await open(page, 'Opdrachten', 'Opdrachten')
    await expect(page.locator('.nv-toolbar .nv-button--primary')).toHaveText(/Nieuwe opdracht/)
    await shot(page, 'sites-zonder-nieuw')
  })
})

test.describe('studio, the toolbar at 1440', () => {
  const LONG =
    'De wijziging is niet bewaard omdat de server een uitgebreide uitleg geeft over waarom dit niet kan, met veel woorden. '.repeat(
      3,
    )

  test('toolbar-at-1440 @e2e: a long save error is cut and keeps the toolbar one line, and + Nieuw leaves an open drawer’s title alone', async ({
    page,
  }) => {
    await page.route('**/api/rows/taak/*', (route) =>
      route.request().method() === 'PATCH'
        ? route.fulfill({ status: 422, json: { code: 'refused', message: LONG } })
        : route.continue(),
    )
    await open(page, 'Taken', 'Taken')
    const toolbar = page.locator('.nv-toolbar')
    await page
      .getByRole('row', { name: /e2e|Taak|Controleer|Offerte/ })
      .first()
      .getByRole('button', { name: 'Openen' })
      .click()
    const drawer = page.locator('.nv-drawer, [aria-label][role=complementary]').first()
    await expect(drawer).toBeVisible()
    const title = drawer.locator('.nv-dw-title')
    const quiet = (await toolbar.boundingBox())?.height as number
    const cell = page.getByRole('grid', { name: 'Taken', exact: true }).getByRole('gridcell').nth(6)
    await cell.click({ position: { x: 6, y: 6 } })
    await page.keyboard.press('Enter')
    await page.keyboard.type('x')
    await page.keyboard.press('Enter')
    await expect(page.locator('.nv-save--error')).toBeVisible()
    await shot(page, 'werkbalk-1440')
    expect((await toolbar.boundingBox())?.height).toBe(quiet)
    const add = (await page.locator('.nv-toolbar .nv-button--primary').boundingBox()) as { x: number; width: number }
    const heading = (await title.boundingBox()) as { x: number }
    expect(add.x + add.width).toBeLessThanOrEqual(heading.x)
  })
})

for (const [scale, tag] of [
  [1.25, '125'],
  [1.5, '150'],
] as const)
  test.describe(`studio, row lines at ${tag}%`, () => {
    test.use({ deviceScaleFactor: scale })

    test(`row-lines-at-${tag} @e2e: a table row’s separator is the row-line token, stronger than the subtle border`, async ({
      page,
    }) => {
      await open(page, 'Sites', 'Sites')
      const [line, row, subtle] = await page.evaluate(() => {
        const root = getComputedStyle(document.documentElement)
        const cell = document.querySelector('.nv-td') as HTMLElement
        return [
          cell && getComputedStyle(cell).borderBottomColor,
          root.getPropertyValue('--color-border-row'),
          root.getPropertyValue('--color-border-subtle'),
        ]
      })
      expect(line).toBe('rgb(196, 203, 211)')
      expect(row.trim()).toBe('#c4cbd3')
      expect(row.trim()).not.toBe(subtle.trim())
      await shot(page, `rijlijnen-${tag}`)
    })
  })

test.describe('studio-polish, what a person reads', () => {
  test('board-groups-only @e2e: Opdrachten per status offers no lane + and no drag hints, and a card still opens', async ({
    page,
  }) => {
    await open(page, 'Opdrachten per status', 'Opdrachten')
    await expect(page.locator('section.nv-board__column').first()).toBeVisible()
    await expect(page.getByRole('button', { name: /^Nieuw in/ })).toHaveCount(0)
    await expect(page.locator('footer.nv-foot > span')).toHaveText(['↑↓←→ bewegen', '↵ openen', '⌘Z ongedaan maken'])
    await shot(page, 'opdrachten-per-status')
    await card(page, 1).click()
    await expect(page.getByRole('complementary', { name: 'Bijwerken · 2 sites' })).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(page.getByRole('complementary')).toHaveCount(0)
    await expect(card(page, 1)).toBeFocused()
  })

  test('drawer-reads-right @e2e: Bevestigen is the filled button beside a quiet Annuleren, no live mark shows while it waits on Bevestigen, and a site’s actions sit at its head', async ({
    page,
  }) => {
    const api = page.request
    const { actie } = await preview(api, [3])
    try {
      await open(page, 'Opdrachten', 'Opdrachten')
      const drawer = await drawerOf(page, 'Bijwerken · voorbeeld-site')
      await expect(drawer.getByRole('button', { name: 'Bevestigen' })).toHaveClass(/nv-button--primary/)
      await expect(drawer.getByRole('button', { name: 'Annuleren' })).toHaveClass(/nv-button--secondary/)
      await expect(drawer.getByText('Volgt live')).toHaveCount(0)
      await expect(drawer.getByText('Bezig…')).toHaveCount(0)
      await shot(page, 'opdracht-drawer-bevestigen')

      await open(page, 'Sites', 'Sites')
      const site = await drawerOf(page, 'voorbeeld-site')
      for (const action of ['Gezondheid checken', 'Malware scannen', 'Bijwerken', 'Smoketest draaien'])
        await expect(site.getByRole('group', { name: action })).toBeInViewport()
      await shot(page, 'site-drawer-acties-boven')
    } finally {
      await api.patch(`/api/rows/actie/${actie}`, { data: { status: 'geannuleerd' } })
    }
  })

  test('toggle-cell-fits @e2e: a switch cell holds its switch and its label in the column’s default width, no dot', async ({
    page,
  }) => {
    await open(page, 'Sites', 'Sites')
    const cells = page.getByRole('grid', { name: 'Sites', exact: true }).locator('.nv-cell__bool')
    expect(await cells.count()).toBeGreaterThan(0)
    const clipped = await cells.evaluateAll(
      (all) =>
        all.filter(
          (one) =>
            (one.closest('[role=gridcell]') as HTMLElement).scrollWidth >
            (one.closest('[role=gridcell]') as HTMLElement).clientWidth,
        ).length,
    )
    expect(clipped).toBe(0)
    await shot(page, 'sites-worker-kolommen')
  })

  test('title-pill-worst-first @e2e: Sites shows Storing before Let op, each with its count', async ({ page }) => {
    const api = page.request
    await open(page, 'Sites', 'Sites')
    const shown = (await rowsOf(api, 'site')).rows
    const held = (tone: string) => shown.filter((site) => site.gezondheid === tone).length
    expect(held('storing')).toBeGreaterThan(0)
    expect(held('let_op')).toBeGreaterThan(0)
    const pills = page.locator('.nv-toolbar__insight')
    await expect(pills).toHaveText([`Storing${held('storing')}`, `Let op${held('let_op')}`])
    await expect(pills.nth(0).locator('.nv-pill')).toHaveClass(/nv-pill--bad/)
    await expect(pills.nth(1).locator('.nv-pill')).toHaveClass(/nv-pill--warn/)
    await shot(page, 'sites-storing-en-let-op')

    // The pills follow the search, as the row count does: an In orde site leaves neither.
    const fine = shown.find((site) => site.gezondheid === 'ok') as Row
    await page.getByRole('searchbox').fill(String(fine.naam))
    await expect(page.getByText('1 rij', { exact: true }).first()).toBeVisible()
    await expect(pills).toHaveCount(0)
  })
})
