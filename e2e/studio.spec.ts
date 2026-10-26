import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { type APIRequestContext, expect, type Locator, type Page, type Route, request, test } from '@playwright/test'
import { STUDIO, STUDIO_SERVICE, STUDIO_WORKER, state } from './auth'
import { card, lane, orders } from './board'
import { offered, openTab, pressInMenu } from './drawer'
import { openLooks } from './editor'
import { forget } from './forget'
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

const asService = (token: string) =>
  request.newContext({
    baseURL: ENGINE,
    extraHTTPHeaders: { Authorization: `Bearer ${readFileSync(token, 'utf8').trim()}` },
  })

/** The studio worker's account: a real service token (kind service), straight to the engine, as the worker calls it. */
const worker = () => asService(STUDIO_WORKER)

/** Claude's account: a service too, but not the worker. */
const claude = () => asService(STUDIO_SERVICE)

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

/** Runs a selection action from the panel: its button, or its item behind Meer when it did not fit. */
async function pressInBar(page: Page, bar: Locator, label: string): Promise<void> {
  const button = bar.getByRole('button', { name: label, exact: true })
  if ((await button.count()) > 0) return button.click()
  await bar.getByRole('button', { name: 'Meer' }).click()
  await page.getByRole('menuitem', { name: label, exact: true }).click()
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
    await open(page, 'Sites met aandacht', 'Sites')
    await page.getByRole('checkbox', { name: 'testmans-bestel selecteren' }).check()
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
    await expect(drawer.getByRole('status').filter({ hasText: 'Volgt live' })).toBeVisible()
    await expect(drawer.getByRole('status').filter({ hasText: 'Volgt live' })).toHaveText('Volgt live')
    await expect(siteLine(drawer, 'oud-archief')).toContainText('Niet meer in de registry')
    await expect(siteLine(drawer, 'oud-archief')).toContainText('Overgeslagen')
    await expect(siteLine(drawer, 'testmans-bestel')).toContainText('Niet gestart')
    await expect(page.getByRole('region', { name: /geselecteerd/ })).toHaveCount(0)
    await shot(page, 'opdracht-drawer-live')

    const actie = await newest(api, 'actie')
    expect(actie).toBe(before + 1)
    expect(await rowOf(api, 'actie', actie)).toMatchObject({ soort: 'gezondheidscheck', status: 'aangevraagd' })
    const links = (await rowsOf(api, 'actie_site', { actie_id: actie })).rows
    expect(links.map((l) => [l.site_id, l.state, l.resultaat]).sort()).toEqual([
      [2, 'wacht', null],
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
    // Nine actions wrap onto a second line; the panel stays a low strip, never a tall block.
    expect((await panel.boundingBox())?.height).toBeLessThan((button?.height ?? 0) * 2 + 28)
    await page.mouse.move(0, 0)
    const lineOf = () =>
      page
        .locator('th.nv-th:not(.nv-num)')
        .first()
        .evaluate((el) => getComputedStyle(el).borderRightColor)
    await expect.poll(() => lineOf()).toBe('color(srgb 0.14902 0.156863 0.172549 / 0.6)')
    await shot(page, 'sites-panel-lines-dark')
    await page.emulateMedia({ colorScheme: 'light' })
    await expect.poll(() => lineOf()).toBe('color(srgb 0.913725 0.92549 0.941176 / 0.6)')
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
      // The opdracht's drawer, opened by Bijwerken, offers Bevestigen itself: the dock line waits until it closes.
      const drawer = page.getByRole('complementary', { name: 'Bijwerken · voorbeeld-site' })
      await expect(drawer.getByRole('button', { name: 'Bevestigen' })).toBeVisible({ timeout: 15_000 })
      await expect(waiting).toHaveCount(0)
      await drawer.getByRole('button', { name: 'Sluiten' }).click()
      await expect(waiting).toBeVisible()
      // The dock floats above the table's pinned total, over the empty end space.
      const room = await page.evaluate(() => ({
        dock: (document.querySelector('.nv-dock') as HTMLElement).getBoundingClientRect().bottom,
        foot: (document.querySelector('tfoot') as HTMLElement).getBoundingClientRect().top,
      }))
      expect(room.dock).toBeLessThanOrEqual(room.foot)

      await shot(page, 'opdracht-wacht-in-dock')

      // From a board, which takes no request to open a record, the link still shows it: in the opdrachten's own table.
      await openView(page, 'Opdrachten per status', 'Opdrachten')
      await expect(page.locator('.nv-board')).toBeVisible()
      await waiting.click()
      await expect(page.getByRole('complementary', { name: /Bijwerken/ })).toBeVisible()
      await expect(waiting).toHaveCount(0)
      await expect(page.getByRole('heading', { level: 1 })).toHaveText('Opdrachten')
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
    await open(page, 'Sites met aandacht', 'Sites')
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
    await drawerOf(page, 'voorbeeld-site')
    expect(await offered(page)).toContain('Gezondheid checken')

    await pressInMenu(page, 'Smoketest draaien')

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
    await expect.poll(() => offered(page)).toContain('Annuleren')
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

  test('agenda-month-full-day @e2e: a full day keeps its cell, the rest behind +N meer; every week row is as tall as the others', async ({
    page,
  }) => {
    const api = page.request
    const ids: number[] = []
    try {
      for (let at = 1; at <= 12; at++) {
        const made = await api.post('/api/rows/agendapunt', { data: { titel: `e2e drukke dag ${at}`, datum: today() } })
        expect(made.status(), await made.text()).toBe(201)
        ids.push(((await made.json()) as { id: number }).id)
      }
      await open(page, 'Agenda', 'Agenda')
      await page.getByRole('radiogroup', { name: 'Periode' }).getByRole('radio', { name: 'Maand' }).click()
      const cell = page.locator('table.nv-cal--month td.nv-cal__today')
      const more = cell.getByRole('button', { name: /^\+\d+ meer$/ })
      // Every week as tall as the others, the month inside the body, the count wholly inside its day.
      const fits = async () => {
        await expect(more).toBeVisible()
        const heights = await page
          .locator('table.nv-cal--month tbody tr')
          .evaluateAll((rows) => rows.map((r) => Math.round(r.getBoundingClientRect().height)))
        expect(Math.max(...heights) - Math.min(...heights)).toBeLessThanOrEqual(1)
        const body = await page.locator('.nv-cal__body--month').boundingBox()
        const table = await page.locator('table.nv-cal--month').boundingBox()
        expect(table && body && table.y + table.height <= body.y + body.height + 1).toBe(true)
        const day = await cell.boundingBox()
        const line = await more.boundingBox()
        expect(day && line && line.y + line.height <= day.y + day.height).toBe(true)
      }
      await fits()
      const groep = page.getByRole('button', { name: /^Groep: / })
      await groep.click()
      await page.getByRole('dialog', { name: 'Groeperen' }).getByRole('button', { name: 'Organisatie' }).click()
      await expect(page.getByRole('list', { name: 'Rijen' })).toBeVisible()
      await fits()
      await groep.click()
      await page.getByRole('dialog', { name: 'Groeperen' }).getByRole('button', { name: 'Geen' }).click()
      await expect(page.getByRole('list', { name: 'Rijen' })).toHaveCount(0)
      await shot(page, 'agenda-maand-vol')
      await more.click()
      const day = page.getByRole('dialog')
      for (let at = 1; at <= 12; at++)
        await expect(day.getByRole('button', { name: `e2e drukke dag ${at}`, exact: true })).toBeVisible()
      await shot(page, 'agenda-maand-dag')
      await day.getByRole('button', { name: 'e2e drukke dag 12', exact: true }).click()
      await expect(page.getByRole('dialog')).toHaveCount(0)
      await expect(page.getByRole('complementary', { name: 'e2e drukke dag 12' })).toBeVisible()
    } finally {
      for (const id of ids) await api.delete(`/api/rows/agendapunt/${id}`)
    }
  })

  test('rail-count-at-the-edge @e2e: the count sits at the right edge of its rail line and gives way to its tools on hover', async ({
    page,
  }) => {
    await page.goto('/')
    const row = page.locator('.nv-model').filter({ has: page.getByRole('button', { name: 'Taken', exact: true }) })
    const count = row.locator('.nv-model__count')
    await expect(count).toBeVisible()
    const edge = await row.boundingBox()
    const at = await count.boundingBox()
    expect(edge && at && edge.x + edge.width - (at.x + at.width)).toBeLessThanOrEqual(12)
    await row.hover()
    await expect(count).toHaveCount(0)
    await expect(row.getByRole('button', { name: 'Meer voor Taken' })).toBeVisible()
  })

  test('dashboard-week-full-day @e2e: the dashboard week holds a few rows per day, the rest behind +N meer, and a full day leaves the tile as tall as a quiet one', async ({
    page,
  }) => {
    const api = page.request
    await landing(page)
    const week = tile(page, 'Agenda')
    await expect(week.locator('.nv-week-tile__bar').first()).toBeVisible()
    const quiet = (await week.boundingBox())?.height ?? 0
    const ids: number[] = []
    const add = async (at: number) => {
      const made = await api.post('/api/rows/agendapunt', { data: { titel: `e2e volle week ${at}`, datum: today() } })
      expect(made.status(), await made.text()).toBe(201)
      ids.push(((await made.json()) as { id: number }).id)
    }
    try {
      for (let at = 1; at <= 12; at++) await add(at)
      await landing(page)
      const day = week.getByRole('group', { current: 'date' })
      const more = day.getByRole('button', { name: /^\+\d+ meer$/ })
      await expect(more).toBeVisible()
      const busy = (await week.boundingBox())?.height ?? 0
      expect(Math.abs(busy - quiet)).toBeLessThanOrEqual(1)
      const hidden = Number((await more.textContent())?.match(/\d+/)?.[0])
      await add(13)
      await landing(page)
      await expect(day.getByRole('button', { name: `+${hidden + 1} meer` })).toBeVisible()
      expect(Math.abs(((await week.boundingBox())?.height ?? 0) - busy)).toBeLessThanOrEqual(1)
      await shot(page, 'dashboard-week-vol')
      await more.click()
      const all = page.getByRole('dialog')
      for (let at = 1; at <= 12; at++)
        await expect(all.getByRole('button', { name: `e2e volle week ${at}`, exact: true })).toBeVisible()
      await shot(page, 'dashboard-week-dag')
      await all.getByRole('button', { name: 'e2e volle week 12', exact: true }).click()
      await expect(page.getByRole('dialog')).toHaveCount(0)
      await expect(page.getByRole('complementary', { name: 'e2e volle week 12' })).toBeVisible()
    } finally {
      for (const id of ids) await api.delete(`/api/rows/agendapunt/${id}`)
    }
  })

  test('drawer-line-wraps @e2e: a site line with a long path wraps inside the opdracht drawer, nothing scrolls sideways', async ({
    page,
  }) => {
    const api = page.request
    const site = (await rowsOf(api, 'site', { naam: 'testmans-winkel' })).rows[0]
    const made = await run(api, 'malwarescan', [site.id])
    try {
      const service = await worker()
      const long = `Map mu-plugins ligt niet binnen de site (/data/sites/web/${'sintpieterscollegebrussels'.repeat(3)}/www/./wp-content/mu-plugins)`
      const patched = await service.patch(`/api/rows/actie_site/${made.links[0]}`, {
        data: { state: 'overgeslagen', samenvatting: long, resultaat: long, expect: { state: 'wacht' } },
      })
      expect(patched.status(), await patched.text()).toBe(200)
      await service.dispose()
      const title = (await rowOf(api, 'actie', made.actie)).titel as string
      await open(page, 'Opdrachten', 'Opdrachten')
      const drawer = await drawerOf(page, title)
      await expect(siteLine(drawer, 'testmans-winkel')).toContainText('wp-content/mu-plugins')
      const edge = await drawer.boundingBox()
      const line = await siteLine(drawer, 'testmans-winkel').boundingBox()
      expect(edge && line && line.x + line.width <= edge.x + edge.width).toBe(true)
      // No box in the drawer scrolls sideways; a title cut with an ellipsis is fine.
      const scrolls = await drawer.evaluate(
        (el) =>
          [el, ...el.querySelectorAll('*')].filter(
            (n) => ['auto', 'scroll'].includes(getComputedStyle(n).overflowX) && n.scrollWidth > n.clientWidth + 1,
          ).length,
      )
      expect(scrolls).toBe(0)
      await shot(page, 'opdracht-lange-regel')
    } finally {
      await api.delete(`/api/rows/actie/${made.actie}`)
    }
  })

  test('drawer-site-line-room @e2e: a site line keeps its state chip on the name’s line and its detail below at the line’s full width', async ({
    page,
  }) => {
    const api = page.request
    const site = (await rowsOf(api, 'site', { naam: 'testmans-winkel' })).rows[0]
    const made = await run(api, 'malwarescan', [site.id])
    try {
      const service = await worker()
      const long = 'Map mu-plugins ligt niet binnen de site, de scan sloeg deze site daarom over en schreef niets weg'
      const patched = await service.patch(`/api/rows/actie_site/${made.links[0]}`, {
        data: { state: 'overgeslagen', samenvatting: long, resultaat: long, expect: { state: 'wacht' } },
      })
      expect(patched.status(), await patched.text()).toBe(200)
      await service.dispose()
      const title = (await rowOf(api, 'actie', made.actie)).titel as string
      await open(page, 'Opdrachten', 'Opdrachten')
      const drawer = await drawerOf(page, title)
      const line = siteLine(drawer, 'testmans-winkel')
      const name = line.getByText('testmans-winkel', { exact: true })
      const chip = line.locator('.nv-pill')
      const detail = line.getByText(long)
      await expect(chip).toHaveText('Overgeslagen')
      const [n, c, d] = await Promise.all([name.boundingBox(), chip.boundingBox(), detail.boundingBox()])
      if (!n || !c || !d) throw new Error('a part of the site line has no box')
      // The chip shares the name's line; the detail starts under the name and runs on under the chip.
      expect(Math.abs(c.y + c.height / 2 - (n.y + n.height / 2))).toBeLessThan(4)
      expect(d.y).toBeGreaterThanOrEqual(n.y + n.height - 1)
      expect(d.x + d.width).toBeGreaterThan(c.x + c.width / 2)
      for (const scheme of ['light', 'dark'] as const) {
        await page.emulateMedia({ colorScheme: scheme })
        await shot(page, `opdracht-regel-chip-${scheme}`)
      }
    } finally {
      await page.emulateMedia({ colorScheme: 'light' })
      await api.delete(`/api/rows/actie/${made.actie}`)
    }
  })

  test('drawer-site-line-buttons-centred @e2e: a site line with its own buttons keeps the name and the button labels on one centre line', async ({
    page,
  }) => {
    const api = page.request
    const { actie } = await preview(api, [3])
    try {
      await open(page, 'Opdrachten', 'Opdrachten')
      const drawer = await drawerOf(page, 'Bijwerken · voorbeeld-site')
      const line = siteLine(drawer, 'voorbeeld-site')
      const button = line.getByRole('button', { name: 'Niet nu' })
      await expect(button).toBeVisible()
      // The text's own box, not its element's: a stretched grid cell has its centre wherever its text is not.
      const middle = (el: Element) => {
        const text = [el, ...el.querySelectorAll('*')]
          .flatMap((n) => [...n.childNodes])
          .find((c) => c.nodeType === 3 && c.textContent?.trim())
        const range = document.createRange()
        if (text) range.selectNodeContents(text)
        const r = range.getBoundingClientRect()
        return r.y + r.height / 2
      }
      const name = await line.getByText('voorbeeld-site', { exact: true }).evaluate(middle)
      const label = await button.evaluate(middle)
      expect(Math.abs(name - label)).toBeLessThanOrEqual(2)
      await shot(page, 'opdracht-regel-knoppen')
    } finally {
      await api.patch(`/api/rows/actie/${actie}`, { data: { status: 'geannuleerd' } })
    }
  })

  test('drawer-busy-line @e2e: a live drawer shows a thin line along its head’s foot, says Volgt live only to a reader, and leaves the head row to the title and tools', async ({
    page,
  }) => {
    const api = page.request
    const before = await newest(api, 'actie')
    await open(page, 'Sites', 'Sites')
    await page.getByRole('checkbox', { name: 'testmans-winkel selecteren' }).check()
    await page
      .getByRole('region', { name: '1 geselecteerd' })
      .getByRole('button', { name: 'Gezondheid checken', exact: true })
      .click()
    const actie = () => newest(api, 'actie')
    await expect.poll(actie).toBeGreaterThan(before)
    try {
      const drawer = page.getByRole('complementary', { name: 'Gezondheidscheck · testmans-winkel' })
      await expect(drawer).toBeVisible()
      const status = drawer.getByRole('status').filter({ hasText: 'Volgt live' })
      await expect(status).toHaveText('Volgt live')
      expect((await drawer.getByText('Volgt live').boundingBox())?.width ?? 0).toBeLessThanOrEqual(1)
      const head = await drawer.locator('.nv-drawer__head').boundingBox()
      const line = await status.boundingBox()
      if (!head || !line) throw new Error('the head or its busy line has no box')
      expect(line.height).toBeLessThanOrEqual(3)
      expect(Math.abs(line.y + line.height - (head.y + head.height))).toBeLessThanOrEqual(2)
      expect(line.width).toBeGreaterThan(head.width - 2)
      for (const scheme of ['light', 'dark'] as const) {
        await page.emulateMedia({ colorScheme: scheme })
        await shot(page, `opdracht-volgt-live-${scheme}`)
      }
    } finally {
      await page.emulateMedia({ colorScheme: 'light' })
      await api.delete(`/api/rows/actie/${await actie()}`)
    }
  })

  test('selection-bar-one-line @e2e: one ticked site shows the panel on one line, the actions that do not fit behind Meer, and Selectie wissen at the right edge', async ({
    page,
  }) => {
    await open(page, 'Sites', 'Sites')
    await page.getByRole('checkbox', { name: 'testmans-winkel selecteren' }).check()
    const bar = page.getByRole('region', { name: '1 geselecteerd' })
    await expect(bar).toBeVisible()
    const clear = bar.getByRole('button', { name: 'Selectie wissen' })
    const [panel, wissen] = await Promise.all([bar.boundingBox(), clear.boundingBox()])
    if (!panel || !wissen) throw new Error('the panel or Selectie wissen has no box')
    expect(panel.height).toBeLessThan(wissen.height + 24)
    expect(panel.x + panel.width - (wissen.x + wissen.width)).toBeLessThan(24)
    const shown = await bar.locator('.nv-selection__item').count()
    const more = bar.getByRole('button', { name: 'Meer' })
    const folded = (await more.count()) > 0
    for (const scheme of ['light', 'dark'] as const) {
      await page.emulateMedia({ colorScheme: scheme })
      await shot(page, `selectie-een-regel-${scheme}`)
    }
    await page.emulateMedia({ colorScheme: 'light' })
    expect(folded).toBe(true)
    await more.click()
    const items = await page.getByRole('menuitem').allTextContents()
    expect(shown + items.length).toBe(9)
    await page.keyboard.press('Escape')
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
    await expect.poll(() => offered(page)).toContain('Annuleren')
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
    await pressInMenu(page, 'Annuleren')
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
    await drawerOf(page, 'Malwarescan · voorbeeld-site')
    await pressInMenu(page, 'Verwijderen')
    await page.getByRole('button', { name: 'Zeker?' }).click()
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

    test(`row-lines-at-${tag} @e2e: a table row’s separator is the row-line token, apart from the subtle border`, async ({
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
      expect(line).toBe('rgb(233, 236, 240)')
      expect(row.trim()).toBe('#e9ecf0')
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

  test('drawer-reads-right @e2e: Bevestigen is the filled button in the action row with Annuleren beside it, no live mark shows while it waits on Bevestigen, and a site’s actions sit in its row', async ({
    page,
  }) => {
    const api = page.request
    const { actie } = await preview(api, [3])
    try {
      await open(page, 'Opdrachten', 'Opdrachten')
      const drawer = await drawerOf(page, 'Bijwerken · voorbeeld-site')
      await expect(drawer.getByRole('button', { name: 'Bevestigen' })).toHaveClass(/nv-button--primary/)
      await expect.poll(() => offered(page)).toContain('Annuleren')
      await expect(drawer.getByText('Volgt live')).toHaveCount(0)
      await expect(drawer.getByText('Bezig…')).toHaveCount(0)
      await shot(page, 'opdracht-drawer-bevestigen')

      await open(page, 'Sites', 'Sites')
      const site = await drawerOf(page, 'voorbeeld-site')
      await expect(site.locator('.nv-dw-actions__row')).toBeInViewport()
      expect(await offered(page)).toEqual(
        expect.arrayContaining(['Gezondheid checken', 'Malware scannen', 'Bijwerken', 'Smoketest draaien']),
      )
      await shot(page, 'site-drawer-acties-boven')
    } finally {
      await api.patch(`/api/rows/actie/${actie}`, { data: { status: 'geannuleerd' } })
    }
  })

  test('confirm-from-the-row @e2e: an opdracht waiting on Bevestigen shows it as a filled button under Sites, Annuleren beside it, nothing of either in the head, in light and dark', async ({
    page,
  }) => {
    const api = page.request
    const { actie } = await preview(api, [3])
    try {
      await open(page, 'Opdrachten', 'Opdrachten')
      const drawer = await drawerOf(page, 'Bijwerken · voorbeeld-site')
      const sites = drawer.getByRole('region', { name: /Sites/ })
      const row = drawer.locator('.nv-dw-actions__row')
      const confirm = row.getByRole('button', { name: 'Bevestigen' })
      await expect(confirm).toBeVisible()
      await expect(confirm).toHaveClass(/nv-button--primary/)
      await expect(row.getByRole('button', { name: 'Annuleren' })).not.toHaveClass(/nv-button--primary/)
      const [above, under] = [await sites.boundingBox(), await row.boundingBox()]
      expect(under?.y ?? 0).toBeGreaterThanOrEqual((above?.y ?? 0) + (above?.height ?? 0) - 1)
      expect((await confirm.boundingBox())?.x ?? 0, 'Bevestigen comes first').toBeLessThan(
        (await row.getByRole('button', { name: 'Annuleren' }).boundingBox())?.x ?? 0,
      )
      await expect(
        drawer.locator('.nv-drawer__head').getByRole('button', { name: /Bevestigen|Annuleren/ }),
      ).toHaveCount(0)
      await expect(page.getByRole('menu')).toHaveCount(0)
      for (const scheme of ['light', 'dark'] as const) {
        await page.emulateMedia({ colorScheme: scheme })
        await shot(page, `opdracht-rij-${scheme === 'light' ? 'licht' : 'donker'}`)
      }
    } finally {
      await api.patch(`/api/rows/actie/${actie}`, { data: { status: 'geannuleerd' } })
    }
  })

  test('site-actions-in-the-row @e2e: a site’s actions are one line in its drawer without horizontal overflow, at 392px and widened, and what does not fit is behind Meer', async ({
    page,
  }) => {
    await open(page, 'Sites', 'Sites')
    const site = await drawerOf(page, 'voorbeeld-site')
    const row = site.locator('.nv-dw-actions__row')
    const oneLine = async () => {
      const middles = await row
        .locator(':scope > *')
        .evaluateAll((els) => els.map((el) => el.getBoundingClientRect().top + el.getBoundingClientRect().height / 2))
      expect(Math.max(...middles) - Math.min(...middles), 'one line').toBeLessThan(3)
      expect(await row.evaluate((el) => el.scrollWidth <= el.clientWidth), 'no overflow').toBe(true)
      expect(
        await site.locator('.nv-dw-body').evaluate((el) => el.scrollWidth <= el.clientWidth),
        'no body overflow',
      ).toBe(true)
    }
    const all = [
      'Gezondheid checken',
      'Malware scannen',
      'Bijwerken',
      'Smoketest draaien',
      'Studio-plugin installeren',
      'Cache legen',
      'Cron draaien',
      'Onderhoudsmodus aan',
      'Onderhoudsmodus uit',
    ]

    await oneLine()
    expect(Math.abs(((await site.boundingBox())?.width ?? 0) - 392)).toBeLessThanOrEqual(2)
    await expect(row.getByRole('button', { name: 'Meer' })).toHaveCount(1)
    expect(await offered(page)).toEqual(all)
    const inline = () => row.locator(':scope > .nv-button').count()
    const narrow = await inline()
    for (const scheme of ['light', 'dark'] as const) {
      await page.emulateMedia({ colorScheme: scheme })
      await shot(page, `site-rij-${scheme === 'light' ? 'licht' : 'donker'}`)
    }

    await site.getByRole('button', { name: 'Volledig openen' }).click()
    await expect.poll(async () => (await site.boundingBox())?.width ?? 0).toBeGreaterThan(392)
    await oneLine()
    // Nine actions no longer all fit even widened: more sit in the row than at 392, the rest stay behind Meer.
    expect(await inline()).toBeGreaterThan(narrow)
    expect(await offered(page)).toEqual(all)
    for (const scheme of ['light', 'dark'] as const) {
      await page.emulateMedia({ colorScheme: scheme })
      await shot(page, `site-rij-breed-${scheme === 'light' ? 'licht' : 'donker'}`)
    }
  })

  test('open-the-address @e2e: a site’s drawer head opens its address in a new tab, first of its tools; a site without one shows no icon; no person may rewrite it', async ({
    page,
    browser,
  }) => {
    const ADDRESS = 'https://voorbeeld-site.test/'
    const service = await worker()
    const bare = (await (await service.post('/api/rows/site', { data: { naam: 'e2e-zonder-adres' } })).json()) as Row
    const editor = await browser.newContext({ storageState: state('studio-editor') })
    try {
      await open(page, 'Sites', 'Sites')
      const site = await drawerOf(page, 'voorbeeld-site')
      const head = site.locator('.nv-drawer__head')
      const link = head.getByRole('link', { name: 'Openen in nieuw tabblad' })
      await expect(link).toBeVisible()
      await expect(link).toHaveAttribute('href', ADDRESS)
      await expect(link).toHaveAttribute('target', '_blank')
      await expect(link).toHaveAttribute('rel', 'noopener noreferrer')
      // A site has no record link and no delete, so no ⋮: the icon leads the head's tools, before widen.
      await expect(head.getByRole('button', { name: 'Acties' })).toHaveCount(0)
      const [icon, widen] = [
        await link.boundingBox(),
        await head.getByRole('button', { name: 'Volledig openen' }).boundingBox(),
      ]
      expect((icon?.x ?? 0) + (icon?.width ?? 0), 'the icon sits before widen').toBeLessThanOrEqual(widen?.x ?? 0)
      for (const scheme of ['light', 'dark'] as const) {
        await page.emulateMedia({ colorScheme: scheme })
        await shot(page, `site-adres-icoon-${scheme === 'light' ? 'licht' : 'donker'}`)
        if (process.env.SHAKEOUT_SHOTS)
          await head.screenshot({
            path: `${process.env.SHAKEOUT_SHOTS}/site-adres-icoon-kop-${scheme === 'light' ? 'licht' : 'donker'}.png`,
          })
      }

      // The .test host never resolves: the new tab's request is caught and refused, nothing leaves the machine.
      let requested = ''
      await page.context().route(/voorbeeld-site\.test/, (route) => {
        requested = route.request().url()
        return route.abort()
      })
      const [tab] = await Promise.all([page.context().waitForEvent('page'), link.click()])
      await expect.poll(() => requested).toBe(ADDRESS)
      expect(page.context().pages()).toContain(tab)
      await tab.close()
      await expect(site).toBeVisible()

      await open(page, 'Sites', 'Sites')
      const without = await drawerOf(page, 'e2e-zonder-adres')
      await expect(without.getByRole('button', { name: 'Volledig openen' })).toBeVisible()
      await expect(without.getByRole('link', { name: 'Openen in nieuw tabblad' })).toHaveCount(0)

      for (const [who, api] of [
        ['administrator', page.request],
        ['editor', editor.request],
      ] as const) {
        const refused = await api.patch(`${STUDIO.app}/api/rows/site/3`, { data: { adres: 'https://nep-site.test' } })
        expect({ who, status: refused.status(), code: ((await refused.json()) as Values).code }).toEqual({
          who,
          status: 403,
          code: 'service_only',
        })
      }
      expect((await rowOf(page.request, 'site', 3)).adres).toBe('https://voorbeeld-site.test')
    } finally {
      await page.context().unrouteAll()
      forget(STUDIO, 'site', [bare.id])
      await service.dispose()
      await editor.close()
    }
  })

  test('toolbar-at-1280 @e2e: with a drawer open at 1280 px the toolbar keeps its one row', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 })
    await open(page, 'Sites', 'Sites')
    const toolbar = page.locator('.nv-toolbar')
    const alone = (await toolbar.boundingBox())?.height
    await shot(page, 'toolbar-1280-alone')
    await page
      .getByRole('row')
      .filter({ has: page.getByRole('checkbox', { name: 'testmans-winkel selecteren' }) })
      .getByRole('button', { name: 'Openen' })
      .click()
    await expect(page.getByRole('complementary', { name: 'testmans-winkel' })).toBeVisible()
    await shot(page, 'toolbar-1280-drawer')
    expect((await toolbar.boundingBox())?.height).toBe(alone)
    await page.keyboard.press('Control+k')
    await expect(page.getByRole('searchbox', { name: 'Zoeken' })).toBeFocused()
  })

  test('delete-a-seeded-view @e2e: an administrator deletes a seeded view, the seed leaves it gone and drops its tile, and a restore brings both back', async ({
    page,
  }) => {
    const api = page.request
    const views = async () =>
      ((await (await api.get('/api/views')).json()) as { views: { id: number; name: string; editable: boolean }[] })
        .views
    const seeded = (await views()).find((v) => v.name === 'Storing')
    expect(seeded?.editable, 'a seeded view the administrator may change').toBe(true)
    const seed = () =>
      execFileSync(
        'bun',
        [
          'packages/engine/src/serve.ts',
          '--domain',
          '@worktable/studio',
          '--db',
          'e2e/.tmp/studio.db',
          '--seed-missing',
        ],
        { cwd: process.cwd(), encoding: 'utf8' },
      )
    const inRail = page.getByRole('navigation', { name: 'Views' }).getByRole('button', { name: 'Storing', exact: true })
    try {
      await open(page, 'Sites', 'Sites')
      await expect(inRail).toHaveCount(1)
      await page.getByRole('button', { name: 'More actions: Storing' }).click()
      await page.getByRole('menuitem', { name: 'Verwijderen' }).click()
      await expect(inRail).toHaveCount(0)

      expect(seed()).toContain('deleted by a person, left alone')
      await landing(page)
      await expect(tile(page, 'Storing')).toHaveCount(0)
      await expect(
        page.getByRole('navigation', { name: 'Views' }).getByRole('button', { name: 'Storing', exact: true }),
      ).toHaveCount(0)
      await shot(page, 'overzicht-zonder-storing')

      const restored = await api.post(`/api/views/${seeded?.id}/restore`, { data: {} })
      expect(restored.status()).toBe(200)
      seed()
      await landing(page)
      await expect(tile(page, 'Storing')).toBeVisible()
    } finally {
      if (!(await views()).some((v) => v.name === 'Storing'))
        await api.post(`/api/views/${seeded?.id}/restore`, { data: {} })
      seed()
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

test.describe('views-and-actions, the shake-out', () => {
  const waitingLine = (page: Page) => page.getByRole('button', { name: 'Bijwerken · Voorbereid — openen' })

  /** A Bijwerken on voorbeeld-site requested from the Sites panel and prepared as the worker would: its line waits on Bevestigen. */
  async function waitingRun(page: Page): Promise<number> {
    const api = page.request
    await open(page, 'Sites', 'Sites')
    await page.getByRole('checkbox', { name: 'voorbeeld-site selecteren' }).check()
    await page
      .getByRole('region', { name: '1 geselecteerd' })
      .getByRole('button', { name: 'Bijwerken', exact: true })
      .click()
    await expect(page.getByRole('complementary', { name: 'Bijwerken · voorbeeld-site' })).toBeVisible()
    const actie = await newest(api, 'actie')
    await prepare({ actie, links: (await rowsOf(api, 'actie_site', { actie_id: actie })).rows.map((l) => l.id) })
    await closeWaitingDrawer(page)
    return actie
  }

  /** The opdracht's own drawer offers Bevestigen, so its dock line hides; closing the drawer brings the line back. */
  async function closeWaitingDrawer(page: Page): Promise<void> {
    const drawer = page.getByRole('complementary', { name: 'Bijwerken · voorbeeld-site' })
    await expect(drawer.getByRole('button', { name: 'Bevestigen' })).toBeVisible({ timeout: 15_000 })
    await expect(waitingLine(page)).toHaveCount(0)
    await drawer.getByRole('button', { name: 'Sluiten' }).click()
    await expect(waitingLine(page)).toBeVisible()
  }

  /** A prepared opdracht keeps its site lines and so cannot be deleted: it is cancelled, as Stefan would. */
  async function removeRun(page: Page, actie: number | undefined): Promise<void> {
    if (actie === undefined) return
    const api = page.request
    const cancelled = await api.patch(`/api/rows/actie/${actie}`, { data: { status: 'geannuleerd' } })
    expect(cancelled.status(), await cancelled.text()).toBe(200)
  }

  /** WCAG contrast of an element's text against the run line it sits on. */
  const contrastOn = (target: Locator) =>
    target.evaluate((el) => {
      const rgb = (css: string) => (css.match(/\d+(\.\d+)?/g) ?? []).slice(0, 3).map(Number)
      const lum = (css: string) => {
        const [r, g, b] = rgb(css).map((v) => {
          const c = v / 255
          return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
        })
        return 0.2126 * r + 0.7152 * g + 0.0722 * b
      }
      const line = el.closest('.nv-run') as HTMLElement
      const [fg, bg] = [getComputedStyle(el).color, getComputedStyle(line).backgroundColor]
      const [a, b] = [lum(fg), lum(bg)]
      return { ratio: (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05), fg, bg }
    })

  test('table-lines-in-both-themes @e2e: Sites lists only the sites in the registry, and every header and row cell shows its column line in dark and in light', async ({
    page,
  }) => {
    await open(page, 'Sites', 'Sites')
    await expect(page.locator('tbody tr.nv-tr')).toHaveText([
      /testmans-bestel/,
      /testmans-winkel/,
      /voorbeeld-blog/,
      /voorbeeld-site/,
    ])
    const lines = () =>
      page
        .locator('th.nv-th:not(.nv-num), tbody tr.nv-tr td.nv-td:not(.nv-num)')
        .evaluateAll((cells) => [
          ...new Set(
            cells.map((c) => `${getComputedStyle(c).borderRightColor} ${getComputedStyle(c).borderRightWidth}`),
          ),
        ])
    for (const [scheme, colour, name] of [
      ['dark', 'color(srgb 0.14902 0.156863 0.172549 / 0.6)', 'sites-kolomlijnen-donker'],
      ['light', 'color(srgb 0.913725 0.92549 0.941176 / 0.6)', 'sites-kolomlijnen-licht'],
    ] as const) {
      await page.emulateMedia({ colorScheme: scheme })
      await expect.poll(lines).toEqual([`${colour} 1px`])
      await shot(page, name)
    }
  })

  test('waiting-line-and-panel-leave-the-last-row @e2e: with a run waiting on Bevestigen and two sites ticked, the table scrolls its last row clear of the dock, with its total pinned below it', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 430 })
    let actie: number | undefined
    try {
      actie = await waitingRun(page)
      await expect(page.getByRole('complementary')).toHaveCount(0)
      await page.getByRole('checkbox', { name: 'testmans-bestel selecteren' }).check()
      await page.getByRole('checkbox', { name: 'testmans-winkel selecteren' }).check()
      const panel = page.getByRole('region', { name: '2 geselecteerd' })
      await expect(panel).toBeVisible()
      await expect(waitingLine(page)).toBeVisible()
      // The steady dock: the panel over the waiting line, once the request's toast has gone.
      await expect(page.locator('.nv-dock .nv-toast')).toHaveCount(0, { timeout: 15_000 })
      await page.locator('.nv-scroll').evaluate((el) => {
        el.scrollTop = el.scrollHeight
      })
      await page.emulateMedia({ colorScheme: 'dark' })
      await shot(page, 'wacht-en-selectie-onderaan-donker')
      await page.emulateMedia({ colorScheme: 'light' })
      await shot(page, 'wacht-en-selectie-onderaan-licht')

      const last = page.getByRole('row').filter({ hasText: 'voorbeeld-site' })
      const reached = await last.evaluate((row) => {
        const box = row.getBoundingClientRect()
        return row.contains(document.elementFromPoint(box.x + 200, box.y + box.height / 2))
      })
      expect(reached).toBe(true)
      const top = (await panel.boundingBox())?.y ?? 0
      const row = await last.boundingBox()
      expect((row?.y ?? 0) + (row?.height ?? 0), 'the last row ends above the panel').toBeLessThanOrEqual(top)
      const dock = await page.locator('.nv-dock').boundingBox()
      const foot = await page.locator('tfoot').boundingBox()
      expect((dock?.y ?? 0) + (dock?.height ?? 0), 'the total is pinned below the dock').toBeLessThanOrEqual(
        foot?.y ?? 0,
      )
    } finally {
      await removeRun(page, actie)
    }
  })

  test('tall-dock-leaves-the-last-row @e2e: with the selection panel over three waiting lines the table still scrolls its last row clear of the whole dock', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 480 })
    const api = page.request
    const made: number[] = []
    try {
      await open(page, 'Sites', 'Sites')
      for (const site of ['voorbeeld-site', 'voorbeeld-blog', 'testmans-bestel']) {
        await page.getByRole('checkbox', { name: `${site} selecteren` }).check()
        await page
          .getByRole('region', { name: '1 geselecteerd' })
          .getByRole('button', { name: 'Bijwerken', exact: true })
          .click()
        const drawer = page.getByRole('complementary', { name: `Bijwerken · ${site}` })
        await expect(drawer).toBeVisible()
        const actie = await newest(api, 'actie')
        made.push(actie)
        await prepare({ actie, links: (await rowsOf(api, 'actie_site', { actie_id: actie })).rows.map((l) => l.id) })
        await drawer.getByRole('button', { name: 'Sluiten' }).click()
        await expect(page.getByRole('complementary')).toHaveCount(0)
      }
      await page.getByRole('checkbox', { name: 'testmans-bestel selecteren' }).check()
      await page.getByRole('checkbox', { name: 'testmans-winkel selecteren' }).check()
      await expect(page.getByRole('region', { name: '2 geselecteerd' })).toBeVisible()
      await expect(page.locator('.nv-dock .nv-run')).toHaveCount(3, { timeout: 15_000 })
      await expect(page.locator('.nv-dock .nv-toast')).toHaveCount(0, { timeout: 15_000 })
      await page.locator('.nv-scroll').evaluate((el) => {
        el.scrollTop = el.scrollHeight
      })
      const dock = await page.locator('.nv-dock').boundingBox()
      const last = await page.locator('tbody tr.nv-tr').last().boundingBox()
      expect((last?.y ?? 0) + (last?.height ?? 0), 'the last row ends above the whole dock').toBeLessThanOrEqual(
        dock?.y ?? 0,
      )
      await shot(page, 'hoge-dock-laatste-rij')
    } finally {
      for (const actie of made) await removeRun(page, actie)
    }
  })

  test('waiting-line-reads-in-both-themes @e2e: the "— openen" link of a run waiting on Bevestigen reads against its line in dark and in light', async ({
    page,
  }) => {
    let actie: number | undefined
    try {
      actie = await waitingRun(page)
      for (const scheme of ['dark', 'light'] as const) {
        await page.emulateMedia({ colorScheme: scheme })
        // The theme fades its surfaces: read the colours once the line's transitions have run.
        await waitingLine(page).evaluate((el) =>
          Promise.all(
            [el, el.closest('.nv-run') as Element].flatMap((one) => one.getAnimations()).map((done) => done.finished),
          ),
        )
        const read = await contrastOn(waitingLine(page))
        expect(read.ratio, `contrast in ${scheme}: ${read.fg} on ${read.bg}`).toBeGreaterThanOrEqual(4.5)
      }
    } finally {
      await removeRun(page, actie)
    }
  })

  test('dock-link-from-the-board @e2e: on Opdrachten per status, the waiting line’s link opens the opdracht in its table', async ({
    page,
  }) => {
    let actie: number | undefined
    try {
      actie = await waitingRun(page)
      await page.emulateMedia({ colorScheme: 'dark' })
      await openView(page, 'Opdrachten per status', 'Opdrachten')
      await expect(page.locator('.nv-board')).toBeVisible()
      await expect(page.getByRole('complementary')).toHaveCount(0)
      await shot(page, 'bord-dock-openen-voor')
      await waitingLine(page).click()
      await expect(page.getByRole('heading', { level: 1 })).toHaveText('Opdrachten')
      await expect(page.getByRole('complementary', { name: 'Bijwerken · voorbeeld-site' })).toBeVisible()
      await expect(waitingLine(page)).toHaveCount(0)
      await shot(page, 'bord-dock-openen-na')
    } finally {
      await removeRun(page, actie)
    }
  })

  test('actions-row-by-keyboard @e2e: a site’s action row is walked with Tab, Meer opens on Enter, arrows walk it, Escape closes it back onto Meer and a second Escape closes the drawer', async ({
    page,
  }) => {
    await open(page, 'Sites', 'Sites')
    await page.getByRole('row').filter({ hasText: 'voorbeeld-site' }).getByRole('button', { name: 'Openen' }).click()
    const drawer = page.getByRole('complementary', { name: 'voorbeeld-site' })
    await expect(drawer).toBeVisible()
    const row = drawer.locator('.nv-dw-actions__row')
    const more = row.getByRole('button', { name: 'Meer' })
    await row.getByRole('button', { name: 'Gezondheid checken' }).focus()
    await page.keyboard.press('Tab')
    await expect(row.getByRole('button', { name: 'Malware scannen' })).toBeFocused()
    await more.focus()
    await page.keyboard.press('Enter')
    const menu = page.getByRole('menu', { name: 'Meer' })
    const folded = menu.getByRole('menuitem')
    await expect(folded.first()).toBeFocused()
    await page.keyboard.press('ArrowDown')
    await expect(folded.nth(1)).toBeFocused()
    await shot(page, 'site-acties-toetsen')
    await page.keyboard.press('Escape')
    await expect(menu).toHaveCount(0)
    await expect(more).toBeFocused()
    await expect(drawer).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(drawer).toHaveCount(0)
  })

  test('delete-asks-twice @e2e: Verwijderen in a task’s Acties asks Zeker?, Escape keeps the task, the second press deletes it', async ({
    page,
  }) => {
    const api = page.request
    const made = (await (
      await api.post('/api/rows/taak', { data: { titel: 'e2e verwijderen', deadline: today() } })
    ).json()) as Row
    try {
      await open(page, 'Taken', 'Taken')
      const drawer = await drawerOf(page, 'e2e verwijderen')
      await pressInMenu(page, 'Verwijderen')
      const sure = page.getByRole('dialog', { name: 'Verwijderen' }).getByRole('button', { name: 'Zeker?' })
      await expect(sure).toBeVisible()
      await shot(page, 'taak-verwijderen-zeker')
      await page.keyboard.press('Escape')
      await expect(sure).toHaveCount(0)
      await expect(drawer).toBeVisible()
      expect(await exists(api, 'taak', made.id)).toBe(true)

      await pressInMenu(page, 'Verwijderen')
      await sure.click()
      await expect.poll(() => exists(api, 'taak', made.id)).toBe(false)
      await expect(drawer).toHaveCount(0)
    } finally {
      if (await exists(api, 'taak', made.id)) await api.delete(`/api/rows/taak/${made.id}`)
    }
  })

  test('seeded-view-menu-by-role @e2e: an administrator renames a seeded view from the rail; an editor is offered only a copy', async ({
    page,
    browser,
  }) => {
    const api = page.request
    const viewsOf = async (on: Api) =>
      ((await (await on.get('/api/views')).json()) as { views: { id: number; name: string }[] }).views
    const id = (await viewsOf(api)).find((v) => v.name === 'SLA-sites')?.id as number
    const rail = (on: Page, name: string) =>
      on.getByRole('navigation', { name: 'Views' }).getByRole('button', { name, exact: true })
    try {
      await open(page, 'Sites', 'Sites')
      await page.getByRole('button', { name: 'More actions: SLA-sites', exact: true }).click()
      await expect(page.getByRole('menuitem')).toHaveText(['Kopie maken', 'Naam wijzigen', 'Verwijderen'])
      await shot(page, 'rail-menu-beheerder')
      await page.getByRole('menuitem', { name: 'Naam wijzigen' }).click()
      await page.getByRole('textbox', { name: 'Nieuwe naam' }).fill('SLA-klanten')
      await page.getByRole('textbox', { name: 'Nieuwe naam' }).press('Enter')
      await expect(rail(page, 'SLA-klanten')).toHaveCount(1)
      await expect.poll(async () => (await viewsOf(api)).find((v) => v.id === id)?.name).toBe('SLA-klanten')

      const editor = await browser.newContext({
        storageState: state('studio-editor'),
        viewport: { width: 1440, height: 900 },
      })
      const other = await editor.newPage()
      await other.goto(STUDIO.app)
      await openView(other, 'Sites', 'Sites')
      await expect(rail(other, 'SLA-klanten')).toHaveCount(1)
      await other.getByRole('button', { name: 'More actions: SLA-klanten', exact: true }).click()
      await expect(other.getByRole('menuitem')).toHaveText(['Kopie maken'])
      await shot(other, 'rail-menu-redacteur')
      await editor.close()
    } finally {
      await api.patch(`/api/views/${id}`, { data: { name: 'SLA-sites' } })
    }
  })

  test('null-boolean-reads-blank @e2e: a site whose SLA was never given shows a blank cell, no switch and no Nee, and Space sets it', async ({
    page,
  }) => {
    const api = page.request
    expect((await api.patch('/api/rows/site/1', { data: { sla: null } })).status()).toBe(200)
    try {
      await open(page, 'Sites', 'Sites')
      const row = page.getByRole('row').filter({ hasText: 'testmans-winkel' })
      const blank = row.locator('.nv-cell__bool--blank')
      await expect(blank).toHaveCount(1)
      const cell = row.getByRole('gridcell').filter({ has: page.locator('.nv-cell__bool--blank') })
      await expect(cell).toHaveText('')
      await expect(cell.getByRole('switch')).toHaveCount(0)
      await shot(page, 'sla-leeg')
      // By keyboard: a click on the blank cell already sets it (null-boolean-by-mouse).
      await row.getByRole('gridcell').filter({ hasText: 'Bakkerij' }).click()
      await page.keyboard.press('ArrowRight')
      await page.keyboard.press(' ')
      await expect.poll(async () => (await rowOf(api, 'site', 1)).sla).toBe(true)
      await expect(row.getByRole('switch', { name: 'SLA' })).toBeChecked()
    } finally {
      await api.patch('/api/rows/site/1', { data: { sla: true } })
    }
  })

  test('null-boolean-by-mouse @e2e: a click on a site’s blank SLA cell gives it its first value, as Space does', async ({
    page,
  }) => {
    const api = page.request
    expect((await api.patch('/api/rows/site/1', { data: { sla: null } })).status()).toBe(200)
    try {
      await open(page, 'Sites', 'Sites')
      const row = page.getByRole('row').filter({ hasText: 'testmans-winkel' })
      await row
        .getByRole('gridcell')
        .filter({ has: page.locator('.nv-cell__bool--blank') })
        .click()
      await expect.poll(async () => (await rowOf(api, 'site', 1)).sla, { timeout: 3000 }).toBe(true)
    } finally {
      await api.patch('/api/rows/site/1', { data: { sla: true } })
    }
  })

  test('twenty-runs-leave-the-table-reachable @e2e: with twenty requests followed at once, the dock leaves the table’s rows and the toolbar to the pointer', async ({
    page,
  }) => {
    test.setTimeout(90_000)
    const api = page.request
    const before = await newest(api, 'actie')
    try {
      await open(page, 'Sites', 'Sites')
      for (let n = 0; n < 20; n++) {
        await page.getByRole('checkbox', { name: 'testmans-winkel selecteren' }).check()
        await page
          .getByRole('region', { name: '1 geselecteerd' })
          .getByRole('button', { name: 'Gezondheid checken', exact: true })
          .click()
        await expect(page.getByRole('region', { name: /geselecteerd/ })).toHaveCount(0)
      }
      // The newest three show, the other seventeen are counted in one line: twenty lines would cover the table.
      await expect(page.getByRole('region', { name: /Gezondheid checken/ })).toHaveCount(3)
      await expect(page.getByText('+17 eerdere verzoeken')).toBeVisible()
      await shot(page, 'twintig-lopende-opdrachten')
      const cell = page
        .getByRole('row')
        .filter({ hasText: 'testmans-bestel' })
        .getByRole('gridcell')
        .filter({ hasText: /^Let op$/ })
      const reached = await cell.evaluate((el) => {
        const box = el.getBoundingClientRect()
        return el.contains(document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2))
      })
      expect(reached, 'the first row’s Gezondheid cell is under the pointer, not under a run line').toBe(true)
    } finally {
      for (const actie of (await rowsOf(api, 'actie')).rows.filter((r) => r.id > before)) {
        for (const link of (await rowsOf(api, 'actie_site', { actie_id: actie.id })).rows)
          await api.delete(`/api/rows/actie_site/${link.id}`)
        await api.delete(`/api/rows/actie/${actie.id}`)
      }
    }
  })
})

test.describe('action-row, the shake-out', () => {
  const rgb = (css: string) => (css.match(/\d+(\.\d+)?/g) ?? []).slice(0, 3).map(Number)
  const lum = (css: string) => {
    const [r, g, b] = rgb(css).map((v) => {
      const c = v / 255
      return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
    })
    return 0.2126 * r + 0.7152 * g + 0.0722 * b
  }
  const contrast = (a: string, b: string) => {
    const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x)
    return (hi + 0.05) / (lo + 0.05)
  }

  test('link-names-keep-their-commas @e2e: a links cell reads its names as coloured text, each comma beside its name, no pill padding', async ({
    page,
  }) => {
    await open(page, 'Opdrachten', 'Opdrachten')
    const names = page.getByRole('row', { name: /Bijwerken · 2 sites/ }).locator('.nv-names')
    await expect(names.locator('.nv-pill')).toHaveCount(2)
    const look = await names.evaluate((el) => {
      const pills = [...el.querySelectorAll<HTMLElement>('.nv-pill')]
      const comma = document.createRange()
      const text = [...(pills[1].parentElement?.childNodes ?? [])].find((n) => n.nodeType === 3) as Text
      comma.setStart(text, 0)
      comma.setEnd(text, 1)
      return {
        padding: pills.map((p) => `${getComputedStyle(p).paddingLeft} ${getComputedStyle(p).paddingRight}`),
        gap: comma.getBoundingClientRect().left - pills[0].getBoundingClientRect().right,
      }
    })
    for (const scheme of ['light', 'dark'] as const) {
      await page.emulateMedia({ colorScheme: scheme })
      await shot(page, `opdrachten-sites-namen-${scheme === 'light' ? 'licht' : 'donker'}`)
    }
    expect(look.padding).toEqual(['0px 0px', '0px 0px'])
    expect(look.gap, 'the comma sits against the first name').toBeLessThanOrEqual(2)
  })

  test('off-switch-shows-on-a-hovered-row @e2e: a switch that is off stays visible on the row under the pointer, in light and dark', async ({
    page,
  }) => {
    await open(page, 'Sites', 'Sites')
    const row = page.getByRole('row', { name: /voorbeeld-site/ })
    for (const scheme of ['light', 'dark'] as const) {
      await page.emulateMedia({ colorScheme: scheme })
      await page.mouse.move(0, 0)
      await row.locator('.nv-cell__title').hover()
      const read = await row
        .locator('.nv-switch__track')
        .first()
        .evaluate((track) => {
          // The theme fades its surfaces: read once every transition has run.
          return Promise.all(document.getAnimations().map((a) => a.finished.catch(() => null))).then(() => ({
            track: getComputedStyle(track).backgroundColor,
            cell: getComputedStyle(track.closest('td') as Element).backgroundColor,
          }))
        })
      await shot(page, `sites-schakelaar-hover-${scheme === 'light' ? 'licht' : 'donker'}`)
      expect(
        contrast(read.track, read.cell),
        `${scheme}: the off track ${read.track} on the hovered cell ${read.cell}`,
      ).toBeGreaterThanOrEqual(1.1)
    }
  })
})

