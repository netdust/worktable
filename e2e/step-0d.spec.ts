import { execFileSync } from 'node:child_process'
import { expect, type Locator, type Page, test } from '@playwright/test'

const WEEK = '/#from=2026-10-12'
const MATRIX = 'Toewijzingen per activiteit'

interface Toewijzing {
  id: number
  activiteit_id: number
  persoon_id: number | null
  naam: string | null
  state: string
}

interface SavedView {
  id: number
  name: string
  mine: boolean
  shared: boolean
}

/** A column header by its exact label, the sort arrow aside. */
const header = (page: Page, label: string) =>
  page.locator('thead th').filter({ hasText: new RegExp(`^\\s*${label}\\s*[↑↓]?\\s*$`) })

/** Picks a view in the rail and waits for `ready`, content only that view shows, so nothing is read off the view it replaced. */
async function pick(page: Page, view: string, ready: Locator) {
  await page.getByText(view, { exact: true }).first().click()
  await expect(ready.first()).toBeVisible()
  await expect(page.locator('tbody tr.nv-tr').first()).toBeVisible()
}

async function open(page: Page, view: string, ready: Locator) {
  await page.goto(WEEK)
  await pick(page, view, ready)
}

async function columnIndex(page: Page, label: string): Promise<number> {
  await expect(header(page, label).first()).toBeVisible()
  const index = await page
    .locator('thead th')
    .evaluateAll(
      (heads, wanted) => heads.findIndex((th) => (th.textContent ?? '').replace(/\s*[↑↓]$/, '').trim() === wanted),
      label,
    )
  expect(index, `column ${label}`).toBeGreaterThanOrEqual(0)
  return index
}

const row = (page: Page, title: string) => page.locator(`tbody tr.nv-tr[data-title="${title}"]`)

/** A matrix cell: the row's gridcells follow its label, one per column. */
async function spot(page: Page, title: string, person: string): Promise<Locator> {
  return row(page, title)
    .locator('td[data-cell]')
    .nth((await columnIndex(page, person)) - 1)
}

/** The first column of the first row, read straight from the e2e database with bound parameters. */
function readDb(sql: string, ...params: (string | number)[]): unknown {
  const script = `import { Database } from 'bun:sqlite'
    const row = new Database('e2e/.tmp/e2e.db', { readonly: true }).query(${JSON.stringify(sql)}).get(...${JSON.stringify(params)})
    console.log(JSON.stringify(row ? Object.values(row)[0] : undefined))`
  const out = execFileSync('bun', ['-e', script]).toString().trim()
  return out === 'undefined' || out === '' ? undefined : JSON.parse(out)
}

async function rows<T>(page: Page, dataset: string): Promise<T[]> {
  const response = await page.request.get(`/api/rows/${dataset}?limit=500`)
  expect(response.status()).toBe(200)
  return ((await response.json()) as { rows: T[] }).rows
}

const toewijzingen = (page: Page) => rows<Toewijzing>(page, 'toewijzing')

async function views(page: Page): Promise<SavedView[]> {
  const response = await page.request.get('/api/views')
  expect(response.status()).toBe(200)
  return ((await response.json()) as { views: SavedView[] }).views
}

async function activiteitId(page: Page, omschrijving: string): Promise<number> {
  const found = (await rows<{ id: number; omschrijving: string }>(page, 'activiteit')).filter(
    (a) => a.omschrijving === omschrijving,
  )
  expect(found, `one ${omschrijving}`).toHaveLength(1)
  return found[0].id
}

async function personId(page: Page, name: string): Promise<number> {
  const found = (await rows<{ id: number; weergavenaam: string }>(page, 'persoon')).find((p) => p.weergavenaam === name)
  expect(found, name).toBeDefined()
  return found?.id as number
}

async function typeInto(target: Locator, value: string) {
  await target.click()
  await target.press('Enter')
  const input = target.locator('input')
  await input.fill(value)
  await input.press('Enter')
}

async function pressKey(target: Locator, key: string) {
  await target.click()
  await target.press(key)
}

