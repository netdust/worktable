import { createServer, type Server } from 'node:http'
import { expect, type Locator, type Page, test } from '@playwright/test'
import { openEditor } from './editor'
import { fillDate } from './segments'
import { openWeek } from './tree'

const MONDAY = '2026-10-12'

interface Activiteit {
  id: number
  productie_id: number
  omschrijving: string
  start_at: string
  eind_at: string | null
  plandag: string
  status: string
}

interface Revision {
  field: string
  old: unknown
  new: unknown
}

async function open(page: Page, view: string, model = view) {
  await openWeek(page, view, model, 'plandag', MONDAY)
  await expect(page.locator('tbody tr.nv-tr').first()).toBeVisible()
}

async function dropStatusFilter(page: Page) {
  await page.getByRole('button', { name: 'Filter Status wissen' }).click()
}

async function activiteit(page: Page, omschrijving: string): Promise<Activiteit> {
  const response = await page.request.get('/api/rows/activiteit?limit=500')
  const { rows } = (await response.json()) as { rows: Activiteit[] }
  const found = rows.filter((row) => row.omschrijving === omschrijving)
  expect(found, `one ${omschrijving}`).toHaveLength(1)
  return found[0]
}

async function revisions(page: Page, id: number): Promise<Revision[]> {
  const response = await page.request.get(`/api/revisions/activiteit/${id}`)
  expect(response.status()).toBe(200)
  return ((await response.json()) as { revisions: Revision[] }).revisions
}

const row = (page: Page, omschrijving: string) => page.locator(`tbody tr.nv-tr[data-title="${omschrijving}"]`)

async function cell(page: Page, omschrijving: string, label: string): Promise<Locator> {
  const index = await page
    .locator('thead th')
    .evaluateAll(
      (heads, wanted) => heads.findIndex((th) => (th.textContent ?? '').replace(/\s*[↑↓]$/, '').trim() === wanted),
      label,
    )
  expect(index, `column ${label}`).toBeGreaterThanOrEqual(0)
  return row(page, omschrijving).locator('td').nth(index)
}

/** Select the cell, Enter opens the editor, the value typed into its segments commits on Enter. */
async function typeInto(target: Locator, value: string) {
  await target.click()
  await target.press('Enter')
  await fillDate(target, value)
  await target.getByRole('spinbutton').last().press('Enter')
}

/** Select the cell, Enter opens the list, the first letter picks the option, Enter commits. */
async function pickOption(target: Locator, letter: string) {
  await target.click()
  await target.press('Enter')
  const list = openEditor(target.page()).getByRole('listbox')
  await list.press(letter)
  await list.press('Enter')
}

async function sectionOf(page: Page, omschrijving: string): Promise<string> {
  return row(page, omschrijving).evaluate((tr) => {
    let el: Element | null = tr
    while (el && !el.classList.contains('nv-group')) el = el.previousElementSibling
    return el?.querySelector('.nv-group__label')?.textContent?.trim() ?? ''
  })
}

test('status-persists', async ({ page }) => {
  const name = 'maaltijd Gent'
  expect((await activiteit(page, name)).status).toBe('optie')
  await open(page, 'Planning', 'Activiteiten')
  await dropStatusFilter(page)

  const status = await cell(page, name, 'Status')
  await expect(status).toHaveText('Optie')
  await pickOption(status, 'b')
  await expect(status).toHaveText('Bevestigd')
  await expect.poll(async () => (await activiteit(page, name)).status).toBe('bevestigd')

  await page.reload()
  await expect(page.locator('tbody tr.nv-tr').first()).toBeVisible()
  await expect(await cell(page, name, 'Status')).toHaveText('Bevestigd')
})

