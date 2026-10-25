import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { Search } from './Search'
import { groupTables } from './tables'

const tables = groupTables([
  { key: 'planning', label: 'Planning', model: 'activity', types: ['grid', 'matrix'] },
  { key: 'afwezigheden', label: 'Afwezigheden', model: 'absence', types: ['grid'] },
], [
  { key: 'planning', label: 'Tabel', model: 'activity', table: 'planning', table_label: 'Planning' },
  { key: 'bezetting', label: 'Matrix', model: 'activity', type: 'matrix', table: 'planning', table_label: 'Planning' },
  { key: 'afwezigheden', label: 'Tabel', model: 'absence', table: 'afwezigheden', table_label: 'Afwezigheden' },
])
const options = () => screen.queryAllByRole('button').filter((b) => !b.classList.contains('nv-search__toggle')).map((b) => b.textContent)

afterEach(cleanup)

describe('the search', () => {
  it('opens its field from the icon a narrow toolbar shows, and puts the cursor in it', () => {
    render(<Search query="" onQuery={() => undefined} tables={tables} onJump={() => undefined} />)
    const holder = document.querySelector('.nv-search') as HTMLElement
    expect(holder.hasAttribute('data-open')).toBe(false)

    fireEvent.click(screen.getByRole('button', { name: 'Zoeken' }))

    expect(holder.hasAttribute('data-open')).toBe(true)
    expect(document.activeElement).toBe(screen.getByRole('searchbox', { name: 'Zoeken' }))
  })

  it('names a view of a table with two views as table · view', () => {
    render(<Search query="planning" onQuery={() => undefined} tables={tables} onJump={() => undefined} />)

    expect(options()).toEqual(['Naar Planning · Tabel', 'Naar Planning · Matrix'])
  })

  it('matches a view by its own label', () => {
    render(<Search query="matrix" onQuery={() => undefined} tables={tables} onJump={() => undefined} />)

    expect(options()).toEqual(['Naar Planning · Matrix'])
  })

  it('names the view of a table with one view by the table alone', () => {
    render(<Search query="afwez" onQuery={() => undefined} tables={tables} onJump={() => undefined} />)

    expect(options()).toEqual(['Naar Afwezigheden'])
  })

  it('never offers a view of a dataset the tree leaves out', () => {
    const hidden = groupTables([
      { key: 'ties', label: 'Ties', model: 'tie', types: ['grid'], listed: false },
      { key: 'members', label: 'Members', model: 'member', types: ['grid'] },
    ], [
      { key: 'ties', label: 'Tabel', model: 'tie', table: 'ties', table_label: 'Ties' },
      { key: 'members', label: 'Tabel', model: 'member', table: 'members', table_label: 'Members' },
    ])
    render(<Search query="e" onQuery={() => undefined} tables={hidden} onJump={() => undefined} />)

    expect(options()).toEqual(['Naar Members'])
  })

  it('jumps to the view and clears the query', () => {
    const onJump = vi.fn()
    const onQuery = vi.fn()
    render(<Search query="matrix" onQuery={onQuery} tables={tables} onJump={onJump} />)

    fireEvent.click(screen.getByRole('button', { name: 'Naar Planning · Matrix' }))

    expect(onJump).toHaveBeenCalledWith('bezetting')
    expect(onQuery).toHaveBeenCalledWith('')
  })

  it('finds a saved view by its name, as table · name', () => {
    const saved = { key: '42', label: 'Calais techniek', model: 'activity', table: 'planning', table_label: 'Planning', id: 42 }
    const withSaved = tables.map((table) => (table.key === 'planning' ? { ...table, views: [...table.views, saved] } : table))
    render(<Search query="calais" onQuery={() => undefined} tables={withSaved} onJump={() => undefined} />)

    expect(options()).toEqual(['Naar Planning · Calais techniek'])
  })

  it('shows a saved name with markup as its characters, never as an element (threat 7)', () => {
    const saved = { key: '45', label: '<img src=x onerror=alert(1)>', model: 'activity', table: 'planning', table_label: 'Planning', id: 45 }
    const withSaved = tables.map((table) => (table.key === 'planning' ? { ...table, views: [...table.views, saved] } : table))
    const { container } = render(<Search query="onerror" onQuery={() => undefined} tables={withSaved} onJump={() => undefined} />)

    expect(options()).toEqual(['Naar Planning · <img src=x onerror=alert(1)>'])
    expect(container.querySelector('img')).toBeNull()
  })

  it('reports what is typed, and Escape clears it', () => {
    const onQuery = vi.fn()
    render(<Search query="mat" onQuery={onQuery} tables={tables} onJump={() => undefined} />)
    const field = screen.getByRole('searchbox', { name: 'Zoeken' })

    fireEvent.change(field, { target: { value: 'matr' } })
    expect(onQuery).toHaveBeenLastCalledWith('matr')

    fireEvent.keyDown(field, { key: 'Escape' })
    expect(onQuery).toHaveBeenLastCalledWith('')
  })

  it('takes focus on Ctrl+K and shows the hint', () => {
    render(<Search query="" onQuery={() => undefined} tables={tables} onJump={() => undefined} />)

    fireEvent.keyDown(document.body, { key: 'k', ctrlKey: true })

    expect(document.activeElement).toBe(screen.getByRole('searchbox', { name: 'Zoeken' }))
    expect(screen.getByText('⌘K').tagName).toBe('KBD')
  })
})
