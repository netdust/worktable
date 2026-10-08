import { expect, type Page, test } from '@playwright/test'
import { openView } from './tree'

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
