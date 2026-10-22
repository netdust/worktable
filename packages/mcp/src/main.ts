import { readFileSync } from 'node:fs'
import { parseArgs } from 'node:util'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { EngineClient } from './client'
import { registerTools } from './tools'

export async function main(argv: string[]): Promise<void> {
  const { values } = parseArgs({ args: argv, options: { url: { type: 'string' }, 'token-file': { type: 'string' } } })
  if (!values.url || !values['token-file']) throw new Error('usage: main.ts --url <instance> --token-file <file>')
  const token = readFileSync(values['token-file'], 'utf8').trim()
  const server = new McpServer({ name: 'worktable', version: '0.0.0' })
  registerTools(server, new EngineClient(values.url, token))
  await server.connect(new StdioServerTransport())
}

if (import.meta.main) await main(process.argv.slice(2))
