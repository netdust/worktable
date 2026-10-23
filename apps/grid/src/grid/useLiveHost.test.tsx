import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { useState } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Model, Row, View } from '../types'

const remote = vi.hoisted(() => ({ rowOf: vi.fn(), recordCount: vi.fn(() => Promise.resolve(0)), recordHistory: vi.fn(() => Promise.resolve([])), rowsWhere: vi.fn(() => Promise.resolve({ rows: [], total: 0 })), records: vi.fn(), optionsFrom: vi.fn(), attachmentsOf: vi.fn() }))
vi.mock('../api', () => remote)
const { useOpenRow } = await import('./useOpenRow')
const { DrawerWriteContext } = await import('./drawerWrite')

const model = { key: 'job', label: 'Job', title_label: 'Titel', title_readonly: false, lifecycle: 'state', live: ['busy'], fields: { state: { type: 'select', label: 'Stand', required: false, fact: true, options: { busy: 'Bezig', done: 'Klaar' } } } } as unknown as Model
const view = { key: 'jobs', label: 'Jobs', table: 'jobs', model: 'job', type: 'board' } as unknown as View
const at = (state: string): Row => ({ id: 1, title: 'Import', status: '', fields: { state } })

// A board-like host: its rows are its own state, and App's `fresh` replaces the row it re-read, as the store does.
function Board({ rows }: { rows: Row[] }) {
  const [open, drawer] = useOpenRow(model, view, { job: model }, rows)
  return <><button type="button" onClick={() => open(rows[0])}>Import</button>{drawer}</>
}

function Host() {
  const [rows, setRows] = useState([at('busy')])
  const write = { press: () => Promise.resolve(), fresh: (_of: string, row: Row) => setRows([row]) }
  return <DrawerWriteContext.Provider value={write}><Board rows={rows} /></DrawerWriteContext.Provider>
}

beforeEach(() => vi.useFakeTimers())
afterEach(() => {
  cleanup()
  vi.useRealTimers()
  remote.rowOf.mockReset()
})

describe('a drawer opened through the board’s host', () => {
  it('follows the record while it is live, then stops on leaving the live state, and Bezig goes with it', async () => {
    remote.rowOf.mockResolvedValueOnce(at('busy')).mockResolvedValue(at('done'))
    render(<Host />)
    fireEvent.click(screen.getByRole('button', { name: 'Import' }))
    expect(screen.getByRole('status').textContent).toContain('Volgt live')

    await act(async () => { await vi.advanceTimersByTimeAsync(3100) })
    await act(async () => { await vi.advanceTimersByTimeAsync(3000) })
    expect(remote.rowOf).toHaveBeenCalledTimes(2)
    expect(screen.queryByText('Volgt live')).toBeNull()

    await act(async () => { await vi.advanceTimersByTimeAsync(30_000) })
    expect(remote.rowOf).toHaveBeenCalledTimes(2)
  })

  it('stops polling when the drawer is closed', async () => {
    remote.rowOf.mockResolvedValue(at('busy'))
    render(<Host />)
    fireEvent.click(screen.getByRole('button', { name: 'Import' }))
    await act(async () => { await vi.advanceTimersByTimeAsync(3100) })
    expect(remote.rowOf).toHaveBeenCalledTimes(1)

    fireEvent.click(screen.getByRole('button', { name: 'Sluiten' }))
    await act(async () => { await vi.advanceTimersByTimeAsync(30_000) })

    expect(remote.rowOf).toHaveBeenCalledTimes(1)
  })

  it('closes when the poll finds the record gone', async () => {
    remote.rowOf.mockResolvedValue(null)
    render(<Host />)
    fireEvent.click(screen.getByRole('button', { name: 'Import' }))

    await act(async () => { await vi.advanceTimersByTimeAsync(3100) })

    expect(screen.queryByRole('complementary')).toBeNull()
  })
})
