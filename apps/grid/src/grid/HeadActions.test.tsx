import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Field, Model, ModelAction, Row } from '../types'
import { columnsFor } from './columns'
import { activity, planning } from './calais.test.data'

const remote = vi.hoisted(() => ({
  takeHandoff: vi.fn((_dataset: string, _id: number): Promise<string | null> => Promise.resolve(null)),
  recordCount: vi.fn(() => Promise.resolve(0)), recordHistory: vi.fn((): Promise<unknown[]> => Promise.resolve([])), rowsWhere: vi.fn(() => Promise.resolve({ rows: [], total: 0 })),
  records: vi.fn(), recordLink: vi.fn(), rotateRecordLink: vi.fn(), optionsFrom: vi.fn(), attachmentsOf: vi.fn(), uploadAttachment: vi.fn(), removeAttachment: vi.fn(),
  fileUrl: (id: number) => `/api/attachments/file/${id}`,
}))
vi.mock('../api', () => remote)
const { HeadActions } = await import('./HeadActions')
const { Drawer } = await import('./Drawer')

const field = (extra: Partial<Field> = {}): Field => ({ type: 'text', label: 'Adres', required: false, fact: false, ...extra })
const model = { key: 'plek', label: 'Plekken', fields: { adres: field({ href: true }), naam: field() } } as unknown as Model
const SITE = 'http://voorbeeld-site.test'
const inloggen: ModelAction = { name: 'inloggen', label: 'Inloggen', input: {}, head: { icon: 'log-in' }, handoff: true }
const plain: ModelAction = { name: 'wissen', label: 'Wissen', input: {}, head: { icon: 'log-in' } }
const quiet: ModelAction = { name: 'stil', label: 'Stil', input: {} }
const row = (adres: unknown, actions: string[] = ['inloggen', 'wissen', 'stil']): Row => ({ id: 3, title: 'Plek', status: '', fields: { adres }, available: { state: '', buttons: [], actions } })

interface Tab { closed: boolean; close: () => void; log: string[]; opener: unknown; location: { href: string } }
let tab: Tab | null
let open: ReturnType<typeof vi.spyOn>

function fakeTab(): Tab {
  const log: string[] = []
  const made: Tab = {
    closed: false, log,
    close: vi.fn(() => { made.closed = true }),
    set opener(value: unknown) { log.push(`opener=${String(value)}`) },
    get opener() { return {} },
    location: { set href(value: string) { log.push(`href=${value}`) }, get href() { return '' } },
  } as unknown as Tab
  return made
}

let finish: (value: unknown) => void
let fail: (error: unknown) => void
const onAction = vi.fn()
const onSaid = vi.fn()

function show(record: Row, actions: ModelAction[] = [inloggen, plain, quiet]) {
  return render(<HeadActions row={record} model={model} actions={actions} onAction={onAction} onSaid={onSaid} />)
}
const button = () => screen.queryByRole('button', { name: 'Inloggen' })
const click = () => fireEvent.click(button() as HTMLElement)
const settle = (ms = 0) => act(async () => { await vi.advanceTimersByTimeAsync(ms) })
const hrefs = () => (tab?.log ?? []).filter((entry) => entry.startsWith('href='))
const body = () => document.body.textContent ?? ''

beforeEach(() => {
  vi.useFakeTimers()
  tab = fakeTab()
  open = vi.spyOn(window, 'open').mockImplementation(() => tab as unknown as Window)
  onAction.mockImplementation(() => new Promise((resolve, reject) => { finish = resolve; fail = reject }))
  remote.takeHandoff.mockReset()
  remote.takeHandoff.mockImplementation(() => Promise.resolve(null))
})
afterEach(() => {
  cleanup()
  vi.useRealTimers()
  open.mockRestore()
  onAction.mockReset()
  onSaid.mockReset()
})