test('matrix-cell-persists', async ({ page }) => {
  const [activity, person] = ['opbouw Brugge', 'Noor Claes']
  const [activiteit, persoon] = [await activiteitId(page, activity), await personId(page, person)]
  const held = async () =>
    (await toewijzingen(page)).find((t) => t.activiteit_id === activiteit && t.persoon_id === persoon)
  expect(await held()).toBeUndefined()

  await open(page, MATRIX, header(page, 'Noor Claes'))
  const target = await spot(page, activity, person)
  await expect(target.locator('.nv-mx__mark')).toHaveCount(0)
  await pressKey(target, 'b')
  await expect(target.locator('.nv-mx__mark')).toHaveText('✓')
  await expect.poll(async () => (await held())?.state).toBe('bevestigd')

  await page.reload()
  await pick(page, MATRIX, header(page, 'Noor Claes'))
  await expect((await spot(page, activity, person)).locator('.nv-mx__mark')).toHaveText('✓')

  await pressKey(await spot(page, activity, person), 'Delete')
  await expect((await spot(page, activity, person)).locator('.nv-mx__mark')).toHaveCount(0)
  await expect.poll(held).toBeUndefined()
})

test('matrix-away-mark', async ({ page }) => {
  await open(page, MATRIX, header(page, 'Noor Claes'))
  const away = await spot(page, 'vergadering Antwerpen', 'Noor Claes')
  await expect(away).toHaveClass(/nv-mx__away/)
  await expect(away).toHaveAttribute('aria-label', /Away: Familiefeest/)
  await expect(await spot(page, 'vergadering Antwerpen', 'Bram De Wilde')).not.toHaveClass(/nv-mx__away/)
})

test('matrix-two-activities-undo', async ({ page }) => {
  const person = 'Bram De Wilde'
  const [first, second] = ['reis Gent', 'vergadering Gent']
  const [one, two, persoon] = [
    await activiteitId(page, first),
    await activiteitId(page, second),
    await personId(page, person),
  ]
  const held = async (activiteit: number) =>
    (await toewijzingen(page)).find((t) => t.activiteit_id === activiteit && t.persoon_id === persoon)
  expect(await held(one)).toBeUndefined()
  expect(await held(two)).toBeUndefined()

  await open(page, MATRIX, header(page, 'Noor Claes'))
  await pressKey(await spot(page, first, person), 'b')
  await expect.poll(async () => (await held(one))?.state).toBe('bevestigd')
  await pressKey(await spot(page, second, person), 'u')
  await expect.poll(async () => (await held(two))?.state).toBe('uitgenodigd')

  await expect((await spot(page, second, person)).locator('.nv-mx__mark')).toHaveText('?')
  const secondId = (await held(two))?.id as number
  await page.keyboard.press('ControlOrMeta+z')
  await expect((await spot(page, second, person)).locator('.nv-mx__mark')).toHaveCount(0)
  await expect((await spot(page, first, person)).locator('.nv-mx__mark')).toHaveText('✓')
  await expect.poll(async () => await held(two)).toBeUndefined()
  expect((await held(one))?.state).toBe('bevestigd')
  expect(readDb('SELECT deleted_at FROM toewijzing WHERE id = ?', secondId)).not.toBeNull()

  await page.reload()
  await pick(page, MATRIX, header(page, 'Noor Claes'))
  await expect((await spot(page, first, person)).locator('.nv-mx__mark')).toHaveText('✓')
  await expect((await spot(page, second, person)).locator('.nv-mx__mark')).toHaveCount(0)
  expect(await held(two)).toBeUndefined()
  expect((await held(one))?.state).toBe('bevestigd')
})

