import { expect, type Locator, type Page, test } from '@playwright/test'
import { state, THEATRE } from './auth'
import { pressInMenu } from './drawer'
import { fillDate } from './segments'
import { openView, openWeek } from './tree'

// The tourstop made in the grid starts today and spans at most 31 days, so this week moves with today.
const APPLY_WEEK = mondayAhead(14)
const SJABLOON = 'speeldag op locatie (met plaatsen)'
const VENUE = 'Zaal De Spiegel'

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

/** The header may still be laying out after a landing: wait for the column asked for. */
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

const cellOf = async (page: Page, tr: Locator, label: string) => tr.locator('td').nth(await columnIndex(page, label))

/** A stored date or moment goes into the editor's segments, anything else into its input; Enter commits. */
async function typeInto(target: Locator, value: string) {
  await target.click()
  await target.press('Enter')
  if (/^\d{4}-\d{2}-\d{2}/.test(value)) {
    await fillDate(target, value)
    await target.getByRole('spinbutton').last().press('Enter')
    return
  }
  await target.locator('input').fill(value)
  await target.locator('input').press('Enter')
}

const named = (page: Page, title: string) => page.locator(`tbody tr.nv-tr[data-title="${title}"]`)
const gridRows = (page: Page) => page.locator('tbody tr.nv-tr')

/** This week's Monday plus `days`; local, as the grid's days are. */
function mondayAhead(days: number): string {
  const at = new Date()
  at.setHours(12, 0, 0, 0)
  at.setDate(at.getDate() - ((at.getDay() + 6) % 7) + days)
  return `${at.getFullYear()}-${String(at.getMonth() + 1).padStart(2, '0')}-${String(at.getDate()).padStart(2, '0')}`
}

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

