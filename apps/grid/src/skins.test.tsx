import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Model, Row, View } from './types'
import { defaults } from './grid/layout'

const api = vi.hoisted(() => ({ recordCount: vi.fn(() => Promise.resolve(0)), recordHistory: vi.fn(() => Promise.resolve([])), rowsWhere: vi.fn(() => Promise.resolve({ rows: [], total: 0 })),  filesOf: vi.fn(), fileUrl: (id: number) => `/api/attachments/file/${id}`, records: vi.fn(), recordLink: vi.fn(), rotateRecordLink: vi.fn(), attachmentsOf: vi.fn() }))
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
    render(<Board view={view} layout={defaults(view)} model={model} models={{ toewijzing: model }} rows={[row(1, 'Lotte', 'bevestigd'), row(2, 'Bram', 'open'), row(3, 'Naam', null)]} column="state" />)
    const columns = screen.getAllByRole('region').map((list) => list.getAttribute('aria-label'))
    expect(columns).toEqual(['Open', 'Voorlopig', 'Bevestigd', 'Geen'])
    expect(within(screen.getByRole('region', { name: 'Bevestigd' })).getByRole('button', { name: /Lotte/ })).toBeTruthy()
    expect(within(screen.getByRole('region', { name: 'Geen' })).getByRole('button', { name: /Naam/ })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: /Bram/ }))
    expect(screen.getByRole('complementary', { name: 'Bram' })).toBeTruthy()
  })
})

describe('a board card', () => {
  it('reads as the prototype: the soort, the title, the day and hours, the place, from the view\'s own columns', () => {
    const activity = {
      key: 'activiteit', label: 'Activiteiten', title_label: 'Omschrijving', title_readonly: false,
      fields: {
        status: { type: 'select', label: 'Status', required: true, fact: false, options: { optie: 'Optie', bevestigd: 'Bevestigd' }, tones: { optie: 'warn', bevestigd: 'ok' } },
        soort: { type: 'select', label: 'Soort', required: true, fact: false, options: { voorstelling: 'Voorstelling' }, tones: { voorstelling: 'rose' } },
        productie_id: { type: 'relation', label: 'Productie', required: true, fact: false, relation: { model: 'productie', multiple: false } },
        plandag: { type: 'date', label: 'Plandag', required: false, fact: false },
        start_at: { type: 'datetime', label: 'Start', required: false, fact: false },
        eind_at: { type: 'datetime', label: 'Einde', required: false, fact: false },
        plaats: { type: 'text', label: 'Plaats', required: false, fact: false },
      },
    } as unknown as Model
    const board = { ...view, model: 'activiteit', table: 'activiteit', board: { column: 'status' }, arrangement: { order: ['title', 'soort', 'plandag', 'start_at', 'eind_at', 'plaats'], hidden: ['productie_id'] } } as unknown as View
    const show = { id: 7, title: 'Voorstelling Brugge', status: '', fields: { status: 'bevestigd', soort: 'voorstelling', productie_id: [2], plandag: '2026-10-13', start_at: '2026-10-13 20:00', eind_at: '2026-10-13 21:15', plaats: 'Theater Het Anker' } }
    document.documentElement.lang = 'nl'
    render(<Board view={board} layout={defaults(board)} model={activity} models={{ activiteit: activity }} rows={[show]} column="status" />)
    const card = within(screen.getByRole('region', { name: 'Bevestigd' })).getByRole('button', { name: /Voorstelling Brugge/ })
    expect(card.textContent).toContain('Voorstelling')
    expect(card.textContent).toContain('di 13 okt')
    expect(card.querySelector('.nv-time')?.textContent).toBe('20:00–21:15')
    expect(card.textContent).toContain('Theater Het Anker')
    expect(card.textContent).not.toContain('Productie')
    expect(screen.queryByRole('region', { name: 'Geen' })).toBeNull()
    document.documentElement.lang = ''
  })

  it("the line of a relation to a toned dataset carries that record's tone; a plain line none", async () => {
    const activity = {
      key: 'activiteit', label: 'Activiteiten', title_label: 'Omschrijving', title_readonly: false,
      fields: {
        status: { type: 'select', label: 'Status', required: true, fact: false, options: { bevestigd: 'Bevestigd' } },
        productie_id: { type: 'relation', label: 'Productie', required: true, fact: false, relation: { model: 'productie', multiple: false } },
        plaats: { type: 'text', label: 'Plaats', required: false, fact: false },
      },
    } as unknown as Model
    const productie = {
      key: 'productie', label: 'Producties', title_label: 'Titel', title_readonly: false, tone: 'kleur',
      fields: { kleur: { type: 'select', label: 'Kleur', required: false, fact: false, options: { rose: 'Roze' }, tones: { rose: 'rose' } } },
    } as unknown as Model
    api.records.mockResolvedValue({ rows: [{ id: 2, title: 'De Kersentuin', status: '', fields: { kleur: 'rose' } }], total: 1 })
    const board = { ...view, model: 'activiteit', table: 'activiteit', board: { column: 'status' } } as unknown as View
    const show = { id: 7, title: 'Voorstelling Brugge', status: '', fields: { status: 'bevestigd', productie_id: [2], plaats: 'Het Anker' }, lookups: { productie_id: { id: 2, title: 'De Kersentuin', status: '', fields: {} } } }
    render(<Board view={board} layout={defaults(board)} model={activity} models={{ activiteit: activity, productie }} rows={[show]} column="status" />)
    const card = screen.getByRole('button', { name: /Voorstelling Brugge/ })
    const line = (text: string) => [...card.querySelectorAll<HTMLElement>('.nv-board__fact')].find((f) => f.textContent === text) as HTMLElement
    await waitFor(() => expect(line('De Kersentuin').querySelector('i')?.style.getPropertyValue('--c')).toBe('var(--tone-rose)'))
    expect(line('Het Anker').querySelector('i')).toBeNull()
    expect(api.records).toHaveBeenCalledWith('productie', '')
  })
})

