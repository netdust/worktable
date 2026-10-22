import { afterAll, describe, expect, test } from 'bun:test'
import { join } from 'node:path'
import { ConfigError, loadConfig } from '../src/config'
import { removeTokenFiles, scratchDir, tokenFile } from './stdio'

const URL_OK = 'http://127.0.0.1:4312'

afterAll(removeTokenFiles)

function refusal(argv: string[], io?: Parameters<typeof loadConfig>[1]): string {
  try {
    loadConfig(argv, io)
  } catch (err) {
    expect(err).toBeInstanceOf(ConfigError)
    return (err as ConfigError).message
  }
  throw new Error('expected a ConfigError')
}

const foreign = (mode: number) => ({
  stat: () => ({ mode, uid: 4242 }),
  readFile: () => 's3cret-token',
  uid: () => 1000,
})

describe('loadConfig', () => {
  test('a token file open to group or others is refused', () => {
    for (const mode of [0o640, 0o620]) {
      const file = tokenFile('s3cret-token', mode)
      const message = refusal(['--url', URL_OK, '--token-file', file])
      expect(message).toContain('accessible by group or others')
      expect(message).toContain('chmod 600')
      expect(message).toContain(file)
      expect(message).not.toContain('s3cret-token')
    }
  })

  test('a token file owned by someone else is refused', () => {
    const file = tokenFile('s3cret-token')
    const message = refusal(['--url', URL_OK, '--token-file', file], foreign(0o100600))
    expect(message).toContain('owned by another user')
    expect(message).toContain(file)
    expect(message).not.toContain('s3cret-token')
  })

  test('a foreign file open to others gets the owner refusal, not chmod advice', () => {
    const message = refusal(['--url', URL_OK, '--token-file', tokenFile('t')], foreign(0o100644))
    expect(message).toContain('owned by another user')
    expect(message).not.toContain('chmod')
  })

  test('a non-loopback url is refused', () => {
    const file = tokenFile('t')
    for (const url of ['http://example.test:4313', 'http://10.0.0.5', 'ftp://127.0.0.1']) {
      expect(refusal(['--url', url, '--token-file', file])).toContain('127.0.0.1')
    }
  })

  test('[::1] is refused', () => {
    expect(refusal(['--url', 'http://[::1]:4312', '--token-file', tokenFile('t')])).toContain('localhost')
  })

  test('a url with credentials is refused', () => {
    const message = refusal(['--url', 'http://user:pass@127.0.0.1:4312', '--token-file', tokenFile('t')])
    expect(message).not.toContain('pass')
  })

  test('a token on the command line is refused', () => {
    const file = tokenFile('t')
    expect(refusal(['--url', URL_OK, '--token-file', file, '--token', 'abc'])).toContain('never as --token')
    expect(refusal(['--url', URL_OK, '--token-file', file, '--token=abc'])).toContain('never as --token')
  })

  test('a pasted positional is refused without echoing it', () => {
    const message = refusal(['--url', URL_OK, '--token-file', tokenFile('t'), 's3cret-pasted'])
    expect(message).not.toContain('s3cret-pasted')
  })

  test('an unknown option is refused without echoing its name', () => {
    const message = refusal(['--url', URL_OK, '--token-file', tokenFile('t'), '--verbose'])
    expect(message).toContain('unknown option')
    expect(message).not.toContain('verbose')
  })

  test('a relative token file is refused without echoing it', () => {
    const message = refusal(['--url', URL_OK, '--token-file', 'tokens/claude'])
    expect(message).toContain('absolute')
    expect(message).not.toContain('tokens/claude')
  })

  test('a missing url or token file gives the usage', () => {
    expect(refusal(['--token-file', tokenFile('t')])).toContain('--url')
    expect(refusal(['--url', URL_OK])).toContain('--token-file')
  })

  test('an unreadable token file is refused by name', () => {
    const file = join(scratchDir(), 'missing')
    expect(refusal(['--url', URL_OK, '--token-file', file])).toContain(file)
  })

  test('an empty or blank token file is refused', () => {
    expect(refusal(['--url', URL_OK, '--token-file', tokenFile('')])).toContain('empty')
    expect(refusal(['--url', URL_OK, '--token-file', tokenFile(' \n')])).toContain('empty')
  })

  test('a token with whitespace or non-ASCII inside is refused without echoing it', () => {
    for (const token of ['s3cret token', 's3cret\ttoken', 's3crét-token']) {
      const message = refusal(['--url', URL_OK, '--token-file', tokenFile(token)])
      expect(message).toContain('one token')
      expect(message).not.toContain('s3cr')
    }
  })

  test('a loopback address and a 0600 file pass; the token is trimmed', () => {
    const file = tokenFile('  abc123\n')
    expect(loadConfig(['--url', URL_OK, '--token-file', file])).toEqual({ url: URL_OK, token: 'abc123' })
  })

  test('localhost is taken and sent to 127.0.0.1, which the engine binds', () => {
    const file = tokenFile('abc')
    expect(loadConfig(['--url', 'http://localhost:4312', '--token-file', file]).url).toBe(URL_OK)
    expect(loadConfig(['--url', 'https://LOCALHOST:4312', '--token-file', file]).url).toBe('https://127.0.0.1:4312')
  })

  test('the url is reduced to its origin', () => {
    const file = tokenFile('abc')
    expect(loadConfig(['--url', 'http://127.0.0.1:4312/api/x?y=1', '--token-file', file]).url).toBe(URL_OK)
  })
})
