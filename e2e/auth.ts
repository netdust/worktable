import { spawnSync } from 'node:child_process'
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { BrowserContext } from '@playwright/test'

export const THEATRE = {
  app: 'http://127.0.0.1:5174',
  db: 'e2e/.tmp/e2e.db',
  outbox: 'e2e/.tmp/outbox',
  domain: '@worktable/theatre',
}
export const FICHE = {
  app: 'http://127.0.0.1:5175',
  db: 'e2e/.tmp/fiche.db',
  outbox: 'e2e/.tmp/outbox-fiche',
  domain: '@worktable/fiche',
}
export type Instance = typeof THEATRE

export const ACCOUNTS = {
  admin: { email: 'beheer@e2e.test', role: 'administrator' },
  editor: { email: 'planner@e2e.test', role: 'editor' },
  // Lotte Verhaegen (persoon 1) has Toewijzingen and an absence in the seed, beside other people's.
  owner: { email: 'lotte@e2e.test', role: 'owner', subject: 'persoon:1' },
  fiche: { email: 'redactie@e2e.test', role: 'editor' },
}

export const state = (name: string) => `e2e/.tmp/state/${name}.json`

const mails = (outbox: string) => (existsSync(outbox) ? readdirSync(outbox).sort() : [])

// The CLI writes to the database the running engine has open; SQLite allows it.
export function createAccount(at: Instance, email: string, role: string, subject?: string): void {
  const args = [
    'packages/engine/src/serve.ts',
    '--domain',
    at.domain,
    '--db',
    at.db,
    '--create-account',
    email,
    '--role',
    role,
  ]
  const run = spawnSync('bun', subject ? [...args, '--subject', subject] : args, { encoding: 'utf8' })
  if (run.status !== 0) throw new Error(`--create-account ${email}: ${run.stderr}`)
}

async function linkFor(outbox: string, email: string, before: string[]): Promise<string> {
  for (let tries = 0; tries < 100; tries++) {
    for (const name of mails(outbox).filter((file) => !before.includes(file))) {
      const text = readFileSync(join(outbox, name), 'utf8')
      const link = text.includes(`To: ${email}\n`) ? text.match(/http\S+#\/auth\/[\w-]+/)?.[0] : undefined
      if (link) return link
    }
    await new Promise((resolve) => setTimeout(resolve, 50))
  }
  throw new Error(`no link for ${email} in ${outbox}`)
}

/** Asks a link through the form, reads it from the outbox, and opens it in a new tab as a mail client would. */
export async function requestAndOpenLink(context: BrowserContext, at: Instance, email: string) {
  const page = await context.newPage()
  await page.goto(`${at.app}/#/signin`)
  const before = mails(at.outbox)
  await page.getByRole('textbox', { name: 'E-mailadres' }).fill(email)
  await page.getByRole('button', { name: 'Stuur me een link' }).click()
  await page.getByRole('status').filter({ hasText: 'mailbox' }).waitFor()
  const link = await linkFor(at.outbox, email, before)
  await page.close()
  const opened = await context.newPage()
  await opened.goto(link)
  return { page: opened, link }
}

export async function signIn(context: BrowserContext, at: Instance, email: string): Promise<void> {
  const { page } = await requestAndOpenLink(context, at, email)
  await page.getByRole('button', { name: 'Aanmelden' }).click()
  await page.getByRole('navigation', { name: 'Views' }).waitFor()
  await page.close()
}
