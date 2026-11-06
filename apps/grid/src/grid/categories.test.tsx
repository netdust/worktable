import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { Board } from '../board/Board'
import type { Field, Model, Row, View } from '../types'
import { FinishedChip } from '../ui/FinishedChip'
import { SkinChips } from '../ui/SkinChips'
import { defaults } from './layout'
import { categoriesFieldOf, categoryOf, hideFinished } from './categories'
import { CategoryMark } from './CategoryMark'
import { columnsFor } from './columns'
import { Display } from './cells'

vi.mock('../api', async (original) => ({ ...(await original<typeof import('../api')>()), rowsWhere: vi.fn(() => Promise.resolve({ rows: [], total: 0 })), recordHistory: vi.fn(() => Promise.resolve([])) }))

afterEach(cleanup)

const status: Field = {
  type: 'select', label: 'Status', required: true, fact: false,
  options: { todo: 'Te doen', bezig: 'Bezig', klaar: 'Klaar', geschrapt: 'Geschrapt' },
  categories: { todo: 'open', bezig: 'active', klaar: 'done', geschrapt: 'cancelled' },
}
const model = { key: 'taak', label: 'Taken', title_label: 'Titel', title_readonly: false, fields: { status } } as unknown as Model
const plain = { ...model, fields: { status: { ...status, categories: undefined } } } as unknown as Model
const row = (id: number, title: string, value: string | null): Row => ({ id, title, status: '', fields: { status: value } })
const rows = [row(1, 'a', 'todo'), row(2, 'b', 'klaar'), row(3, 'c', 'geschrapt'), row(4, 'd', 'oud'), row(5, 'e', null)]

describe('categoryOf', () => {
  it('names the category of an option, and nothing for a stale or empty value', () => {
    expect(categoryOf(status, 'bezig')).toBe('active')
    expect(categoryOf(status, 'oud')).toBeUndefined()
    expect(categoryOf(status, null)).toBeUndefined()
    expect(categoryOf({ ...status, categories: undefined }, 'klaar')).toBeUndefined()
  })
  it('reads the categories column off the served model', () => {
    expect(categoriesFieldOf(model)).toBe('status')
    expect(categoriesFieldOf(plain)).toBeUndefined()
  })
})

describe('hideFinished', () => {
  const titles = (list: Row[]) => list.map((r) => r.title)
  it('drops done and cancelled rows on the skins that hide, keeping stale and empty values', () => {
    for (const skin of ['calendar', 'timeline', 'gallery', 'matrix'] as const) expect(titles(hideFinished(model, rows, false, skin))).toEqual(['a', 'd', 'e'])
  })
  it('leaves the grid, the board, a plain model and a shown choice alone', () => {
    expect(hideFinished(model, rows, false, 'grid')).toBe(rows)
    expect(hideFinished(model, rows, false, 'board')).toBe(rows)
    expect(hideFinished(plain, rows, false, 'calendar')).toBe(rows)
    expect(hideFinished(model, rows, true, 'calendar')).toBe(rows)
  })
})

const tableView = { key: 't', label: 'Taken', table: 'taak', model: 'taak', type: 'grid' } as unknown as View

describe('the mark beside a status', () => {
  const column = columnsFor(model, tableView).find((c) => c.id === 'status')!
  it('shows in a cell before the tone pill, and not on a column without categories', () => {
    const { container } = render(<Display column={column} row={rows[1]} onToggle={() => undefined} />)
    expect(container.querySelector('[data-category="done"]')).not.toBeNull()
    cleanup()
    const bare = columnsFor(plain, tableView).find((c) => c.id === 'status')!
    const again = render(<Display column={bare} row={rows[1]} onToggle={() => undefined} />)
    expect(again.container.querySelector('[data-category]')).toBeNull()
  })
  it('shows on a board card that is grouped by another field', () => {
    const grouped = { ...model, fields: { ...model.fields, prio: { type: 'select', label: 'Prio', required: false, fact: false, options: { hoog: 'Hoog' } } } } as unknown as Model
    const view = { key: 'b', label: 'Bord', table: 'taak', model: 'taak', type: 'board', board: { column: 'prio' } } as unknown as View
    const card = { ...rows[0], fields: { status: 'todo', prio: 'hoog' } }
    render(<Board view={view} model={grouped} models={{}} rows={[card]} column="prio" layout={defaults(view)} />)
    expect(screen.getByRole('button', { name: /a/ }).querySelector('[data-category="open"]')).not.toBeNull()
  })
})

describe('CategoryMark', () => {
  it('draws a distinct shape for each category', () => {
    const shapes = (['open', 'active', 'done', 'cancelled'] as const).map((category) => render(<CategoryMark category={category} />).container.innerHTML)
    expect(new Set(shapes).size).toBe(4)
  })
})

describe('Afgerond tonen', () => {
  const gallery = { key: 'g', label: 'Galerij', table: 'taak', model: 'taak', type: 'gallery' } as unknown as View
  const chips = (skin: View['type'], on = false) => (
    <SkinChips view={{ ...gallery, type: skin }} model={model} size="M" onSize={() => undefined} away={on} onAway={() => undefined} finished={on} onFinished={() => undefined} archived={false} onArchived={() => undefined} />
  )
  it('sits beside the gallery sizes', () => {
    render(chips('gallery'))
    expect(screen.getByRole('radiogroup', { name: 'Kaartgrootte' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Afgerond tonen' })).toBeTruthy()
  })
  it('shows on a calendar, never on the grid or the board', () => {
    render(chips('calendar'))
    expect(screen.getByRole('button', { name: 'Afgerond tonen' })).toBeTruthy()
    for (const skin of ['grid', 'board'] as const) {
      cleanup()
      const { container } = render(chips(skin))
      expect(container.textContent).not.toContain('Afgerond tonen')
    }
  })
  it('presses on and off', () => {
    const onToggle = vi.fn()
    render(<FinishedChip on={false} onToggle={onToggle} />)
    fireEvent.click(screen.getByRole('button', { name: 'Afgerond tonen' }))
    expect(onToggle).toHaveBeenCalled()
  })
})
