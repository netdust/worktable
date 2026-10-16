import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { defaults } from './grid/layout'
import type { CalendarDef, Model, Row, SavedView, Schema, TableDef, View } from './types'
import { weekOf } from './ui/Window'

const api = vi.hoisted(() => ({
  rows: vi.fn(), records: vi.fn(), recordCount: vi.fn(() => Promise.resolve(0)), recordHistory: vi.fn(() => Promise.resolve([])),
  rowsWhere: vi.fn(() => Promise.resolve({ rows: [], total: 0 })), optionsFrom: vi.fn(() => Promise.resolve([])),
  filesOf: vi.fn(), attachmentsOf: vi.fn(), recordLink: vi.fn(), rotateRecordLink: vi.fn(), fileUrl: (id: number) => `/api/attachments/file/${id}`,
}))
vi.mock('./api', () => api)
const { SchemaContext } = await import('./grid/drawer/context')
const { Board } = await import('./board/Board')
const { Timeline } = await import('./timeline/Timeline')
const { Calendar } = await import('./calendar/Calendar')
const { Matrix } = await import('./matrix/Matrix')
const { WeekTile } = await import('./dashboard/WeekTile')
const { Dashboard } = await import('./dashboard/Dashboard')
const { Grid } = await import('./grid/Grid')
const { createStore } = await import('./grid/store')

// A query whose rows flag activities, their places and their tours, toned by its level.
const meldingen: TableDef = {
  key: 'meldingen', label: 'Meldingen', model: 'meldingen', date_field: 'dag', query: true, types: ['grid'],
  flags: { marks: { activiteit: 'activiteit_id', plaats: 'plaats_id', reeks: 'reeks_id' }, tone: 'niveau' },
}
const flagModel = {
  key: 'meldingen', label: 'Meldingen', title_label: 'Tekst', title_readonly: true,
  fields: { niveau: { type: 'select', label: 'Niveau', required: true, fact: false, options: { hoog: 'Conflict', laag: 'Let op' }, tones: { hoog: 'bad', laag: 'warn' } } },
} as unknown as Model
const TEXT = 'Sien staat dubbel ingepland.'
const flagged = { id: 1, title: TEXT, status: '', fields: { activiteit_id: 7, plaats_id: 11, reeks_id: 3, niveau: 'hoog' } }

const activiteit = {
  key: 'activiteit', label: 'Activiteiten', title_label: 'Omschrijving', title_readonly: false,
  fields: {
    status: { type: 'select', label: 'Status', required: true, fact: false, options: { optie: 'Optie', bevestigd: 'Bevestigd' } },
    plandag: { type: 'date', label: 'Plandag', required: true, fact: false },
    start_at: { type: 'datetime', label: 'Start', required: false, fact: false },
  },
} as unknown as Model
const act = (id: number, title: string, day: string, start: string | null = null): Row =>
  ({ id, title, status: '', fields: { status: 'optie', plandag: day, start_at: start } })
const rows = [act(7, 'Repetitie', '2030-01-08', '2030-01-08T10:00'), act(8, 'Opbouw', '2030-01-09', '2030-01-09T10:00')]
const SHOWN = { count: 1, label: 'Meldingen', source: 'meldingen' }

const schema = (models: Record<string, Model>): Schema => ({ models: { ...models, meldingen: flagModel }, tables: [meldingen], views: [], writable: {} })
const inSchema = (models: Record<string, Model>, node: ReactNode) =>
  render(<SchemaContext.Provider value={schema(models)}>{node}</SchemaContext.Provider>)
const flagRead = () => api.rows.mock.calls.filter(([view]) => view.model === 'meldingen')

beforeEach(() => {
  api.rows.mockImplementation(async (view: View) => (view.model === 'meldingen' ? { rows: [flagged], total: 1 } : { rows: [], total: 0 }))
  api.records.mockResolvedValue({ rows: [], total: 0 })
})
afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

