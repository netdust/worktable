import { readFileSync } from 'node:fs'
import { type APIRequestContext, type Download, expect, type Locator, type Page, test } from '@playwright/test'
import { state } from './auth'
import { openTab } from './drawer'
import { shot } from './shots'
import { openWeek } from './tree'

// One empty week per flow, so no flow sees another's rows.
const DRAWER_WEEK = '2029-03-05'
const REFUSAL_WEEK = '2029-03-19'
const OTHERS_WEEK = '2029-03-26'

type Values = Record<string, unknown>
type Made = { toewijzing: number[]; activiteit: number[]; speelreeks: number[] }
const nothing = (): Made => ({ toewijzing: [], activiteit: [], speelreeks: [] })

// An invented 48×32 photo (a blue sky, a sun, yellow sand), written by an image library: a decodable baseline jpeg.
const PHOTO = Buffer.from(
  '/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAA0JCgsKCA0LCgsODg0PEyAVExISEyccHhcgLikxMC4pLSwzOko+MzZGNywtQFdBRkxOUlNSMj5aYVpQYEpRUk//2wBDAQ4ODhMREyYVFSZPNS01T09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT0//wAARCAAgADADASIAAhEBAxEB/8QAGgABAAIDAQAAAAAAAAAAAAAAAAMEAgUGB//EACUQAAEEAgEDBAMAAAAAAAAAAAEAAgMEESEFBkFREhMxYRQigf/EABkBAAIDAQAAAAAAAAAAAAAAAAEEAwUGB//EABwRAAICAwEBAAAAAAAAAAAAAAABAhEDEiEEE//aAAwDAQACEQMRAD8A0aIiuStLFGjZ5CwK9OEyyEE4GBgDuSdBSchxl3jHsZegMReMt2CD/Rpd30TFXZwEcsLWe7I53vOBycgnAPjWNfee6u9SRV5eBuflNYWsjc9hccYeB+uD5zr7zjulH6GsmtcGFhThdnlaIibFzuERFzs1JNVtS1JC+IjYwWn4Kzt3ZrfpEhAa34a3Qz5VZFJ9ZqOl8BpG9q6ERFGE/9k=',
  'base64',
)
const PDF = Buffer.from(
  '%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Count 0/Kids[]>>endobj\n' +
    'trailer<</Root 1 0 R>>\n%%EOF\n',
)
const MB = 1024 * 1024

async function rowsOf<T = Values>(api: APIRequestContext, dataset: string): Promise<T[]> {
  const response = await api.get(`/api/rows/${dataset}?limit=500`)
  expect(response.status()).toBe(200)
  return ((await response.json()) as { rows: T[] }).rows
}

async function idOf(api: APIRequestContext, dataset: string, values: Values): Promise<number> {
  const response = await api.post(`/api/rows/${dataset}`, { data: values })
  expect(response.status(), await response.text()).toBe(201)
  return ((await response.json()) as { id: number }).id
}

const idByName = async (api: APIRequestContext, dataset: string, column: string, name: string) =>
  (await rowsOf<Values & { id: number }>(api, dataset)).find((r) => r[column] === name)?.id as number

const plusDays = (iso: string, days: number) => {
  const at = new Date(`${iso}T12:00:00Z`)
  at.setUTCDate(at.getUTCDate() + days)
  return at.toISOString().slice(0, 10)
}

async function activity(api: APIRequestContext, made: Made, omschrijving: string, datum: string, rest: Values = {}) {
  const id = await idOf(api, 'activiteit', {
    productie_id: await idByName(api, 'productie', 'titel', 'Nachtwacht'),
    soort: 'repetitie',
    datum,
    omschrijving,
    ...rest,
  })
  made.activiteit.push(id)
  return id
}

/** Deletes what a flow made, whatever happened: the specs share one database. */
async function cleanUp(api: APIRequestContext, made: Made) {
  for (const id of made.toewijzing) await api.delete(`/api/rows/toewijzing/${id}`)
  for (const id of made.activiteit) await api.delete(`/api/rows/activiteit/${id}`)
  for (const id of made.speelreeks) await api.delete(`/api/rows/speelreeks/${id}`)
}

const rowWith = (page: Page, text: string) => page.locator('tbody tr.nv-tr', { hasText: text })

/** Opens a row's drawer through its Openen button; answers the drawer's Bijlagen region. */
async function openDrawer(page: Page, text: string): Promise<Locator> {
  const row = rowWith(page, text)
  await row.hover()
  await row.getByRole('button', { name: 'Openen' }).click()
  const drawer = page.locator('.nv-drawer')
  await expect(drawer).toHaveCount(1)
  return drawer
}

const filesOf = (drawer: Locator) => drawer.getByRole('region', { name: 'Bijlagen' })

