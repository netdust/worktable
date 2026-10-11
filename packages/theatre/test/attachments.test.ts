import { Database } from 'bun:sqlite'
import { describe, expect, test } from 'bun:test'
import { migrate, seedDomain } from '@worktable/engine'
import { signIn, testEngine } from '@worktable/engine/test/sign-in'
import theatre from '../src'

// biome-ignore lint/suspicious/noExplicitAny: response bodies are asserted structurally
type Body = Record<string, any>

const HOST = '127.0.0.1:4310'
const PDF = new TextEncoder().encode('%PDF-1.4\n1 0 obj\n<<>>\nendobj\ntrailer\n<<>>\n%%EOF\n')
const KINDS = { rider: 'Rider', zaalblad: 'Zaalblad', bonnetje: 'Bonnetje', foto: 'Foto', document: 'Document' }

async function planner() {
  const sqlite = new Database(':memory:')
  migrate(sqlite, theatre)
  seedDomain(sqlite, theatre)
  const app = testEngine(sqlite, theatre)
  const cookie = await signIn(app, 'editor')
  return async (method: string, path: string, body?: unknown): Promise<{ status: number; body: Body }> => {
    const bytes = body instanceof Uint8Array
    const headers: Record<string, string> = { host: HOST, cookie }
    if (body !== undefined) headers['content-type'] = bytes ? 'application/octet-stream' : 'application/json'
    if (bytes) headers['content-length'] = String(body.length)
    const res = await app.request(path, {
      method,
      headers,
      body: body === undefined || bytes ? body : JSON.stringify(body),
    })
    return { status: res.status, body: (await res.json()) as Body }
  }
}

describe('theatre attachments', () => {
  test('/schema serves the attachments of activiteit, toewijzing and speelreeks', async () => {
    const as = await planner()
    const { body } = await as('GET', '/api/schema')
    for (const dataset of ['activiteit', 'toewijzing', 'speelreeks']) {
      expect(body.sources[dataset].attachments).toEqual({ kinds: KINDS, max_mb: expect.any(Number) })
    }
    expect(body.sources.productie.attachments).toBeUndefined()
  })

  test('a rider uploaded to an activity is listed', async () => {
    const as = await planner()
    const made = await as('POST', '/api/rows/activiteit', {
      productie_id: 1,
      soort: 'opbouw',
      datum: '2026-11-01',
      status: 'optie',
    })
    expect(made.status).toBe(201)
    const sent = await as('POST', `/api/attachments/activiteit/${made.body.id}?kind=rider&name=rider.pdf`, PDF)
    expect(sent.status).toBe(201)
    const { body } = await as('GET', `/api/attachments/activiteit/${made.body.id}`)
    expect(body.attachments).toEqual([
      expect.objectContaining({
        id: sent.body.id,
        kind: 'rider',
        name: 'rider.pdf',
        mime: 'application/pdf',
        own: true,
      }),
    ])
  })
})
