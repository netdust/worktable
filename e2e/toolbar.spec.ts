import { readFileSync } from 'node:fs'
import { expect, type Locator, type Page, test } from '@playwright/test'
import { state } from './auth'
import { openEditor } from './editor'
import { shot } from './shots'
import { addCondition, copyAndRename, openModel, openView, openWeek, pickIn } from './tree'

type Stored = { id: number; name: string; group_by: string | null; mine: boolean }

async function views(page: Page): Promise<Stored[]> {
  const response = await page.request.get('/api/views')
  expect(response.status()).toBe(200)
  return ((await response.json()) as { views: Stored[] }).views
}

// The specs share one database: the view this flow makes goes again whatever happens.
test('autosave-own-view @e2e', async ({ page }) => {
  const name = 'Eigen e2e autosave'
  try {
    await page.goto('/')
    await openView(page, 'Bevestigd', 'Activiteiten')
    await copyAndRename(page, 'Bevestigd', name)
    await expect.poll(async () => (await views(page)).find((v) => v.name === name)?.mine).toBe(true)

    // A change on one's own view saves itself; the title line says no save word.
    await page.getByRole('button', { name: /^Groep/ }).click()
    await page.getByRole('group', { name: 'Groeperen' }).getByRole('button', { name: 'Soort' }).click()
    await expect.poll(async () => (await views(page)).find((v) => v.name === name)?.group_by).toBe('soort')
    await expect(page.locator('.nv-toolbar').getByText(/gewijzigd|Opslaan|Opgeslagen/)).toHaveCount(0)
    await page.reload()
    await openView(page, name, 'Activiteiten')
    await expect(page.getByRole('button', { name: 'Groep: soort' })).toBeVisible()
    await shot(page, 'autosave-own-view')

    // The seeded view keeps a change in this browser only.
    const seeded = (await views(page)).find((v) => v.name === 'Bevestigd')
    await openView(page, 'Bevestigd', 'Activiteiten')
    await page.getByRole('button', { name: /^Groep/ }).click()
    await page.getByRole('group', { name: 'Groeperen' }).getByRole('button', { name: 'Soort' }).click()
    await page.waitForTimeout(800)
    expect((await views(page)).find((v) => v.id === seeded?.id)?.group_by).toBe(seeded?.group_by)
    await page.getByRole('button', { name: 'More actions', exact: true }).click()
    await page.getByRole('menuitem', { name: 'Terugzetten' }).click()
  } finally {
    for (const view of (await views(page)).filter((v) => v.mine && [name, 'Bevestigd (kopie)'].includes(v.name)))
      await page.request.delete(`/api/views/${view.id}`)
  }
})

const named = (page: Page, title: string) => page.locator(`tbody tr.nv-tr[data-title="${title}"]`)

async function activity(page: Page, soort: string, datum: string, omschrijving: string): Promise<number> {
  const productie = (
    (await (await page.request.get('/api/rows/productie?limit=1')).json()) as { rows: { id: number }[] }
  ).rows[0]?.id
  const made = await page.request.post('/api/rows/activiteit', {
    data: { productie_id: productie, soort, datum, omschrijving, status: 'bevestigd' },
  })
  expect(made.status(), await made.text()).toBe(201)
  return ((await made.json()) as { id: number }).id
}