describe('Kolommen on a card skin', () => {
  it('hides and orders a card\'s facts through the layout; the title always shows', () => {
    const activity = {
      key: 'activiteit', label: 'Activiteiten', title_label: 'Omschrijving', title_readonly: false,
      fields: {
        status: { type: 'select', label: 'Status', required: true, fact: false, options: { optie: 'Optie' } },
        plaats: { type: 'text', label: 'Plaats', required: false, fact: false },
        bron: { type: 'text', label: 'Bron', required: false, fact: false },
      },
    } as unknown as Model
    const board = { ...view, model: 'activiteit', table: 'activiteit', board: { column: 'status' } } as unknown as View
    const show = { id: 7, title: 'Voorstelling Brugge', status: '', fields: { status: 'optie', plaats: 'Het Anker', bron: 'Plan' } }
    const onShown = vi.fn()
    const card = () => screen.getByRole('button', { name: /Voorstelling Brugge/ })
    const { rerender } = render(<Board view={board} layout={{ ...defaults(board), order: ['title', 'bron', 'plaats'] }} model={activity} models={{}} rows={[show]} column="status" onShown={onShown} />)
    expect([...card().querySelectorAll('.nv-board__fact')].map((f) => f.textContent)).toEqual(['Plan', 'Het Anker'])
    rerender(<Board view={board} layout={{ ...defaults(board), hidden: ['bron'] }} model={activity} models={{}} rows={[show]} column="status" onShown={onShown} />)
    expect([...card().querySelectorAll('.nv-board__fact')].map((f) => f.textContent)).toEqual(['Het Anker'])
    expect(card().textContent).toContain('Voorstelling Brugge')
    expect(onShown.mock.lastCall?.[0].menu.map((c: { id: string }) => c.id)).toEqual(['title', 'status', 'plaats', 'bron'])
  })
})

describe('the gallery', () => {
  it('shows each row’s image from one batched read, and a plain card without one', async () => {
    api.filesOf.mockResolvedValue({ 1: { id: 41, mime: 'image/jpeg', name: 'a.jpg' } })
    const activity = { ...model, key: 'activiteit', fields: {} } as unknown as Model
    render(<Gallery view={{ ...view, model: 'activiteit' } as View} model={activity} models={{}} rows={[row(1, 'Repetitie', null), row(2, 'Opbouw', null)]} kind="foto" layout={defaults(view)} />)
    const img = await screen.findByRole('img', { name: 'Repetitie' })
    expect(img.getAttribute('src')).toBe('/api/attachments/file/41')
    expect(api.filesOf).toHaveBeenCalledTimes(1)
    expect(api.filesOf).toHaveBeenCalledWith('activiteit', [1, 2], 'foto')
    expect(within(screen.getByRole('button', { name: /Opbouw/ })).queryByRole('img')).toBeNull()
  })
})

