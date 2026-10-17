import { type APIRequestContext, expect, type Page, request, test } from '@playwright/test'
import { ACCOUNTS, requestAndOpenLink, state, THEATRE } from './auth'
import { fillDate } from './segments'
import { shot } from './shots'
import { addCondition, copyAndRename, openModel, openView, openWeek } from './tree'

const LOTTE = 'Lotte Verhaegen'

interface SavedView {
  id: number
  name: string
  mine: boolean
  editable: boolean
  filters: Record<string, unknown>
}

type Owned = { id: number; persoon_id: number | null }

const signedAs = (role: 'admin' | 'editor' | 'owner') =>
  request.newContext({ baseURL: THEATRE.app, storageState: state(role) })

async function rows(api: APIRequestContext | Page['request'], dataset: string): Promise<Owned[]> {
  const response = await api.get(`/api/rows/${dataset}?limit=500`)
  expect(response.status()).toBe(200)
  return ((await response.json()) as { rows: Owned[] }).rows
}

async function views(api: APIRequestContext | Page['request']): Promise<SavedView[]> {
  const response = await api.get('/api/views')
  expect(response.status()).toBe(200)
  return ((await response.json()) as { views: SavedView[] }).views
}

async function pick(page: Page, view: string, model = view) {
  await openView(page, view, model)
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
}

/** The grid reads the hash once, on load: a hash-only goto needs the reload. */
async function land(page: Page, hash: string) {
  await page.goto(hash)
  await page.reload()
}

const gridRows = (page: Page) => page.locator('tbody tr.nv-tr')

test.describe('without a session', () => {
  test.use({ storageState: { cookies: [], origins: [] } })

  test('sign-in-by-link', async ({ context }) => {
    const { page, link } = await requestAndOpenLink(context, THEATRE, ACCOUNTS.editor.email)
    const token = link.split('#/auth/')[1]

    // Opening the link signed nothing in: only the button does.
    await expect(page.getByRole('button', { name: 'Aanmelden' })).toBeVisible()
    expect((await page.request.get('/api/auth/me')).status()).toBe(401)

    await page.getByRole('button', { name: 'Aanmelden' }).click()
    await expect(page.getByRole('navigation', { name: 'Views' })).toBeVisible()
    await expect(page.getByRole('navigation', { name: 'Views' })).toContainText(ACCOUNTS.editor.email)
    expect(page.url()).not.toContain(token)
    await page.reload()
    await expect(page.getByRole('navigation', { name: 'Views' })).toBeVisible()
  })
})

test.describe('as the owner', () => {
  test.use({ storageState: state('owner') })

  test('owner-sees-own', async ({ page }) => {
    const editor = await signedAs('editor')
    const everyone = await rows(editor, 'toewijzing')
    const own = everyone.filter((r) => r.persoon_id === 1).map((r) => r.id)
    const other = everyone.find((r) => r.persoon_id !== null && r.persoon_id !== 1)
    expect(own.length).toBeGreaterThan(0)
    expect(other).toBeDefined()

    await page.goto('/')
    await pick(page, 'Toewijzingen')
    await expect(gridRows(page)).toHaveCount(own.length)
    for (const title of await gridRows(page).evaluateAll((trs) => trs.map((tr) => tr.getAttribute('data-title')))) {
      expect(title).toBe(LOTTE)
    }
    expect((await rows(page.request, 'toewijzing')).map((r) => r.id)).toEqual(own)

    // Lotte's absence starts in the week of 5 October; the week of 12 October holds only other people's.
    await openWeek(page, 'Afwezigheden', 'Beschikbaarheden', 'start_at', '2026-10-05')
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Afwezigheden')
    await expect(gridRows(page)).toHaveCount(1)
    await expect(gridRows(page).first()).toHaveAttribute('data-title', LOTTE)
    await openWeek(page, 'Afwezigheden', 'Beschikbaarheden', 'start_at', '2026-10-12')
    await expect(page.getByText('Geen rijen in deze periode')).toBeVisible()
    expect((await rows(editor, 'beschikbaarheid')).some((r) => r.persoon_id !== 1)).toBe(true)

    // Another person's row by id, and a view on a dataset the owner cannot read, show nothing.
    expect((await page.request.get(`/api/revisions/toewijzing/${other?.id}`)).status()).toBe(404)
    const planning = (await views(editor)).find((v) => v.name === 'Bevestigd')
    await land(page, `/#view=${planning?.id}`)
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
    await expect(page.getByRole('heading', { level: 1 })).not.toHaveText('Bevestigd')
    const nav = page.getByRole('navigation', { name: 'Views' })
    await expect(nav.getByRole('treeitem', { name: 'Activiteiten', exact: true })).toHaveCount(0)
    await expect(nav.getByRole('button', { name: 'Bevestigd', exact: true })).toHaveCount(0)
    await editor.dispose()
  })
})

