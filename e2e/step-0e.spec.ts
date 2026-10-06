import { type APIRequestContext, expect, type Page, request, test } from '@playwright/test'
import { ACCOUNTS, requestAndOpenLink, state, THEATRE } from './auth'

const WEEK = '/#from=2026-10-12'
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

async function pick(page: Page, view: string) {
  await page.getByText(view, { exact: true }).first().click()
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

    await page.goto(WEEK)
    await pick(page, 'Toewijzingen')
    await expect(gridRows(page)).toHaveCount(own.length)
    for (const title of await gridRows(page).evaluateAll((trs) => trs.map((tr) => tr.getAttribute('data-title')))) {
      expect(title).toBe(LOTTE)
    }
    expect((await rows(page.request, 'toewijzing')).map((r) => r.id)).toEqual(own)

    // Lotte's absence starts in the week of 5 October; the week of 12 October holds only other people's.
    await land(page, '/#from=2026-10-05')
    await pick(page, 'Beschikbaarheden')
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Beschikbaarheden')
    await expect(gridRows(page)).toHaveCount(1)
    await expect(gridRows(page).first()).toHaveAttribute('data-title', LOTTE)
    await land(page, WEEK)
    await pick(page, 'Beschikbaarheden')
    await expect(page.getByText('No rows in this window')).toBeVisible()
    expect((await rows(editor, 'beschikbaarheid')).some((r) => r.persoon_id !== 1)).toBe(true)

    // Another person's row by id, and a view on a dataset the owner cannot read, show nothing.
    expect((await page.request.get(`/api/revisions/toewijzing/${other?.id}`)).status()).toBe(404)
    const planning = (await views(editor)).find((v) => v.name === 'Planning')
    await land(page, `/#view=${planning?.id}`)
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
    await expect(page.getByRole('heading', { level: 1 })).not.toHaveText('Planning')
    await expect(page.getByText('Planning', { exact: true })).toHaveCount(0)
    await editor.dispose()
  })
})

test('seeded-view-read-only', async ({ page }) => {
  const name = 'Planning Nachtwacht'
  const seeded = (await views(page.request)).find((v) => v.name === 'Planning')
  expect(seeded?.editable).toBe(false)
  const patched = await page.request.patch(`/api/views/${seeded?.id}`, { data: { name: 'Mijn planning' } })
  expect(patched.status()).toBe(403)

  await page.goto(WEEK)
  await pick(page, 'Planning')
  await page.getByRole('button', { name: '+ Filter' }).click()
  await page.getByRole('button', { name: 'Productie: Nachtwacht' }).click()
  const toolbar = page.locator('.nv-toolbar')
  await expect(toolbar.getByText('· modified')).toBeVisible()
  await expect(toolbar.getByRole('button', { name: 'Save', exact: true })).toBeDisabled()

  await page.getByRole('button', { name: 'More actions', exact: true }).click()
  await page.getByRole('menuitem', { name: 'Save as new view' }).click()
  await page.getByLabel('Name').fill(name)
  await page.getByLabel('Name').press('Enter')
  await expect.poll(async () => (await views(page.request)).find((v) => v.name === name)?.mine).toBe(true)
  const copy = (await views(page.request)).find((v) => v.name === name) as SavedView
  expect(JSON.stringify(copy.filters)).toContain('productie_id')

  await page.getByRole('button', { name: 'Remove filter Productie' }).click()
  await expect(toolbar.getByRole('button', { name: 'Save', exact: true })).toBeEnabled()
  await toolbar.getByRole('button', { name: 'Save', exact: true }).click()
  await expect
    .poll(async () => JSON.stringify((await views(page.request)).find((v) => v.id === copy.id)?.filters))
    .not.toContain('productie_id')

  await page.reload()
  await pick(page, name)
  await expect(toolbar.getByText('· modified')).toHaveCount(0)
  await expect(page.locator('.nv-chip--filter', { hasText: 'Nachtwacht' })).toHaveCount(0)
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
  await page.goto(WEEK)
  await pick(page, 'Planning')
  await expect(gridRows(page).first()).toBeVisible()

  await context.clearCookies()
  await page.getByText('Producties', { exact: true }).first().click()

  const dialog = page.getByRole('dialog', { name: 'Aanmelden' })
  await expect(dialog).toBeVisible()
  await expect(dialog.getByRole('textbox', { name: 'E-mailadres' })).toBeVisible()
})
