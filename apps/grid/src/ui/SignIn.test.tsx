import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Schema } from '../types'

const api = vi.hoisted(() => ({
  schema: vi.fn(), rows: vi.fn(), awayRows: vi.fn(), records: vi.fn(), update: vi.fn(), create: vi.fn(), remove: vi.fn(),
  savedViews: vi.fn(), createView: vi.fn(), updateView: vi.fn(), deleteView: vi.fn(), restoreView: vi.fn(), prefs: vi.fn(), savePrefs: vi.fn(),
  me: vi.fn(), requestLink: vi.fn(), consumeLink: vi.fn(), signOut: vi.fn(), onUnauthenticated: vi.fn(),
  rowOf: vi.fn(), undoBatch: vi.fn(), runAction: vi.fn(),
}))
vi.mock('../api', () => api)
const { App } = await import('./App')

const served: Schema = {
  models: { activity: { key: 'activity', label: 'Activiteit', title_label: 'Titel', title_readonly: false, fields: {} } },
  tables: [{ key: 'planning', label: 'Planning', model: 'activity', date_field: 'date', types: ['grid'] }],
  views: [{ key: 'planning', label: 'Planning', table: 'planning', model: 'activity', date_field: 'date' }],
  writable: { activity: true },
}
const account = { id: 7, email: 'an@example.test', role: 'editor' as const, subject: null }
const TOKEN = 'secret-Token_123'

let lapse: () => void = () => undefined

beforeEach(() => {
  api.schema.mockResolvedValue(served)
  api.rows.mockResolvedValue({ rows: [], total: 0 })
  api.awayRows.mockResolvedValue([])
  api.records.mockResolvedValue({ rows: [], total: 0 })
  api.savedViews.mockResolvedValue([])
  api.prefs.mockResolvedValue({ order: {}, last: {} })
  api.me.mockResolvedValue(account)
  api.onUnauthenticated.mockImplementation((callback: () => void) => {
    lapse = callback
    return () => undefined
  })
})
afterEach(() => {
  cleanup()
  vi.resetAllMocks()
  vi.restoreAllMocks()
  window.history.replaceState(null, '', '/')
  window.localStorage.clear()
})

const form = () => screen.getByRole('form', { name: 'Aanmelden' })

describe('the sign-in form', () => {
  it.each([
    ['an answer', () => api.requestLink.mockResolvedValue({ ok: true })],
    ['a refusal', () => api.requestLink.mockRejectedValue({ code: 'rate_limited', message: 'Too many' })],
  ])('posts the email and says the same for %s', async (_, answer) => {
    answer()
    api.me.mockRejectedValue({ code: 'unauthenticated', message: 'Sign in first' })
    render(<App />)

    fireEvent.change(await screen.findByRole('textbox', { name: 'E-mailadres' }), { target: { value: ' an@example.test ' } })
    fireEvent.click(within(form()).getByRole('button', { name: 'Stuur me een link' }))

    expect(await screen.findByText(/staat er nu een link in je mailbox/)).toBeTruthy()
    expect(api.requestLink).toHaveBeenCalledWith('an@example.test')
    expect(api.schema).not.toHaveBeenCalled()
  })
})

