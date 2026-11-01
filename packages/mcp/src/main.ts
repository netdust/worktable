import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { EngineClient } from './client'
import { ConfigError, loadConfig } from './config'
import { registerTools } from './tools'

export async function main(argv: string[]): Promise<void> {
  const { url, token } = loadConfig(argv)
  // A proxy in Claude Code's environment would carry the token off loopback; Bun reads these on every fetch.
  process.env.NO_PROXY = '*'
  process.env.no_proxy = '*'
  const server = new McpServer({ name: 'worktable', version: '0.0.0' })
  registerTools(server, new EngineClient(url, token))
  await server.connect(new StdioServerTransport())
}

if (import.meta.main) {
  try {
    await main(process.argv.slice(2))
  } catch (err) {
    if (!(err instanceof ConfigError)) throw err
    console.error(err.message)
    process.exit(1)
  }
}