test('view-saved-after-reload', async ({ page }) => {
  const name = 'Mijn planning'
  expect((await views(page)).map((v) => v.name)).not.toContain(name)
  await open(page, 'Planning', header(page, 'Einde'))

  const head = page.locator('thead th', { hasText: 'Soort' })
  const before = (await head.boundingBox())?.width as number
  const grip = head.locator('.nv-th__resize')
  const at = (await grip.boundingBox()) as { x: number; y: number; width: number; height: number }
  await page.mouse.move(at.x + at.width / 2, at.y + at.height / 2)
  await page.mouse.down()
  await page.mouse.move(at.x + at.width / 2 + 60, at.y + at.height / 2, { steps: 5 })
  await page.mouse.up()
  await expect.poll(async () => (await head.boundingBox())?.width as number).toBeGreaterThan(before + 30)
  const widened = await head.evaluate((th) => (th as HTMLElement).style.width)

  await page.getByRole('button', { name: '+ Filter' }).click()
  await page.getByRole('button', { name: 'Productie: Nachtwacht' }).click()
  await page.getByRole('button', { name: 'More actions', exact: true }).click()
  await page.getByRole('menuitem', { name: 'Save as new view' }).click()
  await page.getByLabel('Name').fill(name)
  await page.getByLabel('Name').press('Enter')

  await expect.poll(async () => (await views(page)).find((v) => v.name === name)?.mine).toBe(true)
  await page.reload()
  await pick(page, name, page.locator('.nv-chip--filter', { hasText: 'Nachtwacht' }))
  await expect(page.locator('.nv-chip--filter', { hasText: 'Productie' })).toContainText('Nachtwacht')
  await expect(page.locator('thead th', { hasText: 'Soort' })).toHaveAttribute('style', new RegExp(`width: ${widened}`))
})

test('view-delete-undo', async ({ page }) => {
  const copy = 'Dagplanning (copy)'
  expect((await views(page)).map((v) => v.name)).not.toContain(copy)
  await open(page, 'Dagplanning', page.getByRole('grid', { name: 'Dagplanning' }))
  await page.getByRole('button', { name: 'More actions: Dagplanning' }).click()
  await page.getByRole('menuitem', { name: 'Duplicate' }).click()
  await expect(page.getByText(copy, { exact: true }).first()).toBeVisible()
  const made = (await views(page)).find((v) => v.name === copy)
  expect(made?.mine).toBe(true)

  await page.getByRole('button', { name: `More actions: ${copy}` }).click()
  const deleted = page.waitForResponse(
    (res) => res.request().method() === 'DELETE' && res.url().endsWith(`/api/views/${made?.id}`),
  )
  await page.getByRole('menuitem', { name: 'Remove' }).click()
  expect((await deleted).status()).toBe(200)

  const restored = page.waitForResponse((res) => res.url().endsWith(`/api/views/${made?.id}/restore`))
  await page.getByRole('status', { name: 'View removed' }).getByRole('button', { name: 'Undo' }).click()
  expect((await restored).status()).toBe(200)
  await expect(page.getByText(copy, { exact: true }).first()).toBeVisible()
  expect((await views(page)).find((v) => v.name === copy)?.id).toBe(made?.id)
})

test('person-to-name', async ({ page }) => {
  const activity = 'repetitie Gent'
  const activiteit = await activiteitId(page, activity)
  const lotte = await personId(page, 'Lotte Verhaegen')
  const before = (await toewijzingen(page)).find((t) => t.activiteit_id === activiteit && t.persoon_id === lotte)
  expect(before).toBeDefined()
  await open(page, 'Toewijzingen', header(page, 'Naam'))

  const target = page.locator('tbody tr.nv-tr', { hasText: activity })
  await expect(target).toHaveCount(1)
  const patches: string[] = []
  page.on('request', (req) => req.method() === 'PATCH' && patches.push(req.url()))
  const naam = target.locator('td').nth(await columnIndex(page, 'Naam'))
  await typeInto(naam, 'Gastdirigent')

  await expect(target).toContainText('Gastdirigent')
  await expect.poll(async () => (await toewijzingen(page)).find((t) => t.id === before?.id)?.persoon_id).toBeNull()
  expect((await toewijzingen(page)).find((t) => t.id === before?.id)?.naam).toBe('Gastdirigent')
  expect(patches).toHaveLength(1)
  await expect(target).not.toContainText('Lotte Verhaegen')
})