test('filter-builder @e2e', async ({ page }) => {
  const week = '2031-03-03'
  const titles = ['repetitie grote zaal e2e', 'opbouw kleine zaal e2e', 'reis naar de zaal e2e', 'repetitie studio e2e']
  const made: number[] = []
  try {
    for (const [at, soort] of ['repetitie', 'opbouw', 'reis', 'repetitie'].entries())
      made.push(await activity(page, soort, '2031-03-04', titles[at] as string))
    await openWeek(page, 'Bevestigd', 'Activiteiten', 'plandag', week)
    for (const title of titles) await expect(named(page, title)).toHaveCount(1)

    // "Soort is Repetitie of Opbouw", the second value found by searching.
    await addCondition(page, 'Soort', 'Repetitie')
    await page
      .locator('.nv-bar')
      .getByRole('button', { name: /^Filter\s*\d*$/ })
      .click()
    const soort = page.getByRole('group', { name: /^Voorwaarde \d/ }).last()
    await soort.getByRole('searchbox', { name: 'Soort zoeken' }).fill('opb')
    await soort.getByRole('option', { name: 'Opbouw', exact: true }).click()

    // "Omschrijving bevat 'zaal'".
    await page.getByRole('button', { name: 'Voorwaarde toevoegen' }).click()
    const text = page.getByRole('group', { name: /^Voorwaarde \d/ }).last()
    await pickIn(text, 'Veld', 'Omschrijving')
    await text.getByRole('textbox', { name: 'Omschrijving' }).fill('zaal')
    await shot(page, 'filter-builder')
    await page.keyboard.press('Escape')

    const chips = page.locator('.nv-bar .nv-chip--filter')
    await expect(chips).toHaveText(['Status is Bevestigd', 'Soort is Repetitie of Opbouw', 'Omschrijving bevat “zaal”'])
    await expect(named(page, titles[0] as string)).toHaveCount(1)
    await expect(named(page, titles[1] as string)).toHaveCount(1)
    await expect(named(page, titles[2] as string)).toHaveCount(0)
    await expect(named(page, titles[3] as string)).toHaveCount(0)

    await page.locator('.nv-bar').getByRole('button', { name: 'Filter Soort wissen' }).click()
    await expect(named(page, titles[2] as string)).toHaveCount(1)
    await page.reload()
    await expect(chips).toHaveText(['Status is Bevestigd', 'Omschrijving bevat “zaal”'])
    await expect(named(page, titles[2] as string)).toHaveCount(1)
    await expect(named(page, titles[3] as string)).toHaveCount(0)
  } finally {
    for (const id of made) await page.request.delete(`/api/rows/activiteit/${id}`)
  }
})

test('filter-link @e2e', async ({ page, browser }) => {
  const before = (await views(page)).find((v) => v.name === 'Planning')
  await page.goto('/')
  await openView(page, 'Planning', 'Activiteiten')
  await expect.poll(() => new URLSearchParams(new URL(page.url()).hash.slice(1)).get('view')).not.toBeNull()
  const key = new URLSearchParams(new URL(page.url()).hash.slice(1)).get('view') as string
  const f = [
    { field: 'plandag', op: 'between', values: ['2026-10-12', '2026-10-18'] },
    { field: 'soort', op: 'in', values: ['repetitie'] },
  ]
  const address = `/#view=${key}&f=${encodeURIComponent(JSON.stringify(f))}`

  const other = await browser.newContext({ storageState: state('editor') })
  try {
    const fresh = await other.newPage()
    await fresh.goto(address)
    await expect(fresh.getByRole('heading', { level: 1 })).toHaveText('Planning')
    await expect(fresh.locator('.nv-bar .nv-chip--filter')).toHaveText(['Soort is Repetitie'])
    await expect(fresh.locator('.nv-toolbar__summary')).toHaveText('Week 42 · 12–18 okt')
    await shot(fresh, 'filter-link')
    await expect.poll(() => new URLSearchParams(new URL(fresh.url()).hash.slice(1)).get('f')).toBeNull()
    await fresh.waitForTimeout(800)
    expect((await views(fresh)).find((v) => v.id === before?.id)).toEqual(before)
  } finally {
    await other.close()
  }
})

