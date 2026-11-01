import { readFileSync, statSync } from 'node:fs'
import { isAbsolute } from 'node:path'
import { parseArgs } from 'node:util'

export class ConfigError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ConfigError'
  }
}

type Io = {
  stat: (file: string) => { mode: number; uid: number }
  readFile: (file: string) => string
  uid: () => number
}

const REAL_IO: Io = {
  stat: (file) => statSync(file),
  readFile: (file) => readFileSync(file, 'utf8'),
  uid: () => process.getuid?.() ?? -1,
}

const USAGE = 'usage: main.ts --url <instance> --token-file <file>'
const LOOPBACK = ['127.0.0.1', 'localhost']
const ONE_TOKEN = /^[\x21-\x7e]+$/

function parseOptions(argv: string[]): { url: string; tokenFile: string } {
  const { values, positionals } = parseArgs({
    args: argv,
    options: { url: { type: 'string' }, 'token-file': { type: 'string' } },
    strict: false,
    allowPositionals: true,
  })
  if ('token' in values) throw new ConfigError('pass the token in a file with --token-file, never as --token')
  if (Object.keys(values).some((key) => key !== 'url' && key !== 'token-file'))
    throw new ConfigError(`unknown option; ${USAGE}`)
  if (positionals.length > 0) throw new ConfigError(`unexpected positional argument; ${USAGE}`)
  const { url, 'token-file': tokenFile } = values
  if (typeof url !== 'string' || typeof tokenFile !== 'string')
    throw new ConfigError(`--url and --token-file are required; ${USAGE}`)
  if (!isAbsolute(tokenFile)) throw new ConfigError(`--token-file must be an absolute path; ${USAGE}`)
  return { url, tokenFile }
}

function loopbackOrigin(raw: string): string {
  const refuse = (why: string) => new ConfigError(`--url ${why}: it must be http(s) on 127.0.0.1 or localhost`)
  let url: URL
  try {
    url = new URL(raw)
  } catch {
    throw refuse('is not a url')
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') throw refuse('has another scheme')
  if (url.username || url.password) throw refuse('carries credentials')
  if (!LOOPBACK.includes(url.hostname)) throw refuse('points at another host')
  // localhost may resolve to ::1, where any local process can listen; the engine binds 127.0.0.1 only.
  url.hostname = '127.0.0.1'
  return url.origin
}

function readToken(file: string, io: Io): string {
  let stat: { mode: number; uid: number }
  let content: string
  try {
    stat = io.stat(file)
    if (stat.uid !== io.uid())
      throw new ConfigError(`token file ${file} is owned by another user: chown it to the user running this server`)
    if ((stat.mode & 0o077) !== 0)
      throw new ConfigError(`token file ${file} is accessible by group or others: chmod 600 ${file}`)
    content = io.readFile(file)
  } catch (err) {
    if (err instanceof ConfigError) throw err
    throw new ConfigError(`token file ${file} cannot be read`)
  }
  const token = content.trim()
  if (token === '') throw new ConfigError(`token file ${file} is empty: put the service account token in it`)
  if (!ONE_TOKEN.test(token))
    throw new ConfigError(`token file ${file} must hold one token alone: printable ASCII, no whitespace inside`)
  return token
}

export function loadConfig(argv: string[], io: Io = REAL_IO): { url: string; token: string } {
  const { url, tokenFile } = parseOptions(argv)
  return { url: loopbackOrigin(url), token: readToken(tokenFile, io) }
}