/** A record's drawer on its Bijlagen tab. */
async function openFiles(page: Page, text: string): Promise<Locator> {
  const drawer = await openDrawer(page, text)
  await openTab(page, 'Bijlagen')
  return drawer
}

const uploaded = (page: Page) =>
  page.waitForResponse(
    (res) =>
      res.request().method() === 'POST' && /^\/api\/attachments\/[a-z_]+\/\d+$/.test(new URL(res.url()).pathname),
  )

/** Picks the kind, then gives the file to the hidden input as the file chooser would. */
async function upload(files: Locator, kind: string, name: string, mimeType: string, buffer: Buffer) {
  const current = files.getByRole('button', { name: /^Soort: / })
  if ((await current.textContent())?.includes(kind) !== true) {
    await current.click()
    await files.page().getByRole('option', { name: kind, exact: true }).click()
  }
  await expect(current).toContainText(kind)
  const answer = uploaded(files.page())
  await files.locator('input[type="file"]').setInputFiles({ name, mimeType, buffer })
  return answer
}

const undoAnswer = (page: Page) =>
  page.waitForResponse(
    (res) => res.request().method() === 'POST' && /^\/api\/batches\/[^/]+\/undo$/.test(new URL(res.url()).pathname),
  )

/** Ctrl+Z as the planner presses it: in a cell of the sheet, beside the drawer. */
async function undoInSheet(page: Page, text: string) {
  const answer = undoAnswer(page)
  await rowWith(page, text).locator('td').nth(2).click()
  await page.keyboard.press('Control+z')
  expect((await answer).status()).toBe(200)
}

/** A download from the page or from the tab its link opened; Chromium may give it to either. */
function downloadIn(page: Page): Promise<Download> {
  return new Promise((resolve) => {
    page.once('download', resolve)
    page.context().once('page', (tab) => tab.once('download', resolve))
  })
}

const listed = (files: Locator) =>
  files
    .locator('.nv-files__item')
    .evaluateAll((items) =>
      items.map((li) =>
        ['kind', 'name', 'size'].map((part) => li.querySelector(`.nv-files__${part}`)?.textContent ?? '').join(' | '),
      ),
    )

test('upload-open-delete-undo @e2e', async ({ page, browser }) => {
  const api = page.request
  const made = nothing()
  const omschrijving = 'Repetitie e2e bijlagen'
  try {
    const id = await activity(api, made, omschrijving, DRAWER_WEEK)
    await page.setViewportSize({ width: 1600, height: 900 })
    await openWeek(page, 'Planning', 'Activiteiten', 'plandag', DRAWER_WEEK)
    const drawer = await openFiles(page, omschrijving)
    const files = filesOf(drawer)
    await expect(files.getByRole('heading', { name: 'Bijlagen' })).toBeVisible()
    await expect(files).toContainText('Nog geen bijlagen')

    const pdf = await upload(files, 'Rider', 'rider e2e.pdf', 'application/pdf', PDF)
    expect(pdf.status(), await pdf.text()).toBe(201)
    const photo = await upload(files, 'Foto', 'zaal e2e.jpg', 'image/jpeg', PHOTO)
    expect(photo.status(), await photo.text()).toBe(201)
    const photoId = ((await photo.json()) as { id: number }).id
    await expect.poll(() => listed(files)).toEqual(['Rider | rider e2e.pdf | 1 kB', 'Foto | zaal e2e.jpg | 1 kB'])
    await expect(files).not.toContainText('Nog geen bijlagen')
    // What the drawer lists is what the server holds.
    const stored = await api.get(`/api/attachments/activiteit/${id}`)
    expect(((await stored.json()) as { attachments: { name: string; kind: string }[] }).attachments).toMatchObject([
      { name: 'rider e2e.pdf', kind: 'rider', mime: 'application/pdf' },
      { name: 'zaal e2e.jpg', kind: 'foto', mime: 'image/jpeg' },
    ])
    await shot(page, 'drawer-files')

    // The pdf opens as a download (SPEC: served as attachment; review m5).
    const download = downloadIn(page)
    await files.getByRole('link', { name: 'rider e2e.pdf' }).click()
    const pdfFile = await download
    expect(pdfFile.suggestedFilename()).toBe('rider e2e.pdf')
    expect(readFileSync(await pdfFile.path()).equals(PDF)).toBe(true)
    for (const tab of page.context().pages()) if (tab !== page) await tab.close()

    // The photo opens inline in its own tab, decoded.
    const [photoTab] = await Promise.all([
      page.context().waitForEvent('page'),
      files.getByRole('link', { name: 'zaal e2e.jpg' }).click(),
    ])
    await photoTab.waitForLoadState()
    expect(new URL(photoTab.url()).pathname).toBe(`/api/attachments/file/${photoId}`)
    await expect.poll(() => photoTab.evaluate(() => document.images[0]?.naturalWidth ?? 0)).toBe(48)
    await photoTab.setViewportSize({ width: 800, height: 600 })
    await shot(photoTab, 'photo-inline')
    await photoTab.close()

    // Delete the photo, then Ctrl+Z in the sheet brings it back and the list reads again.
    const removed = page.waitForResponse((res) => res.request().method() === 'DELETE')
    await files.getByRole('button', { name: 'zaal e2e.jpg verwijderen' }).click()
    expect((await removed).status()).toBe(200)
    await expect.poll(() => listed(files)).toEqual(['Rider | rider e2e.pdf | 1 kB'])
    expect((await api.get(`/api/attachments/file/${photoId}`)).status()).toBe(404)
    await undoInSheet(page, omschrijving)
    await expect.poll(() => listed(files)).toEqual(['Rider | rider e2e.pdf | 1 kB', 'Foto | zaal e2e.jpg | 1 kB'])
    expect((await api.get(`/api/attachments/file/${photoId}`)).status()).toBe(200)
    await shot(page, 'drawer-undo-restored')

    // Re-entry: closed and opened again, the drawer reads the server; one more Ctrl+Z takes the photo's upload back.
    await drawer.getByRole('button', { name: 'Sluiten' }).click()
    await expect(page.locator('.nv-drawer')).toHaveCount(0)
    const again = filesOf(await openFiles(page, omschrijving))
    await expect.poll(() => listed(again)).toEqual(['Rider | rider e2e.pdf | 1 kB', 'Foto | zaal e2e.jpg | 1 kB'])
    await undoInSheet(page, omschrijving)
    await expect.poll(() => listed(again)).toEqual(['Rider | rider e2e.pdf | 1 kB'])
    expect((await api.get(`/api/attachments/file/${photoId}`)).status()).toBe(404)

    // Denied actor: an owner reads no activity, so neither its files nor a file by its id.
    const owner = await browser.newContext({ storageState: state('owner'), baseURL: 'http://127.0.0.1:5174' })
    try {
      const list = await owner.request.get(`/api/attachments/activiteit/${id}`)
      expect(list.status()).toBe(404)
      const pdfId = ((await pdf.json()) as { id: number }).id
      expect((await owner.request.get(`/api/attachments/file/${pdfId}`)).status()).toBe(404)
    } finally {
      await owner.close()
    }
  } finally {
    await cleanUp(api, made)
  }
})