test('seeded-view-read-only', async ({ page }) => {
  const name = 'Planning Nachtwacht'
  const seeded = (await views(page.request)).find((v) => v.name === 'Bevestigd')
  expect(seeded?.editable).toBe(false)
  const patched = await page.request.patch(`/api/views/${seeded?.id}`, { data: { name: 'Mijn planning' } })
  expect(patched.status()).toBe(403)

  await page.goto('/')
  await pick(page, 'Bevestigd', 'Activiteiten')
  await addCondition(page, 'Productie', 'Nachtwacht')
  const toolbar = page.locator('.nv-toolbar')
  // The seeded view keeps the change in this browser: no save word, nothing sent.
  await expect(toolbar.getByText(/gewijzigd|Opslaan|Opgeslagen/)).toHaveCount(0)
  expect((await views(page.request)).find((v) => v.id === seeded?.id)?.filters).toEqual(seeded?.filters)

  try {
    // Kopie maken in the rail takes the change along; the copy is one's own.
    await copyAndRename(page, 'Bevestigd', name)
    await expect.poll(async () => (await views(page.request)).find((v) => v.name === name)?.mine).toBe(true)
    const copy = (await views(page.request)).find((v) => v.name === name) as SavedView
    expect(JSON.stringify(copy.filters)).toContain('productie_id')

    // On one's own view a change saves itself.
    await page.getByRole('button', { name: 'Filter Productie wissen' }).click()
    await expect
      .poll(async () => JSON.stringify((await views(page.request)).find((v) => v.id === copy.id)?.filters))
      .not.toContain('productie_id')

    await page.reload()
    await pick(page, name, 'Activiteiten')
    await expect(toolbar.getByText(/gewijzigd|Opslaan/)).toHaveCount(0)
    await expect(page.locator('.nv-chip--filter', { hasText: 'Nachtwacht' })).toHaveCount(0)
  } finally {
    // The copy goes, renamed or not, so no later test meets a second one.
    for (const view of (await views(page.request)).filter(
      (v) => v.mine && [name, 'Bevestigd (kopie)'].includes(v.name),
    ))
      await page.request.delete(`/api/views/${view.id}`)
  }
})

test('public-view-by-token', async () => {
  const admin = await signedAs('admin')
  const voorstellingen = (await views(admin)).find((v) => v.name === 'Voorstellingen')
  const shared = await admin.put(`/api/views/${voorstellingen?.id}/share-token`, { data: {} })
  expect(shared.status()).toBe(200)
  const { token } = (await shared.json()) as { token: string }
  await admin.dispose()

  const anyone = await request.newContext({ baseURL: THEATRE.app })
  const served = await anyone.get(`/api/public/views/${token}`)
  expect(served.status()).toBe(200)
  const body = (await served.json()) as { columns: { key: string }[]; rows: Record<string, unknown>[]; total: number }
  const keys = ['productie', 'datum', 'start', 'venue', 'adres']
  expect(body.columns.map((c) => c.key)).toEqual(keys)
  expect(body.rows.length).toBeGreaterThan(0)
  expect(body.total).toBe(body.rows.length)
  for (const row of body.rows) expect(Object.keys(row).sort()).toEqual([...keys].sort())

  expect((await anyone.get(`/api/public/views/${'A'.repeat(token.length)}`)).status()).toBe(404)
  await anyone.dispose()
})

test('session-less-401', async ({ page, context }) => {
  await page.goto('/')
  await pick(page, 'Bevestigd', 'Activiteiten')
  await expect(gridRows(page).first()).toBeVisible()

  await context.clearCookies()
  await openModel(page, 'Producties')

  const dialog = page.getByRole('dialog', { name: 'Aanmelden' })
  await expect(dialog).toBeVisible()
  await expect(dialog.getByRole('textbox', { name: 'E-mailadres' })).toBeVisible()
})

