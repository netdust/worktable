import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { renderNl } from '../test-setup'
import { MoreMenu } from './MoreMenu'

afterEach(cleanup)

describe('MoreMenu', () => {
  const run = vi.fn()
  const actions = [{ label: 'Terugzetten', run }, { label: 'Delen', run: vi.fn(), blocked: 'Eerst opslaan' }]

  it('Escape closes the menu and returns focus to its button', async () => {
    renderNl(<MoreMenu actions={actions} />)
    const button = screen.getByRole('button', { name: 'More actions' })
    button.focus()
    fireEvent.click(button)

    const menu = screen.getByRole('menu', { name: 'More actions' })
    expect(menu.closest('[data-trigger="MenuTrigger"]')).not.toBeNull()
    expect(button.getAttribute('aria-expanded')).toBe('true')
    await waitFor(() => expect(menu.contains(document.activeElement)).toBe(true))

    fireEvent.keyDown(document.activeElement as HTMLElement, { key: 'Escape' })
    await waitFor(() => expect(screen.queryByRole('menu')).toBeNull())
    await waitFor(() => expect(document.activeElement).toBe(button))
    expect(button.getAttribute('aria-expanded')).toBe('false')
  })

  it('runs a chosen action, and a blocked one is disabled and says why', async () => {
    renderNl(<MoreMenu actions={actions} />)
    fireEvent.click(screen.getByRole('button', { name: 'More actions' }))

    const blocked = screen.getByRole('menuitem', { name: /Delen/ })
    expect(blocked.getAttribute('aria-disabled')).toBe('true')
    expect(within(blocked).getByText('Eerst opslaan')).toBeTruthy()

    fireEvent.click(screen.getByRole('menuitem', { name: 'Terugzetten' }))
    await waitFor(() => expect(screen.queryByRole('menu')).toBeNull())
    expect(run).toHaveBeenCalledTimes(1)
  })

  /** What a mouse does: down (focus moves, or leaves for the page), up, click. */
  const click = (target: HTMLElement) => {
    fireEvent.pointerDown(target, { button: 0, pointerType: 'mouse' })
    fireEvent.mouseDown(target, { button: 0 })
    if (target.tabIndex >= 0) target.focus()
    else (document.activeElement as HTMLElement | null)?.blur()
    fireEvent.pointerUp(target, { button: 0, pointerType: 'mouse' })
    fireEvent.mouseUp(target, { button: 0 })
    fireEvent.click(target, { button: 0 })
  }

  it('closes on a press outside it', async () => {
    renderNl(<><p>page</p><MoreMenu actions={actions} /></>)
    fireEvent.click(screen.getByRole('button', { name: 'More actions' }))
    await screen.findByRole('menu')

    click(screen.getByText('page'))
    await waitFor(() => expect(screen.queryByRole('menu')).toBeNull())
  })

  it('closes on a second click on its trigger', async () => {
    renderNl(<MoreMenu actions={actions} />)
    const button = screen.getByRole('button', { name: 'More actions' })
    click(button)
    await screen.findByRole('menu')

    click(button)
    await waitFor(() => expect(screen.queryByRole('menu')).toBeNull())
  })

  it('opens another menu with one click on its trigger', async () => {
    renderNl(<><MoreMenu actions={actions} label="Eerste" menu="Eerste menu" /><MoreMenu actions={actions} label="Tweede" menu="Tweede menu" /></>)
    fireEvent.click(screen.getByRole('button', { name: 'Eerste' }))
    await screen.findByRole('menu', { name: 'Eerste menu' })

    click(screen.getByRole('button', { name: 'Tweede' }))
    await screen.findByRole('menu', { name: 'Tweede menu' })
    await waitFor(() => expect(screen.queryByRole('menu', { name: 'Eerste menu' })).toBeNull())
  })

  it('closes when the box it sits in scrolls', async () => {
    renderNl(<div data-testid="box"><MoreMenu actions={actions} /></div>)
    fireEvent.click(screen.getByRole('button', { name: 'More actions' }))
    await screen.findByRole('menu')

    fireEvent.scroll(screen.getByTestId('box'))
    await waitFor(() => expect(screen.queryByRole('menu')).toBeNull())
  })
})
