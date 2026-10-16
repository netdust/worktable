import { renderHook, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Model, Row, Schema, TableDef } from '../types'
import { useFlags, windowOfRows } from './useFlags'

const api = vi.hoisted(() => ({ rows: vi.fn() }))
vi.mock('../api', () => api)

// A query whose rows flag jobs and their rooms, toned by its level.
const meldingen: TableDef = {
  key: 'meldingen', label: 'Meldingen', model: 'meldingen', date_field: 'day', space: 'scoped', query: true, types: ['grid'],
  flags: { marks: { job: 'job_id', room: 'room_id' }, tone: 'level' },
}
const jobs: TableDef = { key: 'job', label: 'Jobs', model: 'job', types: ['grid'] }
const model = {
  key: 'meldingen', label: 'Meldingen', title_label: 'Tekst', title_readonly: true,
  fields: { level: { type: 'select', label: 'Niveau', required: true, fact: false, options: { high: 'Hoog', low: 'Laag' }, tones: { high: 'bad', low: 'warn' } } },
} as unknown as Model
const schema = (tables: TableDef[] = [jobs, meldingen]): Schema => ({ models: { meldingen: model }, tables, views: [], writable: {} })
const row = (id: number, title: string, fields: Record<string, unknown>): Row => ({ id, title, status: '', fields })
const week = { from: '2030-01-07', to: '2030-01-13' }

afterEach(() => vi.resetAllMocks())

describe('the flags of a flag query', () => {
  it('marks each record by the id its mark column holds, with the row as its text and the tone option as its word', async () => {
    api.rows.mockResolvedValue({
      rows: [
        row(1, 'Dubbel geboekt.', { job_id: 7, room_id: 3, level: 'high' }),
        row(2, 'Nog niet bevestigd.', { job_id: 7, room_id: null, level: 'low' }),
        row(3, 'Afwezig.', { job_id: 8, room_id: null, level: 'high' }),
      ],
      total: 3,
    })
    const { result } = renderHook(() => useFlags(schema(), null, week, 'job'))

    await waitFor(() => expect(result.current).not.toBeNull())
    const flags = result.current!
    expect(flags.marksOf('job', 7)).toEqual([
      { text: 'Dubbel geboekt.', tone: 'bad', label: 'Hoog', marks: { job: 7, room: 3 } },
      { text: 'Nog niet bevestigd.', tone: 'warn', label: 'Laag', marks: { job: 7 } },
    ])
    expect(flags.marksOf('room', 3).map((f) => f.text)).toEqual(['Dubbel geboekt.'])
    expect(flags.marksOf('job', 9)).toEqual([])
    expect(flags.marksOf('team', 7)).toEqual([])
    expect(flags.count('job', [7, 8, 9, 10])).toBe(2)
    expect([flags.source, flags.label]).toEqual(['meldingen', 'Meldingen'])
  })

  it('reads the flag query over the window, in the space when the query is scoped', async () => {
    api.rows.mockResolvedValue({ rows: [], total: 0 })
    const scope = { field: 'team_id', id: 4 }
    renderHook(() => useFlags(schema(), scope, week, 'job'))
    await waitFor(() => expect(api.rows).toHaveBeenCalledTimes(1))
    expect(api.rows.mock.calls[0][0]).toMatchObject({ model: 'meldingen', date_field: 'day' })
    expect(api.rows.mock.calls[0].slice(1, 3)).toEqual([week, scope])

    api.rows.mockClear()
    renderHook(() => useFlags(schema([{ ...meldingen, space: 'global', date_field: undefined }]), scope, week, 'job'))
    await waitFor(() => expect(api.rows).toHaveBeenCalledTimes(1))
    expect(api.rows.mock.calls[0].slice(1, 3)).toEqual([{}, null])
  })

  it("reads again when the skin's version moves, keeping the last flags until that read lands", async () => {
    const held = { rows: [row(1, 'Dubbel geboekt.', { job_id: 7, level: 'high' })], total: 1 }
    let answer: (found: { rows: Row[]; total: number }) => void = () => undefined
    api.rows.mockResolvedValueOnce(held).mockReturnValueOnce(new Promise((done) => { answer = done }))
    const { result, rerender } = renderHook(({ version }) => useFlags(schema(), null, week, 'job', version), { initialProps: { version: 1 } })
    await waitFor(() => expect(result.current?.marksOf('job', 7)).toHaveLength(1))

    rerender({ version: 1 })
    expect(api.rows).toHaveBeenCalledTimes(1)
    rerender({ version: 2 })
    await waitFor(() => expect(api.rows).toHaveBeenCalledTimes(2))
    expect(result.current?.marksOf('job', 7)).toHaveLength(1)
    answer({ rows: [row(2, 'Afwezig.', { job_id: 8, level: 'low' })], total: 1 })
    await waitFor(() => expect(result.current?.marksOf('job', 7)).toEqual([]))
    expect(result.current?.marksOf('job', 8).map((f) => f.text)).toEqual(['Afwezig.'])
  })

  it('is null and reads nothing without a flag query that marks the dataset, or without a window', () => {
    expect(renderHook(() => useFlags(schema([jobs]), null, week, 'job')).result.current).toBeNull()
    expect(renderHook(() => useFlags(schema(), null, week, 'team')).result.current).toBeNull()
    expect(renderHook(() => useFlags(schema(), null, null, 'job')).result.current).toBeNull()
    expect(renderHook(() => useFlags(null, null, week, 'job')).result.current).toBeNull()
    expect(api.rows).not.toHaveBeenCalled()
  })

  it('is null when the read is refused, as for a caller who cannot read the flag query', async () => {
    api.rows.mockRejectedValue({ code: 'unknown_source', message: 'unknown source' })
    const { result } = renderHook(() => useFlags(schema(), null, week, 'job'))
    await waitFor(() => expect(api.rows).toHaveBeenCalledTimes(1))
    await Promise.resolve()
    expect(result.current).toBeNull()
  })
})

describe("a skin's window", () => {
  it("is the first to the last day its rows are on, nothing without rows, and every day without a date column", () => {
    const rows = [row(1, 'a', { day: '2030-01-09' }), row(2, 'b', { day: '2030-01-07' }), row(3, 'c', { day: null })]
    expect(windowOfRows(rows, 'day')).toEqual({ from: '2030-01-07', to: '2030-01-09' })
    expect(windowOfRows([], 'day')).toBeNull()
    expect(windowOfRows(rows, undefined)).toEqual({})
  })
})
