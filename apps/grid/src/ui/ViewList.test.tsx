import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { SavedView, View } from '../types'
import type { Table } from './tables'
import { ViewList } from './ViewList'

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
const marked = saved(45, '<img src=x onerror=alert(1)>')
const table: Table = { key: 'planning', label: 'Planning', space: 'scoped', views: [tabel, matrix, own, sharedOwn, theirs, marked] }

const group = () => screen.getByRole('group', { name: 'View type' })
const actions = () => ({ rename: vi.fn(), duplicate: vi.fn(), remove: vi.fn(), share: vi.fn(), order: vi.fn() })
const menuOf = (name: string) => screen.getByRole('button', { name: `More actions: ${name}` })
const open = (name: string) => {
  fireEvent.click(menuOf(name))
  return screen.getByRole('menu', { name: 'More actions' })
}
const choices = (name: string) => within(open(name)).getAllByRole('menuitem').map((item) => item.textContent)
const item = (name: string) => within(group()).getByRole('button', { name: new RegExp(`^${name}`) }).parentElement!

afterEach(cleanup)

describe('the views list', () => {
  it('holds one button per view and the disabled calendar in its group, the new view outside it', () => {
    render(<ViewList table={table} active="planning" onSelect={() => undefined} onNew={() => undefined} />)
    const buttons = within(group()).getAllByRole('button')

    expect(buttons.map((b) => b.textContent)).toEqual(['Tabel', 'Matrix', 'Calais techniek', 'Montage', 'Ploeg', '<img src=x onerror=alert(1)>', 'Calendarsoon'])
    expect((buttons.at(-1) as HTMLButtonElement).disabled).toBe(true)
    const add = screen.getByRole('button', { name: '+ View' })
    expect(group().contains(add)).toBe(false)
  })

  it('has no new-view button without its handler', () => {
    render(<ViewList table={table} active="planning" onSelect={() => undefined} />)

    expect(screen.queryByRole('button', { name: '+ View' })).toBeNull()
  })

  it('marks only an own view that is not shared as mine; a shared one as shared', () => {
    render(<ViewList table={table} active="planning" onSelect={() => undefined} />)

    expect(within(item('Calais techniek')).getByRole('img', { name: 'Mine' })).toBeTruthy()
    for (const name of ['Tabel', 'Matrix', 'Montage', 'Ploeg']) expect(within(item(name)).queryByRole('img', { name: 'Mine' })).toBeNull()
    expect(within(item('Montage')).getByRole('img', { name: 'Shared with the team' })).toBeTruthy()
    expect(within(item('Ploeg')).getByRole('img', { name: 'Shared with the team' })).toBeTruthy()
    expect(within(item('Tabel')).queryByRole('img')).toBeNull()
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

  it('keeps every ⋯ out of the view type group: it holds the view buttons and the calendar only', () => {
    render(<ViewList table={table} active="planning" onSelect={() => undefined} onNew={() => undefined} actions={actions()} />)

    expect(within(group()).getAllByRole('button').map((b) => b.textContent)).toEqual(['Tabel', 'Matrix', 'Calais techniek', 'Montage', 'Ploeg', '<img src=x onerror=alert(1)>', 'Calendarsoon'])
    expect(group().contains(menuOf('Calais techniek'))).toBe(false)
  })

  it('offers rename, duplicate, share, move up and down and delete on an own view', () => {
    render(<ViewList table={table} active="planning" onSelect={() => undefined} actions={actions()} />)

    expect(choices('Calais techniek')).toEqual(['Rename', 'Duplicate', 'Share with the team', 'Move up', 'Move down', 'Remove'])
  })

  it('offers unshare on an own shared view', () => {
    render(<ViewList table={table} active="planning" onSelect={() => undefined} actions={actions()} />)

    expect(choices('Montage')).toContain('Only for me')
  })

  it('offers only duplicate on a starting view and on another\'s shared view', () => {
    render(<ViewList table={table} active="planning" onSelect={() => undefined} actions={actions()} />)

    expect(choices('Tabel')).toEqual(['Duplicate'])
    cleanup()
    render(<ViewList table={table} active="planning" onSelect={() => undefined} actions={actions()} />)
    expect(choices('Ploeg')).toEqual(['Duplicate'])
  })

  it('offers an administrator rename and delete on a shared view of another', () => {
    render(<ViewList table={withAdmin} active="planning" onSelect={() => undefined} actions={actions()} />)

    expect(choices('Bezetting Jan')).toEqual(['Rename', 'Duplicate', 'Remove'])
  })

  it('offers no move up on the first view of the list and no move down on the last', () => {
    const first: Table = { ...table, views: [own, tabel, sharedOwn] }
    render(<ViewList table={first} active="planning" onSelect={() => undefined} actions={actions()} />)

    expect(choices('Calais techniek')).not.toContain('Move up')
    cleanup()
    render(<ViewList table={first} active="planning" onSelect={() => undefined} actions={actions()} />)
    expect(choices('Montage')).not.toContain('Move down')
  })

  it('runs the chosen action on its view', () => {
    const run = actions()
    render(<ViewList table={table} active="planning" onSelect={() => undefined} actions={run} />)

    fireEvent.click(within(open('Calais techniek')).getByRole('menuitem', { name: 'Duplicate' }))
    expect(run.duplicate).toHaveBeenCalledWith(own)
    fireEvent.click(within(open('Calais techniek')).getByRole('menuitem', { name: 'Move up' }))
    expect(run.order).toHaveBeenCalledWith('planning', ['planning', '42', 'bezetting', '43', '44', '45'])
    fireEvent.click(within(open('Montage')).getByRole('menuitem', { name: 'Only for me' }))
    expect(run.share).toHaveBeenCalledWith(sharedOwn, false)
    fireEvent.click(within(open('Calais techniek')).getByRole('menuitem', { name: 'Remove' }))
    expect(run.remove).toHaveBeenCalledWith(own)
  })

  it('is keyboard-operable: the menu says it is open, Escape closes it and gives focus back to ⋯', () => {
    render(<ViewList table={table} active="planning" onSelect={() => undefined} actions={actions()} />)
    const trigger = menuOf('Calais techniek')
    trigger.focus()

    expect(trigger.getAttribute('aria-expanded')).toBe('false')
    const menu = open('Calais techniek')
    expect(trigger.getAttribute('aria-expanded')).toBe('true')
    expect(document.activeElement).toBe(within(menu).getAllByRole('menuitem')[0])
    fireEvent.keyDown(document.activeElement!, { key: 'ArrowDown' })
    expect(document.activeElement).toBe(within(menu).getAllByRole('menuitem')[1])
    fireEvent.keyDown(document.activeElement!, { key: 'Escape' })

    expect(trigger.getAttribute('aria-expanded')).toBe('false')
    expect(document.activeElement).toBe(trigger)
  })

  it('renames an own view in place on a double-click: Enter saves', () => {
    const run = actions()
    render(<ViewList table={table} active="planning" onSelect={() => undefined} actions={run} />)

    fireEvent.doubleClick(within(group()).getByRole('button', { name: /^Calais techniek/ }))
    const name = screen.getByRole('textbox', { name: 'Rename' }) as HTMLInputElement
    expect(name.value).toBe('Calais techniek')
    fireEvent.change(name, { target: { value: 'Calais licht' } })
    fireEvent.keyDown(name, { key: 'Enter' })

    expect(run.rename).toHaveBeenCalledWith(own, 'Calais licht')
    expect(screen.queryByRole('textbox', { name: 'Rename' })).toBeNull()
  })

  it('cancels a rename on Escape, and renames nothing unchanged or blank', () => {
    const run = actions()
    render(<ViewList table={table} active="planning" onSelect={() => undefined} actions={run} />)

    fireEvent.doubleClick(within(group()).getByRole('button', { name: /^Calais techniek/ }))
    fireEvent.change(screen.getByRole('textbox', { name: 'Rename' }), { target: { value: 'Calais licht' } })
    fireEvent.keyDown(screen.getByRole('textbox', { name: 'Rename' }), { key: 'Escape' })
    expect(within(group()).getByRole('button', { name: /^Calais techniek/ })).toBeTruthy()

    fireEvent.doubleClick(within(group()).getByRole('button', { name: /^Calais techniek/ }))
    fireEvent.change(screen.getByRole('textbox', { name: 'Rename' }), { target: { value: '   ' } })
    fireEvent.keyDown(screen.getByRole('textbox', { name: 'Rename' }), { key: 'Enter' })
    expect(run.rename).not.toHaveBeenCalled()
  })

  it('renames from the menu in the same place', () => {
    render(<ViewList table={table} active="planning" onSelect={() => undefined} actions={actions()} />)

    fireEvent.click(within(open('Calais techniek')).getByRole('menuitem', { name: 'Rename' }))

    expect((screen.getByRole('textbox', { name: 'Rename' }) as HTMLInputElement).value).toBe('Calais techniek')
  })

  it('renames nothing in place on a starting view or on another\'s shared view', () => {
    render(<ViewList table={table} active="planning" onSelect={() => undefined} actions={actions()} />)

    fireEvent.doubleClick(within(group()).getByRole('button', { name: /^Tabel/ }))
    fireEvent.doubleClick(within(group()).getByRole('button', { name: /^Ploeg/ }))

    expect(screen.queryByRole('textbox', { name: 'Rename' })).toBeNull()
  })
})

describe('ordering the list', () => {
  const ROW = 28
  const middle = (row: number) => row * ROW + ROW / 2
  const keysOf = () => within(group()).getAllByRole('button').map((b) => b.textContent)
  const press = (name: string, y: number) => fireEvent.pointerDown(item(name), { button: 0, clientY: y })

  beforeEach(() => {
    // jsdom lays nothing out: each row is ROW tall at its grid row.
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
      const top = (Number(this.style.gridRow) - 1) * ROW
      return { top, bottom: top + ROW, height: ROW, left: 0, right: 200, width: 200, x: 0, y: top, toJSON: () => ({}) } as DOMRect
    })
  })
  afterEach(() => vi.restoreAllMocks())

  it('drags a view to the edge of the row the pointer is nearest, a line showing where it lands', () => {
    const run = actions()
    render(<ViewList table={table} active="planning" onSelect={() => undefined} actions={run} />)

    press('Ploeg', middle(4))
    fireEvent.pointerMove(window, { clientY: middle(0) - 4 })
    expect(item('Tabel').className).toContain('nv-view--drop-before')
    expect(item('Ploeg').className).toContain('nv-view--dragging')
    fireEvent.pointerUp(window, { clientY: middle(0) - 4 })

    expect(run.order).toHaveBeenCalledWith('planning', ['44', 'planning', 'bezetting', '42', '43', '45'])
    expect(item('Tabel').className).not.toContain('nv-view--drop')
  })

  it('drops after the last view below every row, and selects nothing with the click a drag ends on', () => {
    const run = actions()
    const onSelect = vi.fn()
    render(<ViewList table={table} active="planning" onSelect={onSelect} actions={run} />)

    press('Tabel', middle(0))
    fireEvent.pointerMove(window, { clientY: middle(5) + 6 })
    expect(item('<img src=x onerror=alert\\(1\\)>').className).toContain('nv-view--drop-after')
    fireEvent.pointerUp(window, { clientY: middle(5) + 6 })
    fireEvent.click(within(group()).getByRole('button', { name: /^Tabel/ }))

    expect(run.order).toHaveBeenCalledWith('planning', ['bezetting', '42', '43', '44', '45', 'planning'])
    expect(onSelect).not.toHaveBeenCalled()
  })

  it('keeps a press that hardly moves a click, shows no line where nothing would move, and Escape cancels', () => {
    const run = actions()
    render(<ViewList table={table} active="planning" onSelect={() => undefined} actions={run} />)

    press('Matrix', middle(1))
    fireEvent.pointerMove(window, { clientY: middle(1) + 3 })
    fireEvent.pointerUp(window, { clientY: middle(1) + 3 })
    press('Matrix', middle(1))
    fireEvent.pointerMove(window, { clientY: middle(2) - 6 })
    expect(document.querySelector('[class*="nv-view--drop"]')).toBeNull()
    fireEvent.pointerMove(window, { clientY: middle(3) + 6 })
    fireEvent.keyDown(window, { key: 'Escape' })
    fireEvent.pointerUp(window, { clientY: middle(3) + 6 })

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

    expect(keysOf()).toEqual(['Tabel', 'Matrix', 'Montage', 'Calais techniek', 'Ploeg', '<img src=x onerror=alert(1)>', 'Calendarsoon'])
    expect(document.activeElement?.textContent).toBe('Calais techniek')
    fireEvent.keyDown(document.activeElement!, { key: 'ArrowUp', altKey: true })
    expect(run.order).toHaveBeenLastCalledWith('planning', ['planning', 'bezetting', '42', '43', '44', '45'])
    fireEvent.keyDown(document.activeElement!, { key: 'ArrowDown' })
    expect(run.order).toHaveBeenCalledTimes(2)
  })

  it('orders nothing without the actions, and adds no button to the group', () => {
    render(<ViewList table={table} active="planning" onSelect={() => undefined} />)

    press('Ploeg', middle(4))
    fireEvent.pointerMove(window, { clientY: 0 })
    fireEvent.pointerUp(window, { clientY: 0 })

    expect(document.querySelector('.nv-view--dragging')).toBeNull()
    expect(keysOf()).toEqual(['Tabel', 'Matrix', 'Calais techniek', 'Montage', 'Ploeg', '<img src=x onerror=alert(1)>', 'Calendarsoon'])
  })
})
