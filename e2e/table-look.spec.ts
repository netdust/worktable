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
  test('totals-clear-of-the-panel @e2e: the totals are pinned at the pane’s bottom, the selection panel floats above them over the rows, and the last row scrolls clear of the panel', async ({
    page,
  }) => {
    const service = await worker()
    const ids = await addSites(service)
    try {
      await openSites(page)
      const scroll = page.locator('.nv-scroll')
      expect(await scroll.evaluate((el) => el.scrollHeight > el.clientHeight)).toBe(true)

      const lastRow = page.locator('.nv-grid tbody tr').last()
      const bottom = (at: { y: number; height: number } | null) => (at?.y ?? 0) + (at?.height ?? 0)
      const pinned = async () => {
        const pane = await scroll.boundingBox()
        const foot = await box(page, '.nv-grid__foot td')
        expect(bottom(pane) - bottom(foot)).toBeGreaterThanOrEqual(0)
        expect(bottom(pane) - bottom(foot)).toBeLessThanOrEqual(16)
        return foot
      }
      const theme = (scheme: string) => (scheme === 'light' ? 'licht' : 'donker')

      await scroll.evaluate((el) => {
        el.scrollTop = 0
      })
      await pinned()
      const before = await scroll.boundingBox()

      await scrollEnd(page)
      const foot = await pinned()
      expect((foot?.y ?? 0) - bottom(await lastRow.boundingBox())).toBeGreaterThanOrEqual(100)

      await page.getByRole('checkbox', { name: `${named(1)} selecteren` }).check()
      await page.getByRole('checkbox', { name: `${named(2)} selecteren` }).check()
      await expect(page.locator('.nv-selection')).toBeVisible()
      expect((await scroll.boundingBox())?.height).toBe(before?.height)
      await scrollEnd(page)
      const panel = await box(page, '.nv-selection')
      expect(bottom(panel)).toBeLessThanOrEqual((await pinned())?.y ?? 0)
      expect(panel?.y ?? 0).toBeGreaterThan(before?.y ?? 0)
      expect(bottom(await lastRow.boundingBox())).toBeLessThanOrEqual(panel?.y ?? 0)
      for (const scheme of ['light', 'dark'] as const) {
        await page.emulateMedia({ colorScheme: scheme })
        await shot(page, `tabel-einde-paneel-${theme(scheme)}`)
      }

      await scroll.evaluate((el) => {
        el.scrollTop = el.scrollHeight / 8
      })
      const mid = await box(page, '.nv-selection')
      const under = await page
        .locator('.nv-grid tbody tr')
        .evaluateAll(
          (rows, line) =>
            rows.some((r) => r.getBoundingClientRect().top < line && r.getBoundingClientRect().bottom > line),
          (mid?.y ?? 0) + 20,
        )
      expect(under).toBe(true)
      for (const scheme of ['light', 'dark'] as const) {
        await page.emulateMedia({ colorScheme: scheme })
        await shot(page, `tabel-midden-paneel-${theme(scheme)}`)
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
