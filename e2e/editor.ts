import type { Locator, Page } from '@playwright/test'

/** The open cell editor's popover: React Aria portals it out of the cell, and only one editor is open at a time. */
export function openEditor(page: Page): Locator {
  return page.locator('.nv-pop[data-editor]')
}
