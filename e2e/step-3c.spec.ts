import { type APIRequestContext, expect, type Page, test } from '@playwright/test'
import { state } from './auth'
import { cardIn } from './board'
import { shot } from './shots'
import { openView, openWeek } from './tree'

// Weeks no other spec uses. The dashboard's week strip shows this week, so its flow is dated today (the one exception).
const WEEK = { skins: '2028-06-05', conflict: '2028-06-12' }

type Api = APIRequestContext
type Values = Record<string, unknown>
type View = {
  id: number
  name: string
  skin: string
  source: string | null
  filters: Values
  layout?: { sections: { tiles: Values[] }[] }
}

// One pixel, a valid PNG: the engine sniffs what it stores.
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
  'base64',
)

const plusDays = (day: string, n: number) => {
  const d = new Date(`${day}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}
const localDay = () => {
  const d = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

async function rowsOf<T = Values>(api: Api, source: string, filter?: Values): Promise<{ rows: T[]; total: number }> {
  const query = filter ? `&filter=${encodeURIComponent(JSON.stringify(filter))}` : ''
  const response = await api.get(`/api/rows/${source}?limit=500${query}`)
  expect(response.status()).toBe(200)
  return (await response.json()) as { rows: T[]; total: number }
}

async function idOf(api: Api, dataset: string, values: Values): Promise<number> {
  const response = await api.post(`/api/rows/${dataset}`, { data: values })
  expect(response.status(), await response.text()).toBe(201)
  return ((await response.json()) as { id: number }).id
}

const idByName = async (api: Api, dataset: string, column: string, name: string) =>
  (await rowsOf<Values & { id: number }>(api, dataset)).rows.find((r) => r[column] === name)?.id as number

const viewsOf = async (api: Api) => ((await (await api.get('/api/views')).json()) as { views: View[] }).views

async function activity(
  api: Api,
  productie_id: number,
  omschrijving: string,
  day: string,
  times: [string, string] = ['10:00', '12:00'],
) {
  return idOf(api, 'activiteit', {
    productie_id,
    soort: 'repetitie',
    status: 'bevestigd',
    omschrijving,
    datum: day,
    start_at: `${day}T${times[0]}`,
    eind_at: `${day}T${times[1]}`,
  })
}

async function viewOf(api: Api, values: Values): Promise<number> {
  const response = await api.post('/api/views', {
    data: { filters: {}, sort: [], group_by: null, visible_fields: [], ...values },
  })
  expect(response.status(), await response.text()).toBe(201)
  return ((await response.json()) as { id: number }).id
}

async function removeActivity(api: Api, id: number) {
  for (const t of (await rowsOf<{ id: number }>(api, 'toewijzing', { activiteit_id: id })).rows)
    await api.delete(`/api/rows/toewijzing/${t.id}`)
  await api.delete(`/api/rows/activiteit/${id}`)
}

const stat = (page: Page, label: string) => page.getByRole('region', { name: label, exact: true })
const statValue = (page: Page, label: string) => stat(page, label).getByTestId('stat-value')
const listTitle = (page: Page, label: string) =>
  page.getByRole('region', { name: label, exact: true }).locator('.nv-tile__title')
const countIn = async (page: Page, label: string) =>
  Number((await listTitle(page, label).textContent())?.split('·')[1]?.trim())

async function landing(page: Page) {
  await page.goto('/')
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Overzicht')
}

// The choice lives in this test's own browser context, so no test has to choose it back.
async function chooseSpace(page: Page, name: string) {
  await page.getByRole('button', { name: 'Alle producties', exact: true }).click()
  await page.getByRole('option', { name, exact: true }).click()
  await expect(page.getByRole('button', { name, exact: true })).toBeVisible()
}

test.describe('step 3c', () => {
  test('dashboard-landing @e2e', async ({ page }) => {
    await landing(page)
    const views = await viewsOf(page.request)
    const overzicht = views.find((v) => v.skin === 'dashboard' && v.name === 'Overzicht')
    const stats = (overzicht?.layout?.sections ?? []).flatMap((s) => s.tiles).filter((t) => t.kind === 'stat')
    expect(stats.length).toBe(3)
    for (const tile of stats) {
      const view = views.find((v) => v.id === tile.view) as View
      const expected = (await rowsOf(page.request, view.source as string, view.filters)).total
      await expect(statValue(page, view.name)).toHaveText(String(expected))
    }
    await expect(page.getByRole('region', { name: 'Nu', exact: true })).toBeVisible()
    await shot(page, 'dashboard')
  })

  test('stat-red-then-neutral @e2e', async ({ page }) => {
    const api = page.request
    const titel = 'e2e botsingen'
    const productie = await idOf(api, 'productie', { titel, seizoen: '2028', status: 'actief', organisatie_id: 1 })
    const who = await idOf(api, 'persoon', { voornaam: 'Stat', achternaam: 'Proef' })
    const a = await activity(api, productie, 'e2e botsing een', WEEK.conflict, ['10:00', '12:00'])
    const b = await activity(api, productie, 'e2e botsing twee', WEEK.conflict, ['11:00', '13:00'])
    await idOf(api, 'toewijzing', { activiteit_id: a, persoon_id: who, state: 'bevestigd' })
    const second = await idOf(api, 'toewijzing', { activiteit_id: b, persoon_id: who, state: 'bevestigd' })
    try {
      await landing(page)
      await chooseSpace(page, titel)
      await expect.poll(async () => Number(await statValue(page, 'Conflicten').textContent())).toBeGreaterThanOrEqual(1)
      await expect(stat(page, 'Conflicten')).toHaveClass(/nv-stat--bad/)
      await shot(page, 'conflicten-red')

      expect((await api.patch(`/api/rows/toewijzing/${second}`, { data: { state: 'geannuleerd' } })).status()).toBe(200)
      await page.evaluate(() => window.dispatchEvent(new Event('focus')))
      await expect(statValue(page, 'Conflicten')).toHaveText('0')
      await expect(stat(page, 'Conflicten')).not.toHaveClass(/nv-stat--/)
    } finally {
      await removeActivity(api, a)
      await removeActivity(api, b)
      await api.delete(`/api/rows/productie/${productie}`)
    }
  })

  test('stat-opens-view @e2e', async ({ page }) => {
    await landing(page)
    await stat(page, 'Conflicten').getByRole('button', { name: 'Conflicten' }).click()
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Conflicten')
    await shot(page, 'stat-opens-view')
  })

  test('week-opens-activity @e2e', async ({ page }) => {
    const api = page.request
    const nachtwacht = await idByName(api, 'productie', 'titel', 'Nachtwacht')
    const id = await activity(api, nachtwacht, 'e2e vandaag in de strip', localDay())
    try {
      await landing(page)
      const strip = page.getByRole('region', { name: 'Kalender activiteiten', exact: true })
      await strip.getByRole('button', { name: /e2e vandaag in de strip/ }).click()
      await expect(page.getByRole('complementary', { name: 'e2e vandaag in de strip' })).toBeVisible()
      await shot(page, 'week-drawer')
    } finally {
      await removeActivity(api, id)
    }
  })

  test('werklijst-set @e2e', async ({ page }) => {
    const api = page.request
    // No deadline, so it sorts first in the list (SQLite puts NULL first ascending).
    const taak = await idOf(api, 'taak', { titel: 'e2e afvinken' })
    try {
      await landing(page)
      const list = page.getByRole('region', { name: 'Werklijst', exact: true })
      const row = list.getByRole('listitem').filter({ hasText: 'e2e afvinken' })
      await expect(row).toBeVisible()
      const before = await countIn(page, 'Werklijst')
      await list.scrollIntoViewIfNeeded()
      await shot(page, 'werklijst-set')
      await row.getByRole('button', { name: 'Gedaan' }).click()
      await expect(row).toHaveCount(0)
      await expect.poll(() => countIn(page, 'Werklijst')).toBe(before - 1)
    } finally {
      await api.delete(`/api/rows/taak/${taak}`)
    }
  })

  test('quick-create @e2e', async ({ page }) => {
    const api = page.request
    await landing(page)
    await expect(listTitle(page, 'Werklijst')).toContainText('·')
    const before = await countIn(page, 'Werklijst')
    await page.getByRole('button', { name: 'Nieuwe taak' }).click()
    const dialog = page.getByRole('dialog', { name: 'Nieuwe taak' })
    await dialog.getByLabel('Titel').fill('e2e snel aangemaakt')
    await dialog.getByRole('button', { name: 'Aanmaken' }).click()
    await expect(dialog).toHaveCount(0)
    await expect.poll(() => countIn(page, 'Werklijst')).toBe(before + 1)
    const made = (await rowsOf<{ id: number; titel: string }>(api, 'taak')).rows.find(
      (t) => t.titel === 'e2e snel aangemaakt',
    )
    expect(made).toBeTruthy()
    await api.delete(`/api/rows/taak/${made?.id}`)
  })

  test('space-narrows @e2e', async ({ page }) => {
    const api = page.request
    await landing(page)
    // The tile shows "–" until its count arrives.
    await expect(statValue(page, 'Conflicten')).toHaveText(/^\d+$/)
    const all = Number(await statValue(page, 'Conflicten').textContent())
    const kersentuin = await idByName(api, 'productie', 'titel', 'De Kersentuin')
    await chooseSpace(page, 'De Kersentuin')
    const scoped = (await rowsOf(api, 'conflicten', { productie_id: kersentuin })).total
    await expect(statValue(page, 'Conflicten')).toHaveText(String(scoped))
    expect(scoped).toBeLessThanOrEqual(all)
    await shot(page, 'dashboard-space')
  })

  // Spec R7: "the space switcher narrows every tile". Werklijst and Toewijzing are not scoped, so with a production
  // chosen that has no rows, Open plaatsen, Onbeantwoord, Plaatsen gevuld and the Werklijst still count every production.
  test('space-narrows-every-tile @e2e', async ({ page }) => {
    const api = page.request
    const titel = 'e2e productie zonder plaatsen'
    const productie = await idOf(api, 'productie', { titel, seizoen: '2028', status: 'actief', organisatie_id: 1 })
    // An open place of its own, two days out: the seed's are pinned to its week, and a werklijst counts from today on.
    const soon = new Date()
    soon.setDate(soon.getDate() + 2)
    const day = `${soon.getFullYear()}-${String(soon.getMonth() + 1).padStart(2, '0')}-${String(soon.getDate()).padStart(2, '0')}`
    const nachtwacht = await idByName(api, 'productie', 'titel', 'Nachtwacht')
    const open = await activity(api, nachtwacht, 'e2e open plaats binnenkort', day)
    const place = await idOf(api, 'toewijzing', {
      activiteit_id: open,
      rol_id: await idByName(api, 'rol', 'naam', 'Speler'),
      aantal: 1,
      state: 'open',
    })
    try {
      await landing(page)
      await expect(statValue(page, 'Open plaatsen')).toHaveText(/^[1-9]\d*$/)
      await chooseSpace(page, titel)
      await expect(statValue(page, 'Conflicten')).toHaveText('0')
      await expect(stat(page, 'Conflicten')).not.toHaveClass(/nv-stat--/)
      await expect(statValue(page, 'Open plaatsen')).toHaveText('0')
      await expect(statValue(page, 'Onbeantwoord')).toHaveText('0')
      await expect(listTitle(page, 'Werklijst')).toHaveText('Werklijst · 0')
      await expect(listTitle(page, 'Vandaag')).toHaveText('Vandaag · 0')
      await expect(page.getByRole('region', { name: 'Vandaag', exact: true })).toContainText('Geen rijen')
      await expect(page.getByRole('region', { name: 'Plaatsen gevuld', exact: true })).toContainText('0 van 0')
    } finally {
      await api.delete(`/api/rows/toewijzing/${place}`)
      await api.delete(`/api/rows/activiteit/${open}`)
      await api.delete(`/api/rows/productie/${productie}`)
    }
  })

  test('skins-open @e2e', async ({ page }) => {
    // Opens seven skins, each on rows it makes: 18 s alone, near 30 s under load.
    test.setTimeout(90_000)
    const api = page.request
    const day = WEEK.skins
    const nachtwacht = await idByName(api, 'productie', 'titel', 'Nachtwacht')
    const id = await activity(api, nachtwacht, 'e2e huid activiteit', plusDays(day, 1))
    const who = await idOf(api, 'persoon', { voornaam: 'Huid', achternaam: 'Proef' })
    const slot = await idOf(api, 'toewijzing', { activiteit_id: id, persoon_id: who, state: 'voorlopig' })
    const away = await idOf(api, 'beschikbaarheid', {
      persoon_id: who,
      soort: 'afwezig',
      start_at: `${plusDays(day, 2)}T00:00`,
      eind_at: `${plusDays(day, 3)}T23:59`,
    })
    const reeks = await idOf(api, 'speelreeks', {
      productie_id: nachtwacht,
      naam: 'e2e huid tourstop',
      start_datum: day,
      eind_datum: plusDays(day, 3),
    })
    const upload = await api.post(`/api/attachments/activiteit/${id}?kind=foto&name=pixel.png`, {
      headers: { 'content-type': 'application/octet-stream' },
      data: PNG,
    })
    expect(upload.status(), await upload.text()).toBe(201)
    // Two views the seed does not have: a board of activities by status, a calendar of tourstops whose rows span days.
    const made: number[] = []
    try {
      made.push(
        await viewOf(api, { name: 'e2e Bord activiteiten', source: 'activiteit', skin: 'board', sort: ['plandag'] }),
      )
      made.push(
        await viewOf(api, {
          name: 'e2e Kalender tourstops',
          source: 'speelreeks',
          skin: 'calendar',
          sort: ['start_datum'],
          group_by: 'productie_id',
        }),
      )
      await openWeek(page, 'Tijdlijn tourstops', 'Tourstops', 'start_datum', day)
      await expect(
        page.getByRole('row', { name: 'Nachtwacht' }).getByRole('button', { name: /e2e huid tourstop/ }),
      ).toBeVisible()
      await shot(page, 'timeline')

      await openWeek(page, 'Galerij activiteiten', 'Activiteiten', 'plandag', day)
      await expect(page.getByRole('img', { name: 'e2e huid activiteit' })).toBeVisible()
      await shot(page, 'gallery')

      await openWeek(page, 'Kalender activiteiten', 'Activiteiten', 'plandag', day)
      await expect(page.getByRole('button', { name: /e2e huid activiteit/ })).toBeVisible()

      await openWeek(page, 'Kalender afwezigheden', 'Beschikbaarheden', 'start_at', day)
      // One bar over the two days it covers, the band's first column being the axis.
      const away = page
        .getByRole('group', { name: 'Hele dag', exact: true })
        .getByRole('button', { name: /Huid Proef/ })
      await expect(away).toHaveCount(1)

      await page.goto('/')
      await openView(page, 'Bord toewijzingen', 'Toewijzingen')
      await expect(cardIn(page, 'Voorlopig', 'Huid Proef')).toBeVisible()
      await shot(page, 'board')

      await openWeek(page, 'e2e Bord activiteiten', 'Activiteiten', 'plandag', day)
      await expect(cardIn(page, 'Bevestigd', 'e2e huid activiteit')).toBeVisible()
      await shot(page, 'board-activiteiten')

      await openWeek(page, 'e2e Kalender tourstops', 'Tourstops', 'start_datum', day)
      // The tourstop runs Monday to Thursday: one bar from the first day's column over four.
      const tour = page
        .getByRole('group', { name: 'Hele dag', exact: true })
        .getByRole('button', { name: /e2e huid tourstop/ })
      await expect(tour).toHaveCount(1)
      await shot(page, 'calendar-span')
    } finally {
      for (const view of made) await api.delete(`/api/views/${view}`)
      await api.delete(`/api/rows/toewijzing/${slot}`)
      await api.delete(`/api/rows/beschikbaarheid/${away}`)
      await removeActivity(api, id)
      await api.delete(`/api/rows/speelreeks/${reeks}`)
    }
  })
  test('composer-team-dashboard @e2e: an administrator edits the seeded dashboard in place, may delete it, and an editor reads the same', async ({
    browser,
    page,
  }) => {
    const admin = await browser.newContext({ storageState: state('admin') })
    const a = await admin.newPage()
    const dashboards = async () => (await viewsOf(admin.request)).filter((v) => v.skin === 'dashboard')
    const before = await dashboards()
    const seeded = before[0]
    const layout = seeded?.layout
    try {
      await landing(a)
      const rail = a.getByRole('navigation', { name: 'Views' }).getByRole('group', { name: 'Dashboard', exact: true })
      await expect(rail.getByRole('treeitem')).toHaveCount(1)
      // The seeded dashboard is the team's: its administrator may delete it, which the seed then respects.
      await expect(rail.getByRole('button', { name: 'Dashboard verwijderen' })).toHaveCount(1)

      await a.getByRole('button', { name: 'Bewerken' }).click()
      const nu = a.getByRole('group', { name: 'Sectie Nu', exact: true })
      await nu.getByLabel('Soort tegel').selectOption({ label: 'Getal' })
      await nu.getByLabel('Weergave', { exact: true }).selectOption({ label: 'Vandaag' })
      await nu.getByLabel('Titel tegel').fill('e2e tegel')
      await nu.getByLabel('Kleur').selectOption({ label: 'Rood' })
      await expect(nu.getByLabel('Boven')).toHaveValue('0')
      await shot(a, 'composer')
      await nu.getByRole('button', { name: 'Tegel toevoegen' }).click()
      await expect(nu.getByText('Getal: Vandaag', { exact: true })).toBeVisible()
      await a.getByRole('button', { name: 'Opslaan' }).click()
      await expect(stat(a, 'e2e tegel')).toBeVisible()

      // In place: no copy, and an editor lands on the same dashboard.
      expect((await dashboards()).map((v) => v.id)).toEqual(before.map((v) => v.id))
      await landing(page)
      await expect(stat(page, 'e2e tegel')).toBeVisible()
      await expect(rail.getByRole('treeitem')).toHaveCount(1)
    } finally {
      // A changed seeded dashboard is the person's: --seed-missing leaves it, so the layout goes back by hand.
      if (seeded && layout) {
        if (!(await dashboards()).some((v) => v.id === seeded.id))
          await admin.request.post(`/api/views/${seeded.id}/restore`, { data: {} })
        await admin.request.patch(`/api/views/${seeded.id}`, { data: { layout } })
      }
      for (const created of (await dashboards()).filter((v) => !before.some((old) => old.id === v.id)))
        await admin.request.delete(`/api/views/${created.id}`)
      await admin.close()
    }
  })

  test('tile-no-access @e2e', async ({ browser, page }) => {
    const admin = await browser.newContext({ storageState: state('admin') })
    const made: number[] = []
    try {
      const own = await admin.request.post('/api/views', {
        data: {
          name: 'e2e eigen takenlijst',
          source: 'taak',
          skin: 'table',
          filters: {},
          sort: [],
          visible_fields: [],
        },
      })
      expect(own.status(), await own.text()).toBe(201)
      const view = ((await own.json()) as { id: number }).id
      made.push(view)
      const team = await admin.request.post('/api/views', {
        data: {
          name: 'e2e teamdashboard',
          skin: 'dashboard',
          shared: true,
          layout: { sections: [{ label: 'Privé', tiles: [{ kind: 'stat', view, measure: 'count' }] }], actions: [] },
        },
      })
      expect(team.status(), await team.text()).toBe(201)
      made.unshift(((await team.json()) as { id: number }).id)

      // The editor lands on the administrator's shared dashboard; its tile names a view only the administrator reads.
      await page.goto('/')
      await expect(page.getByRole('heading', { level: 1 })).toHaveText('e2e teamdashboard')
      const section = page.getByRole('region', { name: 'Privé', exact: true })
      await expect(section).toContainText('Geen toegang')
      await expect(section).not.toContainText('e2e eigen takenlijst')
      await shot(page, 'tile-no-access')
    } finally {
      for (const id of made) await admin.request.delete(`/api/views/${id}`)
      await admin.close()
    }
  })
})
