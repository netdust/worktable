import { cleanup, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { renderNl } from '../../test-setup'
import { activity, calais, planning } from '../calais.test.data'
import type { Column } from '../columns'
import { columnsFor } from '../columns'
import { SelectCell, SelectEditor } from './Select'

const column = (id: string) => columnsFor(activity, planning).find((c) => c.id === id)!
const at = (status: string, kind = 'meal') => ({ ...calais[2], fields: { ...calais[2].fields, status, kind } })

afterEach(cleanup)

describe('a select cell', () => {
  it('is a pill toned by what its option means in a column keyed status: confirmed green, an option amber, cancelled red', () => {
    const tone = (status: string) => render(<SelectCell column={column('status')} row={at(status)} />).container.querySelector('.nv-pill')?.className

    expect(tone('confirmed')).toContain('nv-pill--ok')
    expect(tone('option')).toContain('nv-pill--warn')
    expect(tone('cancelled')).toContain('nv-pill--bad')
  })

  it('is a dot in its tone, never a pill, in any other select column', () => {
    const other = { ...column('status'), id: 'state' }
    const { container } = render(<SelectCell column={other} row={at('cancelled')} />)

    expect(container.querySelector('.nv-pill')).toBeNull()
    expect(container.querySelector('.nv-dot')?.className).toBe('nv-dot nv-dot--bad')
  })

  it('leaves an option without a meaning neutral', () => {
    const { container } = render(<SelectCell column={column('settled_by')} row={{ ...calais[2], fields: { ...calais[2].fields, settled_by: 'company' } }} />)

    expect(container.querySelector('.nv-dot')?.className).toBe('nv-dot')
    expect(container.textContent).toBe('Gezelschap')
  })

  it('shows a kind with its icon, beside its word', () => {
    const { container } = render(<SelectCell column={column('kind')} row={at('confirmed', 'meal')} />)

    expect(container.querySelector('.nv-kind svg')).not.toBeNull()
    expect(container.textContent).toBe('Maaltijd')
  })
})

describe('a select cell with declared tones', () => {
  const declared = { ...column('status'), options: { alpha: 'Alpha', beta: 'Beta', confirmed: 'Confirmed' }, tones: { alpha: 'bad' as const, beta: 'ok' as const } }
  const pill = (status: string) => render(<SelectCell column={declared} row={at(status)} />).container.querySelector('.nv-pill')?.className

  it('colours the pill by the declared tone', () => {
    expect(pill('alpha')).toBe('nv-pill nv-pill--bad')
    expect(pill('beta')).toBe('nv-pill nv-pill--ok')
  })

  it('lets a declared tone win over the built-in English defaults', () => {
    const over = { ...declared, tones: { confirmed: 'bad' as const } }
    const { container } = render(<SelectCell column={over} row={at('confirmed')} />)
    expect(container.querySelector('.nv-pill')?.className).toBe('nv-pill nv-pill--bad')
  })

  it('keeps an undeclared option neutral', () => {
    const none = { ...declared, options: { gamma: 'Gamma' } }
    expect(render(<SelectCell column={none} row={at('gamma')} />).container.querySelector('.nv-pill')?.className).toBe('nv-pill')
  })
})

describe('the select editor', () => {
  const open = (col: Column, row = at('option', 'meal')) => {
    renderNl(
      <SelectEditor column={col} row={row} editing={{ draft: col.edit(row), mode: 'edit' }} onDraft={vi.fn()} onCommit={vi.fn()}
        onLeave={vi.fn()} onPick={vi.fn()} onCancel={vi.fn()} onClose={vi.fn()} />,
    )
    return screen.getByRole('listbox', { name: col.label })
  }
  const option = (listbox: HTMLElement, name: string) => within(listbox).getByRole('option', { name })

  it('each option is drawn as the cell draws it', () => {
    const status = open(column('status'))
    expect(option(status, 'Bevestigd').querySelector('.nv-pill')?.className).toBe('nv-pill nv-pill--ok')
    expect(option(status, 'Geannuleerd').querySelector('.nv-pill')?.className).toBe('nv-pill nv-pill--bad')
    cleanup()

    const kind = open(column('kind'))
    expect(option(kind, 'Maaltijd').querySelector('.nv-kind svg')).not.toBeNull()
    cleanup()

    const settled = open(column('settled_by'))
    expect(option(settled, 'Gezelschap').querySelector('.nv-dot')).not.toBeNull()
  })

  it('the current option is marked', () => {
    const status = open(column('status'))

    expect(option(status, 'Optie').hasAttribute('data-current')).toBe(true)
    expect(option(status, 'Bevestigd').hasAttribute('data-current')).toBe(false)
    expect(within(status).getAllByRole('option').some((o) => o.hasAttribute('aria-selected'))).toBe(false)
  })

  it('required offers no leeg', () => {
    expect(within(open(column('status'))).getAllByRole('option')).toHaveLength(3)
    cleanup()

    const settled = open(column('settled_by'))
    expect(within(settled).getAllByRole('option').map((o) => o.textContent)).toEqual(['—', 'Gezelschap', 'Programmator'])
  })

  it('the editor root carries data-editor', () => {
    expect(open(column('status')).closest('[data-editor]')).not.toBeNull()
  })
})
