import { Database } from 'bun:sqlite'
import { chmodSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import { parseArgs } from 'node:util'
import { createEngine } from './app'
import { createAccount, disableAccount, findAccount } from './auth'
import type { Actor, Domain } from './declare'
import { importExport, readExportFile } from './import'
import { migrate, seedDomain } from './migrate'
import { MigrationError } from './migration-error'
import { ApiError } from './params'
import { SeedRefused, seedLines, seedMissing } from './seed-missing'

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
    import: { type: 'string' },
    as: { type: 'string' },
    report: { type: 'string' },
    'accept-report': { type: 'boolean', default: false },
    'seed-missing': { type: 'boolean', default: false },
    'link-secret-file': { type: 'string' },
  },
})

function fail(message: string): never {
  console.error(message)
  process.exit(1)
}

if (!values.domain || !values.db) {
  fail(
    'usage: serve.ts --domain <module> --db <file> [--port 4310] [--hostname 127.0.0.1] [--fresh]\n' +
      '  [--app-url <url>] [--outbox <dir>] [--cookie-name <name>] [--link-secret-file <file>]\n' +
      '  [--create-admin <email> | --create-account <email> --role <role> [--subject <dataset>:<id>]\n' +
      '   | --disable-account <email>]\n' +
      '  [--import <export.json> --as <administrator email> [--report <file>] [--accept-report]]\n' +
      '  [--seed-missing]',
  )
}
if (values.import && (values['create-admin'] || values['create-account'] || values['disable-account'])) {
  fail('--import cannot be combined with --create-admin, --create-account or --disable-account: run them one at a time')
}
if (values['seed-missing'] && values.fresh) fail('--seed-missing cannot be combined with --fresh')
if (
  values['seed-missing'] &&
  (values.import || values['create-admin'] || values['create-account'] || values['disable-account'])
) {
  fail('--seed-missing cannot be combined with --import or an account command: run them one at a time')
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

function administrator(email: string | undefined): Actor {
  if (!email) throw new Error('--import needs --as <administrator email>')
  const account = findAccount(sqlite, email)
  if (!account || account.disabled_at !== null || account.role !== 'administrator') {
    throw new Error(`--as must name an enabled administrator account, and ${email} is not one`)
  }
  return { id: account.id, role: account.role, subject: null }
}

// mode applies only to a new file, so an overwritten one is narrowed after.
function writeReport(report: string, body: unknown): void {
  writeFileSync(report, `${JSON.stringify(body, null, 2)}\n`, { mode: 0o600 })
  chmodSync(report, 0o600)
}

// A refused import overwrites an earlier run's report, so that one is never read as current.
function importOrReport(file: string, report: string): ReturnType<typeof importExport> {
  try {
    const data = readExportFile(file)
    return importExport(sqlite, domain, data, administrator(values.as), { acceptReport: values['accept-report'] })
  } catch (err) {
    writeReport(report, { committed: false, error: err instanceof ApiError ? err.code : 'import_failed' })
    throw err
  }
}

// Stdout gets counts only; the report, outside the repo by default, gets legacy ids and messages.
function runImport(file: string): number {
  const report = values.report ?? `${file}.report.json`
  const result = importOrReport(file, report)
  writeReport(report, { committed: result.committed, refused: result.refused })
  for (const [dataset, count] of Object.entries(result.counts)) console.log(`${dataset} ${count}`)
  const refused = result.refused.length
  if (refused > 0) console.log(`${refused} refused, see ${report}`)
  console.log(result.committed ? 'committed' : 'nothing committed')
  return result.committed ? 0 : 1
}

function runImportCommand(): number | null {
  if (!values.import) return null
  try {
    return runImport(values.import)
  } catch (err) {
    console.error(err instanceof Error ? err.message : String(err))
    return 1
  }
}

function runSeedMissingCommand(): number | null {
  if (!values['seed-missing']) return null
  try {
    for (const line of seedLines(seedMissing(sqlite, domain))) console.log(line)
    return 0
  } catch (err) {
    if (err instanceof SeedRefused) console.error(`seed-missing refused: ${err.message}`)
    else console.error(`seed-missing failed: ${err instanceof Error ? err.message : String(err)}`)
    return 1
  }
}

const code = runAccountCommand() ?? runImportCommand() ?? runSeedMissingCommand()
if (code !== null) {
  sqlite.close()
  process.exit(code)
}
if (values.outbox) mkdirSync(values.outbox, { recursive: true, mode: 0o700 })

// Read only when serving: the one-shot commands above sign no link.
function readLinkSecret(file: string | undefined): Uint8Array | undefined {
  if (file === undefined) {
    if (domain.datasets.some((d) => d.record_link)) fail('this domain declares record links: pass --link-secret-file')
    return undefined
  }
  const orRefuse = <T>(read: () => T): T => {
    try {
      return read()
    } catch {
      fail(`--link-secret-file ${file} cannot be read`)
    }
  }
  const mode = orRefuse(() => statSync(file).mode)
  if ((mode & 0o077) !== 0) fail(`--link-secret-file ${file} is readable by group or others: chmod 600 it`)
  const secret = orRefuse(() => new Uint8Array(readFileSync(file)))
  if (secret.length < 32) fail(`--link-secret-file ${file} holds fewer than 32 bytes`)
  return secret
}
const linkSecret = readLinkSecret(values['link-secret-file'])

const port = Number(values.port)
const server = Bun.serve({
  hostname: values.hostname,
  port,
  fetch: createEngine(sqlite, domain, {
    port,
    appUrl: values['app-url'],
    outbox: values.outbox,
    cookieName: values['cookie-name'],
    linkSecret,
  }).fetch,
})
console.log(`engine listening on http://${server.hostname}:${server.port}`)