test('refusals-in-dutch @e2e', async ({ page }) => {
  const api = page.request
  const made = nothing()
  const omschrijving = 'Repetitie e2e weigeringen'
  const TYPE = 'Dit bestandstype kan niet. Gebruik pdf, jpg, png of webp.'
  try {
    const id = await activity(api, made, omschrijving, REFUSAL_WEEK)
    await page.setViewportSize({ width: 1600, height: 900 })
    await openWeek(page, 'Planning', 'Activiteiten', 'plandag', REFUSAL_WEEK)
    const files = filesOf(await openFiles(page, omschrijving))
    const alert = files.getByRole('alert')
    const refused = [
      {
        name: 'logo e2e.svg',
        mime: 'image/svg+xml',
        bytes: '<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>',
      },
      {
        name: 'pagina e2e.pdf',
        mime: 'application/pdf',
        bytes: '<!doctype html><html><script>alert(1)</script></html>',
      },
      { name: 'programma e2e.pdf', mime: 'application/pdf', bytes: `MZ\x90\x00${'\x00'.repeat(60)}PE\x00\x00` },
    ]
    for (const file of refused) {
      const answer = await upload(files, 'Rider', file.name, file.mime, Buffer.from(file.bytes, 'latin1'))
      expect(answer.status(), file.name).toBe(415)
      await expect(alert).toHaveText(TYPE)
      await expect(files).toContainText('Nog geen bijlagen')
    }
    await shot(page, 'refused-type')

    // Boundary: one byte over 10 MB is refused, exactly 10 MB is taken.
    const over = await upload(
      files,
      'Rider',
      'groot e2e.pdf',
      'application/pdf',
      Buffer.concat([PDF, Buffer.alloc(10 * MB + 1 - PDF.length, 0x20)]),
    )
    expect(over.status()).toBe(413)
    await expect(alert).toHaveText('Dit bestand is te groot (max. 10 MB).')
    await expect(files).toContainText('Nog geen bijlagen')
    await shot(page, 'refused-size')
    const stored = await api.get(`/api/attachments/activiteit/${id}`)
    expect(((await stored.json()) as { attachments: unknown[] }).attachments).toEqual([])

    const exact = await upload(
      files,
      'Rider',
      'precies e2e.pdf',
      'application/pdf',
      Buffer.concat([PDF, Buffer.alloc(10 * MB - PDF.length, 0x20)]),
    )
    expect(exact.status(), await exact.text()).toBe(201)
    await expect(alert).toHaveCount(0)
    await expect.poll(() => listed(files)).toEqual(['Rider | precies e2e.pdf | 10 MB'])

    // Mid-flow failure: the connection drops during an upload; the drawer says so and lists nothing new.
    await page.route('**/api/attachments/activiteit/*', (route) =>
      route.request().method() === 'POST' ? route.abort('connectionreset') : route.continue(),
    )
    await files
      .locator('input[type="file"]')
      .setInputFiles({ name: 'weg e2e.pdf', mimeType: 'application/pdf', buffer: PDF })
    await expect(alert).toBeVisible()
    await page.unroute('**/api/attachments/activiteit/*')
    await expect.poll(() => listed(files)).toEqual(['Rider | precies e2e.pdf | 10 MB'])
    const after = await api.get(`/api/attachments/activiteit/${id}`)
    expect(((await after.json()) as { attachments: { name: string }[] }).attachments.map((a) => a.name)).toEqual([
      'precies e2e.pdf',
    ])
  } finally {
    await cleanUp(api, made)
  }
})