describe('the head actions', () => {
  it('is an icon-only quiet button named by the action\'s label, drawn with its icon', () => {
    show(row(SITE))
    const one = button() as HTMLElement
    expect(one.className).toBe('nv-more')
    expect(one.getAttribute('title')).toBe('Inloggen')
    expect(one.textContent).toBe('')
    expect(one.querySelector('svg.lucide-log-in')?.getAttribute('aria-hidden')).toBe('true')
    expect(screen.getByRole('button', { name: 'Wissen' })).not.toBeNull()
  })

  it('has no button for an action without a head', () => {
    show(row(SITE))
    expect(screen.queryByRole('button', { name: 'Stil' })).toBeNull()
  })

  it('shows only the actions the row is marked for', () => {
    show(row(SITE, ['wissen']))
    expect(button()).toBeNull()
    expect(screen.getByRole('button', { name: 'Wissen' })).not.toBeNull()
  })

  it('shows nothing for an unsaved record', () => {
    const { container } = show({ ...row(SITE), id: 0 })
    expect(container.innerHTML).toBe('')
  })

  it.each([null, '', 'javascript:alert(1)', 'data:text/html,x', 'ftp://voorbeeld-site.test', 'geen adres'])('shows a handoff action only with a good address: not for %p, though a plain head action stays', (value) => {
    show(row(value))
    expect(button()).toBeNull()
    expect(screen.getByRole('button', { name: 'Wissen' })).not.toBeNull()
  })

  it('sits directly after the open link in the drawer\'s head', () => {
    const served = { ...activity, actions: [inloggen], fields: { ...activity.fields, adres: field({ href: true }) } } as unknown as Model
    const record = { ...row(SITE), title: 'Lunch' }
    render(<Drawer row={record} columns={columnsFor(activity, { ...planning, columns: undefined }, false)} model={served} actions={[inloggen]} onAction={onAction} onDelete={vi.fn()} onClose={() => undefined} />)
    const link = screen.getByRole('link', { name: 'Openen in nieuw tabblad' })
    expect(link.nextElementSibling).toBe(button())
    expect(button()?.nextElementSibling?.className).toContain('nv-menu')
  })
})

