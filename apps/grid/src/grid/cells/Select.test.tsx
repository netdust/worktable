import { cleanup, render } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { activity, calais, planning } from '../calais.test.data'
import { columnsFor } from '../columns'
import { SelectCell } from './Select'

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