describe('the link', () => {
  it('posts the token from the fragment only when the button is pressed', async () => {
    window.history.replaceState(null, '', `/#/auth/${TOKEN}`)
    api.consumeLink.mockResolvedValue(account)
    render(<App />)

    const press = await screen.findByRole('button', { name: 'Aanmelden' })
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(api.consumeLink).not.toHaveBeenCalled()
    expect(api.me).not.toHaveBeenCalled()

    fireEvent.click(press)
    expect(api.consumeLink).toHaveBeenCalledWith(TOKEN)
    expect(await screen.findByRole('navigation', { name: 'Views' })).toBeTruthy()
  })

  it('after consume the token is gone from the location and the history before the grid writes its hash', async () => {
    window.history.replaceState(null, '', `/#/auth/${TOKEN}`)
    api.consumeLink.mockResolvedValue(account)
    const replaced = vi.spyOn(window.history, 'replaceState')
    const pushed = vi.spyOn(window.history, 'pushState')
    render(<App />)

    fireEvent.click(await screen.findByRole('button', { name: 'Aanmelden' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Next week' }))
    expect(new URLSearchParams(window.location.hash.slice(1)).get('from')).toBeTruthy()

    expect(window.location.href).not.toContain(TOKEN)
    const urls = replaced.mock.calls.map(([, , url]) => String(url))
    expect(urls[0]).toBe('/')
    expect(urls.some((url) => url.includes(TOKEN))).toBe(false)
    expect(pushed).not.toHaveBeenCalled()
  })

  it.each([
    ['the sign-in form', () => api.me.mockRejectedValue({ code: 'unauthenticated', message: 'Sign in first' }), 'Stuur me een link'],
    ['the grid', () => api.me.mockResolvedValue(account), 'Next week'],
  ])('a link pasted into a tab already showing %s opens the confirm screen', async (_, session, shown) => {
    session()
    api.consumeLink.mockResolvedValue(account)
    render(<App />)
    await screen.findByRole('button', { name: shown })

    act(() => {
      window.history.pushState(null, '', `/#/auth/${TOKEN}`)
      window.dispatchEvent(new HashChangeEvent('hashchange'))
    })

    fireEvent.click(await screen.findByRole('button', { name: 'Aanmelden' }))
    expect(api.consumeLink).toHaveBeenCalledWith(TOKEN)
    expect(await screen.findByRole('navigation', { name: 'Views' })).toBeTruthy()
    expect(window.location.href).not.toContain(TOKEN)
  })

  it('a dead link says so and offers the form', async () => {
    window.history.replaceState(null, '', `/#/auth/${TOKEN}`)
    api.consumeLink.mockRejectedValue({ code: 'bad_token', message: 'This link is not valid any more' })
    render(<App />)

    fireEvent.click(await screen.findByRole('button', { name: 'Aanmelden' }))

    expect(await screen.findByText('Deze link werkt niet meer. Vraag een nieuwe aan.')).toBeTruthy()
    expect(screen.getByRole('textbox', { name: 'E-mailadres' })).toBeTruthy()
    expect(window.location.href).not.toContain(TOKEN)
  })
})

describe('a lapsed session', () => {
  const draft = () => screen.getAllByRole('row').find((row) => row.classList.contains('nv-tr--draft'))

  it('a 401 shows sign-in over the grid and keeps the unsaved new row', async () => {
    render(<App />)
    await screen.findByText('No rows in this window')
    fireEvent.click(screen.getByRole('button', { name: 'New Activiteit' }))
    expect(draft()).toBeTruthy()

    act(() => lapse())

    expect(screen.getByRole('dialog', { name: 'Aanmelden' })).toBeTruthy()
    expect(draft()).toBeTruthy()

    // Signed in again in another tab: back here, the grid is as it was.
    await act(async () => {
      window.dispatchEvent(new Event('focus'))
    })
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Aanmelden' })).toBeNull())
    expect(draft()).toBeTruthy()
  })

  it('shows sign-in when there is no session at all', async () => {
    api.me.mockRejectedValue({ code: 'unauthenticated', message: 'Sign in first' })
    render(<App />)

    expect(await screen.findByRole('textbox', { name: 'E-mailadres' })).toBeTruthy()
    expect(api.schema).not.toHaveBeenCalled()
  })
})

describe('the signed-in account', () => {
  it('is named in the rail foot, and signs out there', async () => {
    api.signOut.mockResolvedValue({ ok: true })
    render(<App />)

    const rail = await screen.findByRole('navigation', { name: 'Views' })
    expect(within(rail).getByText('an@example.test')).toBeTruthy()
    fireEvent.click(within(rail).getByRole('button', { name: 'Afmelden' }))

    expect(await screen.findByRole('textbox', { name: 'E-mailadres' })).toBeTruthy()
    expect(api.signOut).toHaveBeenCalledOnce()
    expect(window.location.hash).toBe('#/signin')
  })
})
