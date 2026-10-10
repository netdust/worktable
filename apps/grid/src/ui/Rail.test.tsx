import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { TableDef, View } from '../types'
import { type ModelActions, Rail } from './Rail'
import { ICONS } from './icons'
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

  it("opens a model's menus outside the tree, so its scrolling never clips them, and closes them when it scrolls", () => {
    render(<Rail tables={spaced} active="planning" onSelect={() => undefined} onNewView={() => undefined} />)

    const kinds = menu('Weergave toevoegen aan Planning')
    expect(tree().contains(kinds)).toBe(false)
    expect(document.body.contains(kinds)).toBe(true)
    fireEvent.scroll(tree())
    expect(screen.queryByRole('menu')).toBeNull()

    expect(tree().contains(menu('Meer voor Planning'))).toBe(false)
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

  it('folds the keyboard hints into one Sneltoetsen item and keeps theme and density on one row in its foot', () => {
    const root = Object.assign(document.createElement('div'), { id: 'root' })
    document.body.append(root)
    render(<Rail tables={groupTables(plainTables, plain)} active="planning" onSelect={() => undefined} />)
    const foot = within(rail()).getByRole('contentinfo')
    const keys = within(foot).getByText('Sneltoetsen').closest('details')
    expect(keys?.open).toBe(false)
    const looks = foot.querySelector('.nv-rail__looks')
    expect(looks && within(looks as HTMLElement).getAllByRole('radiogroup').map((g) => g.getAttribute('aria-label'))).toEqual(['Thema', 'Dichtheid'])

    for (const hint of ['bewegen', 'bewerken', 'annuleren', 'Ongedaan maken', 'zoeken en springen']) expect(within(foot).getByText(hint)).toBeTruthy()
    for (const key of ['Esc', '⌘Z', '⌘K']) expect(within(foot).getByText(key)).toBeTruthy()

    const theme = within(foot).getByRole('radiogroup', { name: 'Thema' })
    fireEvent.click(within(theme).getByRole('radio', { name: 'Donker' }))
    expect(root.dataset.theme).toBe('dark')
  })
})

describe("a model's ⋯: name, icon, export", () => {
  const modelActions = (over: Partial<ModelActions> = {}): ModelActions => ({
    rename: vi.fn(), icon: vi.fn(), exportOpen: { run: vi.fn() }, ...over,
  })
  const items = (model: string) => within(menu(`Meer voor ${model}`)).getAllByRole('menuitem')
  const disabled = (found: HTMLElement[]) => found.filter((item) => item.getAttribute('aria-disabled') === 'true').map((item) => item.textContent)

  it('offers an administrator Naam wijzigen, Icoon wijzigen, Exporteren and the fold', () => {
    render(<Rail tables={spaced} active="planning" onSelect={() => undefined} modelActions={modelActions()} />)

    const found = items('Planning')
    expect(found.map((item) => item.textContent)).toEqual(['Naam wijzigen', 'Icoon wijzigen', 'Exporteren', 'Inklappen'])
    expect(disabled(found)).toEqual([])
  })

  it('disables the name and the icon, with the reason, for anyone else', () => {
    render(<Rail tables={spaced} active="planning" onSelect={() => undefined} modelActions={modelActions({ displayBlocked: 'Alleen een beheerder kan dit wijzigen' })} />)

    expect(disabled(items('Planning'))).toEqual([
      'Naam wijzigenAlleen een beheerder kan dit wijzigen',
      'Icoon wijzigenAlleen een beheerder kan dit wijzigen',
    ])
  })

  it("exports from the ⋯ of the open view's model only", () => {
    const actions = modelActions()
    render(<Rail tables={spaced} active="planning" onSelect={() => undefined} modelActions={actions} />)

    expect(disabled(items('Afwezigheden'))).toEqual(['ExporterenOpen eerst een weergave van dit model'])
    fireEvent.keyDown(document, { key: 'Escape' })
    fireEvent.click(within(menu('Meer voor Planning')).getByRole('menuitem', { name: 'Exporteren' }))
    expect(actions.exportOpen.run).toHaveBeenCalledTimes(1)
  })

  it('renames in place: Enter sends the trimmed name, Escape sends nothing', () => {
    const actions = modelActions()
    render(<Rail tables={spaced} active="planning" onSelect={() => undefined} modelActions={actions} />)

    fireEvent.click(within(menu('Meer voor Planning')).getByRole('menuitem', { name: 'Naam wijzigen' }))
    const field = within(rail()).getByRole('textbox', { name: 'Nieuwe naam voor Planning' }) as HTMLInputElement
    expect(field.maxLength).toBe(60)
    fireEvent.change(field, { target: { value: '  Werkplan ' } })
    fireEvent.keyDown(field, { key: 'Enter' })
    expect(actions.rename).toHaveBeenCalledWith(spaced[0], 'Werkplan')

    fireEvent.click(within(menu('Meer voor Planning')).getByRole('menuitem', { name: 'Naam wijzigen' }))
    const again = within(rail()).getByRole('textbox', { name: 'Nieuwe naam voor Planning' })
    fireEvent.change(again, { target: { value: 'Anders' } })
    fireEvent.keyDown(again, { key: 'Escape' })
    expect(actions.rename).toHaveBeenCalledTimes(1)
    expect(within(rail()).queryByRole('textbox')).toBeNull()
  })

  it('picks an icon from the grid of the set, the current one pressed', () => {
    const actions = modelActions()
    const starred = spaced.map((table) => (table.key === 'planning' ? { ...table, icon: 'star' } : table))
    render(<Rail tables={starred} active="planning" onSelect={() => undefined} modelActions={actions} />)

    fireEvent.click(within(menu('Meer voor Planning')).getByRole('menuitem', { name: 'Icoon wijzigen' }))
    const grid = within(node('Planning')).getByRole('group', { name: 'Icoon voor Planning' })
    expect(within(grid).getAllByRole('button')).toHaveLength(ICONS.length)
    expect(within(grid).getByRole('button', { name: 'Ster' }).getAttribute('aria-pressed')).toBe('true')
    expect(document.activeElement).toBe(within(grid).getByRole('button', { name: 'Ster' }))

    fireEvent.click(within(grid).getByRole('button', { name: 'Vlag' }))
    expect(actions.icon).toHaveBeenCalledWith(starred[0], 'flag')
    expect(within(node('Planning')).queryByRole('group', { name: 'Icoon voor Planning' })).toBeNull()
  })

  it('shows a display name as text, never as markup', () => {
    const marked = spaced.map((table) => (table.key === 'planning' ? { ...table, label: '<b>Werk</b>' } : table))
    render(<Rail tables={marked} active="planning" onSelect={() => undefined} modelActions={modelActions()} />)

    expect(nameOf('<b>Werk</b>').textContent).toBe('<b>Werk</b>')
    expect(tree().querySelector('b')).toBeNull()
  })
})

