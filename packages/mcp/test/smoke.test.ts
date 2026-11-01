import { afterAll, expect, test } from 'bun:test'
import { removeTokenFiles, spawnMcp, tokenFile } from './stdio'

afterAll(removeTokenFiles)

// tools/list calls no instance, so the url is never dialled and nothing is read or written.
test('mcp-boots @smoke: the binary over stdio offers the six tools and no delete', async () => {
  const mcp = await spawnMcp(['--url', 'http://127.0.0.1:9', '--token-file', tokenFile('smoke-not-a-service-token')])
  try {
    expect((await mcp.list()).sort()).toEqual(['action', 'create', 'history', 'rows', 'schema', 'update'])
  } finally {
    mcp.close()
  }
})