test.describe('studio, the login from a site drawer', () => {
  const ADDRESS = /testmans-winkel\.test/
  const LINK = 'https://www.testmans-winkel.test/wp-admin/?e2e-login=sentinel-3f9a'

  /** The inloggen actie the click made, once it exists. */
  async function started(api: Api, before: number): Promise<number> {
    await expect.poll(() => newest(api, 'actie')).toBeGreaterThan(before)
    return newest(api, 'actie')
  }

  /** Undoes the click's batch: the actie and its link are soft-deleted, no id is ever reused. */
  async function undo(api: Api, actie: number): Promise<void> {
    const { revisions } = (await (await api.get(`/api/revisions/actie/${actie}`)).json()) as {
      revisions: { batch_id: string }[]
    }
    const batch = revisions[0]?.batch_id
    expect((await api.post(`/api/batches/${batch}/undo`, { data: {} })).status()).toBe(200)
  }

  test('login-from-drawer @e2e: the login icon sits after the address icon, a click opens the tab on the worker’s link once, and the link is in no history', async ({
    page,
  }) => {
    const api = page.request
    const service = await worker()
    let actie = 0
    try {
      await open(page, 'Sites', 'Sites')
      const site = await drawerOf(page, 'testmans-winkel')
      const head = site.locator('.nv-drawer__head')
      const login = head.getByRole('button', { name: 'Inloggen' })
      await expect(login).toBeVisible()
      await expect(login).toHaveAttribute('title', 'Inloggen')
      const next = await head
        .getByRole('link', { name: 'Openen in nieuw tabblad' })
        .evaluate((a) => a.nextElementSibling?.getAttribute('aria-label'))
      expect(next, 'the login icon follows the address icon directly').toBe('Inloggen')
      for (const scheme of ['light', 'dark'] as const) {
        await page.emulateMedia({ colorScheme: scheme })
        const name = scheme === 'light' ? 'licht' : 'donker'
        await shot(page, `site-inloggen-icoon-${name}`)
        if (process.env.SHAKEOUT_SHOTS)
          await head.screenshot({ path: `${process.env.SHAKEOUT_SHOTS}/site-inloggen-icoon-kop-${name}.png` })
      }

      let referer: string | undefined = 'not seen'
      await page.context().route(ADDRESS, (route) => {
        referer = route.request().headers().referer
        return route.fulfill({ contentType: 'text/html', body: '<title>wp-admin (e2e)</title><h1>Ingelogd</h1>' })
      })
      const before = await newest(api, 'actie')
      const [tab] = await Promise.all([page.context().waitForEvent('page'), login.click()])
      actie = await started(api, before)
      expect(await rowOf(api, 'actie', actie)).toMatchObject({ soort: 'inloggen', titel: 'Inloggen · testmans-winkel' })
      const other = await claude()
      const planted = await other.put(`/api/handoff/actie/${actie}`, {
        data: { value: 'https://www.testmans-winkel.test/planted' },
      })
      expect(planted.status(), 'only the worker hands a link back').toBe(403)
      await other.dispose()
      expect((await service.put(`/api/handoff/actie/${actie}`, { data: { value: LINK } })).status()).toBe(200)
      await expect.poll(() => tab.url(), { timeout: 15_000 }).toBe(LINK)
      await expect(tab.getByRole('heading', { name: 'Ingelogd' })).toBeVisible()
      expect(referer, 'the client site never learns where the studio is').toBeUndefined()
      await shot(tab, 'site-inloggen-tab')

      expect((await api.get(`/api/handoff/actie/${actie}`)).status(), 'the tab already took it').toBe(404)
      expect((await service.get(`/api/handoff/actie/${actie}`)).status()).toBe(404)
      expect((await service.put(`/api/handoff/actie/${actie}`, { data: { value: LINK } })).status()).toBe(409)
      for (const path of [`/api/revisions/actie/${actie}`, '/api/schema', '/api/rows/actie?limit=500']) {
        expect(await (await api.get(path)).text(), path).not.toContain('sentinel-3f9a')
      }
      await tab.close()
    } finally {
      await page.context().unrouteAll()
      if (actie) await undo(api, actie)
      await service.dispose()
    }
  })

  test('login-times-out @e2e: with no link from the worker the blank tab closes after 30 seconds and says so; a site without the plugin shows no icon', async ({
    page,
  }) => {
    const api = page.request
    await page.clock.install()
    let actie = 0
    try {
      await open(page, 'Sites', 'Sites')
      await drawerOf(page, 'testmans-winkel')
      const before = await newest(api, 'actie')
      const [tab] = await Promise.all([
        page.context().waitForEvent('page'),
        page.getByRole('button', { name: 'Inloggen' }).click(),
      ])
      actie = await started(api, before)
      for (let second = 0; second < 32; second++) {
        await page.clock.runFor(1000)
        await page.waitForTimeout(40)
      }
      await expect.poll(() => tab.isClosed()).toBe(true)
      await expect(page.getByText('Geen link ontvangen')).toBeVisible()
      await shot(page, 'site-inloggen-geen-link')

      await open(page, 'Sites', 'Sites')
      const without = await drawerOf(page, 'testmans-bestel')
      await expect(without.getByRole('button', { name: 'Volledig openen' })).toBeVisible()
      await expect(without.getByRole('button', { name: 'Inloggen' })).toHaveCount(0)
      await shot(page, 'site-zonder-plugin')
    } finally {
      if (actie) await undo(api, actie)
    }
  })
})

