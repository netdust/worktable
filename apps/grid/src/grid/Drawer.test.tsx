import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Model, ModelAction, Row } from '../types'

const remote = vi.hoisted(() => ({ records: vi.fn(), recordLink: vi.fn(), rotateRecordLink: vi.fn() }))
vi.mock('../api', () => remote)
const { Drawer, linkedDataset } = await import('./Drawer')
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
    expect(document.activeElement?.textContent).toBe('Sluiten')

    ;(document.activeElement as HTMLElement).blur()
    rerender(<Drawer row={row(2, 'b')} columns={columns} onClose={() => undefined} />)
    expect(document.activeElement?.textContent).toBe('Sluiten')
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

    expect(document.activeElement?.textContent).toBe('Sluiten')
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

describe("the drawer's actions", () => {
  const apply: ModelAction = { name: 'sjabloon_toepassen', label: 'Sjabloon toepassen', input: { sjabloon_id: { relation: 'sjabloon', label: 'Sjabloon' } } }
  const speeldag: Row = { id: 4, title: 'speeldag op locatie', status: '', fields: {} }

  async function pickSjabloon() {
    remote.records.mockResolvedValue({ rows: [speeldag], total: 1 })
    fireEvent.click(screen.getByRole('button', { name: 'Sjabloon: —' }))
    fireEvent.click(await screen.findByRole('option', { name: 'speeldag op locatie' }))
  }

  it('shows a button per action with a picker per input, run only once each input is picked', async () => {
    const onAction = vi.fn().mockResolvedValue(undefined)
    render(<Drawer row={row(3, 'Calais')} columns={[]} actions={[apply]} onAction={onAction} onClose={() => undefined} />)
    const group = screen.getByRole('group', { name: 'Sjabloon toepassen' })
    const run = within(group).getByRole('button', { name: 'Sjabloon toepassen' })
    expect(run.hasAttribute('disabled')).toBe(true)

    await pickSjabloon()
    expect(remote.records).toHaveBeenCalledWith('sjabloon', '')
    expect(within(group).getByRole('button', { name: 'Sjabloon: speeldag op locatie' })).toBeTruthy()
    await act(async () => {
      fireEvent.click(run)
    })

    expect(onAction).toHaveBeenCalledExactlyOnceWith(apply, { sjabloon_id: 4 })
  })

  it("says a refusal under the action, in the writer's words", async () => {
    const onAction = vi.fn().mockRejectedValue({ code: 'refused', message: 'Dit sjabloon is al toegepast.' })
    render(<Drawer row={row(3, 'Calais')} columns={[]} actions={[apply]} onAction={onAction} onClose={() => undefined} />)

    await pickSjabloon()
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Sjabloon toepassen' }))
    })

    expect(screen.getByRole('alert').textContent).toBe('Dit sjabloon is al toegepast.')
  })

  const shift: ModelAction = {
    name: 'tour_verschuiven',
    label: 'Tour verschuiven',
    input: { dagen: { type: 'integer', label: 'Dagen', min: -365, max: 365 }, stil: { type: 'boolean', label: 'Stil', required: false } },
  }

  it('takes a typed input as a field, sends it as its value, and leaves an optional one out', async () => {
    const onAction = vi.fn().mockResolvedValue(undefined)
    render(<Drawer row={row(3, 'Calais')} columns={[]} actions={[shift]} onAction={onAction} onClose={() => undefined} />)
    const group = screen.getByRole('group', { name: 'Tour verschuiven' })
    const run = within(group).getByRole('button', { name: 'Tour verschuiven' })
    expect(run.hasAttribute('disabled')).toBe(true)

    fireEvent.change(within(group).getByLabelText('Dagen'), { target: { value: '400' } })
    expect(run.hasAttribute('disabled')).toBe(true)
    fireEvent.change(within(group).getByLabelText('Dagen'), { target: { value: '-3' } })
    await act(async () => {
      fireEvent.click(run)
    })
    expect(onAction).toHaveBeenCalledExactlyOnceWith(shift, { dagen: -3 })

    fireEvent.click(within(group).getByLabelText('Stil'))
    await act(async () => {
      fireEvent.click(run)
    })
    expect(onAction).toHaveBeenLastCalledWith(shift, { dagen: -3, stil: true })
  })

  it('offers no action without a way to run it, nor on a model that declares none', () => {
    const { rerender } = render(<Drawer row={row(3, 'Calais')} columns={[]} actions={[apply]} onClose={() => undefined} />)
    expect(screen.queryByRole('group', { name: 'Sjabloon toepassen' })).toBeNull()

    rerender(<Drawer row={row(3, 'Calais')} columns={[]} onAction={vi.fn()} onClose={() => undefined} />)
    expect(screen.queryByRole('button', { name: 'Sjabloon toepassen' })).toBeNull()
  })
})

describe("a person's link in the drawer", () => {
  const persoon = (record_link?: true): Model => ({ key: 'persoon', label: 'Personen', title_label: 'Naam', title_readonly: true, fields: {}, ...(record_link ? { record_link } : {}) })
  const LINK = 'http://grid.test/#/link/persoon.3.abc'

  it('is offered to an administrator on a dataset declaring record_link only', () => {
    expect(linkedDataset('administrator', persoon(true))).toBe('persoon')
    expect(linkedDataset('editor', persoon(true))).toBeUndefined()
    expect(linkedDataset('owner', persoon(true))).toBeUndefined()
    expect(linkedDataset('administrator', persoon())).toBeUndefined()
  })

  it('shows no link controls without a linked dataset', () => {
    render(<Drawer row={row(3, 'Noor Claes')} columns={[]} onClose={() => undefined} />)
    expect(screen.queryByRole('button', { name: 'Link kopiëren' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Nieuwe link' })).toBeNull()
  })

  it('"Link kopiëren" reads the current link and copies it; "Nieuwe link" rotates and copies the new one', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    Object.assign(navigator, { clipboard: { writeText } })
    remote.recordLink.mockResolvedValue(LINK)
    remote.rotateRecordLink.mockResolvedValue(`${LINK}-new`)
    render(<Drawer row={row(3, 'Noor Claes')} columns={[]} recordLink="persoon" onClose={() => undefined} />)

    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Link kopiëren' })))
    expect(remote.recordLink).toHaveBeenCalledExactlyOnceWith('persoon', 3)
    expect(writeText).toHaveBeenLastCalledWith(LINK)
    expect(screen.getByRole('status').textContent).toBe('Link gekopieerd')

    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Nieuwe link' })))
    expect(remote.rotateRecordLink).toHaveBeenCalledExactlyOnceWith('persoon', 3)
    expect(writeText).toHaveBeenLastCalledWith(`${LINK}-new`)
    expect(screen.getByRole('status').textContent).toBe('Nieuwe link gekopieerd; de vorige werkt niet meer')
  })
})