describe("a query's views under its model", () => {
  const def = (key: string, label: string, extra: Partial<TableDef> = {}): TableDef => ({ key, label, model: key, types: ['grid'], ...extra })
  const v = (key: string, label: string, table: string, extra: Partial<View> = {}): View => ({ key, label, model: table, table, ...extra })
  const query = { query: true, of: 'activiteit' }
  const tables = groupTables([
    def('activiteit', 'Activiteiten'),
    def('dagplanning', 'Dagplanning', query),
    def('productie_dag', 'Per productie per dag', query),
    def('voorstellingen', 'Voorstellingen', query),
    def('losse', 'Losse query', { query: true }),
  ], [
    v('voorstellingen', 'Voorstellingen', 'voorstellingen', query),
    v('activiteiten', 'Activiteiten', 'activiteit'),
    v('dag', 'Dagplanning', 'dagplanning', query),
    v('pdag', 'Per productie per dag', 'productie_dag', query),
    v('los', 'Losse query', 'losse', { query: true }),
  ])

  it('lists no query with `of` as a node; its views sit in the model\'s list in the order they were served, each with the query icon', () => {
    render(<Rail tables={tables} active="activiteiten" onSelect={() => undefined} />)

    expect(models(tree())).toEqual(['Activiteiten', 'Losse query'])
    expect(within(views('Activiteiten')).getAllByRole('button').map((b) => b.textContent)).toEqual(['Voorstellingen', 'Activiteiten', 'Dagplanning', 'Per productie per dag'])
    for (const name of ['Dagplanning', 'Per productie per dag', 'Voorstellingen']) {
      expect(view('Activiteiten', name).querySelector('.lucide-combine')).toBeTruthy()
    }
    expect(view('Activiteiten', 'Activiteiten').querySelector('.lucide-combine')).toBeNull()
  })

  it('keeps a query without `of` as a node of its own', () => {
    render(<Rail tables={tables} active="los" onSelect={() => undefined} />)

    expect(within(views('Losse query')).getAllByRole('button').map((b) => b.textContent)).toEqual(['Losse query'])
  })
})
