import { spawnSync } from 'node:child_process'
import { chmodSync, existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
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

// The CLI writes to the database the running engine has open; SQLite allows it. Answers its stdout.
function cli(at: Instance, args: string[], what: string): string {
  const run = spawnSync('bun', ['packages/engine/src/serve.ts', '--domain', at.domain, '--db', at.db, ...args], {
    encoding: 'utf8',
    timeout: 20_000,
    killSignal: 'SIGKILL',
  })
  // A hung CLI must fail the setup, not hang the gate.
  if (run.error || run.signal) {
    throw new Error(`${what} did not finish: ${run.error?.message ?? `killed by ${run.signal}`}`)
  }
  if (run.status !== 0) throw new Error(`${what} exited ${run.status}: ${run.stderr}`)
  return run.stdout
}

export function createAccount(at: Instance, email: string, role: string, subject?: string): void {
  const args = ['--create-account', email, '--role', role]
  cli(at, subject ? [...args, '--subject', subject] : args, `--create-account ${email}`)
}

/** Adds the e2e's own read-only activiteit views (e2e/fixture-views.ts) to the database the engine has open. */
export function addFixtureViews(at: Instance): void {
  const run = spawnSync('bun', ['e2e/fixture-views.ts', at.db], {
    encoding: 'utf8',
    timeout: 20_000,
    killSignal: 'SIGKILL',
  })
  if (run.error || run.signal || run.status !== 0)
    throw new Error(`fixture views failed: ${run.error?.message ?? run.stderr}`)
}

export const SERVICE = { name: 'e2e-agent', role: 'editor', token: 'e2e/.tmp/service-token' }

/** Creates the service account and keeps its token, shown once, in a file only its owner reads. */
export function createService(at: Instance): void {
  const token = cli(at, ['--create-service', SERVICE.name, '--role', SERVICE.role], '--create-service').trim()
  writeFileSync(SERVICE.token, `${token}\n`, { mode: 0o600 })
  chmodSync(SERVICE.token, 0o600)
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