describe('running a head action that hands back a link', () => {
  it('opens a blank tab, with no features, before the run has answered', () => {
    show(row(SITE))
    click()
    expect(open).toHaveBeenCalledTimes(1)
    expect(open.mock.calls[0]).toEqual(['', '_blank'])
    expect(onAction).toHaveBeenCalledWith(inloggen, {})
  })

  it('runs, then polls the created record every second, then navigates', async () => {
    show(row(SITE))
    click()
    finish({ dataset: 'actie', id: 9 })
    await settle()
    expect(remote.takeHandoff).not.toHaveBeenCalled()
    await settle(1000)
    expect(remote.takeHandoff).toHaveBeenCalledWith('actie', 9)
    expect(remote.takeHandoff).toHaveBeenCalledTimes(1)
    await settle(1000)
    expect(remote.takeHandoff).toHaveBeenCalledTimes(2)
    expect(hrefs()).toEqual([])
    remote.takeHandoff.mockImplementation(() => Promise.resolve(`${SITE}/wp-login.php?token=geheim`))
    await settle(1000)
    expect(hrefs()).toEqual([`href=${SITE}/wp-login.php?token=geheim`])
    await settle(5000)
    expect(remote.takeHandoff).toHaveBeenCalledTimes(3)
    expect(tab?.closed).toBe(false)
  })

  it('cuts the tab off from the studio before it navigates', async () => {
    show(row(SITE))
    click()
    finish({ dataset: 'actie', id: 9 })
    remote.takeHandoff.mockImplementation(() => Promise.resolve(`${SITE}/in`))
    await settle(1000)
    expect(tab?.log).toEqual(['opener=null', `href=${SITE}/in`])
  })

  it('closes the tab and says nothing was received after 30 seconds', async () => {
    show(row(SITE))
    click()
    finish({ dataset: 'actie', id: 9 })
    await settle(29000)
    expect(tab?.closed).toBe(false)
    await settle(2000)
    expect(tab?.closed).toBe(true)
    expect(onSaid).toHaveBeenCalledWith('Geen link ontvangen')
    const calls = remote.takeHandoff.mock.calls.length
    await settle(5000)
    expect(remote.takeHandoff.mock.calls.length).toBe(calls)
  })

  it('closes the tab when the run fails, and reports it as an action row does', async () => {
    show(row(SITE))
    click()
    fail({ code: 'forbidden', message: 'No' })
    await settle()
    expect(tab?.closed).toBe(true)
    expect(onSaid).toHaveBeenCalledTimes(1)
    await settle(3000)
    expect(remote.takeHandoff).not.toHaveBeenCalled()
  })

  it('closes the tab when the run answers no created record', async () => {
    show(row(SITE))
    click()
    finish(null)
    await settle()
    expect(tab?.closed).toBe(true)
    expect(onSaid).toHaveBeenCalledWith('Inloggen is mislukt')
  })

  it('closes the tab when reading the link fails', async () => {
    remote.takeHandoff.mockImplementation(() => Promise.reject({ code: 'forbidden', message: 'No' }))
    show(row(SITE))
    click()
    finish({ dataset: 'actie', id: 9 })
    await settle(1000)
    expect(tab?.closed).toBe(true)
    expect(onSaid).toHaveBeenCalledWith('Inloggen is mislukt')
  })

  it('does not run when the browser blocks the new tab', async () => {
    open.mockImplementation(() => null)
    show(row(SITE))
    click()
    expect(onAction).not.toHaveBeenCalled()
    expect(onSaid).toHaveBeenCalledWith('Het nieuwe tabblad werd geblokkeerd')
  })

  it('runs once however often it is clicked while waiting', () => {
    show(row(SITE))
    click()
    click()
    expect(open).toHaveBeenCalledTimes(1)
    expect(onAction).toHaveBeenCalledTimes(1)
  })

  it('stops polling and closes its tab when the drawer goes away', async () => {
    const { unmount } = show(row(SITE))
    click()
    finish({ dataset: 'actie', id: 9 })
    await settle(1000)
    unmount()
    expect(tab?.closed).toBe(true)
    const calls = remote.takeHandoff.mock.calls.length
    await settle(5000)
    expect(remote.takeHandoff.mock.calls.length).toBe(calls)
  })

  it('leaves a tab that already navigated alone when the drawer goes away', async () => {
    const { unmount } = show(row(SITE))
    click()
    finish({ dataset: 'actie', id: 9 })
    remote.takeHandoff.mockImplementation(() => Promise.resolve(`${SITE}/in`))
    await settle(1000)
    unmount()
    expect(tab?.closed).toBe(false)
  })

  it('does not touch a tab the person closed', async () => {
    show(row(SITE))
    click()
    finish({ dataset: 'actie', id: 9 })
    remote.takeHandoff.mockImplementation(() => Promise.resolve(`${SITE}/in`))
    ;(tab as Tab).closed = true
    await settle(1000)
    expect(tab?.log).toEqual([])
    expect(tab?.close).not.toHaveBeenCalled()
  })

  it('runs a plain head action without a tab', async () => {
    show(row(SITE))
    fireEvent.click(screen.getByRole('button', { name: 'Wissen' }))
    expect(open).not.toHaveBeenCalled()
    expect(onAction).toHaveBeenCalledWith(plain, {})
    fail({ code: 'forbidden', message: 'No' })
    await settle()
    expect(onSaid).toHaveBeenCalledTimes(1)
  })
})

