import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { HistoryEntry, Model } from '../../types'

const remote = vi.hoisted(() => ({ recordHistory: vi.fn(), rowsWhere: vi.fn() }))
vi.mock('../../api', () => remote)
const { HistorySection } = await import('./Sections')

afterEach(cleanup)

const model = { key: 'item', fields: { status: { options: { open: 'Open', klaar: 'Klaar' } } } } as unknown as Model

const entry = (changes: HistoryEntry['changes']): HistoryEntry => ({
  batch: 'b1',
  at: '2026-10-12T16:20:00Z',
  by: 'account',
  actor: 'noor@example.test',
  undoable: false,
  others: 0,
  batch_kind: 'write',
  created: false,
  record: { id: 1, title: 'Eén' },
  changes,
})

describe('the drawer’s Geschiedenis', () => {
  it('says a move as "verplaatst", never "zette … op" a rank', async () => {
    remote.recordHistory.mockResolvedValueOnce([entry([{ field: 'position', label: 'Position', moved: true }])])
    render(<HistorySection model={model} id={1} />)

    const history = await screen.findByRole('region', { name: 'Geschiedenis' })
    expect(history.textContent).toContain('noor verplaatst')
    expect(history.textContent).not.toContain('zette')
  })

  it('still says what a change set, before the move of its batch', async () => {
    const moved = { field: 'position', label: 'Position', moved: true as const }
    remote.recordHistory.mockResolvedValueOnce([entry([{ field: 'status', label: 'Status', old: 'open', new: 'klaar' }, moved])])
    render(<HistorySection model={model} id={1} />)

    expect((await screen.findByRole('region', { name: 'Geschiedenis' })).textContent).toContain('noor zette status op Klaar')
  })
})
