import type { Database } from 'bun:sqlite'
import { mkdtempSync, readdirSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { type Actor, createAccount, createEngine, type Domain, type EngineOptions } from '../src'

type App = ReturnType<typeof createEngine>

const engines = new WeakMap<App, { sqlite: Database; domain: Domain; outbox: string }>()
let accounts = 0

/** An invented secret for test engines; never a real one. */
export const TEST_LINK_SECRET = new TextEncoder().encode('worktable-test-link-secret-not-a-real-one')

// An engine whose links land in a fresh outbox and whose client address is fixed, so signIn can follow a link.
export function testEngine(sqlite: Database, domain: Domain, options: Partial<EngineOptions> = {}): App {
  const outbox = options.outbox ?? mkdtempSync(join(tmpdir(), 'wt-outbox-'))
  const app = createEngine(sqlite, domain, {
    port: 4310,
    outbox,
    clientIp: () => '127.0.0.1',
    linkSecret: TEST_LINK_SECRET,
    ...options,
  })
  engines.set(app, { sqlite, domain, outbox })
  return app
}

const JSON_WRITE = { host: '127.0.0.1:4310', 'content-type': 'application/json' }

export async function linkFor(outbox: string, email: string): Promise<string> {
  for (let tries = 0; tries < 200; tries++) {
    for (const name of readdirSync(outbox)) {
      const text = readFileSync(join(outbox, name), 'utf8')
      const token = text.includes(email) ? text.match(/#\/auth\/([\w-]+)/)?.[1] : undefined
      if (token) return token
    }
    await Bun.sleep(1)
  }
  throw new Error(`no link for ${email} in ${outbox}`)
}

// Signs an existing account in through the real link flow; answers the Cookie header value.
export async function signInAs(app: App, email: string): Promise<string> {
  const known = engines.get(app)
  if (!known) throw new Error('signIn needs an engine made by testEngine')
  const post = (path: string, body: unknown) =>
    app.request(path, { method: 'POST', headers: JSON_WRITE, body: JSON.stringify(body) })
  await post('/api/auth/request', { email })
  const res = await post('/api/auth/consume', { token: await linkFor(known.outbox, email) })
  const cookie = res.headers.get('set-cookie')?.split(';')[0]
  if (res.status !== 200 || !cookie) throw new Error(`sign-in failed: ${res.status}`)
  return cookie
}

export async function signIn(
  app: App,
  role: Actor['role'] = 'editor',
  subject: Actor['subject'] = null,
): Promise<string> {
  const known = engines.get(app)
  if (!known) throw new Error('signIn needs an engine made by testEngine')
  const email = `${role}-${++accounts}@example.test`
  createAccount(known.sqlite, known.domain, email, role, subject)
  return signInAs(app, email)
}
