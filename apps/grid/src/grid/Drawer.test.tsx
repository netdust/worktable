import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Row } from '../types'
import { Drawer } from './Drawer'
import { columnsFor } from './columns'
import { activity, planning } from './calais.test.data'

const row = (id: number, title: string): Row => ({ id, title, status: 'publish', fields: { date: '2026-05-18', notes: 'Twee veggie' } })
const columns = columnsFor(activity, { ...planning, columns: undefined }, false)

afterEach(cleanup)

describe('the drawer', () => {
  it('reads a record whole without an editor, as the grid has it', () => {
    const { container } = render(<Drawer row={row(1, 'Lunch bistrot')} columns={columns} onClose={() => undefined} />)
    const drawer = screen.getByRole('complementary', { name: 'Lunch bistrot' })

    expect(within(drawer).getByRole('heading', { name: 'Lunch bistrot' })).toBeTruthy()
    expect(within(drawer).getByText('Twee veggie')).toBeTruthy()
    expect(container.querySelectorAll('.nv-drawer__field').length).toBe(columns.length - 1)
    expect(container.querySelector('.nv-drawer__editor')).toBeNull()
  })

  it('renders an editor under the fields', () => {
    render(<Drawer row={row(1, 'Lunch bistrot')} columns={[]} editor={<p>the editor</p>} onClose={() => undefined} />)
    const drawer = screen.getByRole('complementary', { name: 'Lunch bistrot' })

    expect(within(drawer).getByText('the editor').closest('.nv-drawer__editor')).not.toBeNull()
  })

  it('focuses its close button on a row change by default', () => {
    const { rerender } = render(<Drawer row={row(1, 'a')} columns={columns} onClose={() => undefined} />)
    expect(document.activeElement?.textContent).toBe('Close')

    ;(document.activeElement as HTMLElement).blur()
    rerender(<Drawer row={row(2, 'b')} columns={columns} onClose={() => undefined} />)
    expect(document.activeElement?.textContent).toBe('Close')
  })

  it('leaves focus where it was when focusOnOpen is false', () => {
    const outside = document.createElement('button')
    document.body.appendChild(outside)
    outside.focus()
    const { rerender } = render(<Drawer row={row(1, 'a')} columns={[]} focusOnOpen={false} onClose={() => undefined} />)
    rerender(<Drawer row={row(2, 'b')} columns={[]} focusOnOpen={false} onClose={() => undefined} />)

    expect(document.activeElement).toBe(outside)
    outside.remove()
  })

  it("leaves focus where it is when the open row's title changes", () => {
    const { rerender } = render(<Drawer row={row(1, 'Montage')} columns={columns} onClose={() => undefined} />)
    const outside = document.createElement('button')
    document.body.appendChild(outside)
    outside.focus()

    rerender(<Drawer row={row(1, 'Montage zaal')} columns={columns} onClose={() => undefined} />)

    expect(document.activeElement).toBe(outside)
    outside.remove()
  })

  it('focuses its close button for another row of the same title', () => {
    const { rerender } = render(<Drawer row={row(1, 'Montage')} columns={columns} onClose={() => undefined} />)
    ;(document.activeElement as HTMLElement).blur()

    rerender(<Drawer row={row(2, 'Montage')} columns={columns} onClose={() => undefined} />)

    expect(document.activeElement?.textContent).toBe('Close')
  })

  it('closes on Escape', () => {
    const onClose = vi.fn()
    render(<Drawer row={row(1, 'a')} columns={[]} onClose={onClose} />)

    fireEvent.keyDown(screen.getByRole('complementary'), { key: 'Escape' })
    expect(onClose).toHaveBeenCalled()
  })

  it('leaves an open list in it to Escape first', () => {
    const onClose = vi.fn()
    render(<Drawer row={row(1, 'a')} columns={[]} editor={<div role="combobox" aria-expanded="true" tabIndex={0}>list</div>} onClose={onClose} />)

    fireEvent.keyDown(screen.getByRole('combobox'), { key: 'Escape' })
    expect(onClose).not.toHaveBeenCalled()
  })
})
