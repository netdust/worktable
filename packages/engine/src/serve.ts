import { Database } from 'bun:sqlite'
import { mkdirSync, rmSync } from 'node:fs'
import { dirname } from 'node:path'
import { parseArgs } from 'node:util'
import { createEngine } from './app'
import type { Domain } from './declare'
import { migrate, seedDomain } from './migrate'

const { values } = parseArgs({
  options: {
    domain: { type: 'string' },
    db: { type: 'string' },
    port: { type: 'string', default: '4310' },
    fresh: { type: 'boolean', default: false },
  },
})

if (!values.domain || !values.db) {
  console.error('usage: serve.ts --domain <module> --db <file> [--port 4310] [--fresh]')
  process.exit(1)
}

const name: string = values.domain
const domain = (await import(Bun.resolveSync(name, process.cwd()))).default as Domain

if (values.fresh) for (const suffix of ['', '-wal', '-shm']) rmSync(values.db + suffix, { force: true })
mkdirSync(dirname(values.db), { recursive: true })
const sqlite = new Database(values.db, { create: true })
migrate(sqlite, domain)
if (values.fresh) seedDomain(sqlite, domain)

const port = Number(values.port)
const server = Bun.serve({
  hostname: '127.0.0.1',
  port,
  fetch: createEngine(sqlite, domain, { port }).fetch,
})
console.log(`engine listening on http://${server.hostname}:${server.port}`)