type Cells = ReturnType<Page['locator']>

async function cellOf(page: Page, tr: Cells, label: string) {
  const index = await page
    .locator('thead th')
    .evaluateAll(
      (heads, wanted) => heads.findIndex((th) => (th.textContent ?? '').replace(/\s*[↑↓]$/, '').trim() === wanted),
      label,
    )
  expect(index, `column ${label}`).toBeGreaterThanOrEqual(0)
  return tr.locator('td').nth(index)
}

/** A stored date or moment goes into the editor's segments, anything else into its input; Enter commits. */
async function typeInto(target: Cells, value: string) {
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

/** + New, the production picked: the row is created at once, on top, untitled; it is named so it can be found again. */
async function createActivity(page: Page, title: string): Promise<Record<string, unknown>> {
  const posted = page.waitForResponse(
    (res) => res.request().method() === 'POST' && new URL(res.url()).pathname === '/api/rows/activiteit',
  )
  await page.getByRole('button', { name: 'Nieuwe activiteit' }).click()
  await page.getByRole('combobox', { name: 'Productie' }).fill('Nacht')
  await page.getByRole('option', { name: 'Nachtwacht' }).click()
  const response = await posted
  const body = response.request().postDataJSON() as Record<string, unknown>
  const { id } = (await response.json()) as { id: number }
  await expect(page.locator('tbody tr.nv-tr--draft')).toHaveCount(0)
  // The seed's rows dated before today sort ahead of a new one: the title goes on the row the POST made, not the grid's first.
  expect((await page.request.patch(`/api/rows/activiteit/${id}`, { data: { omschrijving: title } })).status()).toBe(200)
  await page.reload()
  await pick(page, 'Optie of bevestigd', 'Activiteiten')
  await expect(named(page, title)).toBeVisible()
  return body
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

const plusDays = (iso: string, days: number) => {
  const at = new Date(`${iso}T12:00:00Z`)
  at.setUTCDate(at.getUTCDate() + days)
  return at.toISOString().slice(0, 10)
}

const patchOf = (page: Page, dataset: string) =>
  page.waitForRequest(
    (req) => req.method() === 'PATCH' && new URL(req.url()).pathname.startsWith(`/api/rows/${dataset}/`),
  )

/** An undo is one POST of the edit's batch; the grid then reads the row back. */
const undoOf = (page: Page) =>
  page.waitForResponse(
    (res) => res.request().method() === 'POST' && /^\/api\/batches\/[^/]+\/undo$/.test(new URL(res.url()).pathname),
  )

test('untimed-activity', async ({ page }) => {
  // About fifty presses, typed segment by segment, each re-rendering a view the earlier specs grew to some 140 rows.
  test.setTimeout(60_000)
  await page.goto('/')
  await pick(page, 'Optie of bevestigd', 'Activiteiten')
  await expect(gridRows(page).first()).toBeVisible()

  const body = await createActivity(page, 'zonder tijd e2e')
  const datum = body.datum as string
  expect(datum).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  expect(body.start_at ?? null).toBeNull()
  const day = await shown(page, datum)

  await page.reload()
  await pick(page, 'Optie of bevestigd', 'Activiteiten')
  await expect(named(page, 'zonder tijd e2e')).toBeVisible()
  await expect(await cellOf(page, named(page, 'zonder tijd e2e'), 'Datum')).toHaveText(day)
  await expect(await cellOf(page, named(page, 'zonder tijd e2e'), 'Start')).toHaveText('')

  await createActivity(page, 'vroeg e2e')
  const start = await cellOf(page, named(page, 'vroeg e2e'), 'Start')
  await typeInto(start, `${datum}T05:00`)
  await expect(start).toHaveText(/ 05:00$/)
  await page.reload()
  await pick(page, 'Optie of bevestigd', 'Activiteiten')
  await expect(await cellOf(page, named(page, 'vroeg e2e'), 'Start')).toHaveText(/ 05:00$/)
  await expect(await cellOf(page, named(page, 'vroeg e2e'), 'Datum')).toHaveText(day)

  // One segment cleared: Enter waits on the half-typed moment, nothing is written, Escape keeps the stored time.
  const sent: string[] = []
  page.on('request', (req) => {
    if (req.method() === 'PATCH') sent.push(req.url())
  })
  const halfTyped = await cellOf(page, named(page, 'vroeg e2e'), 'Start')
  await halfTyped.click()
  await halfTyped.press('Enter')
  const minute = halfTyped.locator('[data-type="minute"]')
  await minute.click()
  await minute.press('Backspace')
  await expect(minute).toHaveAttribute('data-placeholder', 'true')
  await minute.press('Enter')
  await expect(halfTyped.getByRole('spinbutton')).toHaveCount(5)
  await minute.press('Escape')
  await expect(await cellOf(page, named(page, 'vroeg e2e'), 'Start')).toHaveText(/ 05:00$/)
  expect(sent).toEqual([])

  // Every segment cleared, Start goes on the wire as null and the row stays on its day.
  const patched = page.waitForRequest(
    (req) => req.method() === 'PATCH' && new URL(req.url()).pathname.startsWith('/api/rows/activiteit/'),
  )
  const clearing = await cellOf(page, named(page, 'vroeg e2e'), 'Start')
  await clearing.click()
  await clearing.press('Enter')
  await fillDate(clearing, '')
  await clearing.getByRole('spinbutton').first().press('Enter')
  expect((await patched).postDataJSON()).toEqual({ start_at: null })
  await expect(await cellOf(page, named(page, 'vroeg e2e'), 'Start')).toHaveText('')
  await page.reload()
  await pick(page, 'Optie of bevestigd', 'Activiteiten')
  await expect(await cellOf(page, named(page, 'vroeg e2e'), 'Start')).toHaveText('')
  await expect(await cellOf(page, named(page, 'vroeg e2e'), 'Datum')).toHaveText(day)
})

test.describe('undo restores what the writer changed with the edit', () => {
  const VIEW = 'Optie of bevestigd'

  async function reopen(page: Page) {
    await page.reload()
    await pick(page, VIEW, 'Activiteiten')
  }

  test('undo-time-on-untimed', async ({ page }) => {
    await page.goto('/')
    await pick(page, VIEW, 'Activiteiten')
    const datum = (await createActivity(page, 'undo tijd e2e')).datum as string
    const later = plusDays(datum, 2)
    const row = () => named(page, 'undo tijd e2e')

    await typeInto(await cellOf(page, row(), 'Start'), `${later}T20:00`)
    await expect(await cellOf(page, row(), 'Datum')).toHaveText(await shown(page, later))

    const undone = undoOf(page)
    await page.keyboard.press('ControlOrMeta+z')
    expect((await undone).status()).toBe(200)
    await expect(await cellOf(page, row(), 'Start')).toHaveText('')
    await expect(await cellOf(page, row(), 'Datum')).toHaveText(await shown(page, datum))

    await reopen(page)
    await expect(await cellOf(page, row(), 'Start')).toHaveText('')
    await expect(await cellOf(page, row(), 'Datum')).toHaveText(await shown(page, datum))
  })

  test('undo-day-line-move', async ({ page }) => {
    // Four datetime edits typed segment by segment: 20 s alone, past 30 s under a full run's load.
    test.slow()
    await page.goto('/')
    await pick(page, VIEW, 'Activiteiten')
    const datum = (await createActivity(page, 'undo nacht e2e')).datum as string
    const row = () => named(page, 'undo nacht e2e')
    await typeInto(await cellOf(page, row(), 'Start'), `${datum}T23:30`)
    await expect(await cellOf(page, row(), 'Start')).toHaveText(/ 23:30$/)

    await typeInto(await cellOf(page, row(), 'Start'), `${plusDays(datum, 1)}T01:30`)
    await expect(await cellOf(page, row(), 'Datum')).toHaveText(await shown(page, plusDays(datum, 1)))

    const undone = undoOf(page)
    await page.keyboard.press('ControlOrMeta+z')
    expect((await undone).status()).toBe(200)
    await expect(await cellOf(page, row(), 'Start')).toHaveText(/ 23:30$/)
    await expect(await cellOf(page, row(), 'Datum')).toHaveText(await shown(page, datum))

    await reopen(page)
    await expect(await cellOf(page, row(), 'Start')).toHaveText(/ 23:30$/)
    await expect(await cellOf(page, row(), 'Datum')).toHaveText(await shown(page, datum))
  })

  test('undo-person-to-name', async ({ page }) => {
    await page.goto('/')
    await pick(page, 'Toewijzingen')
    const first = gridRows(page).first()
    await expect(first).toBeVisible()
    const person = (await first.getAttribute('data-title')) as string
    const held = await named(page, person).count()

    await typeInto(await cellOf(page, first, 'Naam'), 'Gast e2e')
    await expect(named(page, 'Gast e2e')).toHaveCount(1)
    await expect(await cellOf(page, named(page, 'Gast e2e'), 'Persoon')).toHaveText('')

    const undone = undoOf(page)
    await page.keyboard.press('ControlOrMeta+z')
    expect((await undone).status()).toBe(200)
    await expect(named(page, 'Gast e2e')).toHaveCount(0)
    await expect(named(page, person)).toHaveCount(held)

    await page.reload()
    await pick(page, 'Toewijzingen')
    await expect(named(page, 'Gast e2e')).toHaveCount(0)
    await expect(named(page, person)).toHaveCount(held)
  })

  test('clear-start-segment-by-segment', async ({ page }) => {
    await page.goto('/')
    await pick(page, VIEW, 'Activiteiten')
    const datum = (await createActivity(page, 'wis per deel e2e')).datum as string
    const row = () => named(page, 'wis per deel e2e')
    await typeInto(await cellOf(page, row(), 'Start'), `${datum}T10:00`)
    await expect(await cellOf(page, row(), 'Start')).toHaveText(/ 10:00$/)

    const cell = await cellOf(page, row(), 'Start')
    await cell.click()
    await cell.press('Enter')
    const segments = await cell.getByRole('spinbutton').all()
    for (const segment of segments) {
      await segment.click()
      while ((await segment.getAttribute('data-placeholder')) === null) await segment.press('Backspace')
      // Some segments still hold a value: Enter waits, the editor stays.
      if (segment !== segments.at(-1)) {
        await segment.press('Enter')
        await expect(cell.getByRole('spinbutton')).toHaveCount(segments.length)
      }
    }

    const cleared = patchOf(page, 'activiteit')
    await segments[0].press('Enter')
    expect((await cleared).postDataJSON()).toEqual({ start_at: null })
    await expect(await cellOf(page, row(), 'Start')).toHaveText('')
    await shot(page, 'cell-date-step-0e')

    await reopen(page)
    await expect(await cellOf(page, row(), 'Start')).toHaveText('')
    await expect(await cellOf(page, row(), 'Datum')).toHaveText(await shown(page, datum))
  })
})

test('undo-time-on-untimed-in-planning', async ({ page }) => {
  await page.goto('/')
  const productie = (
    (await (await page.request.get('/api/rows/productie?limit=50')).json()) as { rows: { id: number }[] }
  ).rows[0].id
  const created = await page.request.post('/api/rows/activiteit', {
    data: { productie_id: productie, soort: 'repetitie', datum: '2026-10-13', omschrijving: 'dagplanning undo e2e' },
  })
  expect(created.status()).toBe(201)
  const id = ((await created.json()) as { id: number }).id
  const datumOf = async () => {
    const found = await page.request.get(`/api/rows/activiteit?filter=${encodeURIComponent(JSON.stringify({ id }))}`)
    return ((await found.json()) as { rows: { datum: string }[] }).rows[0].datum
  }

  await openWeek(page, 'Planning', 'Activiteiten', 'plandag', '2026-10-12')
  const row = () => named(page, 'dagplanning undo e2e')
  await expect(row()).toBeVisible()
  const moved = patchOf(page, 'activiteit')
  await typeInto(await cellOf(page, row(), 'Tijd'), '2026-10-15T20:00')
  await (await moved).response()
  await expect.poll(datumOf).toBe('2026-10-15')

  const undone = undoOf(page)
  await page.keyboard.press('ControlOrMeta+z')
  expect((await undone).status()).toBe(200)
  await expect.poll(datumOf).toBe('2026-10-13')
  await expect(await cellOf(page, row(), 'Tijd')).toHaveText('zonder tijd')

  await page.reload()
  await pick(page, 'Planning', 'Activiteiten')
  await expect(await cellOf(page, row(), 'Tijd')).toHaveText('zonder tijd')
  expect(await datumOf()).toBe('2026-10-13')
})
