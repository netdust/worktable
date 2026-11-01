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
  it('shows a null value blank: no switch and no Nee, and a press sets it to true', () => {
    const onToggle = vi.fn()
    const empty = { ...row, fields: { ...row.fields, paid: null } }
    const { container } = renderNl(<BoolCell column={paid} row={empty} onToggle={onToggle} />)

    expect(screen.queryByRole('switch')).toBeNull()
    expect(container.textContent).toBe('')
    expect(paid.text(empty)).toBe('')

    fireEvent.click(container.querySelector('.nv-cell__bool') as HTMLElement)

    expect(onToggle).toHaveBeenCalledTimes(1)
  })

  it('shows a new-row draft’s empty boolean as an unchecked switch, not blank: blank is only for a stored null', () => {
    const draft = { ...row, id: -1, fields: { ...row.fields, paid: undefined } }
    renderNl(<BoolCell column={paid} row={draft} onToggle={vi.fn()} />)

    expect(toggle().checked).toBe(false)
  })

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
