import type { Locator, Page } from '@playwright/test'

/** Bijstellen in the rail foot, opened if it is folded: theme, row height and the grid's looks live in it. */
export async function openLooks(page: Page): Promise<void> {
  const toggle = page.getByRole('button', { name: 'Bijstellen' })
  if ((await toggle.getAttribute('aria-expanded')) !== 'true') await toggle.click()
}

/** The open cell editor's popover: React Aria portals it out of the cell, and only one editor is open at a time. */
export function openEditor(page: Page): Locator {
  return page.locator('.nv-pop[data-editor]')
}