describe('the gallery by Groep', () => {
  it('draws a section per day in order, each with its head and count, and a size from S M L', () => {
    api.filesOf.mockResolvedValue({})
    document.documentElement.lang = 'nl-BE'
    const activity = { ...model, key: 'activiteit', fields: { plandag: { type: 'date', label: 'Plandag', required: false, fact: false } } } as unknown as Model
    const at = (id: number, title: string, plandag: string): Row => ({ id, title, status: '', fields: { plandag } })
    const gallery = { ...view, model: 'activiteit' } as View
    const { container } = render(<Gallery view={gallery} model={activity} models={{}} kind="foto" size="L"
      rows={[at(1, 'Opbouw', '2026-10-14'), at(2, 'Repetitie', '2026-10-13'), at(3, 'Voorstelling', '2026-10-13')]} layout={{ ...defaults(gallery), group: 'plandag' }} />)
    const heads = [...container.querySelectorAll('.nv-gallery__head')].map((h) => h.textContent)
    expect(heads).toEqual(['Dinsdag13 oktober2', 'Woensdag14 oktober1'])
    expect(within(screen.getByRole('region', { name: 'Dinsdag' })).getAllByRole('button').map((b) => b.querySelector('.nv-gallery__title')?.textContent)).toEqual(['Repetitie', 'Voorstelling'])
    expect((container.querySelector('.nv-gallery') as HTMLElement).style.getPropertyValue('--min')).toBe('330px')
    document.documentElement.lang = ''
  })
})

describe('the gallery card', () => {
  it('without a picture shows its first letters on its tone, and the title line counts the pictures', async () => {
    api.filesOf.mockReset()
    api.filesOf.mockResolvedValue({ 1: { id: 41, mime: 'image/jpeg', name: 'a.jpg' } })
    const activity = { ...model, key: 'activiteit' } as unknown as Model
    const onShown = vi.fn()
    render(<Gallery view={{ ...view, model: 'activiteit' } as View} model={activity} models={{}} rows={[row(1, 'Repetitie', 'open'), row(2, 'opbouw Gent', 'bevestigd')]} kind="foto" layout={defaults(view)} onShown={onShown} />)
    await screen.findByRole('img', { name: 'Repetitie' })
    const card = screen.getByRole('button', { name: /opbouw Gent/ })
    expect(card.querySelector('.nv-gallery__mark')?.textContent).toBe('OG')
    expect((card.querySelector('.nv-gallery__blank') as HTMLElement).style.getPropertyValue('--s')).toBe('var(--color-success-fg)')
    expect(card.textContent).toContain('Bevestigd')
    expect(onShown).toHaveBeenLastCalledWith(expect.objectContaining({ rows: 2, groups: null, cut: false, pictures: 1 }))
  })
})

describe("the gallery card's relation line", () => {
  it("carries the tone of a record of a toned dataset, as the board card's line does; a plain dataset's none", async () => {
    api.filesOf.mockReset()
    api.filesOf.mockResolvedValue({})
    api.records.mockResolvedValue({ rows: [{ id: 2, title: 'De Kersentuin', status: '', fields: { kleur: 'rose' } }], total: 1 })
    const relation = (model: string) => ({ type: 'relation', label: 'Van', required: false, fact: false, relation: { model, multiple: false } })
    const activity = { ...model, key: 'activiteit', fields: { productie_id: relation('productie'), rol_id: relation('rol') } } as unknown as Model
    const productie = {
      key: 'productie', label: 'Producties', title_label: 'Titel', title_readonly: false, tone: 'kleur',
      fields: { kleur: { type: 'select', label: 'Kleur', required: false, fact: false, options: { rose: 'Roze' }, tones: { rose: 'rose' } } },
    } as unknown as Model
    const rol = { key: 'rol', label: 'Rollen', title_label: 'Naam', title_readonly: false, fields: {} } as unknown as Model
    const of = (id: number, title: string, fields: Record<string, unknown>, lookups: Row['lookups']): Row => ({ id, title, status: '', fields, lookups })
    const rows = [
      of(1, 'Voorstelling Brugge', { productie_id: [2] }, { productie_id: { id: 2, title: 'De Kersentuin', status: '', fields: {} } }),
      of(2, 'Opbouw', { rol_id: [5] }, { rol_id: { id: 5, title: 'Techniek', status: '', fields: {} } }),
    ]
    render(<Gallery view={{ ...view, model: 'activiteit' } as View} model={activity} models={{ activiteit: activity, productie, rol }} rows={rows} kind="foto" layout={defaults(view)} />)
    const line = (title: RegExp) => screen.getByRole('button', { name: title }).querySelector('.nv-gallery__of') as HTMLElement

    await waitFor(() => expect(line(/Voorstelling Brugge/).querySelector('i')?.style.getPropertyValue('--c')).toBe('var(--tone-rose)'))
    expect(line(/Voorstelling Brugge/).textContent).toBe('De Kersentuin')
    expect(line(/Opbouw/).textContent).toBe('Techniek')
    expect(line(/Opbouw/).querySelector('i')).toBeNull()
    expect(api.records).toHaveBeenCalledWith('productie', '')
  })
})

