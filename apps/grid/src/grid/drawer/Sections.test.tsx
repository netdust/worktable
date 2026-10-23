import { act, cleanup, render, screen, waitFor, within } from '@testing-library/react'
import { createRef } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { HistoryEntry, Link, LinkItem, Model, Row, Schema } from '../../types'
import type { Chooser } from './Sections'

const remote = vi.hoisted(() => ({ recordHistory: vi.fn(), rowsWhere: vi.fn(), optionsFrom: vi.fn(), records: vi.fn() }))
vi.mock('../../api', () => remote)
const { HistorySection, LinkSection } = await import('./Sections')

afterEach(cleanup)

const model = { key: 'item', fields: { status: { options: { open: 'Open', klaar: 'Klaar' } } } } as unknown as Model

const rowAt = (status: string): Row => ({ id: 1, title: 'Eén', status: '', fields: { status } })

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
    render(<HistorySection model={model} id={1} row={rowAt('open')} />)

    const history = await screen.findByRole('region', { name: 'Geschiedenis' })
    expect(history.textContent).toContain('noor verplaatst')
    expect(history.textContent).not.toContain('zette')
  })

  it('still says what a change set, before the move of its batch', async () => {
    const moved = { field: 'position', label: 'Position', moved: true as const }
    remote.recordHistory.mockResolvedValueOnce([entry([{ field: 'status', label: 'Status', old: 'open', new: 'klaar' }, moved])])
    render(<HistorySection model={model} id={1} row={rowAt('open')} />)

    expect((await screen.findByRole('region', { name: 'Geschiedenis' })).textContent).toContain('noor zette status op Klaar')
  })
})

describe('the drawer’s Geschiedenis, read again', () => {
  it('reads again when the record’s content changed, and not for the same content', async () => {
    remote.recordHistory.mockReset()
    remote.recordHistory.mockResolvedValue([])
    const { rerender } = render(<HistorySection model={model} id={1} row={rowAt('open')} />)
    await screen.findByRole('region', { name: 'Geschiedenis' })
    expect(remote.recordHistory).toHaveBeenCalledTimes(1)

    rerender(<HistorySection model={model} id={1} row={rowAt('open')} />)
    expect(remote.recordHistory).toHaveBeenCalledTimes(1)

    rerender(<HistorySection model={model} id={1} row={rowAt('klaar')} />)
    await waitFor(() => expect(remote.recordHistory).toHaveBeenCalledTimes(2))
  })
})

describe('a link section', () => {
  const link: Link = { item: 'Plaats', dataset: 'assignment', key: 'activity_id', target: 'person_id', target_dataset: 'person' }
  const from = { source: 'candidates', match: { assignment_id: 'id', role_id: 'role_id' }, value: 'person_id' }
  const relation = (model: string, more: object = {}) => ({ type: 'relation', label: model, required: false, fact: true, relation: { model, multiple: false }, ...more })
  const schema = {
    models: { assignment: { key: 'assignment', label: 'Plaatsen', fields: { activity_id: relation('activity'), person_id: relation('person', { label: 'Persoon', options_from: from }), role_id: relation('role') } } },
    tables: [], views: [], writable: { assignment: true },
  } as unknown as Schema
  const place = (person: number): Row => ({ id: 11, title: '', status: '', fields: { activity_id: 1, person_id: person, role_id: 3 }, lookups: { role_id: { id: 3, title: 'Techniek', status: '', fields: {} } } })
  const held = (target: number, title: string): LinkItem[] => [{ id: 11, target, title, state: null }]

  it('counts its head in places: an open ×2 is two, a cancelled open ×3 none', async () => {
    remote.rowsWhere.mockResolvedValue({ rows: [], total: 0 })
    const toned: Link = { ...link, state: { options: { ok: 'Bevestigd', weg: 'Geannuleerd' }, tones: { ok: 'ok', weg: 'bad' }, default: null } }
    const items: LinkItem[] = [
      { id: 11, target: 5, title: 'Sien Peeters', state: 'ok' },
      { id: 12, target: null, title: '', state: null, places: 2 },
      { id: 13, target: null, title: '', state: 'weg', places: 3 },
    ]
    render(<LinkSection label="Mensen" link={toned} items={items} schema={schema} id={1} />)
    await waitFor(() => expect(remote.rowsWhere).toHaveBeenCalled())
    const section = screen.getByRole('region', { name: 'Mensen' })
    expect(section.querySelector('.nv-dw-sec__n')?.textContent).toBe('1/3')
    // The open ×2 says how many beside it; a place for one says nothing.
    expect([...section.querySelectorAll('li')].map((li) => li.querySelector('.nv-dw-list__main > span')?.textContent)).toEqual([
      'Sien Peeters',
      'Open plek×2',
      'Open plek×3',
    ])
    expect(section.querySelectorAll('.nv-dw-list__times')).toHaveLength(2)
    // The cancelled one says so, as a filled place does, so the head's 3 reads true.
    expect([...section.querySelectorAll('li')].map((li) => li.querySelector('.nv-pill')?.textContent ?? null)).toEqual([
      'Bevestigd',
      null,
      'Geannuleerd',
    ])
  })

  it('re-reads its places once its items change, and asks for the candidates of the place as it reads now', async () => {
    remote.rowsWhere.mockResolvedValueOnce({ rows: [place(5)], total: 1 }).mockResolvedValueOnce({ rows: [place(7)], total: 1 })
    remote.optionsFrom.mockResolvedValue([])
    const chooser = createRef<Chooser>()
    const section = (items: LinkItem[]) => <LinkSection ref={chooser} label="Mensen" link={link} items={items} schema={schema} id={1} onLink={vi.fn()} />
    const { rerender } = render(section(held(5, 'Sien Peeters')))
    expect(await screen.findByText('Techniek')).toBeTruthy()

    rerender(section(held(7, 'Noor Janssens')))
    await waitFor(() => expect(remote.rowsWhere).toHaveBeenCalledTimes(2))
    await act(async () => chooser.current?.choose(11))

    const row = screen.getByRole('region', { name: 'Mensen' }).querySelector('li') as HTMLElement
    expect(within(row).getByRole('combobox', { name: 'Persoon' })).toBeTruthy()
    await waitFor(() => expect(remote.optionsFrom).toHaveBeenCalledExactlyOnceWith(from, { activity_id: 1, person_id: 7, role_id: 3, id: 11 }))
  })
})
