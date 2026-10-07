import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { TableDef, View } from '../types'
import { Rail } from './Rail'
import { groupTables } from './tables'

const plain: View[] = [{ key: 'planning', label: 'Planning', model: 'activity', table: 'planning' }, { key: 'absences', label: 'Absences', model: 'absence', table: 'absences' }]
const plainTables: TableDef[] = [{ key: 'planning', label: 'Planning', model: 'activity', types: ['grid'] }, { key: 'absences', label: 'Absences', model: 'absence', types: ['grid'] }]
const spaced = groupTables([
  { key: 'planning', label: 'Planning', model: 'activity', space: 'scoped', types: ['grid', 'matrix'] },
  { key: 'afwezigheden', label: 'Afwezigheden', model: 'absence', space: 'global', types: ['grid'] },
  { key: 'toewijzingen', label: 'Toewijzingen', model: 'assignment', space: 'global', types: ['grid'], query: true },
  { key: 'leeg', label: 'Leeg', model: 'empty', space: 'global', types: ['grid'] },
], [
  { key: 'planning', label: 'Planning', model: 'activity', space: 'scoped', table: 'planning', table_label: 'Planning' },
  { key: 'bezetting', label: 'Matrix', model: 'activity', type: 'matrix', space: 'scoped', table: 'planning', table_label: 'Planning' },
  { key: 'afwezigheden', label: 'Tabel', model: 'absence', space: 'global', table: 'afwezigheden', table_label: 'Afwezigheden' },
  { key: 'toewijzingen', label: 'Tabel', model: 'assignment', space: 'global', table: 'toewijzingen', table_label: 'Toewijzingen' },
])
const sections = [{ label: 'Werk', sources: ['toewijzingen', 'planning'] }]

const rail = () => screen.getByRole('navigation', { name: 'Views' })
const tree = () => within(rail()).getByRole('tree', { name: 'Views' })
const node = (name: string) => within(tree()).getByRole('treeitem', { name })
const nameOf = (model: string) => within(node(model)).getAllByRole('button', { name: model })[0]
const views = (model: string) => within(node(model)).getByRole('group', { name: 'View type' })
const view = (model: string, name: string) => within(views(model)).getByRole('button', { name })
/** The models under an element, by the label each treeitem is named by. */
const models = (within_: HTMLElement) => within(within_).getAllByRole('treeitem').map((item) => document.getElementById(item.getAttribute('aria-labelledby') ?? '')?.textContent)
const expanded = (model: string) => node(model).getAttribute('aria-expanded')
const menu = (button: string) => {
  fireEvent.click(within(rail()).getByRole('button', { name: button }))
  return screen.getByRole('menu', { name: button })
}

afterEach(() => {
  cleanup()
  document.getElementById('root')?.remove()
  window.localStorage.clear()
})

