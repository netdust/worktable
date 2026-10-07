import { cleanup, render } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import type { Model, Row } from '../../types'
import { columnsFor } from '../columns'
import { Display } from './index'

const model: Model = {
  key: 'session', label: 'Session', title_label: 'Title', title_readonly: false,
  fields: {
    room_from: { type: 'select', label: 'Room from', required: false, fact: false, options: { self: 'Own', series: 'Series' } },
    room: { type: 'text', label: 'Room', required: false, fact: false, inherited: { flag: 'room_from', own: 'self' } },
  },
}
const view = { key: 'v', label: 'V', table: 't', table_label: 'T', model: 'session', type: 'grid', columns: ['room'] } as never
const column = columnsFor(model, view).find((c) => c.id === 'room')!
const at = (flag: string | null): Row => ({ id: 1, title: 'A', fields: { room: 'Hall', room_from: flag } } as never)
const show = (row: Row) => render(<Display column={column} row={row} onToggle={() => {}} />).container

afterEach(cleanup)

describe('an inherited cell', () => {
  it('reads muted with the flag option label when the value comes from elsewhere', () => {
    const c = show(at('series'))

    expect(c.querySelector('.nv-inherited')).not.toBeNull()
    expect(c.querySelector('.nv-via')?.textContent).toBe('via Series')
    expect(c.textContent).toContain('Hall')
  })

  it.each(['self', '', null])('renders plainly when the flag is %j', (flag) => {
    const c = show(at(flag))

    expect(c.querySelector('.nv-inherited')).toBeNull()
    expect(c.querySelector('.nv-via')).toBeNull()
    expect(c.textContent).toBe('Hall')
  })

  it('keeps the tag out of the value: edit, copy and search read the bare text', () => {
    const row = at('series')

    expect(column.text(row)).toBe('Hall')
    expect(column.edit(row)).toBe('Hall')
    expect(column.value(row)).toBe('Hall')
  })
})