describe('a flag on a board', () => {
  const view = { key: 'b', label: 'Per status', table: 'activiteit', model: 'activiteit', type: 'board', date_field: 'plandag', board: { column: 'status' } } as unknown as View
  const card = (title: string) => screen.getByRole('button', { name: new RegExp(title) })

  it("marks the flagged card with the flag's word, its text as the title; reads its rows' days; and the title line counts it", async () => {
    const onShown = vi.fn()
    inSchema({ activiteit }, <Board view={view} model={activiteit} models={{ activiteit }} rows={rows} column="status" layout={defaults(view)} onShown={onShown} />)

    await waitFor(() => expect(card('Repetitie').querySelector('.nv-flag')?.textContent).toBe('Conflict'))
    expect(card('Repetitie').querySelector('.nv-flag')?.getAttribute('title')).toBe(TEXT)
    expect(card('Opbouw').querySelector('.nv-flag')).toBeNull()
    expect(flagRead().map((call) => call.slice(1, 3))).toEqual([[{ from: '2030-01-08', to: '2030-01-09' }, null]])
    // The title line hears of the flags in an effect, which may run after the paint that marked the card.
    await waitFor(() => expect(onShown).toHaveBeenLastCalledWith(expect.objectContaining({ rows: 2, flagged: SHOWN })))

    fireEvent.click(card('Repetitie'))
    expect(within(screen.getByRole('complementary', { name: 'Repetitie' })).getByRole('alert').textContent).toContain(TEXT)
  })

  it('reads its flags again once its rows change, and a flag that ended leaves its card and the count', async () => {
    const onShown = vi.fn()
    const shown = (cards: Row[]) => <SchemaContext.Provider value={schema({ activiteit })}>
      <Board view={view} model={activiteit} models={{ activiteit }} rows={cards} column="status" layout={defaults(view)} onShown={onShown} />
    </SchemaContext.Provider>
    const { rerender } = render(shown(rows))
    await waitFor(() => expect(card('Repetitie').querySelector('.nv-flag')).not.toBeNull())

    api.rows.mockImplementation(async () => ({ rows: [], total: 0 }))
    rerender(shown([{ ...rows[0], fields: { ...rows[0].fields, status: 'bevestigd' } }, rows[1]]))
    await waitFor(() => expect(flagRead()).toHaveLength(2))
    await waitFor(() => expect(card('Repetitie').querySelector('.nv-flag')).toBeNull())
    await waitFor(() => expect(onShown).toHaveBeenLastCalledWith(expect.objectContaining({ flagged: { ...SHOWN, count: 0 } })))
  })

  it('reads no flags and marks nothing outside a schema that declares a flag query', () => {
    render(<Board view={view} model={activiteit} models={{ activiteit }} rows={rows} column="status" layout={defaults(view)} />)
    expect(document.querySelector('.nv-flag')).toBeNull()
    expect(api.rows).not.toHaveBeenCalled()
  })
})

