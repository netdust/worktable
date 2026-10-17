import { expect, type Page, test } from '@playwright/test'
import { shot } from './shots'
import { openView } from './tree'

// A day of its own, so no other flow sees this activity's places.
const DAY = '2027-04-19'
const VIEW = 'e2e plekken splitsen'

type Api = Page['request']
type Values = Record<string, unknown>

async function posted(api: Api, path: string, data: Values): Promise<number> {
  const response = await api.post(path, { data })
  expect(response.status(), await response.text()).toBe(201)
  return ((await response.json()) as { id: number }).id
}

async function idByName(api: Api, dataset: string, column: string, name: string): Promise<number> {
  const rows = ((await (await api.get(`/api/rows/${dataset}?limit=500`)).json()) as { rows: Values[] }).rows
  return rows.find((r) => r[column] === name)?.id as number
}

const rows = (page: Page) => page.locator('tbody tr.nv-tr')

async function cell(page: Page, at: number, label: string) {
  const heads = await page.locator('thead th').allTextContents()
  const index = heads.findIndex((text) => text.replace(/\s*[↑↓]$/, '').trim() === label)
  expect(index, `column ${label}`).toBeGreaterThanOrEqual(0)
  return rows(page).nth(at).locator('td').nth(index)
}

const line = async (page: Page, at: number) =>
  Promise.all(
    ['Persoon', 'Aantal', 'Status'].map(async (label) =>
      ((await (await cell(page, at, label)).textContent()) ?? '').trim(),
    ),
  )

test('fill-open-slot-splits @e2e', async ({ page }) => {
  const api = page.request
  const activity = await posted(api, '/api/rows/activiteit', {
    productie_id: await idByName(api, 'productie', 'titel', 'Nachtwacht'),
    soort: 'voorstelling',
    status: 'optie',
    omschrijving: 'e2e plekken splitsen',
    datum: DAY,
    start_at: `${DAY}T20:00`,
  })
  const view = await posted(api, '/api/views', {
    name: VIEW,
    source: 'toewijzing',
    skin: 'table',
    filters: { activiteit_id: activity },
    sort: [],
    group_by: null,
    visible_fields: ['rol_id', 'persoon_id', 'aantal', 'state'],
  })
  try {
    await posted(api, '/api/rows/toewijzing', {
      activiteit_id: activity,
      rol_id: await idByName(api, 'rol', 'naam', 'Speler'),
      aantal: 2,
    })
    await page.goto('/')
    await openView(page, VIEW, 'Toewijzingen')
    await expect(rows(page)).toHaveCount(1)
    expect(await line(page, 0)).toEqual(['', '2', 'Open'])
    await shot(page, 'slot-split-before')

    // Picking a person on the open Speler ×2 fills one place; the other stays open on a row of its own.
    const persoon = await cell(page, 0, 'Persoon')
    await persoon.click()
    await persoon.press('Enter')
    await expect(page.getByRole('combobox', { name: 'Persoon' })).toBeFocused()
    const candidate = page.getByRole('option').first()
    const name = ((await candidate.textContent()) ?? '').trim()
    await candidate.click()
    await expect(rows(page)).toHaveCount(2)
    expect(await line(page, 0)).toEqual([name, '1', 'Voorlopig'])
    expect(await line(page, 1)).toEqual(['', '1', 'Open'])
    await shot(page, 'slot-split-after')

    // One undo takes the pick back: the open Speler ×2 again, and the second row is gone.
    await page.keyboard.press('ControlOrMeta+z')
    await expect(rows(page)).toHaveCount(1)
    expect(await line(page, 0)).toEqual(['', '2', 'Open'])
  } finally {
    const left = (
      (await (
        await api.get(
          `/api/rows/toewijzing?limit=500&filter=${encodeURIComponent(JSON.stringify({ activiteit_id: activity }))}`,
        )
      ).json()) as { rows: { id: number }[] }
    ).rows
    for (const { id } of left) await api.delete(`/api/rows/toewijzing/${id}`)
    await api.delete(`/api/rows/activiteit/${activity}`)
    await api.delete(`/api/views/${view}`)
  }
})
