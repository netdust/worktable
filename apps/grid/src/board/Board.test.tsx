import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { defaults, type Layout } from '../grid/layout'
import type { Model, Row, View } from '../types'
import { Board } from './Board'
import type { Drop } from './drop'

afterEach(cleanup)

const model = {
  key: 'activiteit', label: 'Activiteiten', title_label: 'Omschrijving', title_readonly: false,
  fields: { status: { type: 'select', label: 'Status', required: true, fact: false, options: { optie: 'Optie', bevestigd: 'Bevestigd' } } },
} as unknown as Model
const view = { key: 'b', label: 'Per status', table: 'activiteit', model: 'activiteit', type: 'board', board: { column: 'status' } } as unknown as View
const row = (id: number, title: string, status: string, position?: string): Row => ({ id, title, status: '', fields: { status, ...(position ? { position } : {}) } })
const manual: Layout = { ...defaults(view), sort: [{ id: 'position', desc: false }] }
const sorted: Layout = { ...defaults(view), sort: [{ id: 'plandag', desc: false }] }
const board = (props: Partial<Parameters<typeof Board>[0]> = {}) =>
  render(<Board view={view} model={model} models={{}} rows={[row(1, 'Repetitie', 'optie')]} column="status" layout={defaults(view)} {...props} />)

const KEYS: Record<string, string> = { Space: ' ', ArrowUp: 'ArrowUp', ArrowDown: 'ArrowDown', ArrowLeft: 'ArrowLeft', ArrowRight: 'ArrowRight', Escape: 'Escape' }

const card = (title: string) => screen.getByRole('button', { name: new RegExp(title) })
const order = (column: string) => within(screen.getByRole('region', { name: column })).getAllByRole('button').map((b) => b.querySelector('.nv-board__title')?.textContent)

/** Keys pressed on the card as dnd-kit's keyboard sensor reads them: it listens on the document one macrotask after the lift. */
async function press(title: string, ...codes: string[]) {
  const target = card(title)
  for (const code of codes) {
    fireEvent.keyDown(target, { code, key: KEYS[code] })
    await act(() => new Promise((resolve) => setTimeout(resolve, 0)))
  }
}

function later() {
  let answer: (landed: boolean) => void = () => undefined
  const promise = new Promise<boolean>((resolve) => (answer = resolve))
  return { promise, answer }
}

describe('the board', () => {
  it('shows every option as a column, an empty one with its empty text', () => {
    board()
    expect(screen.getAllByRole('region').map((g) => g.getAttribute('aria-label'))).toEqual(['Optie', 'Bevestigd'])
    expect(within(screen.getByRole('region', { name: 'Bevestigd' })).getByText('Geen activiteiten')).toBeTruthy()
  })

  it('creates in a column with that column\'s value from its head\'s +', () => {
    const onCreate = vi.fn()
    board({ onCreate })
    fireEvent.click(screen.getByRole('button', { name: 'Nieuw in Bevestigd' }))
    expect(onCreate).toHaveBeenCalledWith({ status: 'bevestigd' })
  })

  it('opens a card\'s row with Enter, and with a click', () => {
    board({ onDrop: vi.fn() })
    fireEvent.keyDown(card('Repetitie'), { code: 'Enter', key: 'Enter' })
    expect(screen.getByRole('complementary', { name: 'Repetitie' })).toBeTruthy()
    cleanup()
    board()
    fireEvent.click(card('Repetitie'))
    expect(screen.getByRole('complementary', { name: 'Repetitie' })).toBeTruthy()
  })
})

