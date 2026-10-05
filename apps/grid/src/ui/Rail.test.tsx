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
  { key: 'toewijzingen', label: 'Toewijzingen', model: 'assignment', space: 'global', types: ['grid'] },
], [
  { key: 'planning', label: 'Tabel', model: 'activity', space: 'scoped', table: 'planning', table_label: 'Planning' },
  { key: 'bezetting', label: 'Matrix', model: 'activity', type: 'matrix', space: 'scoped', table: 'planning', table_label: 'Planning' },
  { key: 'afwezigheden', label: 'Tabel', model: 'absence', space: 'global', table: 'afwezigheden', table_label: 'Afwezigheden' },
  { key: 'toewijzingen', label: 'Tabel', model: 'assignment', space: 'global', table: 'toewijzingen', table_label: 'Toewijzingen' },
])
const rail = () => screen.getByRole('navigation', { name: 'Views' })
const types = () => within(rail()).getByRole('group', { name: 'View type' })
/** The rail's table entries: every rail button outside the views list. */
const tableButtons = () => within(rail()).getAllByRole('button').filter((b) => !types().contains(b))
const entries = () => tableButtons().map((b) => b.textContent)
const entry = (name: string) => tableButtons().find((b) => b.textContent === name)!

afterEach(() => {
  cleanup()
  document.getElementById('ntdst-views-root')?.remove()
})

describe('the rail', () => {
  it('lists one entry per table: the scoped ones first, then General, none named after a matrix view', () => {
    render(<Rail tables={spaced} active="planning" onSelect={() => undefined} space={<h2>Glimworm</h2>} />)
    const general = within(rail()).getByRole('group', { name: 'General' })

    expect(entries()).toEqual(['Planning', 'Afwezigheden', 'Toewijzingen'])
    expect(within(general).getAllByRole('button').map((b) => b.textContent)).toEqual(['Afwezigheden', 'Toewijzingen'])
    expect(within(rail()).queryByRole('button', { name: 'Bezetting' })).toBeNull()
  })

  it('marks the active table when the active view belongs to it', () => {
    const { rerender } = render(<Rail tables={spaced} active="planning" onSelect={() => undefined} space={<h2>H</h2>} />)
    expect(entry('Planning').getAttribute('aria-current')).toBe('page')

    rerender(<Rail tables={spaced} active="bezetting" onSelect={() => undefined} space={<h2>H</h2>} />)
    expect(entry('Planning').getAttribute('aria-current')).toBe('page')
    expect(entry('Afwezigheden').getAttribute('aria-current')).toBeNull()
  })

  it("selects another table's first view, and does nothing on the active table", () => {
    const onSelect = vi.fn()
    render(<Rail tables={spaced} active="bezetting" onSelect={onSelect} space={<h2>H</h2>} />)

    fireEvent.click(entry('Planning'))
    expect(onSelect).not.toHaveBeenCalled()

    fireEvent.click(entry('Toewijzingen'))
    expect(onSelect).toHaveBeenCalledWith('toewijzingen')
  })

  it("lists the active table's views under Views by their own labels, and switches between them", () => {
    const onSelect = vi.fn()
    render(<Rail tables={spaced} active="planning" onSelect={onSelect} space={<h2>H</h2>} />)

    expect(within(types()).getAllByRole('button').map((b) => b.textContent)).toEqual(['Tabel', 'Matrix', 'Calendarsoon'])
    expect(within(types()).getByRole('button', { name: 'Tabel' }).getAttribute('aria-current')).toBe('page')
    expect(within(types()).getByRole('button', { name: 'Matrix' }).querySelector('.lucide-grid3x3, .lucide-grid-3x3')).toBeTruthy()
    expect(within(types()).getByRole('button', { name: 'Tabel' }).querySelector('.lucide-table')).toBeTruthy()

    fireEvent.click(within(types()).getByRole('button', { name: 'Matrix' }))
    expect(onSelect).toHaveBeenCalledWith('bezetting')
  })

  it('leaves Calendar the only disabled item, and shows no Matrix item on a table without one', () => {
    render(<Rail tables={spaced} active="afwezigheden" onSelect={() => undefined} space={<h2>H</h2>} />)

    const items = within(types()).getAllByRole('button')
    expect(items.map((b) => b.textContent)).toEqual(['Tabel', 'Calendarsoon'])
    expect(items.filter((b) => (b as HTMLButtonElement).disabled).map((b) => b.textContent)).toEqual(['Calendarsoon'])
    expect(within(types()).queryByRole('button', { name: /^Matrix/ })).toBeNull()
  })

  it('lists the one view of a table with one view', () => {
    render(<Rail tables={spaced} active="toewijzingen" onSelect={() => undefined} space={<h2>H</h2>} />)

    const item = within(types()).getByRole('button', { name: 'Tabel' })
    expect(item.getAttribute('aria-current')).toBe('page')
    expect((item as HTMLButtonElement).disabled).toBe(false)
  })

  it('names each view of a site that declares no tables twice: as its table, and under Views', () => {
    render(<Rail tables={groupTables(plainTables, plain)} active="planning" onSelect={() => undefined} />)

    expect(entries()).toEqual(['Planning', 'Absences'])
    expect(within(types()).getAllByRole('button').map((b) => b.textContent)).toEqual(['Planning', 'Calendarsoon'])
    const calendar = within(types()).getByRole('button', { name: /^Calendar/ })
    expect((calendar as HTMLButtonElement).disabled).toBe(true)
  })

  it('carries the keyboard hints and the theme in its foot', () => {
    const root = Object.assign(document.createElement('div'), { id: 'ntdst-views-root' })
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