test('filter-or @e2e', async ({ page }) => {
  const week = '2031-03-10'
  const titles = ['reis naar Brugge e2e', 'repetitie studio e2e', 'repetitie zaal e2e']
  const made: number[] = []
  try {
    for (const [at, soort] of ['reis', 'repetitie', 'repetitie'].entries())
      made.push(await activity(page, soort, '2031-03-11', titles[at] as string))
    await openWeek(page, 'Bevestigd', 'Activiteiten', 'plandag', week)
    await page.locator('.nv-bar').getByRole('button', { name: 'Filter Status wissen' }).click()
    await addCondition(page, 'Soort', 'Reis')
    await page
      .locator('.nv-bar')
      .getByRole('button', { name: /^Filter\s*\d*$/ })
      .click()
    await page.getByRole('button', { name: 'Voorwaarde toevoegen' }).click()
    const text = page.getByRole('group', { name: /^Voorwaarde \d/ }).last()
    await pickIn(text, 'Veld', 'Omschrijving')
    await text.getByRole('textbox', { name: 'Omschrijving' }).fill('studio')
    await expect(named(page, titles[0] as string)).toHaveCount(0)

    // "Of": the period still narrows; the two conditions now either hold.
    await pickIn(page.getByRole('group', { name: /^Voorwaarde \d/ }).nth(2), 'Verbinding', 'Of')
    await shot(page, 'filter-or')
    await page.keyboard.press('Escape')
    await expect(page.locator('.nv-bar .nv-chip-join')).toHaveText(['of'])
    await expect(named(page, titles[0] as string)).toHaveCount(1)
    await expect(named(page, titles[1] as string)).toHaveCount(1)
    await expect(named(page, titles[2] as string)).toHaveCount(0)
    await page.reload()
    await expect(named(page, titles[0] as string)).toHaveCount(1)
    await expect(page.locator('.nv-bar .nv-chip-join')).toHaveText(['of'])
  } finally {
    for (const id of made) await page.request.delete(`/api/rows/activiteit/${id}`)
  }
})

interface Activiteit {
  id: number
  omschrijving: string
  status: string
}

async function activiteit(page: Page, omschrijving: string): Promise<Activiteit> {
  const response = await page.request.get('/api/rows/activiteit?limit=500')
  const found = ((await response.json()) as { rows: Activiteit[] }).rows.filter((r) => r.omschrijving === omschrijving)
  expect(found, `one ${omschrijving}`).toHaveLength(1)
  return found[0] as Activiteit
}

async function statusCell(page: Page, omschrijving: string): Promise<Locator> {
  const index = await page
    .locator('thead th')
    .evaluateAll((heads) => heads.findIndex((th) => (th.textContent ?? '').replace(/\s*[↑↓]$/, '').trim() === 'Status'))
  expect(index, 'column Status').toBeGreaterThanOrEqual(0)
  return page.locator(`tbody tr.nv-tr[data-title="${omschrijving}"]`).locator('td').nth(index)
}

// The status goes back through the panel's undo; whatever happens, the record ends as it began.
test('history-undo-own @e2e', async ({ page }) => {
  const name = 'reis Gent'
  const before = await activiteit(page, name)
  const [letter, value, label] = before.status === 'optie' ? ['b', 'bevestigd', 'Bevestigd'] : ['o', 'optie', 'Optie']
  const was = before.status === 'optie' ? 'Optie' : 'Bevestigd'
  try {
    await openWeek(page, 'Bevestigd', 'Activiteiten', 'plandag', '2026-10-12')
    await page.getByRole('button', { name: 'Filter Status wissen' }).click()
    const status = await statusCell(page, name)
    await status.click()
    await status.press('Enter')
    await openEditor(page).getByRole('listbox').press(letter)
    await openEditor(page).getByRole('listbox').press('Enter')
    await expect(status).toHaveText(label)
    await expect.poll(async () => (await activiteit(page, name)).status).toBe(value)

    await page.getByRole('button', { name: 'Geschiedenis', exact: true }).click()
    const panel = page.getByRole('complementary', { name: 'Geschiedenis' })
    const newest = () => panel.getByRole('listitem').filter({ hasText: name }).first()
    await expect(newest()).toContainText(`Status${was} → ${label}`)
    await expect(newest().locator('.nv-history__by')).toHaveText('jij')
    await newest().getByRole('button', { name: 'Ongedaan maken' }).click()

    await expect.poll(async () => (await activiteit(page, name)).status).toBe(before.status)
    // The view reads again: its rows come back once the read answers.
    await expect(page.locator(`tbody tr.nv-tr[data-title="${name}"]`)).toBeVisible()
    await expect(await statusCell(page, name)).toHaveText(was)
    // The list read again: the undo is now the newest entry.
    await expect(newest()).toContainText(`Status${label} → ${was}`)
    await shot(page, 'history-undo-own')
  } finally {
    if ((await activiteit(page, name)).status !== before.status)
      await page.request.patch(`/api/rows/activiteit/${before.id}`, { data: { status: before.status } })
  }
})