describe('the gallery past 200 rows', () => {
  it('reads every row’s image, 200 ids a read', async () => {
    api.filesOf.mockReset()
    api.filesOf.mockImplementation(async (_: string, ids: number[]) => (ids.includes(450) ? { 450: { id: 99, mime: 'image/png', name: 'z.png' } } : {}))
    const activity = { ...model, key: 'activiteit', fields: {} } as unknown as Model
    const rows = Array.from({ length: 450 }, (_, at) => row(at + 1, `Rij ${at + 1}`, null))
    render(<Gallery view={{ ...view, model: 'activiteit' } as View} model={activity} models={{}} rows={rows} kind="foto" layout={defaults(view)} />)
    expect((await screen.findByRole('img', { name: 'Rij 450' })).getAttribute('src')).toBe('/api/attachments/file/99')
    expect(api.filesOf.mock.calls.map(([, ids]) => ids.length)).toEqual([200, 200, 50])
  })
})

describe('the timeline', () => {
  it('draws a bar per row over its days, in lanes', () => {
    const cal = { day: 'start_datum', start: null, end: 'eind_datum', lanes: ['productie_id'], spans: true as const }
    const rows: Row[] = [{ id: 1, title: 'Brugge', status: '', fields: { start_datum: '2026-10-13', eind_datum: '2026-10-15', productie_id: 1 }, lookups: { productie_id: { id: 1, title: 'De Kersentuin', status: '', fields: {} } } }]
    render(<Timeline view={{ ...view, model: 'speelreeks' } as View} model={model} models={{}} rows={rows} cal={cal} shown={{ from: '2026-10-12', to: '2026-10-18' }} lane="productie_id" layout={defaults(view)} />)
    const lane = screen.getByRole('row', { name: 'De Kersentuin' })
    const bar = within(lane).getByRole('button', { name: /Brugge/ })
    expect([bar.style.left, bar.style.width]).toEqual(['calc(14.2857% + 2px)', 'calc(42.8571% - 4px)'])
  })
  it('without a lane, packs the bars into one shared lane by overlap, its head the count alone', () => {
    const cal = { day: 'start_datum', start: null, end: 'eind_datum', lanes: ['productie_id'], spans: true as const }
    const stop = (id: number, title: string, from: string, to: string): Row => ({ id, title, status: '', fields: { start_datum: from, eind_datum: to } })
    const rows = [stop(1, 'Brugge', '2026-10-13', '2026-10-15'), stop(2, 'Gent', '2026-10-14', '2026-10-16'), stop(3, 'Lier', '2026-10-17', '2026-10-18')]
    render(<Timeline view={{ ...view, model: 'speelreeks' } as View} model={model} models={{}} rows={rows} cal={cal} shown={{ from: '2026-10-12', to: '2026-10-18' }} lane={null} layout={defaults(view)} />)
    const lanes = screen.getAllByRole('row').filter((r) => r.classList.contains('nv-tl__lane'))
    expect(lanes).toHaveLength(1)
    expect(within(lanes[0]).getByRole('rowheader').textContent).toBe('3')
    const top = (name: RegExp) => within(lanes[0]).getByRole('button', { name }).style.top
    expect(top(/Brugge\d/)).not.toBe(top(/Gent\d/))
    expect(top(/Lier\d/)).toBe(top(/Brugge\d/))
  })
})
