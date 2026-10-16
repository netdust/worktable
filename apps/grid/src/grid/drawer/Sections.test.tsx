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
