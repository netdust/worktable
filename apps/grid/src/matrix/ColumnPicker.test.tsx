import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

const api = vi.hoisted(() => ({ recordHistory: vi.fn(() => Promise.resolve([])), rowsWhere: vi.fn(() => Promise.resolve({ rows: [], total: 0 })),  records: vi.fn() }))
vi.mock('../api', () => api)
const { ColumnPicker } = await import('./ColumnPicker')

afterEach(() => {
  cleanup()
  vi.resetAllMocks()
})

describe('the column picker', () => {
  it("lists the model's records and picks one by id", async () => {
    api.records.mockResolvedValue({ rows: [{ id: 7, title: 'Marit', status: 'publish', fields: {} }], total: 1 })
    const onPick = vi.fn()
    render(<ColumnPicker model="person" taken={[]} columns={[]} hidden={[]} onToggle={() => undefined} onPick={onPick} />)

    fireEvent.click(await screen.findByRole('button', { name: 'Marit' }))

    expect(onPick).toHaveBeenCalledWith(7)
  })

  it('leaves out a record that already has a column, and searches as you type', async () => {
    api.records.mockResolvedValue({ rows: [{ id: 7, title: 'Marit', status: 'publish', fields: {} }, { id: 8, title: 'Nina', status: 'publish', fields: {} }], total: 2 })
    render(<ColumnPicker model="person" taken={[7]} columns={[]} hidden={[]} onToggle={() => undefined} onPick={() => undefined} />)

    expect(await screen.findByRole('button', { name: 'Nina' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Marit' })).toBeNull()
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'ne' } })
    await vi.waitFor(() => expect(api.records).toHaveBeenLastCalledWith('person', 'ne'))
  })
})