test.describe('plugin-actions, the shake-out', () => {
  async function setTheme(page: Page, theme: 'Licht' | 'Donker') {
    await openLooks(page)
    await page.getByRole('radiogroup', { name: 'Thema' }).getByRole('radio', { name: theme }).click()
    await expect(page.locator('#root')).toHaveAttribute('data-theme', theme === 'Donker' ? 'dark' : 'light')
    await page.getByRole('button', { name: 'Bijstellen' }).click()
  }

  const THEMES = [
    ['Licht', 'licht'],
    ['Donker', 'donker'],
  ] as const

  /** Takes an opdracht a flow made out again: its site lines first, as a person deletes no opdracht with sites. */
  async function remove(api: Api, actie: number): Promise<void> {
    for (const link of (await rowsOf(api, 'actie_site', { actie_id: actie })).rows)
      await api.delete(`/api/rows/actie_site/${link.id}`)
    await api.delete(`/api/rows/actie/${actie}`)
    if (await exists(api, 'actie', actie)) forget(STUDIO, 'actie', [actie])
  }

  test('install-asks-bevestigen @e2e: Studio-plugin installeren on a site without the plugin is not blocked, waits on Bevestigen after the worker’s preview, and only Stefan confirms it', async ({
    page,
    browser,
  }) => {
    const api = page.request
    const service = await worker()
    const editor = await browser.newContext({ storageState: state('studio-editor') })
    let actie = 0
    try {
      await open(page, 'Sites', 'Sites')
      const without = await drawerOf(page, 'testmans-bestel')
      await expect(without.getByRole('link', { name: 'Openen in nieuw tabblad' })).toBeVisible()
      await expect(without.getByRole('button', { name: 'Inloggen' })).toHaveCount(0)
      for (const [theme, name] of THEMES) {
        await setTheme(page, theme)
        await shot(page, `site-zonder-plugin-${name}`)
      }
      await without.getByRole('button', { name: 'Sluiten' }).click()

      await page.getByRole('checkbox', { name: 'testmans-bestel selecteren' }).check()
      const bar = page.getByRole('region', { name: '1 geselecteerd' })
      const install = bar.getByRole('button', { name: 'Studio-plugin installeren', exact: true })
      await expect(install, 'a site without the plugin may get it').toBeEnabled()
      await expect(bar.getByText(/Past niet op/)).toHaveCount(0)
      const before = await newest(api, 'actie')
      await install.click()

      const drawer = page.getByRole('complementary', { name: 'Studio-plugin installeren · testmans-bestel' })
      await expect(drawer).toBeVisible()
      actie = await newest(api, 'actie')
      expect(actie).toBeGreaterThan(before)
      expect(await rowOf(api, 'actie', actie)).toMatchObject({ soort: 'plugin_installeren', status: 'aangevraagd' })
      await expect(siteLine(drawer, 'testmans-bestel')).toContainText('Niet gestart')
      await expect(drawer.getByRole('button', { name: 'Bevestigen' })).toHaveCount(0)
      const links = (await rowsOf(api, 'actie_site', { actie_id: actie })).rows
      expect(links.map((l) => [l.site_id, l.state])).toEqual([[2, 'wacht']])

      const skip = await service.patch(`/api/rows/actie/${actie}`, {
        data: { status: 'bezig', expect: { status: 'aangevraagd' } },
      })
      expect(skip.status(), 'an install never runs before Bevestigen').toBe(422)
      expect((await rowOf(api, 'actie', actie)).status).toBe('aangevraagd')

      const patch = async (path: string, data: Values) => {
        const response = await service.patch(path, { data })
        expect(response.status(), await response.text()).toBe(200)
      }
      await patch(`/api/rows/actie/${actie}`, { status: 'voorbereiden', expect: { status: 'aangevraagd' } })
      await patch(`/api/rows/actie_site/${links[0]?.id}`, {
        state: 'te_bevestigen',
        voorstel: JSON.stringify({ plugin: { slug: 'netdust-studio', to: '1.0.0' } }),
        samenvatting: 'Studio-plugin 1.0.0 installeren',
        expect: { state: 'wacht' },
      })
      await patch(`/api/rows/actie/${actie}`, { status: 'voorbereid', expect: { status: 'voorbereiden' } })

      const confirm = drawer.locator('.nv-dw-actions__row').getByRole('button', { name: 'Bevestigen' })
      await expect(confirm).toBeVisible({ timeout: 15_000 })
      await expect(confirm).toHaveClass(/nv-button--primary/)
      await expect(siteLine(drawer, 'testmans-bestel')).toContainText('Studio-plugin 1.0.0 installeren')
      for (const [theme, name] of THEMES) {
        await setTheme(page, theme)
        await shot(page, `installeren-te-bevestigen-${name}`)
      }

      const refused = await editor.request.patch(`${STUDIO.app}/api/rows/actie/${actie}`, {
        data: { status: 'bevestigd', expect: { status: 'voorbereid' } },
      })
      expect(refused.status(), 'an editor never confirms an install').toBeGreaterThanOrEqual(400)
      expect((await rowOf(api, 'actie', actie)).status).toBe('voorbereid')

      await confirm.click()
      await expect(drawer.getByText('Bevestigd', { exact: true })).toBeVisible()
      await expect(drawer.getByRole('button', { name: 'Bevestigen' })).toHaveCount(0)
      await expect.poll(async () => (await rowOf(api, 'actie', actie)).status).toBe('bevestigd')
    } finally {
      if (actie) await remove(api, actie)
      await service.dispose()
      await editor.close()
    }
  })

  test('cache-runs-straight-away @e2e: Cache legen from the Studio-plugin view runs with no Bevestigen, a site without the plugin is skipped, and a selection with none is refused', async ({
    page,
  }) => {
    const api = page.request
    const service = await worker()
    let actie = 0
    try {
      await open(page, 'Sites', 'Sites')
      const site = await drawerOf(page, 'testmans-winkel')
      const head = site.locator('.nv-drawer__head')
      await expect(head.getByRole('button', { name: 'Inloggen' })).toBeVisible()
      for (const [theme, name] of THEMES) {
        await setTheme(page, theme)
        await shot(page, `site-met-plugin-kop-${name}`)
        await site.locator('.nv-dw-actions__row').getByRole('button', { name: 'Meer' }).click()
        const menu = page.getByRole('menu', { name: 'Meer' })
        for (const label of [
          'Studio-plugin installeren',
          'Cache legen',
          'Cron draaien',
          'Onderhoudsmodus aan',
          'Onderhoudsmodus uit',
        ])
          await expect(menu.getByRole('menuitem', { name: label, exact: true })).toBeVisible()
        await shot(page, `site-acties-meer-${name}`)
        await page.keyboard.press('Escape')
        await expect(menu).toHaveCount(0)
      }

      await open(page, 'Studio-plugin', 'Sites')
      for (const label of ['Studio-plugin', 'Plugin-versie', 'Core-bestanden', 'Cron-achterstand'])
        await expect(page.getByRole('columnheader', { name: new RegExp(label) })).toBeVisible()
      for (const [theme, name] of THEMES) {
        await setTheme(page, theme)
        await shot(page, `studio-plugin-kolommen-${name}`)
      }

      const before = await newest(api, 'actie')
      await page.getByRole('checkbox', { name: 'testmans-bestel selecteren' }).check()
      await page.getByRole('checkbox', { name: 'voorbeeld-blog selecteren' }).check()
      await pressInBar(page, page.getByRole('region', { name: '2 geselecteerd' }), 'Cache legen')
      await expect(page.getByText('Geen van deze sites heeft de studio-plugin.').first()).toBeVisible()
      await expect(page.getByRole('complementary')).toHaveCount(0)
      expect(await newest(api, 'actie'), 'no opdracht when no site has the plugin').toBe(before)
      await page.getByRole('checkbox', { name: 'voorbeeld-blog selecteren' }).uncheck()

      await page.getByRole('checkbox', { name: 'testmans-winkel selecteren' }).check()
      const bar = page.getByRole('region', { name: '2 geselecteerd' })
      for (const [theme, name] of THEMES) {
        await setTheme(page, theme)
        await page.mouse.move(0, 0)
        await shot(page, `studio-plugin-selectie-${name}`)
      }
      await pressInBar(page, bar, 'Cache legen')

      const drawer = page.getByRole('complementary', { name: 'Cache legen · 2 sites' })
      await expect(drawer).toBeVisible()
      actie = await newest(api, 'actie')
      expect(actie).toBeGreaterThan(before)
      expect(await rowOf(api, 'actie', actie)).toMatchObject({ soort: 'cache_legen', status: 'aangevraagd' })
      await expect(siteLine(drawer, 'testmans-bestel')).toContainText('Geen studio-plugin')
      await expect(siteLine(drawer, 'testmans-bestel')).toContainText('Overgeslagen')
      await expect(siteLine(drawer, 'testmans-winkel')).toContainText('Niet gestart')
      await expect(drawer.getByRole('button', { name: 'Bevestigen' })).toHaveCount(0)
      const links = (await rowsOf(api, 'actie_site', { actie_id: actie })).rows
      expect(links.map((l) => [l.site_id, l.state, l.resultaat]).sort()).toEqual([
        [1, 'wacht', null],
        [2, 'overgeslagen', 'geen plugin'],
      ])

      const patch = async (path: string, data: Values) => {
        const response = await service.patch(path, { data })
        expect(response.status(), await response.text()).toBe(200)
      }
      const winkel = links.find((l) => l.site_id === 1)?.id
      await patch(`/api/rows/actie/${actie}`, { status: 'bezig', expect: { status: 'aangevraagd' } })
      await patch(`/api/rows/actie_site/${winkel}`, { state: 'bezig', expect: { state: 'wacht' } })
      await patch(`/api/rows/actie_site/${winkel}`, {
        state: 'klaar',
        resultaat: 'cache geleegd',
        expect: { state: 'bezig' },
      })
      await patch(`/api/rows/actie/${actie}`, { status: 'klaar', expect: { status: 'bezig' } })
      await expect(drawer.getByText('Klaar', { exact: true }).first()).toBeVisible({ timeout: 15_000 })
      await expect(siteLine(drawer, 'testmans-winkel')).toContainText('Klaar')
      await expect(drawer.getByRole('button', { name: 'Bevestigen' })).toHaveCount(0)
      await shot(page, 'cache-legen-klaar')
    } finally {
      if (actie) await remove(api, actie)
      await service.dispose()
    }
  })

  test('refusal-clears-on-a-new-selection @e2e: a selection refused for having no plugin site no longer reads refused once a site with the plugin is ticked', async ({
    page,
  }) => {
    const api = page.request
    const before = await newest(api, 'actie')
    await open(page, 'Studio-plugin', 'Sites')
    const box = (site: string) => page.getByRole('checkbox', { name: `${site} selecteren` })
    await box('testmans-bestel').check()
    await box('voorbeeld-blog').check()
    await pressInBar(page, page.getByRole('region', { name: '2 geselecteerd' }), 'Cache legen')
    const refusal = page.getByText('Geen van deze sites heeft de studio-plugin.')
    await expect(refusal.first()).toBeVisible()
    expect(await newest(api, 'actie')).toBe(before)

    await box('voorbeeld-blog').uncheck()
    await box('testmans-winkel').check()
    await expect(page.getByRole('region', { name: '2 geselecteerd' })).toBeVisible()
    await expect(refusal, 'testmans-winkel has the plugin: the old refusal no longer holds').toHaveCount(0)
  })

  test('drawer-head-keys-unique @e2e: opening a site drawer renders its head tools without a duplicate React key', async ({
    page,
  }) => {
    const duplicates: string[] = []
    page.on('console', (message) => {
      if (message.text().includes('two children with the same key')) duplicates.push(message.text())
    })
    await open(page, 'Sites', 'Sites')
    const site = await drawerOf(page, 'testmans-winkel')
    await expect(site.locator('.nv-drawer__head').getByRole('button', { name: 'Inloggen' })).toBeVisible()
    await site.getByRole('button', { name: 'Volgende' }).click()
    await expect(page.getByRole('complementary', { name: 'voorbeeld-blog' })).toBeVisible()
    expect(duplicates, 'the drawer head gives each tool its own key').toEqual([])
  })
})

