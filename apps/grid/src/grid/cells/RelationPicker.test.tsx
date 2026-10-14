import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { renderNl } from '../../test-setup'
import type { Row } from '../../types'

const remote = vi.hoisted(() => ({ recordCount: vi.fn(() => Promise.resolve(0)), recordHistory: vi.fn(() => Promise.resolve([])), rowsWhere: vi.fn(() => Promise.resolve({ rows: [], total: 0 })),  records: vi.fn() }))
vi.mock('../../api', () => remote)
const { RelationPicker } = await import('./RelationPicker')

const person = (id: number, title: string): Row => ({ id, title, status: '', fields: {} })
const names = () => screen.queryAllByRole('option').map((o) => o.textContent)

afterEach(cleanup)

describe('a picker with candidates', () => {
  it('lists the candidates in their order, then everyone after Iedereen tonen', async () => {
    remote.records.mockResolvedValue({ rows: [person(1, 'Lotte'), person(2, 'Bram'), person(3, 'Noor')], total: 3 })
    const candidates = vi.fn().mockResolvedValue([person(2, 'Bram'), person(1, 'Lotte')])
    const onPick = vi.fn()
    renderNl(<RelationPicker model="persoon" label="Persoon" candidates={candidates} onPick={onPick} onCancel={() => undefined} />)
    await screen.findAllByRole('option')

    expect(names()).toEqual(['Bram', 'Lotte'])
    expect(remote.records).not.toHaveBeenCalled()

    fireEvent.click(screen.getByRole('button', { name: 'Iedereen tonen' }))
    await waitFor(() => expect(names()).toEqual(['Lotte', 'Bram', 'Noor']))
  })

  it('says Geen kandidaten for an empty list', async () => {
    renderNl(<RelationPicker model="persoon" label="Persoon" candidates={vi.fn().mockResolvedValue([])} onPick={() => undefined} onCancel={() => undefined} />)
    expect(await screen.findByText('Geen kandidaten')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Iedereen tonen' })).toBeTruthy()
  })

  it('without candidates, it is the plain search', async () => {
    remote.records.mockResolvedValue({ rows: [person(1, 'Lotte')], total: 1 })
    renderNl(<RelationPicker model="persoon" label="Persoon" onPick={() => undefined} onCancel={() => undefined} />)
    await screen.findAllByRole('option')

    expect(names()).toEqual(['Lotte'])
    expect(screen.queryByRole('button', { name: 'Iedereen tonen' })).toBeNull()
  })
})
