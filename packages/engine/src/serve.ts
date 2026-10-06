import { Database } from 'bun:sqlite'
import { mkdirSync, rmSync } from 'node:fs'
import { dirname } from 'node:path'
import { parseArgs } from 'node:util'
import { createEngine } from './app'
import { createAccount, disableAccount, findAccount } from './auth'
import type { Actor, Domain } from './declare'
import { migrate, seedDomain } from './migrate'
import { MigrationError } from './migration-error'

const { values } = parseArgs({
  options: {
    domain: { type: 'string' },
    db: { type: 'string' },
    port: { type: 'string', default: '4310' },
    hostname: { type: 'string', default: '127.0.0.1' },
    fresh: { type: 'boolean', default: false },
    'app-url': { type: 'string' },
    outbox: { type: 'string' },
    'cookie-name': { type: 'string' },
    'create-admin': { type: 'string' },
    'create-account': { type: 'string' },
    'disable-account': { type: 'string' },
    role: { type: 'string' },
    subject: { type: 'string' },
  },
})

function fail(message: string): never {
  console.error(message)
  process.exit(1)
}

if (!values.domain || !values.db) {
  fail(
    'usage: serve.ts --domain <module> --db <file> [--port 4310] [--hostname 127.0.0.1] [--fresh]\n' +
      '  [--app-url <url>] [--outbox <dir>] [--cookie-name <name>]\n' +
      '  [--create-admin <email> | --create-account <email> --role <role> [--subject <dataset>:<id>]\n' +
      '   | --disable-account <email>]',
  )
}
// The Host allowlist names these two; any other address would need a mailer, and 0e has none.
if (!['127.0.0.1', 'localhost'].includes(values.hostname)) {
  fail(`--hostname ${values.hostname} needs a mailer to send sign-in links, and there is none: bind 127.0.0.1`)
}

const name: string = values.domain
const domain = (await import(Bun.resolveSync(name, process.cwd()))).default as Domain

if (values.fresh) for (const suffix of ['', '-wal', '-shm']) rmSync(values.db + suffix, { force: true })
mkdirSync(dirname(values.db), { recursive: true })
const sqlite = new Database(values.db, { create: true })
try {
  migrate(sqlite, domain)
} catch (err) {
  if (!(err instanceof MigrationError)) throw err
  fail(`migration refused: ${err.message}`)
}
if (values.fresh) seedDomain(sqlite, domain)

function subjectOf(raw: string | undefined): Actor['subject'] {
  if (raw === undefined) return null
  const match = /^([a-z][a-z0-9_]*):([1-9]\d*)$/.exec(raw)
  if (!match) throw new Error(`--subject must be <dataset>:<id>, not "${raw}"`)
  return { dataset: match[1] as string, id: Number(match[2]) }
}

function createFromFlags(email: string): void {
  const subject = subjectOf(values.subject)
  if (!values.role) throw new Error('--create-account needs --role administrator|editor|owner')
  if (values.role === 'owner' && !subject) throw new Error('an owner account needs --subject <dataset>:<id>')
  createAccount(sqlite, domain, email, values.role as Actor['role'], subject)
  console.log(`created ${values.role} ${email}`)
}

function createAdmin(email: string): void {
  const existing = findAccount(sqlite, email)
  if (existing) console.log(`account ${existing.email} exists as ${existing.role}`)
  else createAccount(sqlite, domain, email, 'administrator')
}

function disable(email: string): void {
  if (!disableAccount(sqlite, email)) throw new Error(`no account ${email}`)
}

// Answers the exit code of an account command, or null when none was given.
function runAccountCommand(): number | null {
  const { 'create-admin': admin, 'create-account': account, 'disable-account': off } = values
  try {
    if (admin) createAdmin(admin)
    else if (account) createFromFlags(account)
    else if (off) disable(off)
    else return null
    return 0
  } catch (err) {
    console.error(err instanceof Error ? err.message : String(err))
    return 1
  }
}

const code = runAccountCommand()
// Exiting with the database still open sometimes left the process spinning, so it is closed first.
if (code !== null) {
  sqlite.close()
  process.exit(code)
}
if (values.outbox) mkdirSync(values.outbox, { recursive: true })

const port = Number(values.port)
const server = Bun.serve({
  hostname: values.hostname,
  port,
  fetch: createEngine(sqlite, domain, {
    port,
    appUrl: values['app-url'],
    outbox: values.outbox,
    cookieName: values['cookie-name'],
  }).fetch,
})
console.log(`engine listening on http://${server.hostname}:${server.port}`)
