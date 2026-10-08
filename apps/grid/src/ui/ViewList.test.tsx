import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { SavedView, View } from '../types'
import type { Table } from './tables'
import { landing, ViewList } from './ViewList'

const tabel: View = { key: 'planning', label: 'Tabel', model: 'activity', table: 'planning', starting: true }
const matrix: View = { ...tabel, key: 'bezetting', label: 'Matrix', type: 'matrix' }
const saved = (id: number, label: string, extra: Partial<SavedView> = {}): SavedView => ({
  ...tabel, key: String(id), id, label, type: 'matrix', starting: false,
  arrangement: { hidden: [], order: [], widths: [], sort: [], filters: [], group: null, picked: [] },
  shared: false, owner: { id: 1, name: 'Hester' }, mine: true, editable: true, ...extra,
})
const own = saved(42, 'Calais techniek')
const sharedOwn = saved(43, 'Montage', { shared: true })
const theirs = saved(44, 'Ploeg', { shared: true, mine: false, editable: false, owner: { id: 2, name: 'Jan' } })
const seeded = saved(47, 'Rooster', { shared: true, mine: false, editable: false, owner: { id: -1, name: '' } })
const marked = saved(45, '<img src=x onerror=alert(1)>')
const table: Table = { key: 'planning', label: 'Planning', space: 'scoped', types: ['grid', 'matrix'], views: [tabel, matrix, own, sharedOwn, theirs, marked] }

const group = () => screen.getByRole('group', { name: 'View type' })
const actions = () => ({ rename: vi.fn(), duplicate: vi.fn(), remove: vi.fn(), share: vi.fn(), order: vi.fn() })
const menuOf = (name: string) => screen.getByRole('button', { name: `More actions: ${name}` })
const open = (name: string) => {
  fireEvent.click(menuOf(name))
  return screen.getByRole('menu', { name: 'More actions' })
}
const choices = (name: string) => within(open(name)).getAllByRole('menuitem').map((item) => item.textContent)
// The views' own buttons: with the actions each row also holds its drag button, "Verplaats <view>".
const viewButtons = () => within(group()).getAllByRole('button', { name: (name) => !name.startsWith('Verplaats ') })
const item = (name: string) => within(group()).getByRole('button', { name: new RegExp(`^${name}`) }).parentElement!

afterEach(cleanup)

describe('the views list', () => {
  it('holds one button per view in its group, each named by its label alone', () => {
    render(<ViewList table={table} active="planning" onSelect={() => undefined} />)
    const buttons = within(group()).getAllByRole('button')

    expect(buttons.map((b) => b.textContent)).toEqual(['Tabel', 'Matrix', 'Calais techniek', 'Montage', 'Ploeg', '<img src=x onerror=alert(1)>'])
    expect(within(group()).getByRole('button', { name: 'Calais techniek' })).toBeTruthy()
  })

  it("marks a starting or seeded view with the Standaardweergave lock, a colleague's shared view with its own mark, and one's own unshared view with a person", () => {
    render(<ViewList table={{ ...table, views: [...table.views, seeded] }} active="planning" onSelect={() => undefined} />)
    const lock = 'Standaardweergave, alleen te kopiëren'
    const colleague = 'Gedeeld door een collega, alleen te kopiëren'

    expect(within(item('Calais techniek')).getByRole('img', { name: 'Alleen voor jou' })).toBeTruthy()
    for (const name of ['Tabel', 'Matrix', 'Rooster']) expect(within(item(name)).getByRole('img', { name: lock })).toBeTruthy()
    expect(within(item('Ploeg')).getByRole('img', { name: colleague })).toBeTruthy()
    expect(within(item('Ploeg')).queryByRole('img', { name: lock })).toBeNull()
    expect(within(item('Rooster')).queryByRole('img', { name: colleague })).toBeNull()
    expect(within(item('Montage')).queryByRole('img')).toBeNull()
    expect(within(item('Calais techniek')).queryByRole('img', { name: lock })).toBeNull()
  })

  it('renders a name made of markup as its characters', () => {
    const { container } = render(<ViewList table={table} active="planning" onSelect={() => undefined} />)

    expect(within(group()).getByText('<img src=x onerror=alert(1)>')).toBeTruthy()
    expect(container.querySelector('img')).toBeNull()
  })

  it('selects a saved view by its key and marks the active one', () => {
    const onSelect = vi.fn()
    render(<ViewList table={table} active="42" onSelect={onSelect} />)

    expect(within(group()).getByRole('button', { name: /^Calais techniek/ }).getAttribute('aria-current')).toBe('page')
    fireEvent.click(within(group()).getByRole('button', { name: /^Montage/ }))
    expect(onSelect).toHaveBeenCalledWith('43')
  })
})