test('datetime-shown', async ({ page }) => {
  await open(page, 'Planning', header(page, 'Einde'))
  const start = page.locator('tbody td [data-value="2026-10-14T00:30"]').first()
  await expect(start).toHaveText(/^Wed 14\/10 00:30$/)
  await expect(start).not.toContainText('T')
})

test('in-filter-applies', async ({ page }) => {
  await open(page, 'Optie of bevestigd', row(page, 'vergadering Gent'))
  await expect(page.locator('.nv-toolbar')).toContainText('+ 1 vaste filter')
  await expect(row(page, 'vergadering Gent')).toBeVisible()
  await expect(row(page, 'voorstelling Kortrijk')).toHaveCount(0)
  const statuses = async () => {
    const index = await columnIndex(page, 'Status')
    return page
      .locator('tbody tr.nv-tr')
      .evaluateAll((trs, i) => trs.map((tr) => tr.querySelectorAll('td')[i].textContent), index)
  }
  expect(new Set(await statuses())).toEqual(new Set(['Optie', 'Bevestigd']))

  await page.getByRole('button', { name: '+ Filter' }).click()
  await page.getByRole('button', { name: 'Status: Optie' }).click()
  await expect(row(page, 'vergadering Gent')).toHaveCount(0)
  await expect(row(page, 'overnachting Brugge')).toBeVisible()
  expect(new Set(await statuses())).toEqual(new Set(['Optie']))
  await expect(page.locator('.nv-toolbar')).toContainText('+ 1 vaste filter')
})

test('new-without-title', async ({ page }) => {
  const created: string[] = []
  page.on('request', (req) => req.method() === 'POST' && created.push(req.url()))
  await open(page, 'Planning', header(page, 'Einde'))
  await page.getByRole('button', { name: 'New Activiteiten' }).click()
  await expect(page.getByRole('combobox', { name: 'Productie' })).toBeFocused()
  expect(created).toEqual([])
})

test('relation-beyond-page', async ({ page }) => {
  const titels = (await rows<{ titel: string }>(page, 'productie')).map((p) => p.titel)
  expect(titels.length).toBeGreaterThan(2)
  const asked: { limit: string | null; offset: number }[] = []
  page.on('request', (req) => {
    const url = new URL(req.url())
    if (url.pathname === '/api/rows/productie')
      asked.push({ limit: url.searchParams.get('limit'), offset: Number(url.searchParams.get('offset')) })
  })
  await open(page, 'Planning', header(page, 'Einde'))
  await page.getByRole('button', { name: '+ Filter' }).click()
  for (const titel of titels) {
    await expect(page.getByRole('button', { name: `Productie: ${titel}` })).toBeVisible()
  }
  expect(asked.every((a) => a.limit === '2')).toBe(true)
  const offsets = [...new Set(asked.map((a) => a.offset))].sort((a, b) => a - b)
  expect(offsets).toEqual(Array.from({ length: Math.ceil(titels.length / 2) }, (_, i) => i * 2))
})

test.describe('foreign-view-hidden', () => {
  const name = 'Van Zeven privé'

  test.beforeAll(() => {
    execFileSync('bun', [
      '-e',
      `import { Database } from 'bun:sqlite'
       const db = new Database('e2e/.tmp/e2e.db')
       db.query("INSERT INTO saved_view (name, source_type, source, skin, owner_id, shared) VALUES (?, 'dataset', 'activiteit', 'table', 7, 0)").run(${JSON.stringify(name)})`,
    ])
    expect(readDb('SELECT count(*) FROM saved_view WHERE name = ? AND owner_id = 7 AND shared = 0', name)).toBe(1)
  })

  test('never listed, never in the rail', async ({ page }) => {
    expect((await views(page)).map((v) => v.name)).not.toContain(name)
    await page.goto(WEEK)
    await expect(page.getByText('Planning', { exact: true }).first()).toBeVisible()
    await expect(page.getByText('Dagplanning', { exact: true }).first()).toBeVisible()
    await expect(page.getByText(name)).toHaveCount(0)
  })
})