test('refused-edit', async ({ page }) => {
  const name = 'vergadering Gent'
  const before = await activiteit(page, name)
  expect(before.status).toBe('bevestigd')
  await open(page, 'Planning', 'Activiteiten')

  await typeInto(await cell(page, name, 'Einde'), '2026-10-16T09:00')
  await expect(row(page, name).getByRole('alert')).toContainText('Einde ligt voor de start.')

  const after = await activiteit(page, name)
  expect(after.eind_at).toBe(before.eind_at)
  expect(after.start_at).toBe(before.start_at)
  expect(await revisions(page, before.id)).toEqual([])
})

test('query-edit-lands', async ({ page }) => {
  const name = 'opbouw Brugge'
  const before = await activiteit(page, name)
  expect(before.status).toBe('bevestigd')
  await open(page, 'Dagplanning', 'Activiteiten')

  const status = await cell(page, name, 'Status')
  await expect(status).toHaveText('Bevestigd')
  await pickOption(status, 'o')
  await expect(status).toHaveText('Optie')

  const filter = encodeURIComponent(JSON.stringify({ id: before.id }))
  const response = await page.request.get(`/api/rows/activiteit?filter=${filter}`)
  const { rows } = (await response.json()) as { rows: Activiteit[] }
  expect(rows).toHaveLength(1)
  expect(rows[0].status).toBe('optie')
})

test('revisions-recorded', async ({ page }) => {
  const name = 'reis Leuven'
  const before = await activiteit(page, name)
  expect(before.status).toBe('geannuleerd')
  expect(await revisions(page, before.id)).toEqual([])
  await open(page, 'Dagplanning', 'Activiteiten')

  const status = await cell(page, name, 'Status')
  await expect(status).toHaveText('Geannuleerd')
  await pickOption(status, 'b')
  await expect(status).toHaveText('Bevestigd')

  await expect.poll(async () => (await revisions(page, before.id)).length).toBe(1)
  const [revision] = await revisions(page, before.id)
  expect(revision.field).toBe('status')
  expect(revision.old).toBe('geannuleerd')
  expect(revision.new).toBe('bevestigd')
})

test('day-line-move', async ({ page }) => {
  // eind_at is moved later first: a start past its own end is refused as end before start.
  const name = 'repetitie Gent'
  const before = await activiteit(page, name)
  expect(before.start_at).toBe('2026-10-12T14:00')
  expect(before.plandag).toBe('2026-10-12')
  await open(page, 'Planning', 'Activiteiten')
  expect(await sectionOf(page, name)).toContain('12 oktober')

  await typeInto(await cell(page, name, 'Einde'), '2026-10-13T08:00')
  await expect.poll(async () => (await activiteit(page, name)).eind_at).toBe('2026-10-13T08:00')

  await typeInto(await cell(page, name, 'Start'), '2026-10-13T03:30')
  await expect.poll(async () => (await activiteit(page, name)).start_at).toBe('2026-10-13T03:30')
  expect((await activiteit(page, name)).plandag).toBe('2026-10-12')
  expect(await sectionOf(page, name)).toContain('12 oktober')

  await typeInto(await cell(page, name, 'Start'), '2026-10-13T06:00')
  await expect.poll(async () => (await activiteit(page, name)).plandag).toBe('2026-10-13')
  await expect.poll(() => sectionOf(page, name)).toContain('13 oktober')

  const fields = (await revisions(page, before.id)).map((revision) => revision.field)
  expect(fields).toContain('start_at')
  expect(fields).toContain('plandag')
  const plandag = (await revisions(page, before.id)).filter((revision) => revision.field === 'plandag')
  expect(plandag.map((revision) => [revision.old, revision.new])).toEqual([['2026-10-12', '2026-10-13']])
})