describe("a view's actions", () => {
  const admin = saved(46, 'Bezetting Jan', { shared: true, mine: false, editable: true, owner: { id: 2, name: 'Jan' } })
  const withAdmin: Table = { ...table, views: [...table.views, admin] }

  it('keeps every ⋯ out of the view type group: it holds the view buttons only', () => {
    render(<ViewList table={table} active="planning" onSelect={() => undefined} actions={actions()} />)

    expect(viewButtons().map((b) => b.textContent)).toEqual(['Tabel', 'Matrix', 'Calais techniek', 'Montage', 'Ploeg', '<img src=x onerror=alert(1)>'])
    expect(group().contains(menuOf('Calais techniek'))).toBe(false)
  })

  it('says its ⋯ in Dutch on hover, while its accessible name stays the kept contract', () => {
    render(<ViewList table={table} active="planning" onSelect={() => undefined} actions={actions()} />)

    expect(menuOf('Montage').getAttribute('title')).toBe('Meer acties: Montage')
  })

  it('offers copy, rename, share, Omhoog, Omlaag and delete on an own view', () => {
    render(<ViewList table={table} active="planning" onSelect={() => undefined} actions={actions()} />)

    expect(choices('Calais techniek')).toEqual(['Kopie maken', 'Naam wijzigen', 'Delen met het team', 'Omhoog', 'Omlaag', 'Verwijderen'])
  })

  it('offers unshare on an own shared view', () => {
    render(<ViewList table={table} active="planning" onSelect={() => undefined} actions={actions()} />)

    expect(choices('Montage')).toContain('Niet meer delen')
  })

  it('offers only duplicate on a starting view and on another\'s shared view', () => {
    render(<ViewList table={table} active="planning" onSelect={() => undefined} actions={actions()} />)

    expect(choices('Tabel')).toEqual(['Kopie maken'])
    cleanup()
    render(<ViewList table={table} active="planning" onSelect={() => undefined} actions={actions()} />)
    expect(choices('Ploeg')).toEqual(['Kopie maken'])
  })

  it('offers an administrator rename and delete on a shared view of another', () => {
    render(<ViewList table={withAdmin} active="planning" onSelect={() => undefined} actions={actions()} />)

    expect(choices('Bezetting Jan')).toEqual(['Kopie maken', 'Naam wijzigen', 'Verwijderen'])
  })

  it('offers no move up on the first view of the list and no move down on the last', () => {
    const first: Table = { ...table, views: [own, tabel, sharedOwn] }
    render(<ViewList table={first} active="planning" onSelect={() => undefined} actions={actions()} />)

    expect(choices('Calais techniek')).not.toContain('Omhoog')
    cleanup()
    render(<ViewList table={first} active="planning" onSelect={() => undefined} actions={actions()} />)
    expect(choices('Montage')).not.toContain('Omlaag')
  })

  it('runs the chosen action on its view', () => {
    const run = actions()
    render(<ViewList table={table} active="planning" onSelect={() => undefined} actions={run} />)

    fireEvent.click(within(open('Calais techniek')).getByRole('menuitem', { name: 'Kopie maken' }))
    expect(run.duplicate).toHaveBeenCalledWith(own)
    fireEvent.click(within(open('Calais techniek')).getByRole('menuitem', { name: 'Omhoog' }))
    expect(run.order).toHaveBeenCalledWith('planning', ['planning', '42', 'bezetting', '43', '44', '45'])
    fireEvent.click(within(open('Montage')).getByRole('menuitem', { name: 'Niet meer delen' }))
    expect(run.share).toHaveBeenCalledWith(sharedOwn, false)
    fireEvent.click(within(open('Calais techniek')).getByRole('menuitem', { name: 'Verwijderen' }))
    expect(run.remove).toHaveBeenCalledWith(own)
  })

  it('is keyboard-operable: the menu says it is open, Escape closes it and gives focus back to ⋯', async () => {
    render(<ViewList table={table} active="planning" onSelect={() => undefined} actions={actions()} />)
    const trigger = menuOf('Calais techniek')
    trigger.focus()

    expect(trigger.getAttribute('aria-expanded')).toBe('false')
    fireEvent.keyDown(trigger, { key: 'Enter' })
    fireEvent.keyUp(trigger, { key: 'Enter' })
    const menu = screen.getByRole('menu', { name: 'More actions' })
    expect(trigger.getAttribute('aria-expanded')).toBe('true')
    await waitFor(() => expect(document.activeElement).toBe(within(menu).getAllByRole('menuitem')[0]))
    fireEvent.keyDown(document.activeElement!, { key: 'ArrowDown' })
    expect(document.activeElement).toBe(within(menu).getAllByRole('menuitem')[1])
    fireEvent.keyDown(document.activeElement!, { key: 'Escape' })

    await waitFor(() => expect(document.activeElement).toBe(trigger))
    expect(trigger.getAttribute('aria-expanded')).toBe('false')
  })

  it('renames an own view in place on a double-click: Enter saves', () => {
    const run = actions()
    render(<ViewList table={table} active="planning" onSelect={() => undefined} actions={run} />)

    fireEvent.doubleClick(within(group()).getByRole('button', { name: /^Calais techniek/ }))
    const name = screen.getByRole('textbox', { name: 'Nieuwe naam' }) as HTMLInputElement
    expect(name.value).toBe('Calais techniek')
    fireEvent.change(name, { target: { value: 'Calais licht' } })
    fireEvent.keyDown(name, { key: 'Enter' })

    expect(run.rename).toHaveBeenCalledWith(own, 'Calais licht')
    expect(screen.queryByRole('textbox', { name: 'Nieuwe naam' })).toBeNull()
  })

  it('cancels a rename on Escape, and renames nothing unchanged or blank', () => {
    const run = actions()
    render(<ViewList table={table} active="planning" onSelect={() => undefined} actions={run} />)

    fireEvent.doubleClick(within(group()).getByRole('button', { name: /^Calais techniek/ }))
    fireEvent.change(screen.getByRole('textbox', { name: 'Nieuwe naam' }), { target: { value: 'Calais licht' } })
    fireEvent.keyDown(screen.getByRole('textbox', { name: 'Nieuwe naam' }), { key: 'Escape' })
    expect(within(group()).getByRole('button', { name: /^Calais techniek/ })).toBeTruthy()

    fireEvent.doubleClick(within(group()).getByRole('button', { name: /^Calais techniek/ }))
    fireEvent.change(screen.getByRole('textbox', { name: 'Nieuwe naam' }), { target: { value: '   ' } })
    fireEvent.keyDown(screen.getByRole('textbox', { name: 'Nieuwe naam' }), { key: 'Enter' })
    expect(run.rename).not.toHaveBeenCalled()
  })

  it('renames from the menu in the same place', () => {
    render(<ViewList table={table} active="planning" onSelect={() => undefined} actions={actions()} />)

    fireEvent.click(within(open('Calais techniek')).getByRole('menuitem', { name: 'Naam wijzigen' }))

    expect((screen.getByRole('textbox', { name: 'Nieuwe naam' }) as HTMLInputElement).value).toBe('Calais techniek')
  })

  it('renames nothing in place on a starting view or on another\'s shared view', () => {
    render(<ViewList table={table} active="planning" onSelect={() => undefined} actions={actions()} />)

    fireEvent.doubleClick(within(group()).getByRole('button', { name: /^Tabel/ }))
    fireEvent.doubleClick(within(group()).getByRole('button', { name: /^Ploeg/ }))

    expect(screen.queryByRole('textbox', { name: 'Nieuwe naam' })).toBeNull()
  })
})