test.describe('drawer-tabs, the shake-out', () => {
  const head = (drawer: Locator) => drawer.locator('header')
  const bar = (drawer: Locator) => drawer.getByRole('toolbar', { name: 'Onderdelen' })
  const checked = (drawer: Locator) => bar(drawer).locator('[role="radio"][aria-checked="true"]')
  const icons = (drawer: Locator) => bar(drawer).getByRole('radio')
  const more = (drawer: Locator) => bar(drawer).getByRole('button', { name: 'Meer tabbladen' })
  const focusedName = (page: Page) => page.evaluate(() => document.activeElement?.getAttribute('aria-label') ?? '')

  async function setTheme(page: Page, theme: 'Licht' | 'Donker') {
    await openLooks(page)
    await page.getByRole('radiogroup', { name: 'Thema' }).getByRole('radio', { name: theme }).click()
    await expect(page.locator('#root')).toHaveAttribute('data-theme', theme === 'Donker' ? 'dark' : 'light')
    await page.getByRole('button', { name: 'Bijstellen' }).click()
  }

  /** One screenshot per theme, Licht last again; `show` puts back what the theme switch closed. */
  async function shotBoth(page: Page, name: string, show?: () => Promise<void>) {
    try {
      for (const [theme, tag] of [
        ['Licht', 'licht'],
        ['Donker', 'donker'],
      ] as const) {
        await setTheme(page, theme)
        if (show) await show()
        await shot(page, `${name}-${tag}`)
        if (show) await page.keyboard.press('Escape')
      }
    } finally {
      await setTheme(page, 'Licht')
    }
  }

  test('drawer-opens-on-fields @e2e: a site drawer opens on its fields and actions, its title and tabs on the head line; two icons at 392 px beside the address and Inloggen, three widened', async ({
    page,
  }) => {
    await open(page, 'Sites', 'Sites')
    const site = await drawerOf(page, 'voorbeeld-site')
    await expect(head(site).getByRole('heading', { name: 'voorbeeld-site' })).toBeVisible()
    await expect(head(site)).not.toContainText(/\d+ van \d+/)
    await expect(head(site)).not.toContainText('Sites')
    await expect(checked(site)).toHaveAccessibleName('Gegevens')
    await expect(site.locator('.nv-drawer__fields').first()).toBeVisible()
    await expect(site.locator('.nv-dw-actions__row')).toBeInViewport()
    expect(await offered(page)).toEqual(expect.arrayContaining(['Gezondheid checken']))
    await expect(site.getByRole('region', { name: 'Notities' })).toHaveCount(0)
    await expect(site.getByRole('region', { name: 'Geschiedenis' })).toHaveCount(0)

    // Stefan's ruling: on a 392 px drawer with the address and Inloggen, two icons; the title keeps its 96 px.
    await expect(head(site).getByRole('link', { name: 'Openen in nieuw tabblad' })).toBeVisible()
    await expect(head(site).getByRole('button', { name: 'Inloggen' })).toBeVisible()
    await expect(icons(site)).toHaveCount(2)
    expect((await head(site).locator('.nv-dw-title').boundingBox())?.width ?? 0).toBeGreaterThanOrEqual(96)
    await expect(more(site)).toBeVisible()
    await shotBoth(page, 'drawer-tabs-gegevens')

    await site.getByRole('button', { name: 'Volledig openen' }).click()
    await expect.poll(async () => (await site.boundingBox())?.width ?? 0).toBeGreaterThan(392)
    await expect(icons(site)).toHaveCount(3)
    await expect(checked(site)).toHaveAccessibleName('Gegevens')
    await shotBoth(page, 'drawer-tabs-breed')
  })

  test('notes-in-their-tab @e2e: the long texts read in the Notities tab, the fields out of the way; an edit is kept when the person clicks back to Gegevens', async ({
    page,
  }) => {
    await open(page, 'Sites', 'Sites')
    const site = await drawerOf(page, 'voorbeeld-site')
    await openTab(page, 'Notities')
    await expect(checked(site)).toHaveAccessibleName('Notities')
    const notes = site.getByRole('region', { name: 'Notities' })
    await expect(notes).toBeVisible()
    await expect(site.getByRole('region', { name: 'Beheerders', exact: true })).toBeVisible()
    await expect(site.locator('.nv-drawer__fields')).toHaveCount(0)
    await expect(head(site).getByRole('heading', { name: 'voorbeeld-site' })).toBeVisible()
    await shotBoth(page, 'drawer-tabs-notities')

    // Mid-flow: a note still being typed is saved when the tab changes under it, not lost with its pane.
    const before = (await rowOf(page.request, 'site', 3)).notities ?? null
    try {
      await notes.getByRole('button', { name: /notities/i }).click()
      await page.keyboard.type('e2e notitie bij het wisselen')
      await bar(site).getByRole('radio', { name: 'Gegevens' }).click()
      await expect(site.locator('.nv-drawer__fields').first()).toBeVisible()
      await expect
        .poll(async () => (await rowOf(page.request, 'site', 3)).notities)
        .toBe('e2e notitie bij het wisselen')
      await openTab(page, 'Notities')
      await expect(notes).toContainText('e2e notitie bij het wisselen')
    } finally {
      const restored = await page.request.patch('/api/rows/site/3', { data: { notities: before } })
      expect(restored.status(), await restored.text()).toBe(200)
    }
  })

  test('more-menu-holds-the-rest @e2e: Meer tabbladen lists the other panes; one chosen shows and marks …; another record opens on Gegevens, and so does stepping back with j and k', async ({
    page,
  }) => {
    await open(page, 'Sites', 'Sites')
    const site = await drawerOf(page, 'voorbeeld-site')
    await more(site).click()
    const menu = page.getByRole('menu', { name: 'Meer tabbladen' })
    await expect(menu.getByRole('menuitemradio', { name: 'Geschiedenis' })).toBeVisible()
    await expect(menu.getByRole('menuitemradio', { name: 'Bijlagen' })).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(menu).toHaveCount(0)
    await expect(
      page.getByRole('complementary', { name: 'voorbeeld-site' }),
      'Escape in the menu closes only the menu',
    ).toBeVisible()
    await shotBoth(page, 'drawer-tabs-meer', () => more(site).click())
    await more(site).click()
    await menu.getByRole('menuitemradio', { name: 'Geschiedenis' }).click()
    await expect(site.getByRole('region', { name: 'Geschiedenis' })).toBeVisible()
    await expect(more(site)).toHaveAttribute('data-current', 'true')
    await expect(checked(site)).toHaveCount(0)
    await shotBoth(page, 'drawer-tabs-geschiedenis')

    await head(site).getByRole('button', { name: 'Vorige' }).click()
    const other = page.getByRole('complementary').last()
    await expect(head(other).getByRole('heading')).not.toHaveText('voorbeeld-site')
    await expect(checked(other)).toHaveAccessibleName('Gegevens')
    await expect(more(other)).not.toHaveAttribute('data-current', 'true')

    // Re-entry: j back to the record whose Geschiedenis was open, and it reads Gegevens again; k and j once more.
    await head(other).getByRole('button', { name: 'Sluiten' }).focus()
    await page.keyboard.press('j')
    const back = page.getByRole('complementary', { name: 'voorbeeld-site' })
    await expect(back).toBeVisible()
    await expect(checked(back)).toHaveAccessibleName('Gegevens')
    await expect(more(back)).not.toHaveAttribute('data-current', 'true')
    await expect(back.getByRole('region', { name: 'Geschiedenis' })).toHaveCount(0)
    await openTab(page, 'Notities')
    await head(back).getByRole('button', { name: 'Sluiten' }).focus()
    await page.keyboard.press('k')
    await expect(head(page.getByRole('complementary').last()).getByRole('heading')).not.toHaveText('voorbeeld-site')
    await page.keyboard.press('j')
    await expect(page.getByRole('complementary', { name: 'voorbeeld-site' })).toBeVisible()
    await expect(checked(back)).toHaveAccessibleName('Gegevens')
  })

  test('drawer-tabs-by-keyboard @e2e: Tab enters the bar on the open pane, arrows walk it, Enter and Space choose, … opens on Enter and gives focus back marked', async ({
    page,
  }) => {
    await open(page, 'Sites', 'Sites')
    // testmans-winkel has a next record, so Volgende takes focus.
    const site = await drawerOf(page, 'testmans-winkel')
    await head(site).getByRole('button', { name: 'Volgende' }).focus()
    await page.keyboard.press('Tab')
    expect(await focusedName(page), 'Tab lands on the open pane').toBe('Gegevens')
    await page.keyboard.press('ArrowRight')
    expect(await focusedName(page)).toBe('Notities')
    await expect(checked(site), 'an arrow moves focus, it does not choose').toHaveAccessibleName('Gegevens')
    await page.keyboard.press('Enter')
    await expect(checked(site)).toHaveAccessibleName('Notities')
    await expect(site.getByRole('region', { name: 'Notities' })).toBeVisible()
    await page.keyboard.press('ArrowLeft')
    await page.keyboard.press('Space')
    await expect(checked(site)).toHaveAccessibleName('Gegevens')
    await page.keyboard.press('ArrowRight')
    await page.keyboard.press('ArrowRight')
    expect(await focusedName(page)).toBe('Meer tabbladen')
    await page.keyboard.press('Enter')
    const menu = page.getByRole('menu', { name: 'Meer tabbladen' })
    await expect(menu).toBeVisible()
    await page.keyboard.press('ArrowDown')
    const target = await page.evaluate(() => document.activeElement?.textContent ?? '')
    await page.keyboard.press('Enter')
    await expect(menu).toHaveCount(0)
    expect(await focusedName(page), 'focus returns to …').toBe('Meer tabbladen')
    await expect(more(site)).toHaveAttribute('data-current', 'true')
    await expect(site.getByRole('region', { name: target.trim() })).toBeVisible()
    await shot(page, 'drawer-tabs-toetsenbord')
    // Shift+Tab from widen enters the bar on its last stop, …; the bar is one tab stop.
    await head(site).getByRole('button', { name: 'Volledig openen' }).focus()
    await page.keyboard.press('Shift+Tab')
    expect(await focusedName(page)).toBe('Meer tabbladen')
    await page.keyboard.press('Shift+Tab')
    expect(await focusedName(page)).toBe('Volgende')
    await head(site).getByRole('button', { name: 'Volgende' }).focus()
    await page.keyboard.press('Tab')
    await page.keyboard.press('Tab')
    expect(await focusedName(page), 'one Tab leaves the bar').toBe('Volledig openen')
  })

  test.describe('at 1280 by 720', () => {
    test.use({ viewport: { width: 1280, height: 720 } })

    test('drawer-tabs-at-1280 @e2e: the head line fits, one row, nothing scrolls sideways, light and dark', async ({
      page,
    }) => {
      await open(page, 'Sites', 'Sites')
      const site = await drawerOf(page, 'testmans-winkel')
      try {
        for (const [theme, name] of [
          ['Licht', 'licht'],
          ['Donker', 'donker'],
        ] as const) {
          await setTheme(page, theme)
          const line = await head(site).boundingBox()
          expect(line?.height ?? 0).toBeLessThan(60)
          await expect(bar(site)).toBeInViewport({ ratio: 1 })
          await expect(head(site).getByRole('button', { name: 'Sluiten' })).toBeInViewport({ ratio: 1 })
          expect(await site.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true)
          expect(await head(site).evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true)
          await shot(page, `drawer-tabs-1280-${name}`)
        }
      } finally {
        await setTheme(page, 'Licht')
      }
    })
  })
})