test.describe('the share menu', () => {
  const items = async (page: Page) => {
    await page.locator('.nv-toolbar').getByRole('button', { name: 'Exporteren / delen' }).click()
    const names = await page.getByRole('menu', { name: 'Exporteren / delen' }).getByRole('menuitem').allTextContents()
    await page.keyboard.press('Escape')
    return names
  }

  test('share-menu @e2e', async ({ page, browser }) => {
    await openWeek(page, 'Planning', 'Activiteiten', 'plandag', '2026-10-12')
    await expect(page.locator('tbody tr.nv-tr').first()).toBeVisible()
    expect(await items(page)).toEqual(['Excel', 'Agenda (.ics)', 'Link kopiëren'])

    await page.locator('.nv-toolbar').getByRole('button', { name: 'Exporteren / delen' }).click()
    const download = page.waitForEvent('download')
    await page.getByRole('menuitem', { name: 'Agenda (.ics)' }).click()
    const file = await download
    expect(file.suggestedFilename()).toBe('Planning.ics')
    const ics = readFileSync(await file.path(), 'utf8')
    const shown = await page.locator('tbody tr.nv-tr').count()
    expect(ics.split('\r\n').filter((line) => line === 'BEGIN:VEVENT')).toHaveLength(shown)
    const first = (await page.locator('tbody tr.nv-tr').first().getAttribute('data-title')) as string
    expect(ics.replace(/\r\n /g, '')).toContain(`SUMMARY:${first.replace(/[;,]/g, (c) => `\\${c}`)}`)

    const admin = await browser.newContext({ storageState: state('admin') })
    try {
      const other = await admin.newPage()
      await openWeek(other, 'Planning', 'Activiteiten', 'plandag', '2026-10-12')
      expect(await items(other)).toEqual(['Excel', 'Agenda (.ics)', 'Link kopiëren', 'Publiceren'])
      await other.locator('.nv-toolbar').getByRole('button', { name: 'Exporteren / delen' }).click()
      await expect(other.getByRole('menu', { name: 'Exporteren / delen' })).toBeVisible()
      await shot(other, 'share-menu')
      await other.keyboard.press('Escape')
    } finally {
      await admin.close()
    }
  })
})

// At the narrowest supported width the builder, its value list and its last row stay inside the viewport.
test('builder-fits-at-1280 @e2e', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 })
  await openWeek(page, 'Bevestigd', 'Activiteiten', 'plandag', '2026-10-12')
  await page
    .locator('.nv-bar')
    .getByRole('button', { name: /^Filter\s*\d*$/ })
    .click()
  for (const field of ['Soort', 'Omschrijving']) {
    await page.getByRole('button', { name: 'Voorwaarde toevoegen' }).click()
    await pickIn(page.getByRole('group', { name: /^Voorwaarde \d/ }).last(), 'Veld', field)
  }
  const soort = page.getByRole('group', { name: /^Voorwaarde \d/ }).nth(2)
  await soort.getByRole('searchbox', { name: 'Soort zoeken' }).click()
  await expect(soort.getByRole('listbox', { name: 'Soort' })).toBeVisible()
  const inside = async (selector: string) => {
    const box = await page.locator(selector).last().boundingBox()
    expect(box, selector).not.toBeNull()
    const b = box as { x: number; y: number; width: number; height: number }
    expect(b.x, `${selector} left`).toBeGreaterThanOrEqual(0)
    expect(b.x + b.width, `${selector} right`).toBeLessThanOrEqual(1280)
    expect(b.y + b.height, `${selector} bottom`).toBeLessThanOrEqual(800)
  }
  await inside('.nv-fb-panel')
  await inside('.nv-fb__menu')
  await inside('.nv-fb__remove')
  await shot(page, 'builder-at-1280')
  await page.keyboard.press('Escape')
  await page.keyboard.press('Escape')
  await page.getByRole('button', { name: 'More actions', exact: true }).click()
  await page.getByRole('menuitem', { name: 'Terugzetten' }).click()
})

