import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { Toolbar } from './Toolbar'

const base = { title: 'Planning', search: null, addLabel: 'Nieuw Activiteit', addBlocked: null }

afterEach(cleanup)

describe('the toolbar', () => {
  it('opens the history with an icon button in the title line, before the ⋯', () => {
    const onHistory = vi.fn()
    render(<Toolbar {...base} onHistory={onHistory} local={{ onRevert: () => undefined }} />)

    const button = screen.getByRole('button', { name: 'Geschiedenis' })
    expect(button.getAttribute('title')).toBe('Geschiedenis')
    const more = screen.getByRole('button', { name: 'More actions' })
    expect(button.compareDocumentPosition(more) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    fireEvent.click(button)
    expect(onHistory).toHaveBeenCalledTimes(1)
  })

  it('has no history button without a view to read it for', () => {
    render(<Toolbar {...base} />)

    expect(screen.queryByRole('button', { name: 'Geschiedenis' })).toBeNull()
  })

  it('adds with its button', () => {
    const onAdd = vi.fn()
    render(<Toolbar {...base} onAdd={onAdd} />)

    fireEvent.click(screen.getByRole('button', { name: 'Nieuw Activiteit' }))

    expect(onAdd).toHaveBeenCalledTimes(1)
  })

  it("shows a view's name with markup in its title as characters, never as an element (threat 7)", () => {
    const { container } = render(<Toolbar {...base} title="Planning · <img src=x onerror=alert(1)>" />)

    expect(screen.getByText('Planning · <img src=x onerror=alert(1)>')).toBeTruthy()
    expect(container.querySelector('img')).toBeNull()
  })

  it('says on one line what the view is: its name, a lock where it is read-only, and the summary', () => {
    const { rerender } = render(<Toolbar {...base} title="Dagplanning" shown={{ rows: 21, groups: 3, cut: false }} locked="standard" />)

    expect(screen.getByRole('heading', { level: 1, name: 'Dagplanning' })).toBeTruthy()
    expect(screen.getByRole('img', { name: 'Standaardweergave: maak een kopie om aan te passen' })).toBeTruthy()
    expect(screen.getByText('21 rijen · 3 groepen')).toBeTruthy()

    rerender(<Toolbar {...base} title="Ploeg" shown={{ rows: 1, groups: null, cut: false }} locked="colleague" />)

    expect(screen.getByRole('img', { name: 'Gedeeld door een collega: maak een kopie om aan te passen' })).toBeTruthy()
    expect(screen.queryByRole('img', { name: /Standaardweergave/ })).toBeNull()

    rerender(<Toolbar {...base} title="Mijn week" shown={{ rows: 1, groups: null, cut: false }} />)

    expect(screen.queryByRole('img')).toBeNull()
    expect(screen.getByText('1 rij')).toBeTruthy()
  })

  it('says "+" after the loaded rows when the read limit cut them', () => {
    render(<Toolbar {...base} shown={{ rows: 5000, groups: 3, cut: true }} />)

    expect(screen.getByText('5000+ rijen · 3 groepen')).toBeTruthy()
  })

  it('has no add button without an add', () => {
    render(<Toolbar {...base} />)

    expect(screen.queryByRole('button', { name: 'Nieuw Activiteit' })).toBeNull()
  })

  it('holds the share menu in the title line, and Exporteren is no longer in the ⋯', () => {
    render(<Toolbar {...base} share={<button type="button">Exporteren / delen</button>} local={{ onRevert: () => undefined }} />)

    expect(screen.getByRole('button', { name: 'Exporteren / delen' })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'More actions' }))
    expect(within(screen.getByRole('menu', { name: 'More actions' })).queryByRole('menuitem', { name: /^Export/ })).toBeNull()
  })

  it('has no ⋯ when there is nothing to put in it', () => {
    render(<Toolbar {...base} />)

    expect(screen.queryByRole('button', { name: 'More actions' })).toBeNull()
  })

  it('says only a refused or failed write: saving and saved say nothing', () => {
    const error = { id: 2, field: 'record:5', code: 'duplicate_assignment', message: 'Deze persoon staat al op deze activiteit' }
    const { rerender } = render(<Toolbar {...base} saving={{ save: 'error', error }} />)
    expect(screen.getByRole('status').textContent).toBe('Niet opgeslagen: Deze persoon staat al op deze activiteit')

    for (const save of ['saving', 'saved'] as const) {
      rerender(<Toolbar {...base} saving={{ save, error: null }} />)
      expect(screen.queryByRole('status')).toBeNull()
      expect(screen.queryByText(/Opslaan|Opgeslagen|gewijzigd/)).toBeNull()
    }
  })
})

describe('a view with fixed filters', () => {
  it('says how many saved filters have no chip, in the singular and the plural', () => {
    const { rerender } = render(<Toolbar {...base} fixed={1} />)
    expect(screen.getByText('+ 1 vaste filter')).toBeTruthy()

    rerender(<Toolbar {...base} fixed={2} />)
    expect(screen.getByText('+ 2 vaste filters')).toBeTruthy()

    rerender(<Toolbar {...base} fixed={0} />)
    expect(screen.queryByText(/vaste filter/)).toBeNull()
  })
})

describe('a change kept in this browser', () => {
  const more = () => screen.getByRole('button', { name: 'More actions' })
  const items = () => within(screen.getByRole('menu', { name: 'More actions' })).getAllByRole('menuitem').map((item) => item.textContent)

  it('says no save word, and puts Terugzetten in the ⋯', () => {
    const onRevert = vi.fn()
    render(<Toolbar {...base} local={{ onRevert }} />)

    expect(screen.queryByText(/gewijzigd|Opslaan|Opgeslagen/)).toBeNull()
    fireEvent.click(more())
    expect(items()).toEqual(['Terugzetten'])
    fireEvent.click(within(screen.getByRole('menu')).getByRole('menuitem', { name: 'Terugzetten' }))
    expect(onRevert).toHaveBeenCalled()
  })

  it('offers Publieke weergave bijwerken on a public view one may write, and saves with it', () => {
    const onPublish = vi.fn()
    render(<Toolbar {...base} local={{ onRevert: () => undefined, onPublish }} />)

    fireEvent.click(more())
    expect(items()).toEqual(['Publieke weergave bijwerken', 'Terugzetten'])
    fireEvent.click(within(screen.getByRole('menu')).getByRole('menuitem', { name: 'Publieke weergave bijwerken' }))
    expect(onPublish).toHaveBeenCalled()
  })

  it('opens on the keyboard, moves with the arrows, and gives focus back to ⋯ on Escape', async () => {
    render(<Toolbar {...base} local={{ onRevert: () => undefined, onPublish: () => undefined }} />)
    more().focus()
    fireEvent.click(more())

    const menu = within(screen.getByRole('menu')).getAllByRole('menuitem')
    expect(document.activeElement).toBe(menu[0])
    fireEvent.keyDown(menu[0] as HTMLElement, { key: 'ArrowDown' })
    expect(document.activeElement).toBe(menu[1])
    fireEvent.keyDown(menu[1] as HTMLElement, { key: 'ArrowDown' })
    expect(document.activeElement).toBe(menu[0])

    fireEvent.keyDown(document.activeElement!, { key: 'Escape' })
    await waitFor(() => expect(document.activeElement).toBe(more()))
  })

  it('has no ⋯ while the view is as saved', () => {
    render(<Toolbar {...base} local={null} />)
    expect(screen.queryByRole('button', { name: 'More actions' })).toBeNull()
  })
})
