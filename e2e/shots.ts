import { writeFileSync } from 'node:fs'
import type { Page } from '@playwright/test'

/** The shake-out's viewport screenshots, one per surface, with the page's address beside each, only when `SHAKEOUT_SHOTS` names a folder. */
export async function shot(page: Page, name: string): Promise<void> {
  const dir = process.env.SHAKEOUT_SHOTS
  if (!dir) return
  await page.screenshot({ path: `${dir}/${name}.png`, animations: 'disabled' })
  writeFileSync(`${dir}/${name}.url`, page.url())
}
