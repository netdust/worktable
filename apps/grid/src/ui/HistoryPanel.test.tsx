import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { HistoryEntry } from '../types'
import { HistoryPanel } from './HistoryPanel'

afterEach(cleanup)

const entry = (over: Partial<HistoryEntry>): HistoryEntry => ({
  batch: 'b1',
  at: '2026-10-08T10:15:00.000Z',
  by: 'self',
  actor: 'hester@example.test',
  undoable: true,
  others: 0,
  batch_kind: 'write',
  created: false,
  record: { id: 1, title: 'Bouw' },
  changes: [{ field: 'status', label: 'Status', old: 'optie', new: 'bevestigd' }],
  ...over,
})

const panel = () => screen.getByRole('complementary', { name: 'Geschiedenis' })
const items = () => within(panel()).getAllByRole('listitem')

function shown(entries: HistoryEntry[], props: Partial<Parameters<typeof HistoryPanel>[0]> = {}) {
  const load = vi.fn().mockResolvedValue(entries)
  const onUndo = vi.fn().mockResolvedValue(undefined)
  const onUndone = vi.fn()
  const onRefused = vi.fn()
  render(<HistoryPanel load={load} onUndo={onUndo} onUndone={onUndone} onRefused={onRefused} onClose={() => undefined} {...props} />)
  return { load, onUndo, onUndone, onRefused }
}

describe('the history panel', () => {
  it('lists the entries grouped by day, newest first, each with its record, column and values', async () => {
    shown([
      entry({ batch: 'b3', at: '2026-10-08T10:15:00.000Z' }),
      entry({ batch: 'b2', at: '2026-10-08T09:00:00.000Z', record: { id: 2, title: 'Opbouw' } }),
      entry({ batch: 'b1', at: '2026-10-07T16:00:00.000Z', record: { id: 3, title: 'Afbouw' } }),
    ])

    const days = await within(panel()).findAllByRole('heading', { level: 3 })
    expect(days).toHaveLength(2)
    const groups = within(panel()).getAllByRole('list')
    expect(within(groups[0]!).getAllByRole('listitem')).toHaveLength(2)
    expect(within(groups[1]!).getAllByRole('listitem')).toHaveLength(1)
    expect(items()[0]!.textContent).toContain('Bouw')
    expect(items()[0]!.textContent).toContain('Status')
    expect(items()[0]!.textContent).toContain('optie')
    expect(items()[0]!.textContent).toContain('bevestigd')
    expect(items()[2]!.textContent).toContain('Afbouw')
  })

  it('names a record once for a run of its entries, again after another record', async () => {
    shown([
      entry({ batch: 'b4', record: { id: 7, title: 'Zomerstorm' } }),
      entry({ batch: 'b3', record: { id: 7, title: 'Zomerstorm' } }),
      entry({ batch: 'b2', record: { id: 8, title: 'Opbouw' } }),
      entry({ batch: 'b1', record: { id: 7, title: 'Zomerstorm' } }),
    ])

    await within(panel()).findAllByRole('listitem')
    const titles = items().map((li) => li.querySelector('.nv-history__record')?.textContent ?? null)
    expect(titles).toEqual(['Zomerstorm', null, 'Opbouw', 'Zomerstorm'])
  })

  it('says a creation', async () => {
    shown([entry({ created: true, changes: [] })])

    expect((await within(panel()).findByRole('listitem')).textContent).toContain('aangemaakt')
  })

  it('says a move as "verplaatst", without a rank or an arrow, beside the other changes of its batch', async () => {
    const moved = { field: 'position', label: 'Position', moved: true as const }
    shown([entry({ batch: 'b2', changes: [moved] }), entry({ batch: 'b1', changes: [entry({}).changes[0]!, moved] })])

    await within(panel()).findAllByRole('listitem')
    expect(items()[0]!.textContent).toContain('verplaatst')
    expect(items()[0]!.textContent).not.toContain('→')
    expect(items()[0]!.textContent).not.toContain('Position')
    expect(items()[1]!.textContent).toContain('optie → bevestigd')
    expect(items()[1]!.textContent).toContain('verplaatst')
  })

  it('says whose change it was: jij, systeem, planning, onbekend, the email or bevestigd door <naam>', async () => {
    shown([
      entry({ batch: 'a', by: 'self' }),
      entry({ batch: 'b', by: 'system', actor: null }),
      entry({ batch: 'c', by: 'hidden', actor: null }),
      entry({ batch: 'd', by: 'gone', actor: null }),
      entry({ batch: 'e', by: 'account', actor: 'collega@example.test' }),
      entry({ batch: 'f', by: 'link', actor: 'Ann Peeters' }),
    ])

    await within(panel()).findAllByRole('listitem')
    const whose = items().map((li) => li.querySelector('.nv-history__by')?.textContent)
    expect(whose).toEqual(['jij', 'systeem', 'planning', 'onbekend', 'collega@example.test', 'bevestigd door Ann Peeters'])
  })

  it('offers Ongedaan maken only where the entry is undoable, and it undoes the batch', async () => {
    const { onUndo } = shown([entry({ batch: 'mine' }), entry({ batch: 'theirs', by: 'account', undoable: false })])

    await within(panel()).findAllByRole('listitem')
    expect(within(items()[1]!).queryByRole('button', { name: 'Ongedaan maken' })).toBeNull()
    fireEvent.click(within(items()[0]!).getByRole('button', { name: 'Ongedaan maken' }))

    expect(onUndo).toHaveBeenCalledWith('mine')
  })

  it('says an undo also undoes the batch’s other changes, counted across the whole batch, not the list', async () => {
    shown([entry({ batch: 'x', others: 29 }), entry({ batch: 'z', others: 1 }), entry({ batch: 'y' })])

    await within(panel()).findAllByRole('listitem')
    expect(items()[0]!.textContent).toContain('Dit maakt ook 29 andere wijzigingen ongedaan')
    expect(items()[1]!.textContent).toContain('Dit maakt ook 1 andere wijziging ongedaan')
    expect(items()[2]!.textContent).not.toContain('andere')
  })

  it('reads the list and the view again after an undo', async () => {
    const { load, onUndone } = shown([entry({})])

    fireEvent.click(await within(panel()).findByRole('button', { name: 'Ongedaan maken' }))

    await waitFor(() => expect(load).toHaveBeenCalledTimes(2))
    expect(onUndone).toHaveBeenCalledTimes(1)
  })

  it('hands a refused undo on, and reads the list again', async () => {
    const refusal = { code: 'changed_since', message: '"status" changed since', column: 'status', label: 'Status' }
    const { load, onUndone, onRefused } = shown([entry({})], { onUndo: vi.fn().mockRejectedValue(refusal) })

    fireEvent.click(await within(panel()).findByRole('button', { name: 'Ongedaan maken' }))

    await waitFor(() => expect(onRefused).toHaveBeenCalledWith(refusal))
    expect(onUndone).not.toHaveBeenCalled()
    await waitFor(() => expect(load).toHaveBeenCalledTimes(2))
  })

  it('says when there is nothing to show', async () => {
    shown([])

    expect(await within(panel()).findByText('Nog geen wijzigingen')).toBeTruthy()
  })
})
