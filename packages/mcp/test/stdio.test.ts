import { afterAll, describe, expect, test } from 'bun:test'
import { envWithout, MAIN, removeTokenFiles, spawnMcp, tokenFile } from './stdio'

afterAll(removeTokenFiles)

test('an environment proxy never carries the request', async () => {
  let proxied = 0
  let direct = 0
  const proxy = Bun.serve({ hostname: '127.0.0.1', port: 0, fetch: () => Response.json({ sources: ++proxied }) })
  const engine = Bun.serve({ hostname: '127.0.0.1', port: 0, fetch: () => Response.json({ sources: ++direct }) })
  const env = { ...envWithout('NO_PROXY', 'no_proxy'), HTTP_PROXY: proxy.url.href, http_proxy: proxy.url.href }
  const mcp = await spawnMcp(['--url', `http://127.0.0.1:${engine.port}`, '--token-file', tokenFile('t0ken')], env)
  try {
    const result = await mcp.call('schema')
    expect(proxied).toBe(0)
    expect(direct).toBe(1)
    expect(result.isError).toBe(false)
  } finally {
    mcp.close()
    proxy.stop(true)
    engine.stop(true)
  }
})

describe('a token pasted into the wrong slot never reaches stderr', () => {
  const SECRET = 'wt0s3cret0token0abcdef'
  const slots: Record<string, () => string[]> = {
    '--token-file': () => ['--url', 'http://127.0.0.1:4312', '--token-file', SECRET],
    'an option name': () => ['--url', 'http://127.0.0.1:4312', '--token-file', tokenFile('t'), `--${SECRET}`],
    '--url': () => ['--url', `http://${SECRET}:4312`, '--token-file', tokenFile('t')],
  }
  for (const [slot, argv] of Object.entries(slots)) {
    test(slot, () => {
      const run = Bun.spawnSync(['bun', MAIN, ...argv()], { stdout: 'pipe', stderr: 'pipe' })
      expect(run.exitCode).toBe(1)
      expect(run.stderr.toString()).not.toBe('')
      expect(run.stderr.toString()).not.toContain(SECRET)
    })
  }
})
