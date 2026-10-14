import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { defaults } from '../grid/layout'
import type { Model, Row, View } from '../types'
import { Board } from './Board'

afterEach(cleanup)

const model = {
  key: 'activiteit', label: 'Activiteiten', title_label: 'Omschrijving', title_readonly: false,
  fields: { status: { type: 'select', label: 'Status', required: true, fact: false, options: { optie: 'Optie', bevestigd: 'Bevestigd' } } },
} as unknown as Model
const view = { key: 'b', label: 'Per status', table: 'activiteit', model: 'activiteit', type: 'board', board: { column: 'status' } } as unknown as View
const row = (id: number, title: string, status: string): Row => ({ id, title, status: '', fields: { status } })
const board = (props: Partial<Parameters<typeof Board>[0]> = {}) =>
  render(<Board view={view} model={model} models={{}} rows={[row(1, 'Repetitie', 'optie')]} column="status" layout={defaults(view)} {...props} />)

describe('the board', () => {
  it('shows every option as a column, an empty one with its empty text', () => {
    board()
    expect(screen.getAllByRole('grid').map((g) => g.getAttribute('aria-label'))).toEqual(['Optie', 'Bevestigd'])
    expect(within(screen.getByRole('grid', { name: 'Bevestigd' })).getByText('Geen activiteiten')).toBeTruthy()
  })

  it('gives each card a drag handle where the board writes, and none where it cannot', () => {
    board({ onMove: vi.fn() })
    expect(screen.getByRole('button', { name: 'Repetitie verslepen' })).toBeTruthy()
    cleanup()
    board()
    expect(screen.queryByRole('button', { name: 'Repetitie verslepen' })).toBeNull()
  })

  it('creates in a column with that column\'s value from its head\'s +', () => {
    const onCreate = vi.fn()
    board({ onCreate })
    fireEvent.click(screen.getByRole('button', { name: 'Nieuw in Bevestigd' }))
    expect(onCreate).toHaveBeenCalledWith({ status: 'bevestigd' })
  })

  it('opens a card\'s row with Enter', () => {
    board()
    const card = screen.getByRole('row', { name: /Repetitie/ })
    fireEvent.keyDown(card, { key: 'Enter' })
    fireEvent.keyUp(card, { key: 'Enter' })
    expect(screen.getByRole('complementary', { name: 'Repetitie' })).toBeTruthy()
  })
})
