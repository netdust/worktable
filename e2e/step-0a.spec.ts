import { expect, type Page, test } from '@playwright/test'

const WEEK = '/#from=2026-10-12'

interface Section {
  day: string
  starts: string[]
}

async function open(page: Page, view: string) {
  await page.goto(WEEK)
  await page.getByText(view, { exact: true }).first().click()
}

/** A sorted header carries an arrow after its label, so it is stripped before comparing. */
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

async function columnTexts(page: Page, label: string): Promise<string[]> {
  const index = await columnIndex(page, label)
  return page
    .locator('tbody tr.nv-tr')
    .evaluateAll((rows, i) => rows.map((tr) => tr.querySelectorAll('td')[i]?.textContent?.trim() ?? ''), index)
}

/** Each day header with the Start cells that follow it, in page order. */
async function sections(page: Page): Promise<Section[]> {
  const start = await columnIndex(page, 'Start')
  return page
    .locator('tbody')
    .first()
    .evaluate((body, i) => {
      const out: { day: string; starts: string[] }[] = []
      for (const tr of Array.from(body.querySelectorAll('tr'))) {
        if (tr.classList.contains('nv-group')) out.push({ day: tr.textContent?.trim() ?? '', starts: [] })
        else if (tr.classList.contains('nv-tr'))
          out[out.length - 1]?.starts.push(tr.querySelectorAll('td')[i]?.textContent?.trim() ?? '')
      }
      return out
    }, start)
}

const MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
]

/** "Tuesday, October 13" to 2026-10-13: the headers carry no year, the window is in 2026. */
function iso(day: string): string {
  const [, month, date] = /, (\w+) (\d+)$/.exec(day) ?? []
  return `2026-${String(MONTHS.indexOf(month) + 1).padStart(2, '0')}-${date.padStart(2, '0')}`
}

const ascending = (values: string[]) => [...values].sort()

test('planning-grouped-sorted', async ({ page }) => {
  await open(page, 'Planning')
  await expect(page.locator('tbody tr.nv-tr').first()).toBeVisible()

  const found = await sections(page)
  expect(found.length).toBeGreaterThan(1)
  const days = found.map((section) => iso(section.day))
  expect(days).toEqual(ascending(days))
  for (const section of found) {
    expect(section.starts.length).toBeGreaterThan(0)
    expect(section.starts).toEqual(ascending(section.starts))
  }

  const tuesday = found.find((section) => iso(section.day) === '2026-10-13')
  expect(tuesday?.starts).toContain('Wed 14/10 00:30')
  expect(found.find((section) => iso(section.day) === '2026-10-14')?.starts).not.toContain('Wed 14/10 00:30')
})

test('planning-status-filter', async ({ page }) => {
  await open(page, 'Planning')
  await expect(page.locator('tbody tr.nv-tr').first()).toBeVisible()
  expect(new Set(await columnTexts(page, 'Status'))).toEqual(new Set(['Bevestigd']))

  await page.getByRole('button', { name: 'Remove filter Status' }).click()
  await page.getByRole('button', { name: '+ Filter' }).click()
  const request = page.waitForRequest((r) => {
    const url = new URL(r.url())
    return url.pathname === '/api/rows/activiteit' && (url.searchParams.get('filter') ?? '').includes('optie')
  })
  await page.getByRole('button', { name: 'Status: Optie' }).click()
  await request

  await expect(page.locator('tbody tr.nv-tr').first()).toBeVisible()
  await expect.poll(async () => [...new Set(await columnTexts(page, 'Status'))]).toEqual(['Optie'])
})

test('query-view-loads', async ({ page }) => {
  await page.goto(WEEK)
  const response = page.waitForResponse((r) => new URL(r.url()).pathname === '/api/rows/productie_dag')
  await page.getByText('Per productie per dag', { exact: true }).first().click()
  expect((await response).status()).toBe(200)

  await expect(page.locator('tbody tr.nv-tr').first()).toBeVisible()
  expect(await page.locator('tbody tr.nv-tr').count()).toBeGreaterThan(0)
  await expect(page.locator('thead th', { hasText: 'Plandag' })).toBeVisible()
})
