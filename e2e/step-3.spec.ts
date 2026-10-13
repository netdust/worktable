import { type APIRequestContext, expect, type Locator, type Page, test } from '@playwright/test'
import { state } from './auth'
import { writeDb } from './db'
import { openEditor, openLooks } from './editor'
import { shot } from './shots'
import { openView, openWeek } from './tree'

// Weeks the seed and the other specs leave empty, one per flow, so the shared database never moves a flow's rows.
const WEEK = {
  picker: '2028-04-03',
  conflicts: '2028-04-10',
  badge: '2028-04-17',
  calendar: '2028-04-24',
  away: '2028-05-01',
  none: '2028-05-08',
  edges: '2028-05-15',
  night: '2028-05-22',
  point: '2028-05-29',
}
const MATRIX = 'Toewijzingen per activiteit'

type Api = APIRequestContext
type Values = Record<string, unknown>

const plusDays = (day: string, n: number) => {
  const d = new Date(`${day}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}

// SQL's today is the server's local date.
const localDay = (offset: number) => {
  const d = new Date()
  d.setDate(d.getDate() + offset)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

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

const nachtwacht = (api: Api) => idByName(api, 'productie', 'titel', 'Nachtwacht')

async function activity(
  api: Api,
  omschrijving: string,
  day: string,
  times: [string, string] | null,
  soort = 'repetitie',
) {
  return idOf(api, 'activiteit', {
    productie_id: await nachtwacht(api),
    soort,
    status: 'bevestigd',
    omschrijving,
    datum: day,
    ...(times ? { start_at: `${day}T${times[0]}`, eind_at: `${day}T${times[1]}` } : {}),
  })
}

const assign = (api: Api, activiteit_id: number, persoon_id: number, state = 'voorlopig') =>
  idOf(api, 'toewijzing', { activiteit_id, persoon_id, state })

const absence = (api: Api, persoon_id: number, day: string, soort: string, reden: string) =>
  idOf(api, 'beschikbaarheid', { persoon_id, soort, reden, start_at: `${day}T00:00`, eind_at: `${day}T23:59` })

const person = (api: Api, voornaam: string, achternaam: string) => idOf(api, 'persoon', { voornaam, achternaam })

async function removeActivity(api: Api, id: number) {
  for (const t of await rowsOf<{ id: number }>(api, 'toewijzing', { activiteit_id: id }))
    await api.delete(`/api/rows/toewijzing/${t.id}`)
  await api.delete(`/api/rows/activiteit/${id}`)
}

/** The row of a grid or matrix by its title. */
const row = (page: Page, title: string) => page.locator(`tbody tr.nv-tr[data-title="${title}"]`)

/** A matrix cell: one per person column, counted past the label and the open column. */
async function spot(page: Page, title: string, name: string): Promise<Locator> {
  const head = page.locator(`thead th.nv-mx__head[title="${name}"]`)
  await expect(head).toBeVisible()
  const index = await page
    .locator('thead th.nv-mx__head')
    .evaluateAll((heads, wanted) => heads.findIndex((th) => th.getAttribute('title') === wanted), name)
  return row(page, title).locator('td[data-cell]').nth(index)
}

async function columnOf(page: Page, label: string): Promise<number> {
  let index = -1
  await expect
    .poll(async () => {
      index = await page
        .locator('thead th')
        .evaluateAll(
          (heads, wanted) => heads.findIndex((th) => (th.textContent ?? '').replace(/\s*[↑↓]$/, '').trim() === wanted),
          label,
        )
      return index
    })
    .toBeGreaterThanOrEqual(0)
  return index
}

async function cellOf(page: Page, title: string, label: string): Promise<Locator> {
  let index = -1
  await expect
    .poll(async () => {
      index = await page
        .locator('thead th')
        .evaluateAll(
          (heads, wanted) => heads.findIndex((th) => (th.textContent ?? '').replace(/\s*[↑↓]$/, '').trim() === wanted),
          label,
        )
      return index
    })
    .toBeGreaterThanOrEqual(0)
  return row(page, title).locator('td').nth(index)
}

test.describe('step 3', () => {
  test('candidates-picker @e2e', async ({ page }) => {
    const api = page.request
    const title = 'e2e kandidaten'
    const day = WEEK.picker
    const id = await activity(api, title, day, ['10:00', '12:00'])
    const [noor, sam] = [
      await idByName(api, 'persoon', 'weergavenaam', 'Noor Claes'),
      await idByName(api, 'persoon', 'weergavenaam', 'Sam Peeters'),
    ]
    const away = await absence(api, noor, day, 'afwezig', 'e2e kandidaten afwezig')
    try {
      await idOf(api, 'toewijzing', { activiteit_id: id, rol_id: await idByName(api, 'rol', 'naam', 'Speler') })
      await assign(api, id, sam)
      await openWeek(page, MATRIX, 'Activiteiten', 'plandag', day)
      await row(page, title).locator('[data-testid="open"]').getByRole('button').click()
      const picker = page.getByRole('region', { name: 'Open plek invullen' })
      const names = picker.locator('.nv-mx__pick')
      await expect(names.first()).toBeVisible()
      const listed = await names.allTextContents()
      expect(listed.indexOf('Bram De Wilde')).toBeGreaterThanOrEqual(0)
      expect(listed.indexOf('Bram De Wilde')).toBeLessThan(listed.indexOf('Lotte Verhaegen'))
      expect(listed).not.toContain('Noor Claes')
      expect(listed).not.toContain('Sam Peeters')
      await shot(page, 'candidates-picker')

      await picker.getByRole('button', { name: 'Iedereen tonen' }).click()
      await expect(picker.getByRole('button', { name: 'Noor Claes', exact: true })).toBeVisible()
      await picker.getByRole('searchbox', { name: 'Kies een persoon' }).fill('Bram')
      const filled = page.waitForResponse(
        (res) => res.request().method() === 'POST' && res.url().endsWith('/api/actions/vul_slot'),
      )
      await picker.getByRole('button', { name: 'Bram De Wilde', exact: true }).click()
      expect((await filled).status()).toBe(201)
      const bram = await idByName(api, 'persoon', 'weergavenaam', 'Bram De Wilde')
      expect(await rowsOf(api, 'toewijzing', { activiteit_id: id, persoon_id: bram })).toEqual([
        expect.objectContaining({ state: 'voorlopig' }),
      ])
    } finally {
      await removeActivity(api, id)
      await api.delete(`/api/rows/beschikbaarheid/${away}`)
    }
  })

  // The shared e2e database is changed by earlier specs, so this flow makes one conflict of each kind in its own week.
  // The seeded six are pinned on a fresh database by packages/theatre/test/step3-queries.test.ts.
  test('conflicten-six-types @e2e', async ({ page }) => {
    const api = page.request
    const day = (n: number) => plusDays(WEEK.conflicts, n)
    const who = await person(api, 'Botsing', 'Proef')
    const spiegel = await idByName(api, 'organisatie', 'naam', 'Zaal De Spiegel')
    const kersentuin = await idByName(api, 'productie', 'titel', 'De Kersentuin')
    const made: number[] = []
    const absences: number[] = []
    const make = async (omschrijving: string, on: string, times: [string, string], extra: Values = {}) => {
      const id = await activity(api, omschrijving, on, times)
      if (Object.keys(extra).length > 0)
        expect((await api.patch(`/api/rows/activiteit/${id}`, { data: extra })).status()).toBe(200)
      made.push(id)
      return id
    }
    try {
      await assign(api, await make('e2e overlap een', day(0), ['10:00', '12:00']), who)
      await assign(api, await make('e2e overlap twee', day(0), ['11:00', '13:00']), who)
      absences.push(await absence(api, who, day(1), 'afwezig', 'e2e conflict afwezig'))
      await assign(api, await make('e2e afwezig', day(1), ['10:00', '12:00']), who)
      absences.push(await absence(api, who, day(2), 'onzeker', 'e2e conflict onzeker'))
      await assign(api, await make('e2e onzeker', day(2), ['10:00', '12:00']), who)
      await make('e2e zaal een', day(3), ['10:00', '12:00'], { locatie_id: spiegel })
      await make('e2e zaal twee', day(3), ['11:00', '13:00'], { locatie_id: spiegel, productie_id: kersentuin })
      const soon = await make('e2e open plaats morgen', localDay(1), ['10:00', '12:00'])
      await idOf(api, 'toewijzing', { activiteit_id: soon, rol_id: await idByName(api, 'rol', 'naam', 'Speler') })
      const slot = await assign(api, await make('e2e onbevestigd', day(4), ['10:00', '12:00']), who, 'uitgenodigd')
      const longAgo = new Date(Date.now() - 30 * 86_400_000).toISOString()
      writeDb('UPDATE toewijzing SET created_at = ? WHERE id = ?', longAgo, slot)
      writeDb("UPDATE revision SET at = ? WHERE entity = 'toewijzing' AND record_id = ?", longAgo, slot)

      await page.goto('/')
      await openView(page, 'Conflicten', 'Conflicten')
      await expect(page.getByRole('heading', { level: 1 })).toHaveText('Conflicten')
      // Each of this flow's own rows, found by its sentence, with its type and its weight.
      const expected: [string, string, string][] = [
        ['e2e overlap een en e2e overlap twee', 'Overlap', 'Conflict'],
        ['afwezig tijdens e2e afwezig', 'Afwezig', 'Conflict'],
        ['niet beschikbaar tijdens e2e onzeker', 'Onzeker', 'Waarschuwing'],
        ['e2e open plaats morgen', 'Open plaats', 'Conflict'],
        ['e2e onbevestigd', 'Onbevestigd', 'Conflict'],
        ['e2e zaal een en e2e zaal twee', 'Locatie dubbel', 'Conflict'],
      ]
      const [type, ernst] = [await columnOf(page, 'Type'), await columnOf(page, 'Ernst')]
      for (const [text, label, weight] of expected) {
        const found = page.locator('tbody tr.nv-tr').filter({ hasText: text }).first()
        await expect(found.locator('td').nth(type)).toHaveText(label)
        await expect(found.locator('td').nth(ernst)).toHaveText(weight)
      }
      await shot(page, 'conflicten')
    } finally {
      for (const id of made) await removeActivity(api, id)
      for (const id of absences) await api.delete(`/api/rows/beschikbaarheid/${id}`)
    }
  })

  test('badge-clears @e2e', async ({ page }) => {
    const api = page.request
    const title = 'e2e badge repetitie'
    const day = WEEK.badge
    const id = await activity(api, title, day, ['10:00', '12:00'])
    const who = await person(api, 'Badge', 'Proef')
    const away = await absence(api, who, day, 'afwezig', 'e2e badge afwezig')
    try {
      await assign(api, id, who, 'bevestigd')
      await openWeek(page, 'Per persoon per dag', 'Per persoon per dag', 'plandag', day)
      await expect(row(page, title).locator('.nv-badge')).toHaveText('1')
      await row(page, title).locator('.nv-badge').scrollIntoViewIfNeeded()
      await shot(page, 'badge')

      await openWeek(page, 'Afwezigheden', 'Beschikbaarheden', 'start_at', day)
      const soort = await cellOf(page, 'Badge Proef', 'Soort')
      await soort.click()
      await soort.press('Enter')
      const saved = page.waitForResponse(
        (res) => res.request().method() === 'PATCH' && /\/api\/rows\/beschikbaarheid\/\d+$/.test(res.url()),
      )
      await openEditor(page).getByRole('option', { name: 'Beschikbaar', exact: true }).click()
      expect((await saved).status()).toBe(200)

      await openWeek(page, 'Per persoon per dag', 'Per persoon per dag', 'plandag', day)
      await expect(row(page, title)).toHaveCount(1)
      await expect(row(page, title).locator('.nv-badge')).toHaveCount(0)
    } finally {
      await removeActivity(api, id)
      await api.delete(`/api/rows/beschikbaarheid/${away}`)
    }
  })

  test('away-only-afwezig @e2e', async ({ page }) => {
    const api = page.request
    const title = 'e2e afwezig in de matrix'
    const day = WEEK.away
    const id = await activity(api, title, day, ['10:00', '12:00'])
    const [gone, unsure] = [await person(api, 'Weg', 'Proef'), await person(api, 'Twijfel', 'Proef')]
    const away = await absence(api, gone, day, 'afwezig', 'e2e weg')
    const maybe = await absence(api, unsure, day, 'onzeker', 'e2e misschien')
    try {
      await assign(api, id, gone)
      await assign(api, id, unsure)
      await openWeek(page, MATRIX, 'Activiteiten', 'plandag', day)
      await expect(await spot(page, title, 'Weg Proef')).toHaveClass(/nv-mx__away/)
      await expect(await spot(page, title, 'Twijfel Proef')).not.toHaveClass(/nv-mx__away/)
      await shot(page, 'away-only-afwezig')

      expect((await api.patch(`/api/rows/beschikbaarheid/${away}`, { data: { soort: 'beschikbaar' } })).status()).toBe(
        200,
      )
      await page.reload()
      await expect(await spot(page, title, 'Weg Proef')).not.toHaveClass(/nv-mx__away/)
    } finally {
      await removeActivity(api, id)
      await api.delete(`/api/rows/beschikbaarheid/${away}`)
      await api.delete(`/api/rows/beschikbaarheid/${maybe}`)
    }
  })

  test('person-calendar @e2e', async ({ page }) => {
    const api = page.request
    const day = WEEK.calendar
    const timed = await activity(api, 'e2e kalender repetitie', day, ['14:00', '17:00'])
    const untimed = await activity(api, 'e2e kalender overnachting', plusDays(day, 2), null, 'overnachting')
    const who = await person(api, 'Kalender', 'Proef')
    try {
      await assign(api, timed, who)
      await assign(api, untimed, who)
      await openWeek(page, 'Persoonskalender', 'Per persoon per dag', 'plandag', day)
      await expect(page.getByRole('radio', { name: 'Week' })).toBeChecked()
      // A calendar, not a table: the timed one on the hour axis of its day, the untimed one in that day's all-day band.
      await expect(page.getByTestId('hours')).toContainText('08:00')
      const monday = page.getByRole('region', { name: 'ma 24', exact: true })
      await expect(monday.getByRole('button', { name: /14:00–17:00.*e2e kalender repetitie/ })).toBeVisible()
      const band = page.getByRole('group', { name: 'Hele dag wo 26', exact: true })
      await expect(band.getByRole('button', { name: /e2e kalender overnachting/ })).toBeVisible()
      await expect(page.getByRole('list', { name: 'Rijen' })).toContainText('Kalender Proef')
      await shot(page, 'person-calendar')

      await page.getByRole('radio', { name: 'Productie' }).click()
      await expect(page.getByRole('list', { name: 'Rijen' }).getByText('Nachtwacht', { exact: true })).toBeVisible()
      await expect(band.getByRole('button', { name: /e2e kalender overnachting/ })).toHaveAttribute(
        'title',
        'Nachtwacht · e2e kalender overnachting',
      )

      await page.getByRole('button', { name: /e2e kalender repetitie/ }).click()
      await expect(page.getByRole('complementary', { name: 'e2e kalender repetitie' })).toBeVisible()
    } finally {
      await removeActivity(api, timed)
      await removeActivity(api, untimed)
    }
  })

  test('company-week @e2e', async ({ page }) => {
    await openWeek(page, 'Bedrijfsweek', 'Per productie per dag', 'plandag', '2026-10-12')
    await expect(page.getByRole('radio', { name: 'Week' })).toBeChecked()
    // productie_dag has no start: only the all-day band, the productions told apart by colour and legend.
    await expect(page.getByTestId('hours')).toHaveCount(0)
    const legend = page.getByRole('list', { name: 'Rijen' })
    await expect(legend.getByText('De Kersentuin', { exact: true })).toBeVisible()
    await expect(legend.getByText('Nachtwacht', { exact: true })).toBeVisible()
    await expect(
      page.getByRole('group', { name: 'Hele dag ma 12', exact: true }).getByRole('button').first(),
    ).toBeVisible()
    await shot(page, 'company-week')

    // The month fills the view, its chips carry the lane colours, and a click opens the row drawer beside it.
    await page.getByRole('radio', { name: 'Maand' }).click()
    await expect(page.getByRole('radio', { name: 'Maand' })).toBeChecked()
    const month = page.locator('table.nv-cal--month')
    const [table, body] = [await month.boundingBox(), await page.locator('.nv-cal__body').boundingBox()]
    expect((table?.y ?? 0) + (table?.height ?? 0)).toBeGreaterThan((body?.y ?? 0) + (body?.height ?? 0) - 4)
    const chip = month.getByRole('button', { name: /Nachtwacht/ }).first()
    expect(await chip.evaluate((el) => getComputedStyle(el).borderRadius)).toBe('0px')
    await openLooks(page)
    await page.getByRole('radio', { name: 'Donker' }).click()
    await shot(page, 'company-month-dark')
    await chip.click()
    const drawer = page.getByRole('complementary')
    await expect(drawer).toBeVisible()
    const [aside, cal] = [await drawer.boundingBox(), await page.locator('.nv-cal__body').boundingBox()]
    expect(aside?.x ?? 0).toBeGreaterThanOrEqual((cal?.x ?? 0) + (cal?.width ?? 0) - 1)
    await shot(page, 'company-month-drawer')
    await page.getByRole('radio', { name: 'Auto' }).click()
  })

  // Empty edge: a role nobody holds has no candidates; the picker says so and still offers everyone.
  test('candidates-none @e2e', async ({ page }) => {
    const api = page.request
    const title = 'e2e geen kandidaten'
    const id = await activity(api, title, WEEK.none, ['10:00', '12:00'])
    const rol = await idOf(api, 'rol', { naam: 'e2e Niemandsrol', categorie: 'techniek' })
    try {
      await idOf(api, 'toewijzing', { activiteit_id: id, rol_id: rol })
      await openWeek(page, MATRIX, 'Activiteiten', 'plandag', WEEK.none)
      await row(page, title).locator('[data-testid="open"]').getByRole('button').click()
      const picker = page.getByRole('region', { name: 'Open plek invullen' })
      await expect(picker.getByText('Geen kandidaten', { exact: true })).toBeVisible()
      await expect(picker.locator('.nv-mx__pick')).toHaveCount(0)
      await shot(page, 'candidates-none')
      await picker.getByRole('button', { name: 'Iedereen tonen' }).click()
      await expect(picker.getByRole('button', { name: 'Bram De Wilde', exact: true })).toBeVisible()
      await expect(picker.getByRole('button', { name: 'Noor Claes', exact: true })).toBeVisible()
    } finally {
      await removeActivity(api, id)
      await api.delete(`/api/rows/rol/${rol}`)
    }
  })

  // The untimed rule at its edges, and a clash between two productions seen from each production.
  test('conflicten-edges @e2e', async ({ page }) => {
    const api = page.request
    const day = (n: number) => plusDays(WEEK.edges, n)
    const who = await person(api, 'Rand', 'Proef')
    const kersentuin = await idByName(api, 'productie', 'titel', 'De Kersentuin')
    const made: number[] = []
    const make = async (omschrijving: string, values: Values) => {
      const id = await idOf(api, 'activiteit', {
        productie_id: await nachtwacht(api),
        soort: 'repetitie',
        status: 'bevestigd',
        omschrijving,
        ...values,
      })
      made.push(id)
      await assign(api, id, who)
      return id
    }
    const at = (d: number, from: string, to?: string, next = 0) => ({
      start_at: `${day(d)}T${from}`,
      ...(to ? { eind_at: `${day(d + next)}T${to}` } : {}),
    })
    try {
      await make('e2e raak een', at(0, '10:00', '12:00'))
      await make('e2e raak twee', at(0, '12:00', '14:00'))
      await make('e2e punt een', at(1, '20:00'))
      await make('e2e punt twee', at(1, '20:00'))
      await make('e2e nachtwerk', at(2, '22:00', '01:00', 1))
      await make('e2e na middernacht', { start_at: `${day(3)}T00:30`, eind_at: `${day(3)}T01:30` })
      await make('e2e maaltijd', { ...at(4, '10:00', '12:00'), soort: 'maaltijd' })
      await make('e2e werk bij maaltijd', at(4, '10:00', '12:00'))
      await make('e2e getimed', at(5, '10:00', '12:00'))
      await make('e2e ongetimed', { datum: day(5) })
      await make('e2e kruis nacht', at(6, '10:00', '12:00'))
      await make('e2e kruis kers', { ...at(6, '11:00', '13:00'), productie_id: kersentuin })

      await page.goto('/')
      await openView(page, 'Conflicten', 'Conflicten')
      await expect(page.getByRole('heading', { level: 1 })).toHaveText('Conflicten')
      const [type, ernst] = [await columnOf(page, 'Type'), await columnOf(page, 'Ernst')]
      const rows = (text: string) => page.locator('tbody tr.nv-tr').filter({ hasText: text })
      await expect(rows('e2e punt een en e2e punt twee').first()).toBeVisible()
      for (const [text, weight] of [
        ['e2e punt een en e2e punt twee', 'Conflict'],
        ['e2e nachtwerk en e2e na middernacht', 'Conflict'],
        ['e2e getimed en e2e ongetimed', 'Waarschuwing'],
      ]) {
        await expect(rows(text).first().locator('td').nth(type)).toHaveText('Overlap')
        await expect(rows(text).first().locator('td').nth(ernst)).toHaveText(weight)
      }
      await expect(rows('e2e raak een')).toHaveCount(0)
      await expect(rows('e2e maaltijd')).toHaveCount(0)
      await expect(rows('e2e werk bij maaltijd')).toHaveCount(0)
      await expect(rows('Rand Proef staat dubbel ingepland: e2e kruis')).toHaveCount(2)

      // Under each production's scope its own side of the cross-production clash is listed.
      for (const production of ['De Kersentuin', 'Nachtwacht']) {
        await page.getByRole('button', { name: 'Alle producties', exact: true }).click()
        await page.getByRole('option', { name: production, exact: true }).click()
        await expect(page.getByRole('button', { name: production, exact: true })).toBeVisible()
        await expect(rows('Rand Proef staat dubbel ingepland: e2e kruis')).toHaveCount(1)
        if (production === 'De Kersentuin') await shot(page, 'conflicten-scoped')
        await page.getByRole('button', { name: production, exact: true }).click()
        await page.getByRole('option', { name: 'Alle producties', exact: true }).click()
        await expect(page.getByRole('button', { name: 'Alle producties', exact: true })).toBeVisible()
      }
    } finally {
      for (const id of made) await removeActivity(api, id)
    }
  })

  // Denied actor: an owner reads none of the new queries and cannot filter its own rows by a lookup.
  test('owner-denied-queries @e2e', async ({ browser }) => {
    const owner = await browser.newContext({ storageState: state('owner') })
    try {
      for (const query of ['conflicten', 'kandidaten', 'persoon_dag', 'locatie_dag', 'werklijst'])
        expect((await owner.request.get(`/api/rows/${query}`)).status(), query).toBe(404)
      const filter = encodeURIComponent(JSON.stringify({ datum: { $eq: '2026-10-12' } }))
      expect((await owner.request.get(`/api/rows/toewijzing?filter=${filter}`)).status()).toBe(400)
      expect((await owner.request.get('/api/rows/toewijzing')).status()).toBe(200)
      const page = await owner.newPage()
      await page.goto('/')
      await expect(page.getByRole('navigation', { name: 'Views' })).toBeVisible()
      await expect(page.getByRole('navigation', { name: 'Views' }).getByText('Conflicten')).toHaveCount(0)
      await expect(page.getByRole('navigation', { name: 'Views' }).getByText('Per persoon per dag')).toHaveCount(0)
    } finally {
      await owner.close()
    }
  })

  // Boundary: a night on its plandag past midnight, an end before its start drawn as a point,
  // and a date condition that is no whole week opening the week it starts in.
  test('calendar-edges @e2e', async ({ page }) => {
    const api = page.request
    const monday = WEEK.night
    const who = await person(api, 'Nacht', 'Proef')
    const night = await idOf(api, 'activiteit', {
      productie_id: await nachtwacht(api),
      soort: 'opbouw',
      status: 'bevestigd',
      omschrijving: 'e2e nachtdienst',
      start_at: `${monday}T22:00`,
      eind_at: `${plusDays(monday, 1)}T01:00`,
    })
    const backwards = await activity(api, 'e2e omgekeerd', plusDays(monday, 1), ['15:00', '16:00'])
    writeDb('UPDATE activiteit SET eind_at = ? WHERE id = ?', `${plusDays(monday, 1)}T13:00`, backwards)
    try {
      await assign(api, night, who)
      await assign(api, backwards, who)
      await openWeek(page, 'Persoonskalender', 'Per persoon per dag', 'plandag', plusDays(monday, 2), 1)
      await expect(page.getByRole('radio', { name: 'Week' })).toBeChecked()
      await expect(page.locator('.nv-week__dayhead')).toHaveCount(7)
      await expect(page.locator('.nv-week__dayhead').first()).toHaveText('ma 22')
      await expect(page.locator('.nv-week__dayhead').last()).toHaveText('zo 28')

      const nightBlock = page
        .getByRole('region', { name: 'ma 22', exact: true })
        .getByRole('button', { name: /e2e nachtdienst/ })
      await expect(nightBlock).toContainText('22:00–01:00')
      // The axis runs on past midnight: its last hour row is 00:00–01:00, where the night ends.
      await expect(page.getByTestId('hours')).toHaveText(/23:0000:00$/)
      const box = await nightBlock.boundingBox()
      const day = await page.getByRole('region', { name: 'ma 22', exact: true }).boundingBox()
      expect((box?.y ?? 0) + (box?.height ?? 0)).toBeLessThanOrEqual((day?.y ?? 0) + (day?.height ?? 0) + 1)
      expect(box?.height ?? 0).toBeGreaterThan(100)

      const point = page
        .getByRole('region', { name: 'di 23', exact: true })
        .getByRole('button', { name: /e2e omgekeerd/ })
      await expect(point.locator('.nv-cal__time')).toHaveText('15:00')
      expect((await point.boundingBox())?.height ?? 0).toBeGreaterThan(0)
      expect((await point.boundingBox())?.height ?? 0).toBeLessThan(48)
      await nightBlock.scrollIntoViewIfNeeded()
      await shot(page, 'calendar-edges')

      await page.getByRole('button', { name: 'Volgende periode' }).click()
      await expect(page.locator('.nv-week__dayhead').first()).toHaveText('ma 29')
      await expect(page.locator('.nv-week__dayhead')).toHaveCount(7)
    } finally {
      await removeActivity(api, night)
      await removeActivity(api, backwards)
    }
  })

  // Boundary: November 2026 starts on a Sunday, so its month shows six whole weeks.
  test('month-starting-sunday @e2e', async ({ page }) => {
    await openWeek(page, 'Bedrijfsweek', 'Per productie per dag', 'plandag', '2026-10-12')
    await page.getByRole('radio', { name: 'Maand' }).click()
    await expect(page.locator('.nv-cal__bar')).toContainText('oktober 2026')
    await page.getByRole('button', { name: 'Volgende periode' }).click()
    await expect(page.locator('.nv-cal__bar')).toContainText('november 2026')
    const month = page.locator('table.nv-cal--month')
    await expect(month.locator('tbody tr')).toHaveCount(6)
    await expect(month.locator('tbody tr').first().locator('td').last().locator('.nv-cal__date')).toHaveText('1')
    await expect(month.locator('tbody tr').last().locator('td').first().locator('.nv-cal__date')).toHaveText('30')
    await shot(page, 'month-six-weeks')
  })

  // Found in the shake-out: a timed activity with no end is a 20 px block, and its name is clipped to nothing.
  test('point-event-shows-its-name @e2e', async ({ page }) => {
    const api = page.request
    const day = WEEK.point
    const who = await person(api, 'Punt', 'Proef')
    const id = await idOf(api, 'activiteit', {
      productie_id: await nachtwacht(api),
      soort: 'voorstelling',
      status: 'bevestigd',
      omschrijving: 'e2e voorstelling zonder einde',
      start_at: `${day}T20:00`,
    })
    try {
      await assign(api, id, who)
      await openWeek(page, 'Persoonskalender', 'Per persoon per dag', 'plandag', day)
      const event = page
        .getByRole('region', { name: 'ma 29', exact: true })
        .getByRole('button', { name: /e2e voorstelling zonder einde/ })
      await expect(event.locator('.nv-cal__time')).toHaveText('20:00')
      await event.scrollIntoViewIfNeeded()
      await shot(page, 'point-event')
      const shown = await event.evaluate((el) => {
        const block = el.getBoundingClientRect()
        const title = (el.querySelector('.nv-cal__title') as HTMLElement).getBoundingClientRect()
        return { height: title.height, inside: title.bottom <= block.bottom + 0.5 }
      })
      expect(shown.height).toBeGreaterThan(8)
      expect(shown.inside).toBe(true)
    } finally {
      await removeActivity(api, id)
    }
  })
})
