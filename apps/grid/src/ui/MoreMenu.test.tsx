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
})