describe('where a handed-back link may go', () => {
  const handed = async (value: string, from = SITE) => {
    show(row(from))
    click()
    finish({ dataset: 'actie', id: 9 })
    remote.takeHandoff.mockImplementation(() => Promise.resolve(value))
    await settle(1000)
  }
  const refused = () => {
    expect(hrefs()).toEqual([])
    expect(tab?.log).toEqual([])
    expect(tab?.closed).toBe(true)
  }

  it.each(['javascript:alert(document.domain)', 'JaVaScRiPt:alert(1)', ' javascript:alert(1)', 'data:text/html,<script>1</script>', 'ftp://voorbeeld-site.test/x', '/wp-login.php', 'geen adres', ''])('never navigates to %p', async (value) => {
    await handed(value)
    refused()
    expect(onSaid).toHaveBeenCalledTimes(1)
  })

  it('never navigates to another site', async () => {
    await handed('http://kwaadaardig.test/in')
    refused()
    expect(onSaid).toHaveBeenCalledWith('De link hoort niet bij deze site')
  })

  it.each(['http://voorbeeld-site.test.kwaadaardig.test/in', 'http://xvoorbeeld-site.test/in', 'http://wwwvoorbeeld-site.test/in', 'http://www.www.voorbeeld-site.test/in'])('never navigates to the look-alike host %p', async (value) => {
    await handed(value)
    refused()
  })

  it('never navigates to a subdomain of the site', async () => {
    await handed('http://blog.voorbeeld-site.test/in')
    refused()
  })

  it('never navigates to the same host on another port', async () => {
    await handed('http://voorbeeld-site.test:8080/in')
    refused()
  })

  it('never navigates to a link whose host hides behind a login name', async () => {
    await handed('http://voorbeeld-site.test@kwaadaardig.test/in')
    refused()
  })

  it('goes to the www twin of the row\'s host', async () => {
    await handed('http://www.voorbeeld-site.test/in')
    expect(hrefs()).toEqual(['href=http://www.voorbeeld-site.test/in'])
  })

  it('goes to the bare host when the row has the www twin', async () => {
    await handed('http://voorbeeld-site.test/in', 'http://www.voorbeeld-site.test')
    expect(hrefs()).toEqual(['href=http://voorbeeld-site.test/in'])
  })

  it('goes to the same host on https when the row says http, as the ports match and https is no downgrade', async () => {
    await handed('https://voorbeeld-site.test/in')
    expect(hrefs()).toEqual(['href=https://voorbeeld-site.test/in'])
  })

  it.each(['http://voorbeeld-site.test/in', 'http://www.voorbeeld-site.test/in'])('never navigates to the plain http link %p on a site that is https', async (value) => {
    await handed(value, 'https://voorbeeld-site.test')
    refused()
    expect(onSaid).toHaveBeenCalledWith('De link hoort niet bij deze site')
  })

  it('goes to an https link on a site that is https, also on its www twin', async () => {
    await handed('https://www.voorbeeld-site.test/in', 'https://voorbeeld-site.test')
    expect(hrefs()).toEqual(['href=https://www.voorbeeld-site.test/in'])
  })

  it('compares hosts without regard to case', async () => {
    await handed('http://VOORBEELD-site.test/in')
    expect(hrefs()).toEqual(['href=http://voorbeeld-site.test/in'])
  })

  it('goes to a host and port the row names too', async () => {
    await handed('http://voorbeeld-site.test:8080/in', 'http://voorbeeld-site.test:8080')
    expect(hrefs()).toHaveLength(1)
  })

  it('never shows the link anywhere on the page, or in the console or an error', async () => {
    const logged = vi.spyOn(console, 'log')
    const warned = vi.spyOn(console, 'warn')
    const errored = vi.spyOn(console, 'error')
    await handed('http://kwaadaardig.test/in?token=geheim')
    expect(body()).not.toContain('geheim')
    expect(JSON.stringify(onSaid.mock.calls)).not.toContain('geheim')
    for (const spy of [logged, warned, errored]) expect(JSON.stringify(spy.mock.calls)).not.toContain('geheim')
    cleanup()
    await handed(`${SITE}/in?token=geheim`)
    expect(body()).not.toContain('geheim')
    expect(JSON.stringify(onSaid.mock.calls)).not.toContain('geheim')
  })
})
