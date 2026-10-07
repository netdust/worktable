import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { Toolbar } from './Toolbar'

const base = { title: 'Planning', window: null, onWindow: () => undefined, search: null, addLabel: 'New Activiteit', addBlocked: null }

afterEach(cleanup)

describe('the toolbar', () => {
  it('adds with its button', () => {
    const onAdd = vi.fn()
    render(<Toolbar {...base} onAdd={onAdd} />)

    fireEvent.click(screen.getByRole('button', { name: 'New Activiteit' }))

    expect(onAdd).toHaveBeenCalledTimes(1)
  })

  it("shows a view's name with markup in its title as characters, never as an element (threat 7)", () => {
    const { container } = render(<Toolbar {...base} title="Planning · <img src=x onerror=alert(1)>" />)

    expect(screen.getByText('Planning · <img src=x onerror=alert(1)>')).toBeTruthy()
    expect(container.querySelector('img')).toBeNull()
  })

  it('says on one line what the view is: its name, a lock where it is read-only, and the summary', () => {
    const { rerender } = render(<Toolbar {...base} title="Dagplanning" shown={{ rows: 21, groups: 3 }} locked />)

    expect(screen.getByRole('heading', { level: 1, name: 'Dagplanning' })).toBeTruthy()
    expect(screen.getByRole('img', { name: 'Standaardweergave: maak een kopie om aan te passen' })).toBeTruthy()
    expect(screen.getByText('21 rijen · 3 groepen')).toBeTruthy()

    rerender(<Toolbar {...base} title="Mijn week" shown={{ rows: 1, groups: null }} />)

    expect(screen.queryByRole('img')).toBeNull()
    expect(screen.getByText('1 rij')).toBeTruthy()
  })

  it('has no add button without an add', () => {
    render(<Toolbar {...base} />)

    expect(screen.queryByRole('button', { name: 'New Activiteit' })).toBeNull()
  })

  it('exports from its ⋯ menu, not from a button of its own', () => {
    const onExport = vi.fn()
    render(<Toolbar {...base} onExport={onExport} />)

    expect(screen.queryByRole('button', { name: 'Export' })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'More actions' }))
    fireEvent.click(within(screen.getByRole('menu', { name: 'More actions' })).getByRole('menuitem', { name: 'Export' }))
    expect(onExport).toHaveBeenCalledTimes(1)
  })

  it('shows a blocked export disabled in the menu, its reason written under it', () => {
    const onExport = vi.fn()
    render(<Toolbar {...base} onExport={onExport} exportBlocked="Not for this view" />)

    fireEvent.click(screen.getByRole('button', { name: 'More actions' }))
    const item = within(screen.getByRole('menu', { name: 'More actions' })).getByRole('menuitem', { name: /^Export/ })
    expect(item.getAttribute('aria-disabled')).toBe('true')
    expect(within(item).getByText('Not for this view')).toBeTruthy()
    fireEvent.click(item)
    expect(onExport).not.toHaveBeenCalled()
  })

  it('has no ⋯ when there is nothing to put in it', () => {
    render(<Toolbar {...base} />)

    expect(screen.queryByRole('button', { name: 'More actions' })).toBeNull()
  })

  it('says the save word from any store that carries a save and an error', () => {
    const error = { id: 2, field: 'record:5', code: 'duplicate_assignment', message: 'Deze persoon staat al op deze activiteit' }
    render(<Toolbar {...base} saving={{ save: 'error', error }} />)

    expect(screen.getByRole('status').textContent).toBe('Not saved: Deze persoon staat al op deze activiteit')
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

describe('a modified view in the toolbar', () => {
  const actions = () => ({ onSave: vi.fn(), onSaveAs: vi.fn(), onRevert: vi.fn() })
  const more = () => screen.getByRole('button', { name: 'More actions' })

  it("saves one's own view with Save, and puts Save as new view and Revert in the ⋯ before Export", () => {
    const modified = actions()
    render(<Toolbar {...base} onExport={() => undefined} modified={modified} />)

    expect(screen.getByText('· modified')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    expect(modified.onSave).toHaveBeenCalled()
    expect(modified.onSaveAs).not.toHaveBeenCalled()
    fireEvent.click(more())
    const menu = screen.getByRole('menu', { name: 'More actions' })
    expect(within(menu).getAllByRole('menuitem').map((item) => item.textContent)).toEqual(['Save as new view', 'Revert', 'Export'])
    fireEvent.click(within(menu).getByRole('menuitem', { name: 'Revert' }))
    expect(modified.onRevert).toHaveBeenCalled()
  })

  it('names the one button Save where it saves as new, and describes it so', () => {
    const modified = { ...actions(), onSave: undefined }
    render(<Toolbar {...base} modified={modified} />)

    expect(screen.queryByRole('button', { name: 'Save as new view' })).toBeNull()
    const save = screen.getByRole('button', { name: 'Save' })
    expect(save).toHaveProperty('title', 'Save as new view')
    fireEvent.click(save)
    expect(modified.onSaveAs).toHaveBeenCalled()
    fireEvent.click(more())
    expect(within(screen.getByRole('menu')).getAllByRole('menuitem').map((item) => item.textContent)).toEqual(['Save as new view', 'Revert'])
  })

  it('keeps add as the one primary button beside Save', () => {
    render(<Toolbar {...base} onAdd={() => undefined} modified={actions()} />)

    expect(screen.getByRole('button', { name: 'Save' }).className).not.toMatch(/primary/)
    expect(screen.getByRole('button', { name: 'New Activiteit' }).className).toMatch(/primary/)
  })

  it('opens on the keyboard, moves with the arrows, and gives focus back to ⋯ on Escape', async () => {
    render(<Toolbar {...base} modified={actions()} />)
    more().focus()
    fireEvent.click(more())

    const items = within(screen.getByRole('menu')).getAllByRole('menuitem')
    expect(document.activeElement).toBe(items[0])
    fireEvent.keyDown(items[0], { key: 'ArrowDown' })
    expect(document.activeElement).toBe(items[1])
    fireEvent.keyDown(items[1], { key: 'ArrowDown' })
    expect(document.activeElement).toBe(items[0])
    fireEvent.keyDown(items[0], { key: 'ArrowUp' })
    expect(document.activeElement).toBe(items[1])

    fireEvent.keyDown(document.activeElement!, { key: 'Escape' })
    await waitFor(() => expect(document.activeElement).toBe(more()))
  })

  it('shows nothing of it while the view is as saved', () => {
    render(<Toolbar {...base} modified={null} />)

    expect(screen.queryByText('· modified')).toBeNull()
    expect(screen.queryByRole('button', { name: 'Save' })).toBeNull()
  })
})
