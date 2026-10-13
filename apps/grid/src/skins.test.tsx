import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Model, Row, View } from './types'

const api = vi.hoisted(() => ({ filesOf: vi.fn(), fileUrl: (id: number) => `/api/attachments/file/${id}`, records: vi.fn(), recordLink: vi.fn(), rotateRecordLink: vi.fn(), attachmentsOf: vi.fn() }))
vi.mock('./api', () => api)
const { Board } = await import('./board/Board')
const { Gallery } = await import('./gallery/Gallery')
const { Timeline } = await import('./timeline/Timeline')

const model = {
  key: 'toewijzing', label: 'Toewijzingen', title_label: 'Persoon', title_readonly: true,
  fields: {
    state: { type: 'select', label: 'Status', required: true, fact: false, options: { open: 'Open', voorlopig: 'Voorlopig', bevestigd: 'Bevestigd' }, tones: { bevestigd: 'ok' } },
    rol_id: { type: 'relation', label: 'Rol', required: false, fact: false, relation: { model: 'rol', multiple: false } },
  },
} as unknown as Model
const view = { key: '5', label: 'Bord', table: 'toewijzing', model: 'toewijzing', type: 'board', board: { column: 'state' } } as unknown as View
const row = (id: number, title: string, state: string | null): Row => ({ id, title, status: '', fields: { state } })

afterEach(cleanup)

describe('the board', () => {
  it('puts cards in the column of their option, in option order, with Geen last; a card opens its row', () => {
    render(<Board view={view} model={model} models={{ toewijzing: model }} rows={[row(1, 'Lotte', 'bevestigd'), row(2, 'Bram', 'open'), row(3, 'Naam', null)]} column="state" />)
    const columns = screen.getAllByRole('list').map((list) => list.getAttribute('aria-label'))
    expect(columns).toEqual(['Open', 'Voorlopig', 'Bevestigd', 'Geen'])
    expect(within(screen.getByRole('list', { name: 'Bevestigd' })).getByRole('button', { name: /Lotte/ })).toBeTruthy()
    expect(within(screen.getByRole('list', { name: 'Geen' })).getByRole('button', { name: /Naam/ })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: /Bram/ }))
    expect(screen.getByRole('complementary', { name: 'Bram' })).toBeTruthy()
  })
})

describe('the gallery', () => {
  it('shows each row’s image from one batched read, and a plain card without one', async () => {
    api.filesOf.mockResolvedValue({ 1: { id: 41, mime: 'image/jpeg', name: 'a.jpg' } })
    const activity = { ...model, key: 'activiteit', fields: {} } as unknown as Model
    render(<Gallery view={{ ...view, model: 'activiteit' } as View} model={activity} models={{}} rows={[row(1, 'Repetitie', null), row(2, 'Opbouw', null)]} kind="foto" />)
    const img = await screen.findByRole('img', { name: 'Repetitie' })
    expect(img.getAttribute('src')).toBe('/api/attachments/file/41')
    expect(api.filesOf).toHaveBeenCalledTimes(1)
    expect(api.filesOf).toHaveBeenCalledWith('activiteit', [1, 2], 'foto')
    expect(within(screen.getByRole('button', { name: /Opbouw/ })).queryByRole('img')).toBeNull()
  })
})

describe('the gallery past 200 rows', () => {
  it('reads every row’s image, 200 ids a read', async () => {
    api.filesOf.mockReset()
    api.filesOf.mockImplementation(async (_: string, ids: number[]) => (ids.includes(450) ? { 450: { id: 99, mime: 'image/png', name: 'z.png' } } : {}))
    const activity = { ...model, key: 'activiteit', fields: {} } as unknown as Model
    const rows = Array.from({ length: 450 }, (_, at) => row(at + 1, `Rij ${at + 1}`, null))
    render(<Gallery view={{ ...view, model: 'activiteit' } as View} model={activity} models={{}} rows={rows} kind="foto" />)
    expect((await screen.findByRole('img', { name: 'Rij 450' })).getAttribute('src')).toBe('/api/attachments/file/99')
    expect(api.filesOf.mock.calls.map(([, ids]) => ids.length)).toEqual([200, 200, 50])
  })
})

describe('the timeline', () => {
  it('draws a bar per row over its days, in lanes', () => {
    const cal = { day: 'start_datum', start: null, end: 'eind_datum', lanes: ['productie_id'], spans: true as const }
    const rows: Row[] = [{ id: 1, title: 'Brugge', status: '', fields: { start_datum: '2026-10-13', eind_datum: '2026-10-15', productie_id: 1 }, lookups: { productie_id: { id: 1, title: 'De Kersentuin', status: '', fields: {} } } }]
    render(<Timeline view={{ ...view, model: 'speelreeks' } as View} model={model} models={{}} rows={rows} cal={cal} shown={{ from: '2026-10-12', to: '2026-10-18' }} lane="productie_id" onShown={() => undefined} />)
    const lane = screen.getByRole('row', { name: 'De Kersentuin' })
    const bar = within(lane).getByRole('button', { name: /Brugge/ })
    expect([bar.style.left, bar.style.width]).toEqual([`${(1 / 7) * 100}%`, `${(3 / 7) * 100}%`])
  })
})
