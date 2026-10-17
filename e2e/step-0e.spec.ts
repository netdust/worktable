import { expect, type Page, test } from '@playwright/test'
import { ACCOUNTS, requestAndOpenLink, THEATRE } from './auth'
import { fillDate } from './segments'
import { openModel, openView } from './tree'

async function pick(page: Page, view: string, model = view) {
  await openView(page, view, model)
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
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

/** An undo is one POST of the edit's batch; the grid then reads the row back. */
const undoOf = (page: Page) =>
  page.waitForResponse(
    (res) => res.request().method() === 'POST' && /^\/api\/batches\/[^/]+\/undo$/.test(new URL(res.url()).pathname),
  )

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
})