describe('a flag on a timeline bar and a calendar event', () => {
  it("marks the flagged tour's bar with the icon, named by the flag", async () => {
    const reeks = { key: 'reeks', label: 'Reeksen', title_label: 'Naam', title_readonly: false, fields: {} } as unknown as Model
    const cal: CalendarDef = { day: 'start', start: null, end: 'einde', lanes: [], spans: true }
    const tour = (id: number, title: string): Row => ({ id, title, status: '', fields: { start: '2030-01-08', einde: '2030-01-10' } })
    const view = { key: 't', label: 'Tijdlijn', table: 'reeks', model: 'reeks', type: 'timeline', calendar: cal } as unknown as View
    const onTitle = vi.fn()
    inSchema({ reeks }, <Timeline view={view} model={reeks} models={{ reeks }} rows={[tour(3, 'Brugge'), tour(4, 'Gent')]} cal={cal}
      shown={{ from: '2030-01-07', to: '2030-01-13' }} lane={null} layout={defaults(view)} onTitle={onTitle} />)

    const bar = screen.getByRole('button', { name: /Brugge\d/ })
    expect((await within(bar).findByRole('img', { name: `Conflict: ${TEXT}` })).classList.contains('nv-flag')).toBe(true)
    expect(within(screen.getByRole('button', { name: /Gent\d/ })).queryByRole('img', { name: /^Conflict/ })).toBeNull()
    expect(flagRead().map((call) => call[1])).toEqual([{ from: '2030-01-07', to: '2030-01-13' }])
    await waitFor(() => expect(onTitle).toHaveBeenLastCalledWith(expect.objectContaining({ flagged: SHOWN })))
  })

  it('marks the flagged event on the week', async () => {
    const cal: CalendarDef = { day: 'plandag', start: 'start_at', end: null, lanes: [] }
    const view = { key: 'c', label: 'Kalender', table: 'activiteit', model: 'activiteit', type: 'calendar', calendar: cal } as unknown as View
    inSchema({ activiteit }, <Calendar view={view} model={activiteit} models={{ activiteit }} rows={rows} cal={cal}
      shown={{ from: '2030-01-07', to: '2030-01-13' }} lane={null} layout={defaults(view)} />)

    const event = screen.getByRole('button', { name: /Repetitie/ })
    expect(await within(event).findByRole('img', { name: `Conflict: ${TEXT}` })).toBeTruthy()
    expect(within(screen.getByRole('button', { name: /Opbouw/ })).queryByRole('img')).toBeNull()
  })
})

describe('a flag in a matrix cell', () => {
  const view = {
    key: 'm', label: 'Bezetting', table: 'activiteit', model: 'activiteit', type: 'matrix', date_field: 'plandag', group: 'plandag',
    join: { model: 'plaats', row_field: 'activiteit', column_field: 'persoon', name_field: 'naam', cell_field: 'stand', keys: {}, marks: { ja: '✓' }, count: 'ja' },
  } as unknown as View
  const plaats = {
    key: 'plaats', label: 'Plaatsen', title_label: 'Titel', title_readonly: false,
    fields: {
      persoon: { type: 'relation', label: 'Persoon', required: false, fact: true, relation: { model: 'persoon', multiple: false } },
      stand: { type: 'select', label: 'Stand', required: true, fact: true, options: { ja: 'Ja' } },
    },
  } as unknown as Model
  const cell = (id: number, persoon: number) => ({ id, title: '', status: '', fields: { persoon: [persoon], naam: '', stand: 'ja' } })
  const withCells = (row: Row, cells: ReturnType<typeof cell>[]): Row => ({ ...row, rollups: { cells } })

  it("marks the flagged cell by its join record, its text in the cell's name, and counts the flagged rows", async () => {
    const onShown = vi.fn()
    const models = { activiteit, plaats }
    inSchema(models, <Matrix view={view} models={models} rows={[withCells(rows[0], [cell(11, 5), cell(12, 6)]), withCells(rows[1], [cell(13, 5)])]} away={[]}
      titles={new Map([[5, 'Sien'], [6, 'Lieve']])} layout={defaults(view)} onLayout={() => undefined} emptyTitle="" onShown={onShown} />)

    const sien = await screen.findByRole('gridcell', { name: new RegExp(TEXT) })
    expect(sien.getAttribute('data-column')).toBe('record:5')
    expect(sien.closest('tr')?.getAttribute('data-title')).toBe('Repetitie')
    expect(sien.querySelector('.nv-mx__warn')?.getAttribute('title')).toBe(TEXT)
    expect(document.querySelectorAll('.nv-mx__warn')).toHaveLength(1)
    await waitFor(() => expect(onShown).toHaveBeenLastCalledWith(expect.objectContaining({ flagged: SHOWN })))
  })
})