// Jef Maes is the seed's one person who is not actief.
test('filter-yes-no @e2e', async ({ page }) => {
  await page.goto('/')
  await openModel(page, 'Personen')
  await expect(page.locator('tbody tr.nv-tr[data-title="Jef Maes"]')).toHaveCount(1)
  await page
    .locator('.nv-bar')
    .getByRole('button', { name: /^Filter\s*\d*$/ })
    .click()
  await page.getByRole('button', { name: 'Voorwaarde toevoegen' }).click()
  const row = page.getByRole('group', { name: /^Voorwaarde \d/ }).last()
  await pickIn(row, 'Veld', 'Actief')
  await expect(row.getByRole('combobox', { name: 'Actief' })).toHaveValue('1')
  await expect(page.locator('tbody tr.nv-tr[data-title="Jef Maes"]')).toHaveCount(0)
  await expect(page.locator('tbody tr.nv-tr[data-title="Bram De Wilde"]')).toHaveCount(1)

  await row.getByRole('combobox', { name: 'Actief' }).selectOption({ label: 'Nee' })
  await page.keyboard.press('Escape')
  await expect(page.locator('.nv-bar .nv-chip--filter').filter({ hasText: 'Actief' })).toHaveText(/Actief is Nee/)
  await expect(page.locator('tbody tr.nv-tr')).toHaveCount(1)
  await expect(page.locator('tbody tr.nv-tr[data-title="Jef Maes"]')).toHaveCount(1)
  await shot(page, 'filter-yes-no')
  await page.getByRole('button', { name: 'More actions', exact: true }).click()
  await page.getByRole('menuitem', { name: 'Terugzetten' }).click()
  await expect(page.locator('tbody tr.nv-tr[data-title="Bram De Wilde"]')).toHaveCount(1)
})

// The administrator's own view is for them alone: the editor who opens its link is told, and keeps their view's own conditions.
test('link-to-a-view-not-yours @e2e', async ({ page, browser }) => {
  const name = 'Beheer e2e alleen ik'
  const admin = await browser.newContext({ storageState: state('admin') })
  const api = admin.request
  let id: number | undefined
  try {
    const made = await api.post('/api/views', { data: { name, source: 'activiteit', shared: false } })
    expect(made.status(), await made.text()).toBe(201)
    id = ((await made.json()) as { id: number }).id
    const sender = await admin.newPage()
    await sender.context().grantPermissions(['clipboard-read', 'clipboard-write'])
    await sender.goto('/')
    await openView(sender, name, 'Activiteiten')
    await addCondition(sender, 'Soort', 'Reis')
    await sender.locator('.nv-toolbar').getByRole('button', { name: 'Exporteren / delen' }).click()
    await sender.getByRole('menuitem', { name: 'Link kopiëren' }).click()
    const link = new URL(await sender.evaluate(() => navigator.clipboard.readText()))
    expect(new URLSearchParams(link.hash.slice(1)).get('f')).toContain('reis')

    await page.goto('/')
    await expect(page.getByRole('navigation', { name: 'Views' })).toBeVisible()
    const before = (await views(page)).filter((v) => v.mine)
    // Opened cold, as from a mail: a same-page hash change lands while the app is open, and a reload would lose its note.
    await page.goto('about:blank')
    await page.goto(`/${link.hash}`)
    await expect(
      page.getByText(/^De gedeelde weergave is er niet voor jou; je ziet .+ zonder de filters van de link\.$/),
    ).toBeVisible()
    await shot(page, 'link-not-yours')
    await expect(page.locator('.nv-bar .nv-chip--filter').filter({ hasText: 'Soort is Reis' })).toHaveCount(0)
    await expect(page.getByRole('heading', { level: 1 })).not.toHaveText(name)
    await expect.poll(() => new URLSearchParams(new URL(page.url()).hash.slice(1)).get('f')).toBeNull()
    await page.waitForTimeout(800)
    expect((await views(page)).filter((v) => v.mine)).toEqual(before)
  } finally {
    if (id !== undefined) await api.delete(`/api/views/${id}`)
    await admin.close()
  }
})

