import { expect, type Locator, type Page, test } from '@playwright/test'
import { state, THEATRE } from './auth'
import { openView } from './tree'

// Weeks the seed leaves empty, one per flow, so no flow sees another's rows.
const APPLY_WEEK = '2026-11-02'
const UNDO_WEEK = '2026-11-16'
const SJABLOON = 'speeldag op locatie'
const VENUE = 'Zaal De Spiegel'
const TWICE =
  'Deze speelreeks heeft al activiteiten. Maak de vorige toepassing ongedaan of verwijder die activiteiten, en pas het sjabloon dan opnieuw toe.'

// The Calais day: omschrijving and start; Overnachting is untimed.
const PATTERN: [string, string | null][] = [
  ['Lunch', '13:00'],
  ['Voorbereiding', '14:00'],
  ['Diner', '17:30'],
  ['Voorbereiding avond', '18:30'],
  ['Voorstelling', '20:00'],
  ['Afwas', '21:15'],
  ['Overnachting', null],
]
// Each timed item's end, from the template's durations: Dagplanning shows the range.
const UNTIL: Record<string, string> = {
  Lunch: '14:00',
  Voorbereiding: '17:30',
  Diner: '18:30',
  'Voorbereiding avond': '20:00',
  Voorstelling: '21:15',
  Afwas: '22:15',
}

