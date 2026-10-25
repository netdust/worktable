import { readFileSync } from 'node:fs'
import { type APIRequestContext, expect, type Page, request, test } from '@playwright/test'
import { STUDIO, STUDIO_SERVICE, state } from './auth'
import { shot } from './shots'
import { openView } from './tree'

// Studio's own instance, as Stefan: Sites made long with invented rows the test removes again.
test.use({ baseURL: STUDIO.app, storageState: state('studio-admin'), viewport: { width: 1440, height: 900 } })

const ENGINE = 'http://127.0.0.1:4313'
const EXTRA = 28
const named = (n: number) => `tabel-site-${String(n).padStart(2, '0')}`

const worker = () =>
  request.newContext({
    baseURL: ENGINE,
    extraHTTPHeaders: { Authorization: `Bearer ${readFileSync(STUDIO_SERVICE, 'utf8').trim()}` },
  })

async function addSites(service: APIRequestContext): Promise<number[]> {
  const ids: number[] = []
  for (let n = 1; n <= EXTRA; n++) {
    const response = await service.post('/api/rows/site', {
      data: { naam: named(n), wp_versie: '6.8.1', php_versie: '8.3' },
    })
    expect(response.status(), await response.text()).toBe(201)
    ids.push(((await response.json()) as { id: number }).id)
  }
  return ids
}

async function openSites(page: Page): Promise<void> {
  await page.goto('/')
  await openView(page, 'Sites', 'Sites')
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Sites')
  await expect(page.getByRole('row', { name: new RegExp(named(EXTRA)) })).toBeVisible()
}

const box = (page: Page, selector: string) => page.locator(selector).first().boundingBox()
const scrollEnd = (page: Page) =>
  page.locator('.nv-scroll').evaluate((el) => {
    el.scrollTop = el.scrollHeight
  })

test.describe('table look', () => {
  test('totals-clear-of-the-panel @e2e: the totals row sits at the table’s end, and with two rows ticked it scrolls clear of the selection panel', async ({
    page,
  }) => {
    const service = await worker()
    const ids = await addSites(service)
    try {
      await openSites(page)
      const scroll = page.locator('.nv-scroll')
      expect(await scroll.evaluate((el) => el.scrollHeight > el.clientHeight)).toBe(true)

      const row = page.locator('.nv-grid tbody tr').last()
      const above = async () => ({ last: await row.boundingBox(), foot: await box(page, '.nv-grid__foot td') })
      await scroll.evaluate((el) => {
        el.scrollTop = 0
      })
      const top = await above()
      expect(top.foot?.y ?? 0).toBeGreaterThanOrEqual((top.last?.y ?? 0) + (top.last?.height ?? 0) - 1)

      await scrollEnd(page)
      const last = await page.locator('.nv-grid tbody tr').last().boundingBox()
      const foot = await box(page, '.nv-grid__foot td')
      expect(foot?.y ?? 0).toBeGreaterThanOrEqual((last?.y ?? 0) + (last?.height ?? 0) - 1)

      for (const scheme of ['light', 'dark'] as const) {
        await page.emulateMedia({ colorScheme: scheme })
        await shot(page, `tabel-einde-${scheme === 'light' ? 'licht' : 'donker'}`)
      }

      await page.getByRole('checkbox', { name: `${named(1)} selecteren` }).check()
      await page.getByRole('checkbox', { name: `${named(2)} selecteren` }).check()
      await expect(page.locator('.nv-selection')).toBeVisible()
      await scrollEnd(page)
      const clear = await box(page, '.nv-grid__foot td')
      const panel = await box(page, '.nv-selection')
      expect((clear?.y ?? 0) + (clear?.height ?? 0)).toBeLessThanOrEqual((panel?.y ?? 0) + 1)
      for (const scheme of ['light', 'dark'] as const) {
        await page.emulateMedia({ colorScheme: scheme })
        await shot(page, `tabel-einde-paneel-${scheme === 'light' ? 'licht' : 'donker'}`)
      }
    } finally {
      for (const id of ids) await service.delete(`/api/rows/site/${id}`)
      await service.dispose()
    }
  })

  test('one-size-in-a-row @e2e: every cell of a row, row number and pills included, has one font size and one face, and the row is 32px', async ({
    page,
  }) => {
    await page.goto('/')
    await openView(page, 'Sites', 'Sites')
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Sites')
    await expect(page.locator('.nv-grid tbody tr').first()).toBeVisible()
    const look = await page
      .locator('.nv-grid tbody tr')
      .first()
      .evaluate((row) => {
        const sizes = new Set<string>()
        const faces = new Set<string>()
        for (const el of row.querySelectorAll<HTMLElement>('.nv-td, .nv-td *')) {
          if (el.closest('.nv-open, svg')) continue
          if (![...el.childNodes].some((n) => n.nodeType === 3 && n.textContent?.trim())) continue
          sizes.add(getComputedStyle(el).fontSize)
          faces.add(getComputedStyle(el).fontFamily)
        }
        return { sizes: [...sizes], faces: [...faces], height: row.getBoundingClientRect().height }
      })
    expect(look.sizes).toEqual(['13px'])
    expect(look.faces).toHaveLength(1)
    expect(look.height).toBe(32)

    const winkel = page.getByRole('row', { name: /testmans-winkel/ })
    const middle = async (selector: string) => {
      const at = await winkel.locator(selector).first().boundingBox()
      return (at?.y ?? 0) + (at?.height ?? 0) / 2
    }
    expect(Math.abs((await middle('.nv-cell__muted')) - (await middle('.nv-cell__title')))).toBeLessThanOrEqual(2)
  })
})