describe("a flag on the dashboard's week", () => {
  it('marks the flagged event on the strip, reading the flags over the same week', async () => {
    const week = weekOf(new Date())
    const view = {
      key: '3', id: 3, label: 'Deze week', model: 'activiteit', table: 'activiteit', type: 'calendar', date_field: 'plandag',
      calendar: { day: 'plandag', start: null, end: null, lanes: [] }, arrangement: { hidden: [], order: [], widths: [], sort: [], filters: [], group: null, picked: [] },
    } as unknown as SavedView
    api.rows.mockImplementation(async (read: View) => ({ rows: read.model === 'meldingen' ? [flagged] : [act(7, 'Repetitie', week.from), act(8, 'Opbouw', week.from)], total: 2 }))
    inSchema({ activiteit }, <WeekTile view={view} model={activiteit} scope={null} version={0} onOpen={() => undefined} onOpenRow={() => undefined} />)

    const event = await screen.findByRole('button', { name: /Repetitie/ })
    expect(await within(event).findByRole('img', { name: `Conflict: ${TEXT}` })).toBeTruthy()
    expect(within(screen.getByRole('button', { name: /Opbouw/ })).queryByRole('img')).toBeNull()
    expect(flagRead().map((call) => call[1])).toEqual([week])
  })
})

describe("a flag in the dashboard's drawer", () => {
  it('opens a flagged bar of the week strip on its band, with Negeren', async () => {
    const week = weekOf(new Date())
    const strip = {
      key: '3', id: 3, label: 'Deze week', model: 'activiteit', table: 'activiteit', type: 'calendar', date_field: 'plandag',
      calendar: { day: 'plandag', start: null, end: null, lanes: [] }, arrangement: { hidden: [], order: [], widths: [], sort: [], filters: [], group: null, picked: [] },
      shared: true, owner: { id: -1, name: '' }, mine: false, editable: false,
    } as unknown as SavedView
    const dashboard = { ...strip, key: '9', id: 9, label: 'Overzicht', model: '', type: 'dashboard', layout: { sections: [{ label: 'Week', tiles: [{ kind: 'week', view: 3 }] }], actions: [] } } as unknown as SavedView
    api.rows.mockImplementation(async (read: View) => ({ rows: read.model === 'meldingen' ? [flagged] : [act(7, 'Repetitie', week.from)], total: 1 }))
    inSchema({ activiteit }, <Dashboard dashboard={dashboard} views={[strip]} models={{ activiteit }} tables={[]} scope={null} role="editor" onOpenView={() => undefined} onSaved={() => undefined} />)

    const bar = await screen.findByRole('button', { name: /Repetitie/ })
    await within(bar).findByRole('img', { name: `Conflict: ${TEXT}` })
    fireEvent.click(bar)
    const band = within(screen.getByRole('complementary', { name: 'Repetitie' })).getByRole('alert')
    expect(band.querySelector('.nv-dw-alert__text')?.textContent).toBe(TEXT)
    expect(within(band).getAllByRole('button').map((b) => b.textContent)).toEqual(['Negeren'])
  })
})

describe('a flag on a table view', () => {
  it('counts the flagged rows in the title line, as the skins do', async () => {
    const view = { key: 'g', label: 'Planning', table: 'activiteit', model: 'activiteit', type: 'grid', date_field: 'plandag' } as unknown as View
    const store = createStore({ model: 'activiteit', rows, api: { update: vi.fn(), create: vi.fn() } })
    const onShown = vi.fn()
    const scope = { field: 'productie_id', id: 2 }
    inSchema({ activiteit }, <Grid model={activiteit} view={view} store={store} writable={false} layout={defaults(view)} onLayout={() => undefined}
      query="" emptyTitle="" onShown={onShown} scope={scope} />)

    await waitFor(() => expect(onShown).toHaveBeenLastCalledWith(expect.objectContaining({ rows: 2, flagged: SHOWN })))
    expect(flagRead().map((call) => call.slice(1, 3))).toEqual([[{ from: '2030-01-08', to: '2030-01-09' }, null]])
  })
})