// "Of" joins the conditions only: a matching row outside the period stays out.
test('or-with-period-narrows @e2e', async ({ page }) => {
  const week = '2031-03-17'
  const inWeek = 'reis in de week e2e'
  const outside = ['reis buiten de week e2e', 'studio buiten de week e2e']
  const made: number[] = []
  try {
    made.push(await activity(page, 'reis', '2031-03-18', inWeek))
    made.push(await activity(page, 'reis', '2031-03-26', outside[0] as string))
    made.push(await activity(page, 'repetitie', '2031-03-05', outside[1] as string))
    await openWeek(page, 'Bevestigd', 'Activiteiten', 'plandag', week)
    await page.locator('.nv-bar').getByRole('button', { name: 'Filter Status wissen' }).click()
    await addCondition(page, 'Soort', 'Reis')
    await page
      .locator('.nv-bar')
      .getByRole('button', { name: /^Filter\s*\d*$/ })
      .click()
    await page.getByRole('button', { name: 'Voorwaarde toevoegen' }).click()
    const text = page.getByRole('group', { name: /^Voorwaarde \d/ }).last()
    await pickIn(text, 'Veld', 'Omschrijving')
    await text.getByRole('textbox', { name: 'Omschrijving' }).fill('studio')
    const read = page.waitForRequest((r) => r.url().includes('/api/rows/activiteit') && r.url().includes('%24or'))
    await pickIn(page.getByRole('group', { name: /^Voorwaarde \d/ }).nth(2), 'Verbinding', 'Of')
    const filter = JSON.parse(new URL((await read).url()).searchParams.get('filter') as string) as Record<
      string,
      unknown
    >
    expect(Object.keys(filter)).toContain('$or')
    expect(Object.keys(filter).some((k) => k.startsWith('datum') || k.startsWith('plandag'))).toBe(true)
    await page.keyboard.press('Escape')
    await expect(page.locator('.nv-bar .nv-chip-join')).toHaveText(['of'])
    await expect(named(page, inWeek)).toHaveCount(1)
    for (const title of outside) await expect(named(page, title)).toHaveCount(0)
    await shot(page, 'or-with-period')
    await page.getByRole('button', { name: 'More actions', exact: true }).click()
    await page.getByRole('menuitem', { name: 'Terugzetten' }).click()
  } finally {
    for (const id of made) await page.request.delete(`/api/rows/activiteit/${id}`)
  }
})

// A colleague's change is listed, by them, without an undo: the engine would refuse it (403).
test('history-other-has-no-undo @e2e', async ({ page, browser }) => {
  const title = 'door beheer gewijzigd e2e'
  const admin = await browser.newContext({ storageState: state('admin') })
  let id: number | undefined
  try {
    const productie = (
      (await (await admin.request.get('/api/rows/productie?limit=1')).json()) as { rows: { id: number }[] }
    ).rows[0]?.id
    const made = await admin.request.post('/api/rows/activiteit', {
      data: { productie_id: productie, soort: 'repetitie', datum: '2031-04-01', omschrijving: title, status: 'optie' },
    })
    expect(made.status(), await made.text()).toBe(201)
    id = ((await made.json()) as { id: number }).id
    const changed = await admin.request.patch(`/api/rows/activiteit/${id}`, { data: { status: 'bevestigd' } })
    expect(changed.status(), await changed.text()).toBe(200)

    await openWeek(page, 'Bevestigd', 'Activiteiten', 'plandag', '2031-03-31')
    await expect(named(page, title)).toHaveCount(1)
    await page.getByRole('button', { name: 'Geschiedenis', exact: true }).click()
    const panel = page.getByRole('complementary', { name: 'Geschiedenis' })
    const entries = panel.getByRole('listitem').filter({ hasText: title })
    await expect(entries.first()).toContainText('StatusOptie → Bevestigd')
    await expect(entries).toHaveCount(2)
    for (const entry of await entries.all()) {
      await expect(entry.locator('.nv-history__by')).not.toHaveText('jij')
      await expect(entry.getByRole('button', { name: 'Ongedaan maken' })).toHaveCount(0)
    }
    await shot(page, 'history-panel')
  } finally {
    if (id !== undefined) await admin.request.delete(`/api/rows/activiteit/${id}`)
    await admin.close()
  }
})

