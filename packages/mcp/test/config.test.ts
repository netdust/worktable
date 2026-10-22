import { describe, expect, test } from 'bun:test'
import { chmodSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { ConfigError, loadConfig } from '../src/config'

const URL_OK = 'http://127.0.0.1:4312'

function tokenFile(content: string, mode: number): string {
  const file = join(mkdtempSync(join(tmpdir(), 'wt-mcp-')), 'token')
  writeFileSync(file, content, { mode })
  chmodSync(file, mode)
  return file
}

function refusal(argv: string[], io?: Parameters<typeof loadConfig>[1]): string {
  try {
    loadConfig(argv, io)
  } catch (err) {
    expect(err).toBeInstanceOf(ConfigError)
    return (err as ConfigError).message
  }
  throw new Error('expected a ConfigError')
}

describe('loadConfig', () => {
  test('a group-readable token file is refused', () => {
    const file = tokenFile('s3cret-token', 0o640)
    const message = refusal(['--url', URL_OK, '--token-file', file])
    expect(message).toContain('chmod 600')
    expect(message).toContain(file)
    expect(message).not.toContain('s3cret-token')
  })

  test('a token file owned by someone else is refused', () => {
    const file = tokenFile('s3cret-token', 0o600)
    const io = {
      stat: () => ({ mode: 0o100600, uid: 4242 }),
      readFile: () => 's3cret-token',
      uid: () => 1000,
    }
    const message = refusal(['--url', URL_OK, '--token-file', file], io)
    expect(message).toContain(file)
    expect(message).not.toContain('s3cret-token')
  })

  test('a non-loopback url is refused', () => {
    const file = tokenFile('t', 0o600)
    for (const url of ['http://example.test:4313', 'http://10.0.0.5', 'ftp://127.0.0.1']) {
      expect(refusal(['--url', url, '--token-file', file])).toContain('127.0.0.1')
    }
  })

  test('[::1] is refused', () => {
    const file = tokenFile('t', 0o600)
    expect(refusal(['--url', 'http://[::1]:4312', '--token-file', file])).toContain('localhost')
  })

  test('a url with credentials is refused', () => {
    const file = tokenFile('t', 0o600)
    expect(refusal(['--url', 'http://user:pass@127.0.0.1:4312', '--token-file', file])).not.toContain('pass@')
  })

  test('a token on the command line is refused', () => {
    const file = tokenFile('t', 0o600)
    expect(refusal(['--url', URL_OK, '--token-file', file, '--token', 'abc'])).toContain('never as --token')
    expect(refusal(['--url', URL_OK, '--token-file', file, '--token=abc'])).toContain('never as --token')
  })

  test('a pasted positional is refused without echoing it', () => {
    const file = tokenFile('t', 0o600)
    const message = refusal(['--url', URL_OK, '--token-file', file, 's3cret-pasted'])
    expect(message).not.toContain('s3cret-pasted')
  })

  test('an unknown option is a ConfigError', () => {
    const file = tokenFile('t', 0o600)
    expect(refusal(['--url', URL_OK, '--token-file', file, '--verbose'])).toContain('--verbose')
  })

  test('a missing url or token file gives the usage', () => {
    const file = tokenFile('t', 0o600)
    expect(refusal(['--token-file', file])).toContain('--url')
    expect(refusal(['--url', URL_OK])).toContain('--token-file')
  })

  test('an unreadable token file is refused by name', () => {
    const file = join(tmpdir(), 'wt-mcp-does-not-exist')
    expect(refusal(['--url', URL_OK, '--token-file', file])).toContain(file)
  })

  test('an empty or blank token file is refused', () => {
    expect(refusal(['--url', URL_OK, '--token-file', tokenFile('', 0o600)])).toContain('empty')
    expect(refusal(['--url', URL_OK, '--token-file', tokenFile(' \n', 0o600)])).toContain('empty')
  })

  test('loopback urls and a 0600 file pass; the token is trimmed', () => {
    const file = tokenFile('  abc123\n', 0o600)
    expect(loadConfig(['--url', URL_OK, '--token-file', file])).toEqual({ url: URL_OK, token: 'abc123' })
    expect(loadConfig(['--url', 'http://localhost:4312', '--token-file', file]).url).toBe('http://localhost:4312')
  })

  test('the url is reduced to its origin', () => {
    const file = tokenFile('abc', 0o600)
    expect(loadConfig(['--url', 'http://127.0.0.1:4312/api/x?y=1', '--token-file', file]).url).toBe(URL_OK)
  })
})