test('bijlagen-on-tourstop-and-assignment @e2e', async ({ page }) => {
  const api = page.request
  const made = nothing()
  const naam = 'Tourstop e2e bijlagen'
  const omschrijving = 'Repetitie e2e toewijzing bijlagen'
  try {
    const reeks = await idOf(api, 'speelreeks', {
      naam,
      productie_id: await idByName(api, 'productie', 'titel', 'Nachtwacht'),
      locatie_id: await idByName(api, 'organisatie', 'naam', 'Theater Het Anker'),
      start_datum: OTHERS_WEEK,
      eind_datum: plusDays(OTHERS_WEEK, 3),
    })
    made.speelreeks.push(reeks)
    const act = await activity(api, made, omschrijving, OTHERS_WEEK)
    const persoon = await idByName(api, 'persoon', 'weergavenaam', 'Noor Claes')
    const toewijzing = await idOf(api, 'toewijzing', { activiteit_id: act, persoon_id: persoon, state: 'bevestigd' })
    made.toewijzing.push(toewijzing)
    await page.setViewportSize({ width: 1600, height: 900 })

    // A tourstop's drawer has Bijlagen, and takes a file.
    await openWeek(page, 'Tourstops', 'Tourstops', 'start_datum', OTHERS_WEEK)
    const stop = filesOf(await openFiles(page, naam))
    await expect(stop.getByRole('heading', { name: 'Bijlagen' })).toBeVisible()
    await expect(stop).toContainText('Nog geen bijlagen')
    const answer = await upload(stop, 'Zaalblad', 'zaalblad e2e.pdf', 'application/pdf', PDF)
    expect(answer.status(), await answer.text()).toBe(201)
    await expect.poll(() => listed(stop)).toEqual(['Zaalblad | zaalblad e2e.pdf | 1 kB'])
    await shot(page, 'tourstop-bijlagen')

    // An assignment's drawer has Bijlagen, its own and empty.
    const views = (await (await api.get('/api/views')).json()) as { views: { id: number; name: string }[] }
    const view = views.views.find((v) => v.name === 'Toewijzingen')
    expect(view).toBeDefined()
    const only = JSON.stringify([{ field: 'activiteit_id', op: 'in', values: [String(act)] }])
    await page.goto(`/#view=${view?.id}&f=${encodeURIComponent(only)}`)
    await page.reload()
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Toewijzingen')
    await expect(page.locator('tbody tr.nv-tr')).toHaveCount(1)
    const assigned = filesOf(await openFiles(page, 'Noor Claes'))
    await expect(assigned.getByRole('heading', { name: 'Bijlagen' })).toBeVisible()
    await expect(assigned).toContainText('Nog geen bijlagen')
    await expect(assigned.getByRole('button', { name: /^Soort: / })).toBeVisible()
    await shot(page, 'assignment-bijlagen')

    // A dataset without attachments shows none: an organisation's drawer, and its route answers 404.
    await page.goto('/')
    await page
      .getByRole('navigation', { name: 'Views' })
      .getByRole('button', { name: 'Organisaties', exact: true })
      .first()
      .click()
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Organisaties')
    const drawer = await openDrawer(page, 'Theater Het Anker')
    await expect(drawer).toContainText('Ankerdijk 8')
    await expect(filesOf(drawer)).toHaveCount(0)
    await expect(drawer.getByText('Bijlagen', { exact: true })).toHaveCount(0)
    await expect(drawer.getByRole('radio', { name: 'Bijlagen' })).toHaveCount(0)
    await shot(page, 'organisation-no-bijlagen')
    const anker = await idByName(api, 'organisatie', 'naam', 'Theater Het Anker')
    expect((await api.get(`/api/attachments/organisatie/${anker}`)).status()).toBe(404)
  } finally {
    await cleanUp(api, made)
  }
})
