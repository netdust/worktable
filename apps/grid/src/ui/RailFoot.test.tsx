import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { RailFoot } from './RailFoot'

beforeEach(() => {
  window.localStorage.clear()
  document.body.innerHTML = '<div id="root"></div>'
})
afterEach(cleanup)

const show = () => render(<RailFoot signed={{ email: 'planner@example.test', onSignOut: () => undefined }} />, { container: document.getElementById('root') as HTMLElement })

describe('Bijstellen in the rail foot', () => {
  it('is collapsed by default and opens on its header', () => {
    show()
    const toggle = screen.getByRole('button', { name: 'Bijstellen' })
    expect(toggle.getAttribute('aria-expanded')).toBe('false')
    expect(screen.queryByRole('radiogroup', { name: 'Thema' })).toBeNull()
    fireEvent.click(toggle)
    for (const name of ['Rijhoogte', 'Dagkop', 'Rasterlijnen', 'Zebrarijen', 'Thema']) expect(screen.getByRole('radiogroup', { name })).toBeTruthy()
  })

  it('draws the grid lines when Rasterlijnen is on, and keeps the choice', () => {
    show()
    fireEvent.click(screen.getByRole('button', { name: 'Bijstellen' }))
    const root = document.getElementById('root') as HTMLElement
    expect(root.getAttribute('data-lines')).toBe('off')
    fireEvent.click(within(screen.getByRole('radiogroup', { name: 'Rasterlijnen' })).getByRole('radio', { name: 'Aan' }))
    expect(root.getAttribute('data-lines')).toBe('on')
    expect(window.localStorage.getItem('ntdst-views/lines')).toBe('on')
  })

  it('remembers that it was left open', () => {
    show()
    fireEvent.click(screen.getByRole('button', { name: 'Bijstellen' }))
    cleanup()
    document.body.innerHTML = '<div id="root"></div>'
    show()
    expect(screen.getByRole('button', { name: 'Bijstellen' }).getAttribute('aria-expanded')).toBe('true')
  })
})