/** + New in Tourstops: the draft asks Naam, then Productie; Locatie and the days are typed into the row. */
async function createInGrid(page: Page, naam: string, start: string, eind: string) {
  await pick(page, 'Tourstops')
  const created = page.waitForResponse(
    (res) => res.request().method() === 'POST' && new URL(res.url()).pathname === '/api/rows/speelreeks',
  )
  await page.getByRole('button', { name: 'Nieuwe tourstop' }).click()
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
  await pressInMenu(page, 'Sjabloon toepassen')
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
  // Landed first: the week's condition stays with Dagplanning, and the tab's undo lives as long as this page.
  await openWeek(page, 'Planning', 'Activiteiten', 'plandag', APPLY_WEEK)
  await createInGrid(page, naam, days[0], days[3])
  const reeks = (await rowsOf<{ id: number; naam: string }>(page.request, 'speelreeks')).find((r) => r.naam === naam)
  expect(reeks).toBeDefined()

  const answered = await applyInDrawer(page, naam)
  expect(answered.status()).toBe(201)
  const reply = (await answered.json()) as { batch_id: string; created: { dataset: string; id: number }[] }
  const activities = reply.created.filter((c) => c.dataset === 'activiteit')
  const slotIds = reply.created.filter((c) => c.dataset === 'toewijzing').map((c) => c.id)
  expect(activities).toHaveLength(28)
  expect(slotIds).toHaveLength(8)
  expect(reply.created).toHaveLength(36)
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

  // The 8 open slots, two a day: a light technician once and two players, none with a person or a name.
  const rollen = await rowsOf<{ id: number; naam: string }>(page.request, 'rol')
  const roleOf = (id: unknown) => rollen.find((r) => r.id === id)?.naam
  const slots = (await rowsOf<Values>(page.request, 'toewijzing')).filter((t) => slotIds.includes(t.id as number))
  expect(slots).toHaveLength(8)
  for (const t of slots) {
    expect(t.state).toBe('open')
    expect(t.persoon_id ?? null).toBeNull()
    expect(t.naam ?? null).toBeNull()
  }
  expect(slots.map((t) => `${roleOf(t.rol_id)} ${t.aantal}`).sort()).toEqual(
    days.flatMap(() => ['Lichttechnicus 1', 'Speler 2']).sort(),
  )

  // Their Revision rows share the action's one batch.
  for (const { id } of activities) {
    const response = await page.request.get(`/api/revisions/activiteit/${id}`)
    expect(response.status()).toBe(200)
    const revisions = ((await response.json()) as { revisions: Revision[] }).revisions
    expect(revisions.length).toBeGreaterThan(0)
    for (const revision of revisions) expect(revision.batch_id).toBe(reply.batch_id)
  }

  await page.keyboard.press('Escape')
  await pick(page, 'Planning', 'Activiteiten')
  await expect(gridRows(page)).toHaveCount(28)
  // Grouped by plandag: one group a day, each the whole pattern at its times, the venue the Speelreeks's.
  const groups = await dayGroups(page)
  expect(groups).toHaveLength(4)
  for (const rows of groups) {
    const want = PATTERN.map(
      ([title, tijd]) => `${title}|${tijd ? `${tijd}–${UNTIL[title]}` : 'zonder tijd'}|${VENUE}via tourstop`,
    )
    expect(rows.map((r) => `${r.title}|${r.start}|${r.locatie}`).sort()).toEqual(want.sort())
  }

  // One undo, from a cell of Dagplanning, removes the 28 and their open slots.
  await (await cellOf(page, gridRows(page).first(), 'Soort')).click()
  const undone = undoOf(page)
  await page.keyboard.press('ControlOrMeta+z')
  expect((await undone).status()).toBe(200)
  await expect(gridRows(page)).toHaveCount(0)
  expect(await rowsOf(page.request, 'activiteit', { speelreeks_id: reeks?.id })).toHaveLength(0)
  expect(
    (await rowsOf<Values>(page.request, 'toewijzing')).filter((t) => slotIds.includes(t.id as number)),
  ).toHaveLength(0)

  await page.reload()
  await pick(page, 'Planning', 'Activiteiten')
  await expect(page.getByText('Geen rijen in deze periode')).toBeVisible()
  await expect(gridRows(page)).toHaveCount(0)
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

test('apply-double-submit @e2e', async ({ page }) => {
  const naam = 'Speelreeks e2e dubbel'
  const id = await speelreeks(page.request, naam, '2026-12-14', '2026-12-15')
  await page.goto('/')
  await pick(page, 'Tourstops')
  await named(page, naam).getByRole('button', { name: 'Openen' }).click()
  await pressInMenu(page, 'Sjabloon toepassen')
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

/** Applies the Sjabloon from the drawer and opens Planning on the week, a cell focused for the keyboard. */
async function appliedInPlanning(page: Page, naam: string, week: string, days: number): Promise<number> {
  await openWeek(page, 'Planning', 'Activiteiten', 'plandag', week)
  const id = await speelreeks(page.request, naam, week, plusDays(week, days - 1))
  await pick(page, 'Tourstops')
  expect((await applyInDrawer(page, naam)).status()).toBe(201)
  await page.keyboard.press('Escape')
  await pick(page, 'Planning', 'Activiteiten')
  await (await cellOf(page, gridRows(page).first(), 'Soort')).click()
  return id
}

test('apply-undo-changed-since @e2e', async ({ page, browser }) => {
  const id = await appliedInPlanning(page, 'Speelreeks e2e na wijziging', '2026-12-21', 1)
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
  expect(await response.json()).toMatchObject({ code: 'changed_since', column: 'locatie_id', label: 'Eigen locatie' })
  await expect(page.getByText('Eigen locatie is intussen gewijzigd; ongedaan maken kan niet.')).toBeVisible()
  expect(await rowsOf(page.request, 'activiteit', { speelreeks_id: id })).toHaveLength(7)
})

test('apply-redo-refused @e2e', async ({ page }) => {
  const naam = 'Speelreeks e2e opnieuw'
  const id = await appliedInPlanning(page, naam, '2026-12-28', 2)
  const undone = undoOf(page)
  await page.keyboard.press('ControlOrMeta+z')
  expect((await undone).status()).toBe(200)
  await expect(gridRows(page)).toHaveCount(0)

  // Dagplanning is empty now: the redo is pressed from a cell of Tourstops, the same tab's history.
  await pick(page, 'Tourstops')
  await (await cellOf(page, named(page, naam), 'Naam')).click()
  const redone = undoOf(page)
  await page.keyboard.press('ControlOrMeta+Shift+z')
  const response = await redone
  expect(response.status()).toBe(422)
  expect(((await response.json()) as { code: string }).code).toBe('not_undoable')
  // A refused redo reads as such in the table grid, whatever the batch held (review S1).
  await expect(page.locator('.nv-toolbar')).toContainText('Opnieuw doen kan hier niet')
  expect(await rowsOf(page.request, 'activiteit', { speelreeks_id: id })).toHaveLength(0)
})