describe('ordering the list', () => {
  const dag: View = { ...tabel, key: 'dagplanning', label: 'Dagplanning', table: 'dagplanning' }
  const week: View = { ...dag, key: 'perweek', label: 'Per week' }
  const grouped: Table = { ...table, views: [...table.views, dag, week] }
  const keysOf = () => viewButtons().map((b) => b.textContent)
  const press = (key: string) => {
    fireEvent.keyDown(document.activeElement!, { key })
    fireEvent.keyUp(document.activeElement!, { key })
  }
  const frame = () => act(() => new Promise((done) => requestAnimationFrame(() => done(undefined))))
  /** React Aria's keyboard drag: Enter on the view's drag button, keys to a place (Home and End reach its group's ends), Enter drops. */
  const drag = async (name: string, ...steps: string[]) => {
    // As a keyboard reaches it: the arrows to its row, then Tab; the list takes back a focus that came another way.
    const button = screen.getByRole('button', { name: `Verplaats ${name}` })
    fireEvent.keyDown(document.body, { key: 'Tab' })
    button.closest<HTMLElement>('[role="row"]')!.focus()
    button.focus()
    press('Enter')
    await frame()
    for (const step of steps) press(step)
    await frame()
  }

  it('a view moves within its own group', async () => {
    const run = actions()
    render(<ViewList table={grouped} active="planning" onSelect={() => undefined} actions={run} />)

    await drag('Ploeg', 'Home', 'Enter')

    expect(run.order).toHaveBeenCalledTimes(1)
    expect(run.order).toHaveBeenCalledWith('planning', ['44', 'planning', 'bezetting', '42', '43', '45'])
  })

  it('a view never drops into another group', async () => {
    const run = actions()
    render(<ViewList table={grouped} active="planning" onSelect={() => undefined} actions={run} />)

    await drag('Dagplanning', 'Home', 'Enter')
    await drag('Matrix', 'End', 'Enter')

    for (const [source, keys] of run.order.mock.calls) {
      if (source === 'planning') expect([...keys].sort()).toEqual(['42', '43', '44', '45', 'bezetting', 'planning'])
      else expect(keys).toEqual(['perweek', 'dagplanning'])
    }
    expect(run.order).toHaveBeenCalledWith('planning', ['planning', '42', '43', '44', '45', 'bezetting'])
  })

  it('refuses a drop into another group: the keyboard is never offered a gap outside the group, and nothing is written', async () => {
    const month: View = { ...dag, key: 'permaand', label: 'Per maand' }
    const run = actions()
    render(<ViewList table={{ ...table, views: [...table.views, dag, week, month] }} active="planning" onSelect={() => undefined} actions={run} />)
    const offered = new Set<string>()
    const target = () => {
      const line = document.querySelector<HTMLElement>('.nv-view__drop[data-drop-target]')
      if (line) offered.add(`${line.style.gridRow} ${line.className.includes('--after') ? 'after' : 'before'}`)
    }

    await drag('Per week')
    target()
    for (const key of ['ArrowUp', 'ArrowUp', 'ArrowUp', 'ArrowDown', 'ArrowDown', 'ArrowDown', 'ArrowDown', 'Home', 'End']) {
      fireEvent.keyDown(document.activeElement!, { key })
      fireEvent.keyUp(document.activeElement!, { key })
      await frame()
      target()
    }
    fireEvent.keyDown(document.activeElement!, { key: 'Escape' })
    fireEvent.keyUp(document.activeElement!, { key: 'Escape' })
    await frame()

    // Rows 7 to 9 are the query's views: only the gap above its first view and the one below its last.
    expect([...offered].sort()).toEqual(['7 before', '9 after'])
    expect(run.order).not.toHaveBeenCalled()
  })

  it('a view drops past the last view of its group', async () => {
    const run = actions()
    render(<ViewList table={grouped} active="planning" onSelect={() => undefined} actions={run} />)

    await drag('Tabel', 'End', 'Enter')

    expect(run.order).toHaveBeenCalledWith('planning', ['bezetting', '42', '43', '44', '45', 'planning'])
  })

  it('cancels a drag on Escape, ordering nothing', async () => {
    const run = actions()
    render(<ViewList table={grouped} active="planning" onSelect={() => undefined} actions={run} />)

    await drag('Matrix', 'ArrowDown', 'ArrowDown', 'Escape')

    expect(run.order).not.toHaveBeenCalled()
  })

  it('moves the focused view with Alt+↓ and Alt+↑, and the view keeps the focus in its new place', () => {
    const run = actions()
    const { rerender } = render(<ViewList table={table} active="planning" onSelect={() => undefined} actions={run} />)
    const calais = within(group()).getByRole('button', { name: /^Calais techniek/ })
    calais.focus()

    fireEvent.keyDown(calais, { key: 'ArrowDown', altKey: true })
    expect(run.order).toHaveBeenLastCalledWith('planning', ['planning', 'bezetting', '43', '42', '44', '45'])
    rerender(<ViewList table={{ ...table, views: [tabel, matrix, sharedOwn, own, theirs, marked] }} active="planning" onSelect={() => undefined} actions={run} />)

    expect(keysOf()).toEqual(['Tabel', 'Matrix', 'Montage', 'Calais techniek', 'Ploeg', '<img src=x onerror=alert(1)>'])
    expect(document.activeElement?.textContent).toBe('Calais techniek')
    fireEvent.keyDown(document.activeElement!, { key: 'ArrowUp', altKey: true })
    expect(run.order).toHaveBeenLastCalledWith('planning', ['planning', 'bezetting', '42', '43', '44', '45'])
    fireEvent.keyDown(document.activeElement!, { key: 'ArrowDown' })
    expect(run.order).toHaveBeenCalledTimes(2)
  })

  it('orders nothing without the actions, and adds no button to the group', () => {
    render(<ViewList table={table} active="planning" onSelect={() => undefined} />)

    expect(screen.queryByRole('button', { name: /^Verplaats / })).toBeNull()
    expect(within(group()).getAllByRole('button').map((b) => b.textContent)).toEqual(['Tabel', 'Matrix', 'Calais techniek', 'Montage', 'Ploeg', '<img src=x onerror=alert(1)>'])
  })
})

