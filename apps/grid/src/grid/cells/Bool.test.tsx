import { cleanup, fireEvent, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { renderNl } from '../../test-setup'
import { activity, calais, planning } from '../calais.test.data'
import { columnsFor } from '../columns'
import { BoolCell } from './Bool'

const paid = columnsFor(activity, { ...planning, columns: ['title', 'paid'] }).find((c) => c.id === 'paid')!
const row = { ...calais[1], fields: { ...calais[1].fields, paid: true } }
const toggle = () => screen.getByRole('switch', { name: 'Betaald' }) as HTMLInputElement

afterEach(cleanup)

describe('a bool cell', () => {
  it('shows the stored value as a switch out of the Tab order', () => {
    renderNl(<BoolCell column={paid} row={row} onToggle={vi.fn()} />)

    expect(toggle().checked).toBe(true)
    expect(toggle().tabIndex).toBe(-1)
  })

  it('a click flips it once', () => {
    const onToggle = vi.fn()
    renderNl(<BoolCell column={paid} row={row} onToggle={onToggle} />)

    fireEvent.click(toggle())

    expect(onToggle).toHaveBeenCalledTimes(1)
  })

  it('a read-only switch does not flip', () => {
    const onToggle = vi.fn()
    renderNl(<BoolCell column={{ ...paid, editable: false }} row={row} onToggle={onToggle} />)

    fireEvent.click(toggle())

    expect(onToggle).not.toHaveBeenCalled()
    expect(toggle().getAttribute('aria-readonly')).toBe('true')
  })
})
