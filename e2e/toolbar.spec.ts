import { readFileSync } from 'node:fs'
import { expect, type Locator, type Page, test } from '@playwright/test'
import { state } from './auth'
import { shot } from './shots'
import { addCondition, openView, openWeek, pickIn } from './tree'

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
    await openView(page, 'Planning', 'Activiteiten')
    await page.getByRole('button', { name: 'More actions: Planning', exact: true }).click()
    await page.getByRole('menuitem', { name: 'Kopie maken' }).click()
    await page.getByRole('button', { name: 'More actions: Planning (kopie)', exact: true }).click()
    await page.getByRole('menuitem', { name: 'Naam wijzigen' }).click()
    await page.getByRole('textbox', { name: 'Nieuwe naam' }).fill(name)
    await page.getByRole('textbox', { name: 'Nieuwe naam' }).press('Enter')
    await expect.poll(async () => (await views(page)).find((v) => v.name === name)?.mine).toBe(true)

    // A change on one's own view saves itself; the title line says no save word.
    await page.getByRole('button', { name: /^Groep/ }).click()
    await page.getByRole('group', { name: 'Groeperen' }).getByRole('button', { name: 'Soort' }).click()
    await expect.poll(async () => (await views(page)).find((v) => v.name === name)?.group_by).toBe('soort')
    await expect(page.locator('.nv-toolbar').getByText(/gewijzigd|Opslaan|Opgeslagen/)).toHaveCount(0)
    await page.reload()
    await openView(page, name, 'Activiteiten')
    await expect(page.getByRole('button', { name: 'Groep: soort' })).toBeVisible()

    // The seeded view keeps a change in this browser only.
    const seeded = (await views(page)).find((v) => v.name === 'Planning')
    await openView(page, 'Planning', 'Activiteiten')
    await page.getByRole('button', { name: /^Groep/ }).click()
    await page.getByRole('group', { name: 'Groeperen' }).getByRole('button', { name: 'Soort' }).click()
    await page.waitForTimeout(800)
    expect((await views(page)).find((v) => v.id === seeded?.id)?.group_by).toBe(seeded?.group_by)
    await page.getByRole('button', { name: 'More actions', exact: true }).click()
    await page.getByRole('menuitem', { name: 'Terugzetten' }).click()
  } finally {
    for (const view of (await views(page)).filter((v) => v.name === name))
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
    await openWeek(page, 'Planning', 'Activiteiten', 'plandag', week)
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
    await expect(chips).toHaveText([
      'Plandag tussen 2031-03-03 en 2031-03-09',
      'Status is Bevestigd',
      'Soort is Repetitie of Opbouw',
      'Omschrijving bevat “zaal”',
    ])
    await expect(named(page, titles[0] as string)).toHaveCount(1)
    await expect(named(page, titles[1] as string)).toHaveCount(1)
    await expect(named(page, titles[2] as string)).toHaveCount(0)
    await expect(named(page, titles[3] as string)).toHaveCount(0)

    await page.locator('.nv-bar').getByRole('button', { name: 'Filter Soort wissen' }).click()
    await expect(named(page, titles[2] as string)).toHaveCount(1)
    await page.reload()
    await expect(chips).toHaveText([
      'Plandag tussen 2031-03-03 en 2031-03-09',
      'Status is Bevestigd',
      'Omschrijving bevat “zaal”',
    ])
    await expect(named(page, titles[2] as string)).toHaveCount(1)
    await expect(named(page, titles[3] as string)).toHaveCount(0)
  } finally {
    for (const id of made) await page.request.delete(`/api/rows/activiteit/${id}`)
  }
})

test('filter-link @e2e', async ({ page, browser }) => {
  const before = (await views(page)).find((v) => v.name === 'Dagplanning')
  await page.goto('/')
  await openView(page, 'Dagplanning', 'Activiteiten')
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
    await expect(fresh.getByRole('heading', { level: 1 })).toHaveText('Dagplanning')
    await expect(fresh.locator('.nv-bar .nv-chip--filter')).toHaveText([
      'Plandag tussen 2026-10-12 en 2026-10-18',
      'Soort is Repetitie',
    ])
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
    await openWeek(page, 'Planning', 'Activiteiten', 'plandag', week)
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
    await openWeek(page, 'Planning', 'Activiteiten', 'plandag', '2026-10-12')
    await page.getByRole('button', { name: 'Filter Status wissen' }).click()
    const status = await statusCell(page, name)
    await status.click()
    await status.press('Enter')
    await status.getByRole('listbox').press(letter)
    await status.getByRole('listbox').press('Enter')
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
    await openWeek(page, 'Dagplanning', 'Activiteiten', 'plandag', '2026-10-12')
    await expect(page.locator('tbody tr.nv-tr').first()).toBeVisible()
    expect(await items(page)).toEqual(['Excel', 'Agenda (.ics)', 'Link kopiëren'])

    await page.locator('.nv-toolbar').getByRole('button', { name: 'Exporteren / delen' }).click()
    const download = page.waitForEvent('download')
    await page.getByRole('menuitem', { name: 'Agenda (.ics)' }).click()
    const file = await download
    expect(file.suggestedFilename()).toBe('Dagplanning.ics')
    const ics = readFileSync(await file.path(), 'utf8')
    const shown = await page.locator('tbody tr.nv-tr').count()
    expect(ics.split('\r\n').filter((line) => line === 'BEGIN:VEVENT')).toHaveLength(shown)
    const first = (await page.locator('tbody tr.nv-tr').first().getAttribute('data-title')) as string
    expect(ics.replace(/\r\n /g, '')).toContain(`SUMMARY:${first.replace(/[;,]/g, (c) => `\\${c}`)}`)

    const admin = await browser.newContext({ storageState: state('admin') })
    try {
      const other = await admin.newPage()
      await openWeek(other, 'Dagplanning', 'Activiteiten', 'plandag', '2026-10-12')
      expect(await items(other)).toEqual(['Excel', 'Agenda (.ics)', 'Link kopiëren', 'Publiceren'])
      await shot(other, 'share-menu')
    } finally {
      await admin.close()
    }
  })
})