describe('where a drop lands', () => {
  const all = ['planning', 'bezetting', 'dagplanning', 'perweek']
  const own = ['planning', 'bezetting']
  const query = ['dagplanning', 'perweek']

  it('refuses the first row of another group and any drop on a view', () => {
    expect(landing(all, query, 'perweek', { type: 'item', key: 'bezetting', dropPosition: 'before' })).toBeNull()
    expect(landing(all, query, 'perweek', { type: 'item', key: 'planning', dropPosition: 'before' })).toBeNull()
    expect(landing(all, own, 'planning', { type: 'item', key: 'perweek', dropPosition: 'before' })).toBeNull()
    expect(landing(all, own, 'planning', { type: 'item', key: 'bezetting', dropPosition: 'on' })).toBeNull()
    expect(landing(all, own, 'planning', { type: 'root' })).toBeNull()
  })

  it('counts the gap after a block\'s last view as its own, whichever side names it', () => {
    expect(landing(all, own, 'planning', { type: 'item', key: 'bezetting', dropPosition: 'after' })).toEqual({ key: 'bezetting', edge: 'after' })
    expect(landing(all, own, 'planning', { type: 'item', key: 'dagplanning', dropPosition: 'before' })).toEqual({ key: 'bezetting', edge: 'after' })
    expect(landing(all, query, 'perweek', { type: 'item', key: 'bezetting', dropPosition: 'after' })).toEqual({ key: 'dagplanning', edge: 'before' })
  })

  it('refuses a drop where nothing would move', () => {
    expect(landing(all, own, 'planning', { type: 'item', key: 'planning', dropPosition: 'before' })).toBeNull()
    expect(landing(all, own, 'planning', { type: 'item', key: 'bezetting', dropPosition: 'before' })).toBeNull()
  })
})