describe('the tree', () => {
  it('holds the served sections in their order, the undeclared sources last and unlabelled, every source a node', () => {
    render(<Rail tables={spaced} sections={sections} active="planning" onSelect={() => undefined} />)
    const [werk, rest] = within(tree()).getAllByRole('group').filter((group) => group.parentElement === tree())

    expect(werk.getAttribute('aria-label')).toBe('Werk')
    expect(models(werk)).toEqual(['Toewijzingen', 'Planning'])
    expect(rest.getAttribute('aria-label')).toBeNull()
    expect(models(rest)).toEqual(['Afwezigheden', 'Leeg'])
  })

  it('shows a section label as text, never as something to click', () => {
    render(<Rail tables={spaced} sections={sections} active="planning" onSelect={() => undefined} />)

    expect(within(tree()).getByText('Werk').tagName).toBe('P')
    expect(within(rail()).queryByRole('button', { name: 'Werk' })).toBeNull()
  })

  it("names a model's treeitem by its label alone, whatever its fold state or icon", () => {
    render(<Rail tables={spaced} active="planning" onSelect={() => undefined} />)

    expect(models(tree())).toEqual(['Planning', 'Afwezigheden', 'Toewijzingen', 'Leeg'])
    fireEvent.mouseEnter(nameOf('Planning').parentElement!)
    expect(within(tree()).getByRole('treeitem', { name: 'Planning' }).getAttribute('aria-expanded')).toBe('true')
    fireEvent.click(within(node('Planning')).getByRole('button', { name: 'Inklappen' }))
    expect(within(tree()).getByRole('treeitem', { name: 'Planning' }).getAttribute('aria-expanded')).toBe('false')
  })

  it("opens the active view's model on a first visit, and only that one", () => {
    render(<Rail tables={spaced} active="bezetting" onSelect={() => undefined} />)

    expect(expanded('Planning')).toBe('true')
    expect(expanded('Afwezigheden')).toBe('false')
    expect(within(node('Afwezigheden')).queryByRole('group', { name: 'View type' })).toBeNull()
  })

  it('highlights the active view, not its model', () => {
    render(<Rail tables={spaced} active="bezetting" onSelect={() => undefined} />)

    expect(view('Planning', 'Matrix').getAttribute('aria-current')).toBe('page')
    expect(view('Planning', 'Planning').getAttribute('aria-current')).toBeNull()
    expect(nameOf('Planning').getAttribute('aria-current')).toBeNull()
  })

  it("opens another model by its name, unfolded, and only unfolds the active one's", () => {
    const onTable = vi.fn()
    render(<Rail tables={spaced} active="planning" onSelect={() => undefined} onTable={onTable} />)

    fireEvent.click(nameOf('Afwezigheden'))
    expect(onTable).toHaveBeenCalledWith(spaced[1])
    expect(expanded('Afwezigheden')).toBe('true')

    fireEvent.click(within(node('Planning')).getByRole('button', { name: 'Inklappen' }))
    fireEvent.click(nameOf('Planning'))
    expect(onTable).toHaveBeenCalledTimes(1)
    expect(expanded('Planning')).toBe('true')
  })

  it("opens a model's first view by default", () => {
    const onSelect = vi.fn()
    render(<Rail tables={spaced} active="planning" onSelect={onSelect} />)

    fireEvent.click(nameOf('Toewijzingen'))
    expect(onSelect).toHaveBeenCalledWith('toewijzingen')
  })

  it('opens a view named like its model by its button, twice in a row, never through the model', () => {
    const onSelect = vi.fn()
    const onTable = vi.fn()
    render(<Rail tables={spaced} active="afwezigheden" onSelect={onSelect} onTable={onTable} />)
    fireEvent.click(within(node('Planning')).getByRole('button', { name: 'Uitklappen' }))

    fireEvent.click(view('Planning', 'Planning'))
    fireEvent.click(view('Planning', 'Planning'))
    expect(onSelect).toHaveBeenCalledTimes(2)
    expect(onSelect).toHaveBeenLastCalledWith('planning')
    expect(onTable).not.toHaveBeenCalled()
  })

  it("opens the clicked view of an open model, not the model's last one", () => {
    const onSelect = vi.fn()
    const onTable = vi.fn()
    render(<Rail tables={spaced} active="afwezigheden" onSelect={onSelect} onTable={onTable} />)
    fireEvent.click(within(node('Planning')).getByRole('button', { name: 'Uitklappen' }))

    fireEvent.click(view('Planning', 'Matrix'))
    expect(onSelect).toHaveBeenCalledWith('bezetting')
    expect(onTable).not.toHaveBeenCalled()
  })

  it('folds and unfolds a model with its chevron without changing the view, and remembers it in this browser', () => {
    const onSelect = vi.fn()
    const onTable = vi.fn()
    render(<Rail tables={spaced} active="planning" onSelect={onSelect} onTable={onTable} />)

    fireEvent.click(within(node('Planning')).getByRole('button', { name: 'Inklappen' }))
    expect(expanded('Planning')).toBe('false')
    fireEvent.click(within(node('Afwezigheden')).getByRole('button', { name: 'Uitklappen' }))
    expect(expanded('Afwezigheden')).toBe('true')
    expect(onSelect).not.toHaveBeenCalled()
    expect(onTable).not.toHaveBeenCalled()

    cleanup()
    render(<Rail tables={spaced} active="planning" onSelect={onSelect} onTable={onTable} />)
    expect(expanded('Planning')).toBe('false')
    expect(expanded('Afwezigheden')).toBe('true')
  })

  it('opens the model of a view that becomes active elsewhere', () => {
    const { rerender } = render(<Rail tables={spaced} active="planning" onSelect={() => undefined} />)

    rerender(<Rail tables={spaced} active="toewijzingen" onSelect={() => undefined} />)
    expect(expanded('Toewijzingen')).toBe('true')
  })

  it('swaps the icon for the chevron and shows the tools on hover and on focus', () => {
    render(<Rail tables={spaced} active="planning" onSelect={() => undefined} onNewView={() => undefined} />)
    const row = nameOf('Afwezigheden').parentElement!
    const lead = within(node('Afwezigheden')).getByRole('button', { name: 'Uitklappen' })

    expect(row.dataset.hot).toBeUndefined()
    expect(lead.querySelector('.lucide-rows-3, .lucide-rows3')).toBeTruthy()
    fireEvent.mouseEnter(row)
    expect(row.dataset.hot).toBe('true')
    expect(lead.querySelector('.lucide-chevron-right')).toBeTruthy()
    fireEvent.mouseLeave(row)
    expect(row.dataset.hot).toBeUndefined()

    fireEvent.focus(nameOf('Afwezigheden'))
    expect(row.dataset.hot).toBe('true')
    expect(within(row).getByRole('button', { name: 'Weergave toevoegen aan Afwezigheden' })).toBeTruthy()
    expect(within(row).getByRole('button', { name: 'Meer voor Afwezigheden' })).toBeTruthy()
  })

  it('shows a query with its own icon', () => {
    render(<Rail tables={spaced} active="planning" onSelect={() => undefined} />)

    const lead = within(node('Toewijzingen')).getByRole('button', { name: 'Uitklappen' })
    expect(lead.querySelector('.lucide-rows-3, .lucide-rows3')).toBeNull()
    expect(lead.querySelector('svg')).toBeTruthy()
  })

  it('lists Grid, Matrix only where the model has one, and Kalender and Bord disabled for later', () => {
    render(<Rail tables={spaced} active="planning" onSelect={() => undefined} onNewView={() => undefined} />)

    const planning = menu('Weergave toevoegen aan Planning')
    expect(within(planning).getAllByRole('menuitem').map((item) => item.textContent)).toEqual(['Grid', 'Matrix', 'Kalenderlater', 'Bordlater'])
    expect(within(planning).getAllByRole('menuitem').filter((item) => item.getAttribute('aria-disabled') === 'true').map((item) => item.textContent))
      .toEqual(['Kalenderlater', 'Bordlater'])
    fireEvent.keyDown(document.activeElement!, { key: 'Escape' })
    cleanup()

    render(<Rail tables={spaced} active="planning" onSelect={() => undefined} onNewView={() => undefined} />)
    expect(within(menu('Weergave toevoegen aan Afwezigheden')).queryByRole('menuitem', { name: 'Matrix' })).toBeNull()
  })

  it('keeps a source without views as a node, and its + asks for its first view', () => {
    const onNewView = vi.fn()
    render(<Rail tables={spaced} active="planning" onSelect={() => undefined} onNewView={onNewView} />)

    expect(node('Leeg')).toBeTruthy()
    fireEvent.click(within(menu('Weergave toevoegen aan Leeg')).getByRole('menuitem', { name: 'Grid' }))
    expect(onNewView).toHaveBeenCalledWith(spaced[3], 'grid')
  })

  it("folds a model from its ⋯", () => {
    render(<Rail tables={spaced} active="planning" onSelect={() => undefined} />)

    fireEvent.click(within(menu('Meer voor Planning')).getByRole('menuitem', { name: 'Inklappen' }))
    expect(expanded('Planning')).toBe('false')
  })

  it('has no + without its handler', () => {
    render(<Rail tables={groupTables(plainTables, plain)} active="planning" onSelect={() => undefined} />)

    expect(within(rail()).queryByRole('button', { name: /^Weergave toevoegen/ })).toBeNull()
  })

  it('carries the keyboard hints and the theme in its foot', () => {
    const root = Object.assign(document.createElement('div'), { id: 'root' })
    document.body.append(root)
    render(<Rail tables={groupTables(plainTables, plain)} active="planning" onSelect={() => undefined} />)
    const foot = within(rail()).getByRole('contentinfo')

    for (const hint of ['move', 'edit', 'cancel', 'Undo', 'search and jump']) expect(within(foot).getByText(hint)).toBeTruthy()
    for (const key of ['Esc', '⌘Z', '⌘K']) expect(within(foot).getByText(key)).toBeTruthy()

    const theme = within(foot).getByRole('group', { name: 'Theme' })
    fireEvent.click(within(theme).getByRole('tab', { name: 'Dark' }))
    expect(root.dataset.theme).toBe('dark')
  })
})
