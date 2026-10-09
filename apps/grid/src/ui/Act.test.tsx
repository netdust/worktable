import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { App } from './App'

const TOKEN = 'act-Token_456'
const fetcher = vi.fn<typeof fetch>()
const seen: { url: string; method: string; body: string; hash: string }[] = []

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
const shown = {
  dataset: 'slot',
  projection: { task_id: 'Opbouw zaal', kind_id: 'Techniek', state: 'asked' },
  labels: { task_id: 'Taak', kind_id: 'Soort', state: 'Status' },
  to: [{ value: 'yes', label: 'Ja' }, { value: 'no', label: 'Nee' }],
}

function answer(byPath: Record<string, Response | (() => Response)>) {
  fetcher.mockImplementation(async (input, init) => {
    const url = String(input)
    seen.push({ url, method: init?.method ?? 'GET', body: String(init?.body ?? ''), hash: window.location.hash })
    const given = byPath[url]
    return typeof given === 'function' ? given() : (given ?? json({ code: 'not_found', message: 'nope' }, 404))
  })
}

beforeEach(() => {
  seen.length = 0
  vi.stubGlobal('fetch', fetcher)
  window.history.replaceState(null, '', `/#/act/${TOKEN}`)
})
afterEach(() => {
  cleanup()
  fetcher.mockReset()
  vi.unstubAllGlobals()
  window.history.replaceState(null, '', '/')
})

describe('the confirm page', () => {
  it('drops the token from the address before any request, shows the projection and posts the answer', async () => {
    answer({ '/api/act/view': () => json(shown), '/api/act': () => json({ ok: true }) })
    render(<App />)

    expect(await screen.findByText('Opbouw zaal')).toBeTruthy()
    expect(screen.getByText('Techniek')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Ja' }))
    expect(await screen.findByText(/Je antwoord is doorgegeven: Ja/)).toBeTruthy()

    expect(window.location.hash).toBe('')
    expect(window.location.href).not.toContain(TOKEN)
    expect(seen.map(({ url, method, body }) => [url, method, body])).toEqual([
      ['/api/act/view', 'POST', JSON.stringify({ token: TOKEN })],
      ['/api/act', 'POST', JSON.stringify({ token: TOKEN, to: 'yes' })],
    ])
    for (const call of seen) {
      expect(call.hash).toBe('')
      expect(call.url).not.toContain(TOKEN)
    }
  })

  it('a dead link reads in Dutch, and no GET is sent', async () => {
    answer({ '/api/act/view': () => json({ code: 'bad_token', message: 'This link is not valid any more' }, 401) })
    render(<App />)

    expect(await screen.findByText('Deze link werkt niet meer')).toBeTruthy()
    expect(screen.queryByRole('button')).toBeNull()
    expect(seen.length).toBeGreaterThan(0)
    expect(seen.every((call) => call.method === 'POST')).toBe(true)
  })

  it('an answer that lost the race reads "Al beantwoord"', async () => {
    answer({
      '/api/act/view': () => json(shown),
      '/api/act': () => json({ code: 'transition_lost', message: 'moved on' }, 409),
    })
    render(<App />)

    fireEvent.click(await screen.findByRole('button', { name: 'Nee' }))
    expect(await screen.findByText('Al beantwoord')).toBeTruthy()
    expect(screen.queryByRole('button')).toBeNull()
  })

  it('a passing failure keeps the answers: the refusal reads in Dutch, and a retry lands', async () => {
    let tries = 0
    answer({
      '/api/act/view': () => json(shown),
      '/api/act': () => (++tries === 1 ? json({ code: 'rate_limited', message: 'Too many requests; try again later' }, 429) : json({ ok: true })),
    })
    render(<App />)

    fireEvent.click(await screen.findByRole('button', { name: 'Ja' }))
    expect(await screen.findByText('Te veel pogingen. Probeer het zo meteen opnieuw.')).toBeTruthy()
    const retry = screen.getByRole('button', { name: 'Ja' })
    await waitFor(() => expect(retry.hasAttribute('disabled')).toBe(false))
    fireEvent.click(retry)
    expect(await screen.findByText(/Je antwoord is doorgegeven: Ja/)).toBeTruthy()
    expect(seen.filter((call) => call.url === '/api/act')).toHaveLength(2)
  })
})