type Api = Page['request']
type Values = Record<string, unknown>
interface Revision {
  batch_id: string | null
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

const productieId = async (api: Api, titel: string) =>
  (await rowsOf<{ id: number; titel: string }>(api, 'productie')).find((p) => p.titel === titel)?.id as number

const organisatieId = async (api: Api, naam: string) =>
  (await rowsOf<{ id: number; naam: string }>(api, 'organisatie')).find((o) => o.naam === naam)?.id as number

const sjabloonId = async (api: Api) =>
  (await rowsOf<{ id: number; naam: string }>(api, 'sjabloon')).find((s) => s.naam === SJABLOON)?.id as number

async function speelreeks(api: Api, naam: string, start: string, eind: string): Promise<number> {
  return idOf(api, 'speelreeks', {
    naam,
    productie_id: await productieId(api, 'Nachtwacht'),
    locatie_id: await organisatieId(api, VENUE),
    start_datum: start,
    eind_datum: eind,
  })
}

async function pick(page: Page, view: string, model = view) {
  await openView(page, view, model)
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(view)
}

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

const cellOf = async (page: Page, tr: Locator, label: string) => tr.locator('td').nth(await columnIndex(page, label))

async function typeInto(target: Locator, value: string) {
  await target.click()
  await target.press('Enter')
  await target.locator('input').fill(value)
  await target.locator('input').press('Enter')
}

const named = (page: Page, title: string) => page.locator(`tbody tr.nv-tr[data-title="${title}"]`)
const gridRows = (page: Page) => page.locator('tbody tr.nv-tr')

const plusDays = (iso: string, days: number) => {
  const at = new Date(`${iso}T12:00:00Z`)
  at.setUTCDate(at.getUTCDate() + days)
  return at.toISOString().slice(0, 10)
}

/** A day as the grid shows it in the page's locale. */
const shown = (page: Page, iso: string) =>
  page.evaluate((day) => {
    const [y, m, d] = day.split('-').map(Number)
    const lang = document.documentElement.lang || 'en'
    return new Intl.DateTimeFormat(lang, { day: '2-digit', month: '2-digit', year: 'numeric' }).format(
      new Date(y, m - 1, d),
    )
  }, iso)

const patchOf = (page: Page, dataset: string) =>
  page.waitForResponse(
    (res) => res.request().method() === 'PATCH' && new URL(res.url()).pathname.startsWith(`/api/rows/${dataset}/`),
  )

const undoOf = (page: Page) =>
  page.waitForResponse(
    (res) => res.request().method() === 'POST' && /^\/api\/batches\/[^/]+\/undo$/.test(new URL(res.url()).pathname),
  )

/** Dagplanning as it reads: each group's rows, with the cells this gate looks at. */
async function dayGroups(page: Page) {
  const cols = {
    start: await columnIndex(page, 'Tijd'),
    locatie: await columnIndex(page, 'Locatie'),
  }
  return page.locator('tbody tr').evaluateAll((trs, c) => {
    const groups: { title: string; start: string; locatie: string }[][] = []
    for (const tr of trs) {
      if (tr.classList.contains('nv-group')) groups.push([])
      if (!tr.classList.contains('nv-tr')) continue
      const text = (i: number) => (tr.children[i]?.textContent ?? '').trim()
      groups[groups.length - 1].push({
        title: tr.getAttribute('data-title') ?? '',
        start: text(c.start),
        locatie: text(c.locatie),
      })
    }
    return groups
  }, cols)
}

/** The grid reads the hash once, on load: a hash-only goto needs the reload. */
async function land(page: Page, hash: string) {
  await page.goto(hash)
  await page.reload()
}

/** + New in Speelreeksen: the draft asks Naam, then Productie; Locatie and the days are typed into the row. */
async function createInGrid(page: Page, naam: string, start: string, eind: string) {
  await pick(page, 'Speelreeksen')
  const created = page.waitForResponse(
    (res) => res.request().method() === 'POST' && new URL(res.url()).pathname === '/api/rows/speelreeks',
  )
  await page.getByRole('button', { name: 'Nieuwe speelreeks' }).click()
  await page.getByRole('textbox', { name: 'Naam' }).fill(naam)
  await page.getByRole('textbox', { name: 'Naam' }).press('Enter')
  await page.getByRole('combobox', { name: 'Productie' }).fill('Nacht')
  await page.getByRole('option', { name: 'Nachtwacht' }).click()
  expect((await created).status()).toBe(201)
  await expect(page.locator('tbody tr.nv-tr--draft')).toHaveCount(0)
  const row = named(page, naam)

  const locatie = await cellOf(page, row, 'Locatie')
  await locatie.click()
  await locatie.press('Enter')
  await page.getByRole('combobox', { name: 'Locatie' }).fill('Spiegel')
  const located = patchOf(page, 'speelreeks')
  await page.getByRole('option', { name: VENUE }).click()
  expect((await located).status()).toBe(200)
  await expect(locatie).toHaveText(VENUE)

  // Einde first: the default days are today's, and an end before the start is refused.
  const saved = patchOf(page, 'speelreeks')
  await typeInto(await cellOf(page, row, 'Einde'), eind)
  expect((await saved).status()).toBe(200)
  await typeInto(await cellOf(page, row, 'Start'), start)
  await expect(await cellOf(page, row, 'Start')).toHaveText(await shown(page, start))
  await expect(await cellOf(page, row, 'Einde')).toHaveText(await shown(page, eind))
}

/** The drawer's action: the Sjabloon picked, then the button; answers the action's reply. */
async function applyInDrawer(page: Page, naam: string) {
  await named(page, naam).getByRole('button', { name: 'Openen' }).click()
  const action = page.getByRole('group', { name: 'Sjabloon toepassen' })
  await action.getByRole('button', { name: /^Sjabloon: / }).click()
  await page.getByRole('combobox', { name: 'Sjabloon' }).fill('speeldag')
  await page.getByRole('option', { name: SJABLOON }).click()
  await expect(action.getByRole('button', { name: `Sjabloon: ${SJABLOON}` })).toBeVisible()
  const answered = page.waitForResponse(
    (res) => res.request().method() === 'POST' && new URL(res.url()).pathname === '/api/actions/sjabloon_toepassen',
  )
  await action.getByRole('button', { name: 'Sjabloon toepassen', exact: true }).click()
  return answered
}

test('apply-template @e2e', async ({ page }) => {
  const naam = 'Speelreeks e2e Spiegel'
  const days = [0, 1, 2, 3].map((n) => plusDays(APPLY_WEEK, n))
  // The window is the app's, not the view's: set here, Dagplanning opens on the week without a reload.
  await land(page, `/#from=${APPLY_WEEK}`)
  await createInGrid(page, naam, days[0], days[3])
  const reeks = (await rowsOf<{ id: number; naam: string }>(page.request, 'speelreeks')).find((r) => r.naam === naam)
  expect(reeks).toBeDefined()

  const answered = await applyInDrawer(page, naam)
  expect(answered.status()).toBe(201)
  const reply = (await answered.json()) as { batch_id: string; created: { dataset: string; id: number }[] }
  expect(reply.created).toHaveLength(28)
  await expect(page.getByText(`Sjabloon toepassen uitgevoerd.`)).toBeVisible()

  // The 28 activities, as the server holds them: every day the pattern, at its times, the venue left to inherit.
  const made = await rowsOf<Values>(page.request, 'activiteit', { speelreeks_id: reeks?.id })
  expect(made).toHaveLength(28)
  const want = days.flatMap((day) =>
    PATTERN.map(([omschrijving, tijd]) => `${day} ${omschrijving} ${tijd ? `${day}T${tijd}` : '-'}`),
  )
  expect(made.map((a) => `${a.datum} ${a.omschrijving} ${a.start_at ?? '-'}`).sort()).toEqual(want.sort())
  for (const a of made) {
    expect(a.locatie_id ?? null).toBeNull()
    expect(a.status).toBe('optie')
  }

  // Their Revision rows share the action's one batch.
  for (const { id } of reply.created) {
    const response = await page.request.get(`/api/revisions/activiteit/${id}`)
    expect(response.status()).toBe(200)
    const revisions = ((await response.json()) as { revisions: Revision[] }).revisions
    expect(revisions.length).toBeGreaterThan(0)
    for (const revision of revisions) expect(revision.batch_id).toBe(reply.batch_id)
  }

  await page.keyboard.press('Escape')
  await pick(page, 'Dagplanning')
  await expect(gridRows(page)).toHaveCount(28)
  // Grouped by plandag: one group a day, each the whole pattern at its times, the venue the Speelreeks's.
  const groups = await dayGroups(page)
  expect(groups).toHaveLength(4)
  for (const rows of groups) {
    const want = PATTERN.map(
      ([title, tijd]) => `${title}|${tijd ? `${tijd}–${UNTIL[title]}` : 'zonder tijd'}|${VENUE}via speelreeks`,
    )
    expect(rows.map((r) => `${r.title}|${r.start}|${r.locatie}`).sort()).toEqual(want.sort())
  }

  // One undo, from a cell of Dagplanning, removes the 28.
  await (await cellOf(page, gridRows(page).first(), 'Soort')).click()
  const undone = undoOf(page)
  await page.keyboard.press('ControlOrMeta+z')
  expect((await undone).status()).toBe(200)
  await expect(gridRows(page)).toHaveCount(0)
  expect(await rowsOf(page.request, 'activiteit', { speelreeks_id: reeks?.id })).toHaveLength(0)

  await page.reload()
  await pick(page, 'Dagplanning')
  await expect(page.getByText('Geen rijen in deze week')).toBeVisible()
  await expect(gridRows(page)).toHaveCount(0)
})

test('apply-twice @e2e', async ({ page }) => {
  const naam = 'Speelreeks e2e twee keer'
  const id = await speelreeks(page.request, naam, '2026-11-09', '2026-11-10')
  const first = await page.request.post('/api/actions/sjabloon_toepassen', {
    data: { id, input: { sjabloon_id: await sjabloonId(page.request) } },
  })
  expect(first.status()).toBe(201)

  await page.goto('/')
  await pick(page, 'Speelreeksen')
  const answered = await applyInDrawer(page, naam)
  expect(answered.status()).toBe(422)
  await expect(page.getByRole('group', { name: 'Sjabloon toepassen' }).getByRole('alert')).toHaveText(TWICE)
  expect(await rowsOf(page.request, 'activiteit', { speelreeks_id: id })).toHaveLength(14)
})

test('speelreeks-delete-in-use @e2e', async ({ page }) => {
  const naam = 'Speelreeks e2e in gebruik'
  const id = await speelreeks(page.request, naam, '2026-11-23', '2026-11-23')
  const applied = await page.request.post('/api/actions/sjabloon_toepassen', {
    data: { id, input: { sjabloon_id: await sjabloonId(page.request) } },
  })
  expect(applied.status()).toBe(201)

  await page.goto('/')
  await pick(page, 'Speelreeksen')
  await named(page, naam).getByRole('button', { name: 'Openen' }).click()
  await page.getByRole('button', { name: 'Verwijderen' }).click()
  const answered = page.waitForResponse((res) => res.request().method() === 'DELETE')
  await page.getByRole('button', { name: 'Zeker?' }).click()
  const response = await answered
  expect(response.status()).toBe(409)
  const body = (await response.json()) as { code: string; by: { label: string; count: number }[] }
  expect(body.code).toBe('in_use')
  expect(body.by).toEqual([{ label: 'Activiteiten', count: 7 }])

  await expect(page.locator('.nv-toolbar')).toContainText('Nog in gebruik door Activiteiten (7).')
  await expect(named(page, naam)).toBeVisible()
  await page.reload()
  await pick(page, 'Speelreeksen')
  await expect(named(page, naam)).toBeVisible()
})

test('speelreeks-end-before-start @e2e', async ({ page }) => {
  const naam = 'Speelreeks e2e omgekeerd'
  const id = await speelreeks(page.request, naam, '2026-11-30', '2026-12-02')
  await page.goto('/')
  await pick(page, 'Speelreeksen')
  const row = named(page, naam)

  const refused = patchOf(page, 'speelreeks')
  await typeInto(await cellOf(page, row, 'Einde'), '2026-11-28')
  expect((await refused).status()).toBe(422)
  await expect(row.getByRole('alert')).toContainText('Einde ligt voor de start.')

  const [held] = await rowsOf<Values>(page.request, 'speelreeks', { id })
  expect(held.eind_datum).toBe('2026-12-02')
  await page.reload()
  await pick(page, 'Speelreeksen')
  await expect(await cellOf(page, named(page, naam), 'Einde')).toHaveText(await shown(page, '2026-12-02'))
})

test('undo-changed-since @e2e', async ({ page, browser }) => {
  const omschrijving = 'dagplanning e2e twee handen'
  const datum = plusDays(UNDO_WEEK, 1)
  const id = await idOf(page.request, 'activiteit', {
    productie_id: await productieId(page.request, 'Nachtwacht'),
    soort: 'repetitie',
    datum,
    omschrijving,
  })
  const startOf = async () => (await rowsOf<Values>(page.request, 'activiteit', { id }))[0].start_at

  await land(page, `/#from=${UNDO_WEEK}`)
  await pick(page, 'Dagplanning')
  const savedA = patchOf(page, 'activiteit')
  await typeInto(await cellOf(page, named(page, omschrijving), 'Tijd'), `${datum}T10:00`)
  expect((await savedA).status()).toBe(200)

  const other = await browser.newContext({ baseURL: THEATRE.app, storageState: state('admin') })
  const b = await other.newPage()
  await land(b, `/#from=${UNDO_WEEK}`)
  await pick(b, 'Dagplanning')
  const savedB = patchOf(b, 'activiteit')
  await typeInto(await cellOf(b, named(b, omschrijving), 'Tijd'), `${datum}T11:00`)
  expect((await savedB).status()).toBe(200)
  await expect(await cellOf(b, named(b, omschrijving), 'Tijd')).toHaveText('11:00')
  await other.close()
  expect(await startOf()).toBe(`${datum}T11:00`)

  const undone = undoOf(page)
  await page.keyboard.press('ControlOrMeta+z')
  const response = await undone
  expect(response.status()).toBe(409)
  expect(((await response.json()) as { code: string }).code).toBe('changed_since')
  await expect(page.getByText('Start is intussen gewijzigd; ongedaan maken kan niet.')).toBeVisible()

  await page.reload()
  await pick(page, 'Dagplanning')
  await expect(await cellOf(page, named(page, omschrijving), 'Tijd')).toHaveText('11:00')
  expect(await startOf()).toBe(`${datum}T11:00`)
})

// The shake-out's flows: the spec's surfaces no flow above drives.

const RATE_REFUSED = 'Alleen een beheerder wijzigt tarieven.'

test('rollen-editor-rate-refused @e2e', async ({ page }) => {
  const before = (await rowsOf<Values>(page.request, 'rol', { naam: 'Lichttechnicus' }))[0]
  await page.goto('/')
  await pick(page, 'Rollen')
  const row = named(page, 'Lichttechnicus')

  const refused = patchOf(page, 'rol')
  await typeInto(await cellOf(page, row, 'Dagtarief'), '999')
  expect((await refused).status()).toBe(403)
  await expect(row.getByRole('alert')).toContainText(RATE_REFUSED)

  // The other columns stay the editor's.
  const saved = patchOf(page, 'rol')
  await typeInto(await cellOf(page, row, 'Standaard verrekening'), 'dagcontract')
  expect((await saved).status()).toBe(200)

  await page.reload()
  await pick(page, 'Rollen')
  await expect(await cellOf(page, named(page, 'Lichttechnicus'), 'Standaard verrekening')).toHaveText('dagcontract')
  const [held] = await rowsOf<Values>(page.request, 'rol', { id: before.id })
  expect(held.dagtarief).toBe(before.dagtarief)
  expect(held.standaard_verrekening).toBe('dagcontract')
})

test.describe('as the administrator', () => {
  test.use({ storageState: state('admin') })

  test('rollen-admin-rate @e2e', async ({ page }) => {
    await page.goto('/')
    await pick(page, 'Rollen')
    const saved = patchOf(page, 'rol')
    await typeInto(await cellOf(page, named(page, 'Speler'), 'Dagtarief'), '225')
    expect((await saved).status()).toBe(200)

    await page.reload()
    await pick(page, 'Rollen')
    await expect(await cellOf(page, named(page, 'Speler'), 'Dagtarief')).toHaveText('225')
    expect((await rowsOf<Values>(page.request, 'rol', { naam: 'Speler' }))[0].dagtarief).toBe(225)
  })
})

test('sjablonen-read-only @e2e', async ({ page }) => {
  await page.goto('/')
  await pick(page, 'Sjablonen')
  await expect(page.getByRole('img', { name: 'Standaardweergave: maak een kopie om aan te passen' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Nieuw sjabloon' })).toBeDisabled()
  const row = named(page, SJABLOON)
  for (const label of ['Naam', 'Items']) {
    const cell = await cellOf(page, row, label)
    await cell.click()
    await cell.press('Enter')
    await expect(cell.locator('input, textarea')).toHaveCount(0)
  }
  const id = await sjabloonId(page.request)
  const patched = await page.request.patch(`/api/rows/sjabloon/${id}`, { data: { naam: 'anders' } })
  expect(patched.status()).toBe(405)
  expect(((await patched.json()) as { code: string }).code).toBe('read_only')
  expect((await page.request.delete(`/api/rows/sjabloon/${id}`)).status()).toBe(405)
})

test('dagplanning-locatie-van @e2e', async ({ page }) => {
  const week = '2026-12-07'
  const api = page.request
  const reeks = await speelreeks(api, 'Speelreeks e2e bron', week, week)
  const productie_id = await productieId(api, 'Nachtwacht')
  const base = { productie_id, soort: 'repetitie', datum: week }
  await idOf(api, 'activiteit', { ...base, omschrijving: 'bron geerfd', speelreeks_id: reeks })
  const eigen = await organisatieId(api, 'Repetitiekot De Loods')
  await idOf(api, 'activiteit', { ...base, omschrijving: 'bron eigen', speelreeks_id: reeks, locatie_id: eigen })
  await idOf(api, 'activiteit', { ...base, omschrijving: 'bron geen' })

  await land(page, `/#from=${week}`)
  await pick(page, 'Dagplanning')
  // "Locatie van" left the default view (R10); the grid shows the venue, the query still serves where it comes from.
  const seen = async (title: string) => {
    const [row] = await rowsOf<Values>(api, 'dagplanning', { omschrijving: title })
    return [await (await cellOf(page, named(page, title), 'Locatie')).textContent(), row.locatie_bron ?? null]
  }
  expect(await seen('bron geerfd')).toEqual([`${VENUE}via speelreeks`, 'speelreeks'])
  expect(await seen('bron eigen')).toEqual(['Repetitiekot De Loods', 'eigen'])
  expect(await seen('bron geen')).toEqual(['', null])

  // Resolved, not stored: the inheriting activity holds no venue of its own.
  const [held] = await rowsOf<Values>(api, 'activiteit', { omschrijving: 'bron geerfd' })
  expect(held.locatie_id ?? null).toBeNull()
})

test('apply-double-submit @e2e', async ({ page }) => {
  const naam = 'Speelreeks e2e dubbel'
  const id = await speelreeks(page.request, naam, '2026-12-14', '2026-12-15')
  await page.goto('/')
  await pick(page, 'Speelreeksen')
  await named(page, naam).getByRole('button', { name: 'Openen' }).click()
  const action = page.getByRole('group', { name: 'Sjabloon toepassen' })
  await action.getByRole('button', { name: /^Sjabloon: / }).click()
  await page.getByRole('combobox', { name: 'Sjabloon' }).fill('speeldag')
  await page.getByRole('option', { name: SJABLOON }).click()
  const created: number[] = []
  page.on('response', (res) => {
    if (new URL(res.url()).pathname === '/api/actions/sjabloon_toepassen' && res.status() === 201) created.push(201)
  })
  await action.getByRole('button', { name: 'Sjabloon toepassen', exact: true }).dblclick()
  await expect(page.getByText('Sjabloon toepassen uitgevoerd.')).toBeVisible()
  expect(created).toHaveLength(1)
  expect(await rowsOf(page.request, 'activiteit', { speelreeks_id: id })).toHaveLength(14)
})

/** Applies the Sjabloon from the drawer and opens Dagplanning on the week, a cell focused for the keyboard. */
async function appliedInDagplanning(page: Page, naam: string, week: string, days: number): Promise<number> {
  await land(page, `/#from=${week}`)
  const id = await speelreeks(page.request, naam, week, plusDays(week, days - 1))
  await pick(page, 'Speelreeksen')
  expect((await applyInDrawer(page, naam)).status()).toBe(201)
  await page.keyboard.press('Escape')
  await pick(page, 'Dagplanning')
  await (await cellOf(page, gridRows(page).first(), 'Soort')).click()
  return id
}

test('apply-undo-changed-since @e2e', async ({ page, browser }) => {
  const id = await appliedInDagplanning(page, 'Speelreeks e2e na wijziging', '2026-12-21', 1)
  const made = await rowsOf<{ id: number; omschrijving: string }>(page.request, 'activiteit', { speelreeks_id: id })
  const lunch = made.find((a) => a.omschrijving === 'Lunch')

  // A colleague gives the Lunch a venue of its own: the column the apply left empty.
  const other = await browser.newContext({ baseURL: THEATRE.app, storageState: state('admin') })
  const locatie_id = await organisatieId(other.request, 'Repetitiekot De Loods')
  expect((await other.request.patch(`/api/rows/activiteit/${lunch?.id}`, { data: { locatie_id } })).status()).toBe(200)
  await other.close()

  const undone = undoOf(page)
  await page.keyboard.press('ControlOrMeta+z')
  const response = await undone
  expect(response.status()).toBe(409)
  expect(await response.json()).toMatchObject({ code: 'changed_since', column: 'locatie_id', label: 'Locatie' })
  await expect(page.getByText('Locatie is intussen gewijzigd; ongedaan maken kan niet.')).toBeVisible()
  expect(await rowsOf(page.request, 'activiteit', { speelreeks_id: id })).toHaveLength(7)
})

test('apply-redo-refused @e2e', async ({ page }) => {
  const naam = 'Speelreeks e2e opnieuw'
  const id = await appliedInDagplanning(page, naam, '2026-12-28', 2)
  const undone = undoOf(page)
  await page.keyboard.press('ControlOrMeta+z')
  expect((await undone).status()).toBe(200)
  await expect(gridRows(page)).toHaveCount(0)

  // Dagplanning is empty now: the redo is pressed from a cell of Speelreeksen, the same tab's history.
  await pick(page, 'Speelreeksen')
  await (await cellOf(page, named(page, naam), 'Naam')).click()
  const redone = undoOf(page)
  await page.keyboard.press('ControlOrMeta+Shift+z')
  const response = await redone
  expect(response.status()).toBe(422)
  expect(((await response.json()) as { code: string }).code).toBe('not_undoable')
  await expect(page.locator('.nv-toolbar')).toContainText('Dit kan niet ongedaan gemaakt worden.')
  expect(await rowsOf(page.request, 'activiteit', { speelreeks_id: id })).toHaveLength(0)
})

test('speelreeks-boundaries @e2e', async ({ page }) => {
  const api = page.request
  const productie_id = await productieId(api, 'Nachtwacht')
  const reeks = (eind: string, extra: Values = {}) =>
    api.post('/api/rows/speelreeks', {
      data: { naam: `Speelreeks e2e tot ${eind}`, productie_id, start_datum: '2027-01-01', eind_datum: eind, ...extra },
    })
  expect((await reeks('2027-01-31')).status()).toBe(201)
  const refusal = async (eind: string, extra: Values = {}) => {
    const response = await reeks(eind, extra)
    expect(response.status()).toBe(422)
    return ((await response.json()) as { message: string }).message
  }
  expect(await refusal('2027-02-01')).toBe('Een speelreeks duurt hoogstens 31 dagen.')
  expect(await refusal('2027-01-02', { productie_id: 99_999 })).toBe('Productie bestaat niet.')
  expect(await refusal('2027-01-02', { locatie_id: 99_999 })).toBe('Locatie bestaat niet.')
})

test.describe('as the owner', () => {
  test.use({ storageState: state('owner') })

  test('owner-denied-speelreeks @e2e', async ({ page }) => {
    const api = page.request
    expect((await api.get('/api/rows/speelreeks')).status()).toBe(404)
    const applied = await api.post('/api/actions/sjabloon_toepassen', { data: { id: 1, input: { sjabloon_id: 1 } } })
    expect(applied.status()).toBe(404)
    const created = await api.post('/api/rows/speelreeks', {
      data: { naam: 'eigenaar', productie_id: 1, start_datum: '2027-01-01', eind_datum: '2027-01-01' },
    })
    expect(created.status()).toBe(404)
    await page.goto('/')
    await expect(page.getByRole('navigation', { name: 'Views' })).not.toContainText('Speelreeksen')
  })
})
