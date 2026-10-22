import { chmodSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

export const MAIN = join(import.meta.dir, '..', 'src', 'main.ts')

export interface ToolResult {
  isError: boolean
  text: string
}

export interface Stdio {
  call(name: string, args?: Record<string, unknown>): Promise<ToolResult>
  close(): void
}

type Env = Record<string, string | undefined>

const dirs: string[] = []

/** A fresh directory for one test's files; removeTokenFiles deletes every one. */
export function scratchDir(): string {
  const dir = mkdtempSync(join(tmpdir(), 'wt-mcp-'))
  dirs.push(dir)
  return dir
}

// The mode is set again after writing, because writeFileSync applies it only to a new file under the umask.
export function tokenFile(token: string, mode = 0o600): string {
  const file = join(scratchDir(), 'token')
  writeFileSync(file, token, { mode })
  chmodSync(file, mode)
  return file
}

export function removeTokenFiles(): void {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true })
}

// Spawns main.ts as Claude Code does, and speaks JSON-RPC to it over stdin and stdout.
export async function spawnMcp(argv: string[], env: Env = process.env): Promise<Stdio> {
  const proc = Bun.spawn(['bun', MAIN, ...argv], { stdin: 'pipe', stdout: 'pipe', stderr: 'pipe', env })
  const reader = proc.stdout.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  let next = 0

  const send = (message: Record<string, unknown>) =>
    proc.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', ...message })}\n`)

  async function answer(id: number): Promise<Record<string, unknown>> {
    for (;;) {
      const end = buffer.indexOf('\n')
      if (end >= 0) {
        const message = JSON.parse(buffer.slice(0, end))
        buffer = buffer.slice(end + 1)
        if (message.id === id) return message
        continue
      }
      const { value, done } = await reader.read()
      if (done) throw new Error(`main.ts closed stdout: ${await new Response(proc.stderr).text()}`)
      buffer += decoder.decode(value)
    }
  }

  async function request(method: string, params: Record<string, unknown>) {
    const id = ++next
    send({ id, method, params })
    return answer(id)
  }

  await request('initialize', {
    protocolVersion: '2025-06-18',
    capabilities: {},
    clientInfo: { name: 'test', version: '0' },
  })
  send({ method: 'notifications/initialized' })

  return {
    async call(name, args = {}) {
      const reply = await request('tools/call', { name, arguments: args })
      const result = reply.result as { content: { text: string }[]; isError?: boolean }
      return { isError: result.isError === true, text: result.content[0]?.text ?? '' }
    },
    close: () => proc.kill(),
  }
}

/** The environment without the given keys, as a child process gets it. */
export function envWithout(...keys: string[]): Env {
  return Object.fromEntries(Object.entries(process.env).filter(([key]) => !keys.includes(key)))
}