describe('a keyboard drag on a manual board', () => {
  const rows = [row(1, 'Repetitie', 'optie', '1'), row(2, 'Opbouw', 'optie', '2'), row(3, 'Afbraak', 'optie', '3'), row(4, 'Voorstelling', 'bevestigd', '1')]

  it('places a card one down: its rank falls between the card it passed and the next', async () => {
    const onDrop = vi.fn((_drop: Drop, _id: number) => Promise.resolve(true))
    board({ rows, layout: manual, onDrop })
    await press('Repetitie', 'Space', 'ArrowDown', 'Space')
    expect(onDrop).toHaveBeenCalledTimes(1)
    const [drop, id] = onDrop.mock.calls[0]
    expect(id).toBe(1)
    expect(drop).toMatchObject({ kind: 'place', ranks: [], manual: true })
    const position = (drop as Extract<Drop, { kind: 'place' }>).position
    expect(position > '2' && position < '3').toBe(true)
  })

  it('places a card in the column to its left with that column\'s value', async () => {
    const onDrop = vi.fn((_drop: Drop, _id: number) => Promise.resolve(true))
    board({ rows, layout: manual, onDrop })
    await press('Voorstelling', 'Space', 'ArrowLeft', 'Space')
    expect(onDrop).toHaveBeenCalledWith(expect.objectContaining({ kind: 'place', value: 'optie', manual: true }), 4)
    expect((onDrop.mock.calls[0][0] as Extract<Drop, { kind: 'place' }>).position < '1').toBe(true)
  })

  it('orders each column by its ranks', () => {
    board({ rows: [row(1, 'Repetitie', 'optie', '3'), row(2, 'Opbouw', 'optie'), row(3, 'Afbraak', 'optie', '1')], layout: manual, onDrop: vi.fn() })
    expect(order('Optie')).toEqual(['Afbraak', 'Repetitie', 'Opbouw'])
  })
})

describe('a keyboard drag on a sorted board', () => {
  const rows = [row(1, 'Repetitie', 'optie'), row(2, 'Opbouw', 'optie'), row(3, 'Afbraak', 'optie'), row(4, 'Voorstelling', 'bevestigd')]

  it('places the card at its slot at once, then switches the view to manual once the writes landed', async () => {
    const answer = later()
    const onDrop = vi.fn((_drop: Drop, _id: number) => answer.promise)
    const onLayout = vi.fn()
    board({ rows, layout: sorted, onDrop, onLayout })
    await press('Repetitie', 'Space', 'ArrowDown', 'Space')
    expect(onDrop).toHaveBeenCalledWith(expect.objectContaining({ kind: 'place', manual: false }), 1)
    expect(order('Optie')).toEqual(['Opbouw', 'Repetitie', 'Afbraak'])
    expect(onLayout).not.toHaveBeenCalled()
    await act(async () => answer.answer(true))
    expect(onLayout).toHaveBeenCalledWith({ ...sorted, sort: [{ id: 'position', desc: false }, { id: 'plandag', desc: false }] })
  })

  it('keeps the sort and puts the column back when the drop is refused', async () => {
    const onLayout = vi.fn()
    board({ rows, layout: sorted, onDrop: vi.fn(() => Promise.resolve(false)), onLayout })
    await press('Repetitie', 'Space', 'ArrowDown', 'Space')
    expect(onLayout).not.toHaveBeenCalled()
    expect(order('Optie')).toEqual(['Repetitie', 'Opbouw', 'Afbraak'])
  })

  it('regroups a card dropped in another column and leaves the sort', async () => {
    const onDrop = vi.fn((_drop: Drop, _id: number) => Promise.resolve(true))
    const onLayout = vi.fn()
    board({ rows, layout: sorted, onDrop, onLayout })
    await press('Voorstelling', 'Space', 'ArrowLeft', 'Space')
    expect(onDrop).toHaveBeenCalledWith({ kind: 'regroup', value: 'optie' }, 4)
    expect(onLayout).not.toHaveBeenCalled()
  })

  it('writes nothing for a card put back on its own place, or a drag cancelled with Escape', async () => {
    const onDrop = vi.fn((_drop: Drop, _id: number) => Promise.resolve(true))
    const onLayout = vi.fn()
    board({ rows, layout: sorted, onDrop, onLayout })
    await press('Repetitie', 'Space', 'Space')
    await press('Opbouw', 'Space', 'ArrowDown', 'Escape')
    expect(onDrop).not.toHaveBeenCalled()
    expect(onLayout).not.toHaveBeenCalled()
    expect(order('Optie')).toEqual(['Repetitie', 'Opbouw', 'Afbraak'])
  })
})

describe('the drag in words and keys', () => {
  it('announces the lift in Dutch with the card\'s title', async () => {
    board({ onDrop: vi.fn(() => Promise.resolve(true)) })
    await press('Repetitie', 'Space')
    expect(screen.getByRole('status').textContent).toBe('Repetitie opgepakt in Optie, plaats 1 van 1.')
  })

  it('lifts nothing where the board cannot write', async () => {
    board()
    await press('Repetitie', 'Space')
    expect(screen.queryByText(/opgepakt/)).toBeNull()
    expect(card('Repetitie').className).not.toContain('nv-board__card--slot')
  })
})