test('relation-pick', async ({ page }) => {
  const name = 'reis Gent'
  const before = await activiteit(page, name)
  expect([before.status, before.productie_id]).toEqual(['bevestigd', 1])
  await open(page, 'Planning', 'Activiteiten')

  const productie = await cell(page, name, 'Productie')
  await expect(productie).toHaveText('De Kersentuin')
  await productie.click()
  await productie.press('Enter')
  await page.getByRole('combobox', { name: 'Productie' }).fill('Nacht')
  await page.getByRole('option', { name: 'Nachtwacht' }).click()

  await expect.poll(async () => (await activiteit(page, name)).productie_id).toBe(2)
  await expect(productie).toHaveText('Nachtwacht')
})

test('clear-end', async ({ page }) => {
  const name = 'afbouw Gent'
  expect((await activiteit(page, name)).eind_at).toBe('2026-10-13T01:00')
  await open(page, 'Planning', 'Activiteiten')

  const einde = await cell(page, name, 'Einde')
  await typeInto(einde, '')

  await expect.poll(async () => (await activiteit(page, name)).eind_at).toBeNull()
  await expect(einde).toHaveText('')
})

test('limit-refused', async ({ page }) => {
  const response = await page.request.get('/api/rows/activiteit?limit=5001')
  expect(response.status()).toBe(400)
  expect(((await response.json()) as { code: string }).code).toBe('bad_limit')
})

test.describe('cross-site-refused', () => {
  let server: Server

  test.beforeAll(async () => {
    server = createServer((_, res) => {
      res.setHeader('Content-Type', 'text/html')
      res.end('<!doctype html><title>other site</title>')
    })
    await new Promise<void>((done) => server.listen(3999, 'localhost', done))
  })

  test.afterAll(async () => {
    server.closeAllConnections()
    await new Promise((done) => server.close(done))
  })

  test('cross-site-refused', async ({ page }) => {
    const name = 'voorstelling Kortrijk'
    const before = await activiteit(page, name)
    const target = `http://127.0.0.1:5174/api/rows/activiteit/${before.id}`
    const body = JSON.stringify({ status: 'optie' })

    await page.goto('http://localhost:3999/')
    const seen = await page.evaluate(
      async ([url, payload]) => {
        try {
          const res = await fetch(url, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: payload,
          })
          return { readable: true, status: res.status, body: await res.text() }
        } catch (error) {
          return { readable: false, status: 0, body: String(error) }
        }
      },
      [target, body],
    )
    expect(seen.readable).toBe(true)
    expect(seen.status).toBe(403)
    expect(JSON.parse(seen.body).code).toBe('forbidden_site')
    const after = await activiteit(page, name)
    expect(after.status).toBe(before.status)
    expect(await revisions(page, before.id)).toEqual([])

    const direct = await page.request.patch(target, {
      headers: { 'Sec-Fetch-Site': 'same-site', 'Content-Type': 'application/json' },
      data: { status: 'optie' },
    })
    expect(direct.status()).toBe(403)
    expect(((await direct.json()) as { code: string }).code).toBe('forbidden_site')
    expect((await activiteit(page, name)).status).toBe(before.status)
  })

  test('rebound-host-refused', async ({ page }) => {
    const name = 'voorstelling Kortrijk'
    const before = await activiteit(page, name)

    const response = await page.request.patch(`http://127.0.0.1:5174/api/rows/activiteit/${before.id}`, {
      headers: { Host: 'evil.example', 'Content-Type': 'application/json' },
      data: { status: 'optie' },
    })
    expect(response.status()).toBe(403)
    expect(await response.text()).toContain('evil.example')
    expect(await activiteit(page, name)).toEqual(before)
  })

  test('json-charset-accepted', async ({ page }) => {
    const name = 'afbouw Mechelen'
    const before = await activiteit(page, name)
    const response = await page.request.patch(`/api/rows/activiteit/${before.id}`, {
      headers: { 'Content-Type': 'application/json; charset=utf-8' },
      data: JSON.stringify({ plaats: 'Tongeren' }),
    })
    expect(response.status()).toBe(200)
    expect((await revisions(page, before.id)).map((revision) => revision.field)).toEqual(['plaats'])
  })
})