// Only a view on a query can be published, so these flows copy Voorstellingen, the website's overview.
async function copyOfVoorstellingen(page: Page, copy: string): Promise<number> {
  await page.goto('/')
  await openView(page, 'Voorstellingen')
  await page.getByRole('button', { name: 'More actions: Voorstellingen', exact: true }).click()
  await page.getByRole('menuitem', { name: 'Kopie maken' }).click()
  await expect.poll(async () => (await views(page)).find((v) => v.name === copy)?.mine).toBe(true)
  await openView(page, copy, 'Voorstellingen')
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(copy)
  return ((await views(page)).find((v) => v.name === copy) as Stored).id
}

// Publiceren from the menu: the write guard takes a PUT only with a JSON body, an empty one too.
test('publish-from-share-menu @e2e', async ({ browser }) => {
  const copy = 'Voorstellingen (kopie)'
  const admin = await browser.newContext({ storageState: state('admin') })
  const page = await admin.newPage()
  try {
    await copyOfVoorstellingen(page, copy)
    await page.locator('.nv-toolbar').getByRole('button', { name: 'Exporteren / delen' }).click()
    await page.getByRole('menuitem', { name: 'Publiceren' }).click()
    const dialog = page.getByRole('dialog', { name: 'Publiceren' })
    await expect(dialog.getByText(/publieke adres|Content-Type/)).toBeVisible()
    await shot(page, 'publish-dialog')
    await expect(dialog.getByRole('alert')).toHaveCount(0, { timeout: 1000 })
    const address = dialog.getByRole('textbox', { name: 'Publiek adres' })
    await expect(address).toHaveValue(/\/api\/public\/views\/\S+$/, { timeout: 1000 })
    expect((await admin.request.get(new URL(await address.inputValue()).pathname)).status()).toBe(200)
    await page.keyboard.press('Escape')
    await expect(dialog).toHaveCount(0)
    await expect(page.locator('.nv-toolbar').getByRole('button', { name: 'Exporteren / delen' })).toBeFocused()
  } finally {
    for (const view of (await views(page)).filter((v) => v.name === copy))
      await admin.request.delete(`/api/views/${view.id}`)
    await admin.close()
  }
})

// A published view never saves itself: a removed condition stays in this browser until "Publieke weergave bijwerken".
test('published-view-stays-put @e2e', async ({ browser }) => {
  const copy = 'Voorstellingen (kopie)'
  const admin = await browser.newContext({ storageState: state('admin') })
  const page = await admin.newPage()
  try {
    const id = await copyOfVoorstellingen(page, copy)
    const filtered = await admin.request.patch(`/api/views/${id}`, {
      data: { filters: { datum: { $period: 'week' } } },
    })
    expect(filtered.status(), await filtered.text()).toBe(200)
    const published = await admin.request.put(`/api/views/${id}/share-token`, { data: {} })
    expect(published.status(), await published.text()).toBe(200)
    await page.reload()
    await openView(page, copy, 'Voorstellingen')
    // The view's period: its lit Week, named in the title line, never a chip.
    const week = page
      .locator('.nv-bar')
      .getByRole('radiogroup', { name: 'Periode' })
      .getByRole('radio', { name: 'Week' })
    await expect(week).toHaveAttribute('aria-checked', 'true')
    await expect(page.locator('.nv-bar .nv-chip--filter')).toHaveCount(0)

    const stored = () => views(page).then((all) => all.find((v) => v.id === id) as Stored & { filters: unknown })
    const before = (await stored()).filters
    await week.click()
    await expect(week).toHaveAttribute('aria-checked', 'false')
    await page.waitForTimeout(800)
    expect((await stored()).filters).toEqual(before)
    await page.getByRole('button', { name: 'More actions', exact: true }).click()
    await expect(page.getByRole('menuitem', { name: 'Publieke weergave bijwerken' })).toBeVisible()
    await shot(page, 'published-stays-put')
    await page.keyboard.press('Escape')
  } finally {
    for (const view of (await views(page)).filter((v) => v.name === copy))
      await admin.request.delete(`/api/views/${view.id}`)
    await admin.close()
  }
})
