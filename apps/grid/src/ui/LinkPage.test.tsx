import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { cleanup, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { App } from './App'

const TOKEN = 'persoon.7.Mac_-Value123'
const fetcher = vi.fn<typeof fetch>()
const seen: { url: string; method: string; authorization: string | null; hash: string }[] = []

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
const columns = [
  { key: 'productie', label: 'Productie', type: 'text' },
  { key: 'rollen', label: 'Rollen', type: 'text' },
  { key: 'laatste_dag', label: 'Laatste dag', type: 'date' },
]
const views = { views: [{ id: 21, name: 'Mijn producties', source: 'mijn_producties', skin: 'table', date: null, sort: [], group_by: null, columns }] }
const rows = { columns, rows: [{ productie: 'De Kersentuin', rollen: 'Speler', laatste_dag: '2026-10-16' }], total: 1 }

function answer(byPath: Record<string, () => Response>) {
  fetcher.mockImplementation(async (input, init) => {
    const url = String(input)
    seen.push({ url, method: init?.method ?? 'GET', authorization: new Headers(init?.headers).get('authorization'), hash: window.location.hash })
    return byPath[url]?.() ?? json({ code: 'forbidden', message: 'no' }, 403)
  })
}

beforeEach(() => {
  seen.length = 0
  vi.stubGlobal('fetch', fetcher)
  window.history.replaceState(null, '', `/#/link/${TOKEN}`)
})
afterEach(() => {
  cleanup()
  fetcher.mockReset()
  vi.unstubAllGlobals()
  window.history.replaceState(null, '', '/')
})

describe('the person page', () => {
  it('strips the token from the address before any request and sends it only as a RecordLink header', async () => {
    answer({ '/api/owner/views': () => json(views), '/api/owner/views/21/rows': () => json(rows) })
    render(<App />)

    expect(await screen.findByText('De Kersentuin')).toBeTruthy()
    expect(window.location.href).not.toContain(TOKEN)
    expect(seen.map(({ url, method }) => [url, method])).toEqual([
      ['/api/owner/views', 'GET'],
      ['/api/owner/views/21/rows', 'GET'],
    ])
    for (const call of seen) {
      expect(call.hash).toBe('')
      expect(call.url).not.toContain(TOKEN)
      expect(call.authorization).toBe(`RecordLink ${TOKEN}`)
    }
  })

  it("shows each view for owners read-only, with the person's productions as the engine served them", async () => {
    answer({ '/api/owner/views': () => json(views), '/api/owner/views/21/rows': () => json(rows) })
    render(<App />)

    const table = await screen.findByRole('table', { name: 'Mijn producties' })
    expect(within(table).getAllByRole('columnheader').map((cell) => cell.textContent)).toEqual(['Productie', 'Rollen', 'Laatste dag'])
    expect(within(table).getAllByRole('row')).toHaveLength(2)
    expect(within(table).getByText('Speler')).toBeTruthy()
    expect(screen.queryByRole('textbox')).toBeNull()
    expect(screen.queryByRole('button')).toBeNull()
  })

  it('a 401 reads "Deze link werkt niet meer"', async () => {
    answer({ '/api/owner/views': () => json({ code: 'bad_link', message: 'This link is not valid' }, 401) })
    render(<App />)

    expect(await screen.findByText('Deze link werkt niet meer')).toBeTruthy()
    expect(screen.queryByRole('table')).toBeNull()
  })

  it('says so when nothing is shared yet', async () => {
    answer({ '/api/owner/views': () => json({ views: [] }) })
    render(<App />)

    expect(await screen.findByText('Er is nog niets voor je gedeeld.')).toBeTruthy()
  })
})

describe('index.html', () => {
  it('sends no referrer and asks not to be indexed', () => {
    const html = readFileSync(join(process.cwd(), 'index.html'), 'utf8')
    expect(html).toContain('<meta name="referrer" content="no-referrer" />')
    expect(html).toContain('<meta name="robots" content="noindex, nofollow" />')
  })
})
