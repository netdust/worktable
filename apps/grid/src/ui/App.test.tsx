import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { setStrings } from '../i18n'
import type { SavedView, Schema } from '../types'
import { calais, schema as calaisSchema } from '../grid/calais.test.data'

const api = vi.hoisted(() => ({
  schema: vi.fn(), rows: vi.fn(), awayRows: vi.fn(), records: vi.fn(), update: vi.fn(), create: vi.fn(), remove: vi.fn(),
  savedViews: vi.fn(), createView: vi.fn(), updateView: vi.fn(), deleteView: vi.fn(), restoreView: vi.fn(), prefs: vi.fn(), savePrefs: vi.fn(),
  me: vi.fn(), requestLink: vi.fn(), consumeLink: vi.fn(), signOut: vi.fn(), onUnauthenticated: vi.fn(),
  rowOf: vi.fn(), undoBatch: vi.fn(), runAction: vi.fn(), setDisplay: vi.fn(),
}))
vi.mock('../api', () => api)
const exporter = vi.hoisted(() => ({ exportSheet: vi.fn() }))
vi.mock('../export/download', () => exporter)
const { App } = await import('./App')

const served: Schema = {
  models: {
    activity: { key: 'activity', label: 'Activiteit', title_label: 'Titel', title_readonly: false, fields: {} },
    absence: { key: 'absence', label: 'Afwezigheid', title_label: 'Titel', title_readonly: false, fields: {} },
  },
  tables: [
    { key: 'planning', label: 'Planning', model: 'activity', date_field: 'date', types: ['grid'] },
    { key: 'absences', label: 'Afwezigheden', model: 'absence', types: ['grid'] },
  ],
  views: [
    { key: 'planning', label: 'Planning', table: 'planning', model: 'activity', date_field: 'date' },
    { key: 'absences', label: 'Afwezigheden', table: 'absences', model: 'absence' },
  ],
  writable: { activity: true, absence: false },
}

const rail = () => screen.getByRole('navigation', { name: 'Views' })
/** The app once the schema answered: the shell renders only then. */
const shell = async () => {
  const rendered = render(<App />)
  await screen.findByRole('navigation', { name: 'Views' })
  return rendered
}
/** The share menu opened, and the item it names. */
const shareItem = (name: string | RegExp) => {
  fireEvent.click(within(document.querySelector<HTMLElement>('.nv-toolbar')!).getByRole('button', { name: 'Exporteren / delen' }))
  return within(screen.getByRole('menu', { name: 'Exporteren / delen' })).getByRole('menuitem', { name })
}
/** A model's node in the tree, named by its label alone. */
const node = (model: string) => within(rail()).getByRole('treeitem', { name: model })
/** A model's name in the tree, never the view of the same name in its list. */
const tableEntry = (model: string) => within(node(model)).getAllByRole('button', { name: model })[0]
/** An open model's views. */
const typesOf = (model: string) => within(node(model)).getByRole('group', { name: 'View type' })

beforeEach(() => {
  api.me.mockResolvedValue({ id: 1, email: 'hester@example.test', role: 'editor', subject: null })
  api.onUnauthenticated.mockReturnValue(() => undefined)
  api.schema.mockResolvedValue(served)
  api.rows.mockResolvedValue({ rows: [], total: 0 })
  api.awayRows.mockResolvedValue([])
  api.records.mockResolvedValue({ rows: [], total: 0 })
  api.savedViews.mockResolvedValue([])
  api.prefs.mockResolvedValue({ order: {}, last: {} })
  api.savePrefs.mockImplementation((sent) => Promise.resolve(sent))
  exporter.exportSheet.mockResolvedValue(undefined)
})
afterEach(() => {
  cleanup()
  vi.useRealTimers()
  vi.resetAllMocks()
  setStrings(undefined)
  window.location.hash = ''
  window.localStorage.clear()
})

/** The builder's rows; with none yet, one is added so its field list can be read. */
async function builderRows(): Promise<HTMLElement[]> {
  fireEvent.click(screen.getByRole('button', { name: /^Filter\s*\d*$/ }))
  if (screen.queryAllByRole('group', { name: /^Voorwaarde/ }).length === 0) fireEvent.click(screen.getByRole('button', { name: 'Voorwaarde toevoegen' }))
  return screen.findAllByRole('group', { name: /^Voorwaarde/ })
}
const fieldList = (row: HTMLElement) => {
  fireEvent.click(within(row).getByRole('button', { name: /^Veld:/ }))
  return within(row).getByRole('listbox', { name: 'Veld' })
}
const fieldNames = (row: HTMLElement) => {
  const names = within(fieldList(row)).getAllByRole('option').map((o) => o.textContent)
  fireEvent.click(within(row).getByRole('button', { name: /^Veld:/ }))
  return names
}

describe('App shell', () => {
  it('renders the rail with the views from the schema', async () => {
    await shell()

    expect(await within(rail()).findByRole('treeitem', { name: 'Afwezigheden' })).toBeTruthy()
    expect(within(typesOf('Planning')).getByRole('button', { name: 'Planning' }).getAttribute('aria-current')).toBe('page')
    expect(tableEntry('Planning').getAttribute('aria-current')).toBeNull()
    await screen.findByText('Geen rijen')
  })

  it('lands on the same view when the sections put another model first', async () => {
    api.schema.mockResolvedValue({ ...served, sections: [{ label: 'Eerst', sources: ['absences', 'planning'] }] })
    await shell()

    expect(within(rail()).getAllByRole('treeitem')[0].getAttribute('aria-expanded')).toBe('false')
    await screen.findByText('Geen rijen')
    expect(api.rows).toHaveBeenLastCalledWith(served.views[0], expect.any(Object), null, expect.any(Object))
    expect(node('Planning').getAttribute('aria-expanded')).toBe('true')
  })

  it('opens a view named like its model from its button, twice in a row', async () => {
    await shell()
    await screen.findByText('Geen rijen')
    fireEvent.click(within(node('Afwezigheden')).getByRole('button', { name: 'Uitklappen' }))

    for (const _ of [1, 2]) {
      fireEvent.click(within(typesOf('Afwezigheden')).getByRole('button', { name: 'Afwezigheden' }))
      expect(new URLSearchParams(window.location.hash.slice(1)).get('view')).toBe('absences')
      expect(within(typesOf('Afwezigheden')).getByRole('button', { name: 'Afwezigheden' }).getAttribute('aria-current')).toBe('page')
    }
    await screen.findByText('Geen rijen')
  })

  it('falls back to the first view when the hash names an unknown one', async () => {
    window.location.hash = '#view=gone'
    await shell()

    expect(screen.getByRole('heading', { level: 1, name: 'Planning' })).toBeTruthy()
    await screen.findByText('Geen rijen')
    expect(api.rows).toHaveBeenLastCalledWith(served.views[0], expect.any(Object), null, expect.any(Object))
  })

  it("names the toolbar after the active view", async () => {
    await shell()

    expect(screen.getByRole('heading', { level: 1, name: 'Planning' })).toBeTruthy()
    await screen.findByText('Geen rijen')
  })

  it('shows the empty state when the window has no rows', async () => {
    render(<App />)

    expect(await screen.findByText('Geen rijen')).toBeTruthy()
  })

  it("shows the schema route's refusal, and asks for no rows, when the schema fails", async () => {
    api.schema.mockRejectedValue({ code: 'not_found', message: 'Engine unreachable.' })

    render(<App />)

    expect(await screen.findByText('Engine unreachable.')).toBeTruthy()
    expect(api.rows).not.toHaveBeenCalled()
  })

  it("switching view in the rail retitles the toolbar and requests that view's rows", async () => {
    await shell()
    fireEvent.click(await within(rail()).findByRole('button', { name: 'Afwezigheden' }))

    expect(screen.getByRole('heading', { level: 1, name: 'Afwezigheden' })).toBeTruthy()
    await screen.findByText('Geen rijen')
    expect(api.rows).toHaveBeenLastCalledWith(served.views[1], {}, null, expect.any(Object))
    expect(screen.queryByText(/^Week /)).toBeNull()
  })

  it("names the add button after the view's model, enabled only when it is writable", async () => {
    render(<App />)
    await screen.findByText('Geen rijen')

    const add = screen.getByRole('button', { name: 'Nieuw Activiteit' })
    expect((add as HTMLButtonElement).disabled).toBe(false)

    fireEvent.click(tableEntry('Afwezigheden'))
    expect((screen.getByRole('button', { name: 'Nieuw Afwezigheid' }) as HTMLButtonElement).disabled).toBe(true)
    await screen.findByText('Geen rijen')
  })

  it("speaks the schema's strings once it loads", async () => {
    api.schema.mockResolvedValue({ ...served, strings: { noRowsInWindow: 'Geen rijen in deze periode', new: 'Nieuw' } })

    render(<App />)

    expect(await screen.findByText('Geen rijen')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Nieuw Activiteit' })).toBeTruthy()
  })

  it('opens the view the hash names, and names the view it switches to', async () => {
    window.location.hash = '#view=absences'
    await shell()

    expect(screen.getByRole('heading', { level: 1, name: 'Afwezigheden' })).toBeTruthy()
    await screen.findByText('Geen rijen')
    fireEvent.click(tableEntry('Planning'))

    expect(new URLSearchParams(window.location.hash.slice(1)).get('view')).toBe('planning')
    await screen.findByText('Geen rijen')
  })

  it('says so when no view is declared', async () => {
    api.schema.mockResolvedValue({ ...served, views: [] })

    render(<App />)

    expect(await screen.findByText('Geen weergaven')).toBeTruthy()
    expect(api.rows).not.toHaveBeenCalled()
  })

  it('focuses the search on Cmd/Ctrl+K', async () => {
    render(<App />)
    await screen.findByText('Geen rijen')

    fireEvent.keyDown(document, { key: 'k', metaKey: true })

    expect(document.activeElement).toBe(screen.getByRole('searchbox', { name: 'Zoeken' }))
  })

  it('exports what is on screen: the view, its window and the layout\'s columns and groups', async () => {
    window.localStorage.setItem('ntdst-views/layout/v2/planning', JSON.stringify({
      hidden: ['place'], order: ['title', 'kind', 'date'], widths: {}, sort: [{ id: 'start', desc: true }],
      filters: [{ field: 'date', op: 'between', values: ['2026-05-18', '2026-05-24'] }], group: 'date',
    }))
    const tabel = { ...calaisSchema.views[0], label: 'Tabel', table: 'planning', table_label: 'Planning' }
    api.schema.mockResolvedValue({ ...calaisSchema, views: [tabel] })
    api.rows.mockResolvedValue({ rows: calais, total: calais.length })

    render(<App />)
    await screen.findByText('Montage')
    fireEvent.click(shareItem('Excel'))

    expect(exporter.exportSheet).toHaveBeenCalledTimes(1)
    const [view, columns, groups, range, title] = exporter.exportSheet.mock.calls[0]
    expect(view).toBe(tabel)
    expect(title).toBe('Planning')
    expect(range).toEqual({ from: '2026-05-18', to: '2026-05-24' })
    expect(columns.map((c: { id: string }) => c.id).slice(0, 3)).toEqual(['title', 'kind', 'start'])
    expect(columns.map((c: { id: string }) => c.id)).not.toContain('place')
    expect(columns.map((c: { id: string }) => c.id)).not.toContain('date')
    expect(groups.map((g: { key: string }) => g.key)).toEqual(['2026-05-18', '2026-05-19', '2026-05-20'])
    expect(groups[0].rows.map((r: { title: string }) => r.title)).toEqual(['Lunch bistrot', 'Montage', 'Auto Pavel + Sien'])
    expect(groups[1].rows.map((r: { title: string }) => r.title)).toEqual(['Présentation interne', 'Repetitie'])
    window.localStorage.clear()
  })

  it("marks the facts of the group the read limit may have cut short with …", async () => {
    const facts = [{ kind: 'count' as const, where: { kind: 'meal' }, label: 'maaltijd' }]
    api.schema.mockResolvedValue({ ...calaisSchema, views: [{ ...calaisSchema.views[0], facts }] })
    api.rows.mockResolvedValue({ rows: calais, total: 5000 })

    render(<App />)
    await screen.findByText('Montage')

    const factOf = (day: string) => [...document.querySelectorAll('tr.nv-group')]
      .find((b) => b.querySelector('.nv-group__label')?.textContent === day)?.querySelector('.nv-group__fact')?.textContent
    expect(factOf('Monday May 18')).toBe('1 maaltijd')
    expect(factOf('Wednesday May 20')).toBe('… maaltijd')
  })

  it('says so when the export fails', async () => {
    exporter.exportSheet.mockRejectedValue(new Error('Failed to fetch dynamically imported module'))
    api.schema.mockResolvedValue(calaisSchema)
    api.rows.mockResolvedValue({ rows: calais, total: calais.length })

    render(<App />)
    await screen.findByText('Montage')
    fireEvent.click(shareItem('Excel'))

    expect((await screen.findByRole('alert')).textContent).toBe('Exporteren mislukt')
  })
})

describe('the density setting', () => {
  afterEach(() => document.getElementById('root')?.remove())

  it('sets data-density on the root from the rail foot, and keeps it when the app renders again', async () => {
    const root = Object.assign(document.createElement('div'), { id: 'root' })
    document.body.append(root)
    await shell()
    const density = () => within(within(rail()).getByRole('contentinfo')).getByRole('radiogroup', { name: 'Dichtheid' })

    expect(root.dataset.density).toBe('normal')
    fireEvent.click(within(density()).getByRole('radio', { name: 'Compact' }))
    expect(root.dataset.density).toBe('compact')

    cleanup()
    root.removeAttribute('data-density')
    await shell()

    expect(root.dataset.density).toBe('compact')
    expect(within(density()).getByRole('radio', { name: 'Compact' }).getAttribute('aria-checked')).toBe('true')
  })
})

describe('the production space', () => {
  const production = { key: 'production', label: 'Producties', title_label: 'Titel', title_readonly: false, fields: {} }
  const spaced: Schema = {
    models: {
      activity: {
        key: 'activity', label: 'Activiteit', title_label: 'Titel', title_readonly: false,
        fields: {
          production: { type: 'relation', label: 'Productie', required: false, fact: true, relation: { model: 'production', multiple: false } },
          status: { type: 'select', label: 'Status', required: true, fact: true, options: { confirmed: 'Bevestigd', option: 'Optie' } },
        },
      },
      absence: served.models.absence,
      production,
    },
    tables: [
      { key: 'planning', label: 'Planning', model: 'activity', date_field: 'date', space: 'scoped', types: ['grid'] },
      { key: 'absences', label: 'Afwezigheden', model: 'absence', space: 'global', types: ['grid'] },
    ],
    views: [
      { key: 'planning', label: 'Planning', table: 'planning', model: 'activity', date_field: 'date', space: 'scoped' },
      { key: 'absences', label: 'Afwezigheden', table: 'absences', model: 'absence', space: 'global' },
    ],
    space: { field: 'production', model: 'production' },
    writable: { activity: true, absence: false },
  }
  const productions = [
    { id: 7, title: 'Glimworm', status: 'publish', fields: {} },
    { id: 9, title: 'Wat de uil zag', status: 'publish', fields: {} },
  ]
  const key = () => `ntdst-views:${window.location.host}:production`
  const activities = [
    { id: 1, title: 'Montage', status: 'publish', fields: { production: [7], status: 'confirmed' }, lookups: { production: { id: 7, title: 'Glimworm', status: 'publish', fields: {} } } },
  ]

  beforeEach(() => {
    window.localStorage.clear()
    api.schema.mockResolvedValue(spaced)
    api.records.mockResolvedValue({ rows: productions, total: 2 })
  })

  /** The switcher's button: its name is the selected record's, or "Alle producties". */
  const switcher = (name: string) => within(rail()).findByRole('button', { name })
  const choose = async (from: string, to: string) => {
    fireEvent.click(await switcher(from))
    fireEvent.click(await within(rail()).findByRole('option', { name: to }))
  }

  it('heads the rail with every production, and lists them after "Alle producties" in a searchable list', async () => {
    await shell()

    fireEvent.click(await switcher('Alle producties'))
    const options = await within(rail()).findAllByRole('option')
    expect(options.map((o) => o.textContent)).toEqual(['Alle producties', 'Glimworm', 'Wat de uil zag'])
    expect(options[0].getAttribute('aria-selected')).toBe('true')
    expect(api.records).toHaveBeenCalledWith('production', '')

    fireEvent.change(within(rail()).getByRole('combobox', { name: 'Producties zoeken' }), { target: { value: 'uil' } })
    expect(within(rail()).getAllByRole('option').map((o) => o.textContent)).toEqual(['Wat de uil zag'])
  })

  it('asks a scoped view for every row under "Alle producties", for the chosen production\'s once switched, and for every row again', async () => {
    await shell()
    await screen.findByText('Geen rijen')
    expect(api.rows).toHaveBeenLastCalledWith(spaced.views[0], expect.any(Object), null, expect.any(Object))

    await choose('Alle producties', 'Wat de uil zag')
    expect(await switcher('Wat de uil zag')).toBeTruthy()
    await waitFor(() => expect(api.rows).toHaveBeenLastCalledWith(spaced.views[0], expect.any(Object), { field: 'production', id: 9 }, expect.any(Object)))

    await choose('Wat de uil zag', 'Alle producties')
    await waitFor(() => expect(api.rows).toHaveBeenLastCalledWith(spaced.views[0], expect.any(Object), null, expect.any(Object)))
    expect(window.localStorage.getItem(key())).toBe('all')
  })

  it('pre-fills a new row with the chosen production', async () => {
    const titled = { ...spaced, models: { ...spaced.models, activity: { ...spaced.models.activity, title_readonly: true } } }
    api.schema.mockResolvedValue(titled)
    api.create.mockResolvedValue({ row: { id: 2, title: '', status: 'publish', fields: { production: [9], status: 'confirmed' } }, batch: 'b1' })
    window.localStorage.setItem(key(), '9')
    await shell()
    await waitFor(() => expect(api.rows).toHaveBeenLastCalledWith(spaced.views[0], expect.any(Object), { field: 'production', id: 9 }, expect.any(Object)))

    fireEvent.click(screen.getByRole('button', { name: 'Nieuw Activiteit' }))

    await waitFor(() => expect(api.create).toHaveBeenCalledWith('activity', expect.objectContaining({ production: [9] })))
  })

  it('puts the served sections first and an undeclared source in a last unlabelled one, and asks a global view for every row', async () => {
    api.schema.mockResolvedValue({ ...spaced, sections: [{ label: 'Werk', sources: ['planning'] }] })
    await shell()
    const tree = within(rail()).getByRole('tree', { name: 'Views' })
    const [werk, rest] = within(tree).getAllByRole('group').filter((group) => group.parentElement === tree)

    expect(werk.getAttribute('aria-label')).toBe('Werk')
    expect(within(werk).getByRole('treeitem', { name: 'Planning' })).toBeTruthy()
    expect(rest.getAttribute('aria-label')).toBeNull()
    fireEvent.click(within(within(rest).getByRole('treeitem', { name: 'Afwezigheden' })).getAllByRole('button', { name: 'Afwezigheden' })[0])

    await screen.findByText('Geen rijen')
    expect(api.rows).toHaveBeenLastCalledWith(spaced.views[1], {}, null, expect.any(Object))
  })

  it('offers a filter on the production under "Alle producties", and none once one is chosen', async () => {
    api.rows.mockResolvedValue({ rows: activities, total: 1 })
    render(<App />)
    await screen.findByText('Montage')
    expect(fieldNames((await builderRows())[0] as HTMLElement)).toContain('Productie')
    fireEvent.click(screen.getByRole('button', { name: /^Filter\s*\d*$/ }))

    await choose('Alle producties', 'Glimworm')
    await waitFor(() => expect(api.rows).toHaveBeenLastCalledWith(spaced.views[0], expect.any(Object), { field: 'production', id: 7 }, expect.any(Object)))
    await screen.findByText('Montage')
    const offered = fieldNames((await builderRows())[0] as HTMLElement)

    expect(offered).toContain('Status')
    expect(offered).not.toContain('Productie')
  })

  it('keeps the selection across a remount, per site', async () => {
    const first = await shell()
    await choose('Alle producties', 'Wat de uil zag')
    await screen.findByText('Geen rijen')
    first.unmount()

    expect(window.localStorage.getItem(key())).toBe('9')
    await shell()
    expect(await switcher('Wat de uil zag')).toBeTruthy()
    await waitFor(() => expect(api.rows).toHaveBeenLastCalledWith(spaced.views[0], expect.any(Object), { field: 'production', id: 9 }, expect.any(Object)))
  })

  it('never asks to choose: with no production at all a scoped view loads every row', async () => {
    api.records.mockResolvedValue({ rows: [], total: 0 })
    await shell()

    await screen.findByText('Geen rijen')
    expect(api.rows).toHaveBeenLastCalledWith(spaced.views[0], expect.any(Object), null, expect.any(Object))
    expect(await switcher('Alle producties')).toBeTruthy()
  })
})

describe('a matrix view', () => {
  const join = {
    model: 'assignment', row_field: 'activity', column_field: 'person', name_field: 'name', cell_field: 'status', note_field: 'note',
    keys: { x: 'confirmed' }, marks: { confirmed: '✓' }, count: 'confirmed',
  }
  const bezetting = {
    key: 'bezetting', label: 'Bezetting', table: 'bezetting', model: 'activity', type: 'matrix' as const, date_field: 'date', space: 'global' as const,
    join, away: { table: 'afwezigheden', column_field: 'person', label_field: 'reason', model: 'absence', date_field: 'from', end_field: 'to' },
  }
  const absences = { key: 'afwezigheden', label: 'Afwezigheden', table: 'afwezigheden', model: 'absence', date_field: 'from', end_field: 'to' }
  const tables = [
    { key: 'bezetting', label: 'Bezetting', model: 'activity', types: ['grid' as const, 'matrix' as const] },
    { key: 'afwezigheden', label: 'Afwezigheden', model: 'absence', types: ['grid' as const] },
  ]
  const matrixSchema: Schema = {
    models: {
      ...served.models,
      assignment: {
        key: 'assignment', label: 'Toewijzing', title_label: 'Titel', title_readonly: false,
        fields: { person: { type: 'relation', label: 'Persoon', required: false, fact: true, relation: { model: 'person', multiple: false } } },
      },
    },
    tables,
    views: [bezetting, absences],
    writable: { activity: true, assignment: true, absence: false },
  }
  const montage = { id: 1, title: 'Montage', status: 'publish', fields: { date: '2026-05-18' }, rollups: { cells: [{ id: 11, title: 'j', status: 'publish', fields: { person: [5], status: 'confirmed' } }] } }

  beforeEach(() => {
    window.location.hash = '#view=bezetting'
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date(2026, 4, 20, 10, 0))
    api.schema.mockResolvedValue(matrixSchema)
    api.rows.mockImplementation((v: { table: string }) => Promise.resolve({ rows: v.table === 'bezetting' ? [montage] : [], total: 1 }))
    api.records.mockResolvedValue({ rows: [{ id: 5, title: 'Sien', status: 'publish', fields: {} }], total: 1 })
  })

  it('reads the current week when its date condition spans over 92 days, and shows no error', async () => {
    window.localStorage.setItem('ntdst-views/layout/v2/bezetting', JSON.stringify({
      hidden: [], order: [], widths: {}, sort: [], filters: [{ field: 'date', op: 'between', values: ['2026-01-01', '2026-04-30'] }], group: null,
    }))
    render(<App />)

    expect(await screen.findByRole('grid', { name: 'Bezetting' })).toBeTruthy()
    const [, asked] = api.rows.mock.calls.at(-1) as [unknown, { from: string; to: string }]
    expect((Date.parse(asked.to) - Date.parse(asked.from)) / 86_400_000).toBe(6)
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it("fetches the matrix view's rows and the away view's rows, and shows the matrix", async () => {
    render(<App />)

    expect(await screen.findByRole('grid', { name: 'Bezetting' })).toBeTruthy()
    await screen.findByRole('columnheader', { name: 'Sien' })
    const window = { from: '2026-05-18', to: '2026-05-24' }
    expect(api.rows).toHaveBeenCalledWith(matrixSchema.views[0], window, null, expect.any(Object))
    expect(api.awayRows).toHaveBeenCalledWith(bezetting.away, window)
    expect(api.records).toHaveBeenCalledWith('person', '')
  })

  it('has no add button and a disabled export with its word', async () => {
    render(<App />)
    await screen.findByRole('grid', { name: 'Bezetting' })

    expect(screen.queryByRole('button', { name: /^New/ })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Exporteren' })).toBeNull()
    const item = shareItem(/^Excel/)
    expect(item.getAttribute('aria-disabled')).toBe('true')
    expect(within(item).getByText('De matrix wordt nog niet geëxporteerd')).toBeTruthy()
  })

  it('builds no grid store: the grid view of the same model is not drawn', async () => {
    render(<App />)
    await screen.findByRole('grid', { name: 'Bezetting' })

    expect(document.querySelector('[data-column="title"]')).toBeNull()
    expect(api.update).not.toHaveBeenCalled()
    expect(api.create).not.toHaveBeenCalled()
  })

  it('writes a typed status to the join model, says Saved and offers the undo', async () => {
    api.create.mockResolvedValue({ row: { id: 99, title: 'j', status: 'publish', fields: { activity: [2], person: [5], status: 'confirmed' } }, batch: 'b1' })
    const leeg = { id: 2, title: 'Leeg', status: 'publish', fields: { date: '2026-05-18' }, rollups: { cells: [] } }
    api.rows.mockImplementation((v: { table: string }) => Promise.resolve({ rows: v.table === 'bezetting' ? [montage, leeg] : [], total: 2 }))
    render(<App />)
    await screen.findByRole('columnheader', { name: 'Sien' })
    const cell = screen.getByRole('row', { name: /Leeg/ }).querySelector<HTMLElement>('[data-column="record:5"]')!

    fireEvent.click(cell)
    fireEvent.keyDown(cell, { key: 'x' })

    expect(api.create).toHaveBeenCalledWith('assignment', { activity: [2], person: [5], status: 'confirmed' })
    expect(await screen.findByRole('button', { name: 'Ongedaan maken' })).toBeTruthy()
    expect(screen.queryByText('Opgeslagen')).toBeNull()
  })

  it('keeps a written cell and its undo through a save of a saved matrix view', async () => {
    const empty = { hidden: [], order: [], widths: [], sort: [], filters: [], group: null, picked: [] }
    const mine: SavedView = { ...bezetting, key: '42', id: 42, label: 'Calais techniek', starting: false, arrangement: empty,
      shared: false, owner: { id: 1, name: 'Hester' }, mine: true, editable: true, public: true }
    window.location.hash = '#view=42&from=2026-05-18&to=2026-05-24'
    window.localStorage.setItem('ntdst-views/layout/v2/42', JSON.stringify({ hidden: ['name:lieve'], order: [], widths: {}, sort: [], filters: [], group: null }))
    api.savedViews.mockResolvedValue([mine])
    api.updateView.mockResolvedValue({ ...mine, arrangement: { ...empty, hidden: ['name:lieve'] } })
    api.create.mockResolvedValue({ row: { id: 99, title: 'j', status: 'publish', fields: { activity: [2], person: [5], status: 'confirmed' } }, batch: 'b1' })
    api.remove.mockResolvedValue({ deleted: true })
    const leeg = { id: 2, title: 'Leeg', status: 'publish', fields: { date: '2026-05-18' }, rollups: { cells: [] } }
    api.rows.mockImplementation((v: { table: string }) => Promise.resolve({ rows: v.table === 'bezetting' ? [montage, leeg] : [], total: 2 }))
    render(<App />)
    await screen.findByRole('columnheader', { name: 'Sien' })
    const cell = () => screen.getByRole('row', { name: /Leeg/ }).querySelector<HTMLElement>('[data-column="record:5"]')!
    fireEvent.click(cell())
    fireEvent.keyDown(cell(), { key: 'x' })
    await screen.findByRole('button', { name: 'Ongedaan maken' })

    fireEvent.click(within(document.querySelector<HTMLElement>('.nv-toolbar')!).getByRole('button', { name: 'More actions' }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Publieke weergave bijwerken' }))
    await waitFor(() => expect(window.localStorage.getItem('ntdst-views/layout/v2/42')).toBeNull())

    expect(api.updateView).toHaveBeenCalled()
    expect(cell().textContent).toBe('✓')
    fireEvent.click(screen.getByRole('button', { name: 'Ongedaan maken' }))
    await waitFor(() => expect(api.remove).toHaveBeenCalledWith('assignment', 99))
    expect(api.rows.mock.calls.filter(([v]) => (v as { table: string }).table === 'bezetting')).toHaveLength(1)
  })

  it('fetches the matrix rows again after a refused write, and shows what another tab stored under the message', async () => {
    api.create.mockRejectedValue({ code: 'duplicate_assignment', message: 'Already on it.' })
    const leeg = { id: 2, title: 'Leeg', status: 'publish', fields: { date: '2026-05-18' }, rollups: { cells: [] } }
    const taken = { ...leeg, rollups: { cells: [{ id: 77, title: 'j', status: 'publish', fields: { activity: [2], person: [5], status: 'confirmed' } }] } }
    let calls = 0
    api.rows.mockImplementation((v: { table: string }) => {
      if (v.table !== 'bezetting') return Promise.resolve({ rows: [], total: 0 })
      calls++
      return Promise.resolve({ rows: [montage, calls === 1 ? leeg : taken], total: 2 })
    })
    render(<App />)
    await screen.findByRole('columnheader', { name: 'Sien' })
    const cell = () => screen.getByRole('row', { name: /Leeg/ }).querySelector<HTMLElement>('[data-column="record:5"]')!

    fireEvent.click(cell())
    fireEvent.keyDown(cell(), { key: 'x' })

    await waitFor(() => expect(calls).toBe(2))
    await waitFor(() => expect(cell().textContent).toBe('✓Already on it.'))
  })

  it('reads the join model\'s writer, not the row model\'s: no writer, no write', async () => {
    api.schema.mockResolvedValue({ ...matrixSchema, writable: { activity: true, assignment: false } })
    render(<App />)
    await screen.findByRole('columnheader', { name: 'Sien' })
    const cell = screen.getByRole('row', { name: /Montage/ }).querySelector<HTMLElement>('[data-column="record:5"]')!

    fireEvent.click(cell)
    fireEvent.keyDown(cell, { key: 'Delete' })

    expect(api.remove).not.toHaveBeenCalled()
    expect(screen.getByRole('grid', { name: 'Bezetting' }).getAttribute('aria-readonly')).toBe('true')
  })

  it('asks for a week when the window is not set, in the site\'s words', async () => {
    api.rows.mockRejectedValue({ code: 'views_window_required', message: 'A window is required' })
    api.schema.mockResolvedValue({ ...matrixSchema, strings: { 'error.views_window_required': 'Kies eerst een week' } })
    render(<App />)

    expect(await screen.findByText('Kies eerst een week')).toBeTruthy()
  })
})

describe('a matrix view with the table\'s filters', () => {
  const join = {
    model: 'assignment', row_field: 'activity', column_field: 'person', name_field: 'name', cell_field: 'status',
    keys: { x: 'confirmed' }, marks: { confirmed: '✓' }, count: 'confirmed',
  }
  const bezetting = {
    key: 'bezetting', label: 'Bezetting', table: 'bezetting', model: 'activity', type: 'matrix' as const, date_field: 'date', space: 'global' as const,
    filters: ['location'], join,
  }
  const tables = [{ key: 'bezetting', label: 'Bezetting', model: 'activity', types: ['grid' as const, 'matrix' as const] }]
  const schemaWith: Schema = {
    models: {
      activity: {
        key: 'activity', label: 'Activiteit', title_label: 'Titel', title_readonly: false,
        fields: {
          date: { type: 'date', label: 'Datum', required: true, fact: true },
          location: { type: 'relation', label: 'Locatie', required: false, fact: true, relation: { model: 'location', multiple: false } },
        },
      },
      assignment: {
        key: 'assignment', label: 'Toewijzing', title_label: 'Titel', title_readonly: false,
        fields: { person: { type: 'relation', label: 'Persoon', required: false, fact: true, relation: { model: 'person', multiple: false } } },
      },
    },
    tables,
    views: [bezetting],
    writable: { activity: true, assignment: true },
  }
  const at = (id: number, title: string, place: number, name: string) => ({
    id, title, status: 'publish', fields: { date: '2026-05-18', location: [place] },
    lookups: { location: { id: place, title: place === 3 ? 'Zaal' : 'Tuin', status: 'publish', fields: {} } },
    rollups: { cells: [{ id: id * 10, title: 'j', status: 'publish', fields: { name, status: 'confirmed', person: [] } }] },
  })

  beforeEach(() => {
    window.location.hash = '#view=bezetting'
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date(2026, 4, 20, 10, 0))
    api.schema.mockResolvedValue(schemaWith)
    api.rows.mockResolvedValue({ rows: [at(1, 'Montage', 3, 'Lieve'), at(2, 'Repetitie', 4, 'Lieve')], total: 2 })
    api.records.mockResolvedValue({ rows: [], total: 0 })
  })
  afterEach(() => window.localStorage.clear())

  const bar = () => document.querySelector<HTMLElement>('.nv-bar')!

  it('offers the table\'s filter fields on the matrix in the bar after + Column, not in the toolbar', async () => {
    render(<App />)

    await screen.findByRole('button', { name: 'Filter' })
    expect(within(bar()).getAllByRole('button').map((b) => b.textContent)).toEqual(['+ Kolom', 'Filter'])
    expect(within(screen.getByRole('banner')).queryByRole('button', { name: 'Filter' })).toBeNull()
  })

  it('keeps the bar and its chip when the filter leaves no row, so the chip can be taken off', async () => {
    window.localStorage.setItem('ntdst-views/layout/v2/bezetting', JSON.stringify({
      hidden: [], order: [], widths: {}, sort: [], filters: [{ field: 'location', op: 'in', values: ['9'] }], group: null,
    }))
    api.rows.mockImplementation((_v: unknown, _w: unknown, _s: unknown, layout: { filters: unknown[] }) =>
      Promise.resolve(layout.filters.length ? { rows: [], total: 0 } : { rows: [at(1, 'Montage', 3, 'Lieve'), at(2, 'Repetitie', 4, 'Lieve')], total: 2 }))
    render(<App />)

    expect(await screen.findByText('Geen rijen voor deze zoekterm of filters')).toBeTruthy()
    fireEvent.click(await within(bar()).findByRole('button', { name: 'Filter Locatie wissen' }))

    expect(await screen.findByRole('row', { name: /Repetitie/ })).toBeTruthy()
  })

  it('names a relation filter\'s record on a window with no rows, from the related model\'s records', async () => {
    window.localStorage.setItem('ntdst-views/layout/v2/bezetting', JSON.stringify({
      hidden: [], order: [], widths: {}, sort: [], filters: [{ field: 'location', op: 'in', values: ['9'] }], group: null,
    }))
    api.rows.mockResolvedValue({ rows: [], total: 0 })
    let answer: (value: unknown) => void = () => undefined
    api.records.mockImplementation((model: string) => model === 'location'
      ? new Promise((resolve) => { answer = resolve })
      : Promise.resolve({ rows: [], total: 0 }))
    render(<App />)

    await waitFor(() => expect(api.records).toHaveBeenCalledWith('location', ''))
    expect(bar().querySelector('.nv-chip--filter'), 'no chip reading the id while the name is asked').toBeNull()
    await act(async () => answer({ rows: [{ id: 9, title: 'Zaal Calais', status: 'publish', fields: {} }], total: 1 }))

    expect(bar().querySelector('.nv-chip--filter')?.textContent).toContain('Zaal Calais')
  })

  it('names a relation filter by its id when its record cannot be found', async () => {
    window.localStorage.setItem('ntdst-views/layout/v2/bezetting', JSON.stringify({
      hidden: [], order: [], widths: {}, sort: [], filters: [{ field: 'location', op: 'in', values: ['9'] }], group: null,
    }))
    api.rows.mockResolvedValue({ rows: [], total: 0 })
    api.records.mockImplementation((model: string) => (model === 'location' ? Promise.reject(new Error('offline')) : Promise.resolve({ rows: [], total: 0 })))
    render(<App />)

    await waitFor(() => expect(bar().querySelector('.nv-chip--filter')?.textContent).toContain('9'))
  })

  it('asks the server for a filtered location, and counts the rows it sends', async () => {
    window.localStorage.setItem('ntdst-views/layout/v2/bezetting', JSON.stringify({
      hidden: [], order: [], widths: {}, sort: [], filters: [{ field: 'location', op: 'in', values: ['3'] }], group: null,
    }))
    api.rows.mockResolvedValue({ rows: [at(1, 'Montage', 3, 'Lieve')], total: 1 })
    render(<App />)

    await screen.findByRole('row', { name: /Montage/ })
    expect(api.rows).toHaveBeenLastCalledWith(expect.objectContaining({ key: 'bezetting' }), expect.any(Object), null,
      expect.objectContaining({ filters: [{ field: 'location', op: 'in', values: ['3'] }] }))

    expect(screen.queryByRole('row', { name: /Repetitie/ })).toBeNull()
    expect(within(screen.getByTestId('total')).getAllByTestId('column-count').map((c) => c.textContent)).toEqual(['1'])
  })
})

describe('a table with two views', () => {
  const join = {
    model: 'assignment', row_field: 'activity', column_field: 'person', name_field: 'name', cell_field: 'status', note_field: 'note',
    keys: { x: 'confirmed' }, marks: { confirmed: '✓' }, count: 'confirmed',
  }
  const tabel = { key: 'planning', label: 'Tabel', model: 'activity', date_field: 'date', space: 'scoped' as const, table: 'planning', table_label: 'Planning' }
  const matrix = {
    key: 'bezetting', label: 'Matrix', model: 'activity', type: 'matrix' as const, date_field: 'date', space: 'scoped' as const, table: 'planning', table_label: 'Planning',
    join, away: { table: 'afwezigheden', column_field: 'person', label_field: 'reason', model: 'absence', date_field: 'from', end_field: 'to' },
  }
  const absences = { key: 'afwezigheden', label: 'Tabel', model: 'absence', date_field: 'from', end_field: 'to', space: 'global' as const, table: 'afwezigheden', table_label: 'Afwezigheden' }
  const tables = [
    { key: 'planning', label: 'Planning', model: 'activity', space: 'scoped' as const, types: ['grid' as const, 'matrix' as const] },
    { key: 'afwezigheden', label: 'Afwezigheden', model: 'absence', space: 'global' as const, types: ['grid' as const] },
  ]
  const schema: Schema = {
    models: {
      ...served.models,
      production: { key: 'production', label: 'Producties', title_label: 'Titel', title_readonly: false, fields: {} },
      assignment: {
        key: 'assignment', label: 'Toewijzing', title_label: 'Titel', title_readonly: false,
        fields: { person: { type: 'relation', label: 'Persoon', required: false, fact: true, relation: { model: 'person', multiple: false } } },
      },
    },
    tables,
    views: [tabel, matrix, absences],
    space: { field: 'production', model: 'production' },
    writable: { activity: true, assignment: true, absence: false },
  }
  const montage = { id: 1, title: 'Montage', status: 'publish', fields: { date: '2026-05-18' }, rollups: { cells: [] } }
  const week = { from: '2026-05-18', to: '2026-05-24' }
  const types = () => typesOf('Planning')

  beforeEach(() => {
    window.localStorage.clear()
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date(2026, 4, 20, 10, 0))
    api.schema.mockResolvedValue(schema)
    api.rows.mockImplementation((v: { table: string }) => Promise.resolve({ rows: v.table === 'afwezigheden' ? [] : [montage], total: 1 }))
    api.records.mockImplementation((model: string) => Promise.resolve(model === 'production'
      ? { rows: [{ id: 7, title: 'Glimworm', status: 'publish', fields: {} }, { id: 9, title: 'Wat de uil zag', status: 'publish', fields: {} }], total: 2 }
      : { rows: [], total: 0 }))
  })

  it("names the toolbar after the view, and the grid and the matrix after the table's label", async () => {
    render(<App />)
    expect(await screen.findByRole('grid', { name: 'Planning' })).toBeTruthy()
    expect(screen.getByRole('heading', { level: 1, name: 'Tabel' })).toBeTruthy()

    fireEvent.click(within(types()).getByRole('button', { name: 'Matrix' }))

    expect(screen.getByRole('heading', { level: 1, name: 'Matrix' })).toBeTruthy()
    await waitFor(() => expect(document.querySelector('table.nv-mx[aria-label="Planning"]')).toBeTruthy())
  })

  it("keeps the production when switching the table's view; the matrix reads this week, the table no window", async () => {
    await shell()
    fireEvent.click(await within(rail()).findByRole('button', { name: 'Alle producties' }))
    fireEvent.click(await within(rail()).findByRole('option', { name: 'Wat de uil zag' }))
    await screen.findByRole('grid', { name: 'Planning' })
    await waitFor(() => expect(api.rows).toHaveBeenLastCalledWith(tabel, {}, { field: 'production', id: 9 }, expect.any(Object)))

    fireEvent.click(within(types()).getByRole('button', { name: 'Matrix' }))

    const hash = () => new URLSearchParams(window.location.hash.slice(1))
    await waitFor(() => expect(api.rows).toHaveBeenCalledWith(matrix, week, { field: 'production', id: 9 }, expect.any(Object)))
    expect([hash().get('view'), hash().get('from'), hash().get('to')]).toEqual(['bezetting', null, null])
    expect(within(rail()).getByRole('button', { name: 'Wat de uil zag' })).toBeTruthy()

    fireEvent.click(within(types()).getByRole('button', { name: 'Tabel' }))
    await waitFor(() => expect(api.rows).toHaveBeenLastCalledWith(tabel, {}, { field: 'production', id: 9 }, expect.any(Object)))
    expect(hash().get('view')).toBe('planning')
  })
  describe('the view a table opens on (V21)', () => {
    const view = () => new URLSearchParams(window.location.hash.slice(1)).get('view')
    const entry = tableEntry
    const render2 = () => render(<App />)

    it('opens the view last used there on a click on the table, and keeps it in the prefs', async () => {
      render2()
      await screen.findByRole('grid', { name: 'Planning' })

      fireEvent.click(within(types()).getByRole('button', { name: 'Matrix' }))
      fireEvent.click(await within(node('Afwezigheden')).findByRole('button', { name: 'Afwezigheden' }))
      expect(view()).toBe('afwezigheden')
      fireEvent.click(entry('Planning'))

      expect(view()).toBe('bezetting')
      await waitFor(() => expect(api.savePrefs).toHaveBeenCalled())
      expect(api.savePrefs).toHaveBeenCalledOnce()
      expect(api.savePrefs).toHaveBeenLastCalledWith({ order: {}, last: { planning: 'bezetting', afwezigheden: 'afwezigheden' } })
    })

    it('opens the stored last view on a click, or the first in the user\'s order once that view is gone', async () => {
      window.location.hash = '#view=afwezigheden&from=2026-05-18&to=2026-05-24'
      api.prefs.mockResolvedValue({ order: { planning: ['bezetting', 'planning'] }, last: { planning: 'planning' } })
      render2()
      await screen.findByText('Geen rijen')

      fireEvent.click(entry('Planning'))
      expect(view()).toBe('planning')

      cleanup()
      window.location.hash = '#view=afwezigheden&from=2026-05-18&to=2026-05-24'
      api.prefs.mockResolvedValue({ order: { planning: ['bezetting', 'planning'] }, last: { planning: '99' } })
      render2()
      await screen.findByText('Geen rijen')

      fireEvent.click(entry('Planning'))
      expect(view()).toBe('bezetting')
    })

    it('lands on the first table\'s first view in the user\'s order without a view in the hash, never the last, and stores nothing', async () => {
      api.prefs.mockResolvedValue({ order: { planning: ['bezetting', 'planning'] }, last: { planning: 'planning' } })
      render2()

      await waitFor(() => expect(document.querySelector('table.nv-mx[aria-label="Planning"]')).toBeTruthy())
      expect(within(types()).getByRole('button', { name: 'Matrix' }).getAttribute('aria-current')).toBe('page')
      await new Promise((resolve) => setTimeout(resolve, 700))
      expect(api.savePrefs).not.toHaveBeenCalled()
    })
  })
})

describe('saved views', () => {
  const empty = { hidden: [], order: [], widths: [], sort: [], filters: [], group: null, picked: [] }
  const calais: SavedView = {
    key: '42', id: 42, label: 'Calais techniek', table: 'planning', table_label: 'Planning', model: 'activity', date_field: 'date', type: 'grid',
    starting: false, arrangement: empty, shared: false, owner: { id: 1, name: 'Hester' }, mine: true, editable: true,
  }
  const types = () => typesOf('Planning')
  const hash = () => new URLSearchParams(window.location.hash.slice(1)).get('view')
  const local = (key: string) => window.localStorage.getItem(`ntdst-views/layout/v2/${key}`)
  const changeLocally = (key: string) => window.localStorage.setItem(`ntdst-views/layout/v2/${key}`, JSON.stringify({
    hidden: ['place'], order: [], widths: {}, sort: [], filters: [], group: null,
  }))
  const toolbar = () => document.querySelector<HTMLElement>('.nv-toolbar')!
  const more = () => {
    fireEvent.click(within(toolbar()).getByRole('button', { name: 'More actions' }))
    return screen.getByRole('menu', { name: 'More actions' })
  }

  beforeEach(() => window.localStorage.clear())
  afterEach(() => window.localStorage.clear())

  const items = () => within(more()).getAllByRole('menuitem').map((item) => item.textContent)

  it('says no save word for a change kept here, and offers Terugzetten in the ⋯', async () => {
    window.location.hash = '#view=42'
    api.savedViews.mockResolvedValue([{ ...calais, mine: false, editable: false, owner: { id: -1, name: '' } }])
    changeLocally('42')
    render(<App />)
    await screen.findByText('Geen rijen')

    expect(within(toolbar()).queryByText(/gewijzigd|Opslaan|Opgeslagen/)).toBeNull()
    const offered = items()
    expect(offered).toContain('Terugzetten')
    expect(offered).not.toContain('Publieke weergave bijwerken')
  })

  it("offers Publieke weergave bijwerken on one's own public view, and saves only with it", async () => {
    window.location.hash = '#view=42'
    api.savedViews.mockResolvedValue([{ ...calais, public: true }])
    api.updateView.mockResolvedValue({ ...calais, public: true, arrangement: { ...empty, hidden: ['place'] }, hidden: ['place'] })
    changeLocally('42')
    render(<App />)
    await screen.findByText('Geen rijen')
    await new Promise((resolve) => setTimeout(resolve, 500))
    expect(api.updateView).not.toHaveBeenCalled()

    fireEvent.click(within(more()).getByRole('menuitem', { name: 'Publieke weergave bijwerken' }))
    expect(api.updateView).toHaveBeenCalledWith(expect.objectContaining({ id: 42 }), { arrangement: { ...empty, hidden: ['place'] } })
    await waitFor(() => expect(local('42')).toBeNull())
  })

  it('offers no Publieke weergave bijwerken on a public view one may not write: only Kopie maken in the rail', async () => {
    window.location.hash = '#view=42'
    api.savedViews.mockResolvedValue([{ ...calais, public: true, mine: false, editable: false, owner: { id: -1, name: '' } }])
    changeLocally('42')
    render(<App />)
    await screen.findByText('Geen rijen')

    expect(items()).not.toContain('Publieke weergave bijwerken')
  })

  it('says nothing and offers no Terugzetten for a view this browser has not changed', async () => {
    window.location.hash = '#view=42'
    api.savedViews.mockResolvedValue([calais])
    render(<App />)
    await screen.findByText('Geen rijen')

    expect(within(toolbar()).queryByText(/gewijzigd|Opslaan|Opgeslagen/)).toBeNull()
    expect(within(toolbar()).queryByRole('button', { name: 'More actions' }) ? items() : []).not.toContain('Terugzetten')
  })

  it("lists the table's saved views after its starting one, and opens one the hash names by id", async () => {
    window.location.hash = '#view=42'
    api.savedViews.mockResolvedValue([calais])
    await shell()

    expect(await within(types()).findByRole('button', { name: /^Calais techniek/ })).toBeTruthy()
    expect(within(types()).getAllByRole('button').map((b) => b.textContent)).toEqual(['Planning', 'Calais techniek'])
    await screen.findByText('Geen rijen')
    expect(within(types()).getByRole('button', { name: /^Calais techniek/ }).getAttribute('aria-current')).toBe('page')
    expect(api.rows).toHaveBeenLastCalledWith(calais, expect.any(Object), null, expect.any(Object))
  })

  it('lands on the first saved view when the engine declares its table after others', async () => {
    api.schema.mockResolvedValue({ ...served, tables: [served.tables[1], served.tables[0]], views: [] })
    api.savedViews.mockResolvedValue([calais, { ...calais, key: '43', id: 43, label: 'Ziek', table: 'absences', model: 'absence', date_field: undefined }])
    await shell()

    expect(screen.getByRole('heading', { level: 1, name: 'Calais techniek' })).toBeTruthy()
    await screen.findByText('Geen rijen')
    expect(api.rows).toHaveBeenLastCalledWith(calais, expect.any(Object), null, expect.any(Object))
  })

  it('falls back to the first view when the hash names an id that is no saved view', async () => {
    window.location.hash = '#view=999'
    api.savedViews.mockResolvedValue([calais])
    render(<App />)

    await screen.findByText('Geen rijen')
    expect(api.rows).toHaveBeenLastCalledWith(served.views[0], expect.any(Object), null, expect.any(Object))
    expect(api.rows).not.toHaveBeenCalledWith(calais, expect.any(Object), null, expect.any(Object))
  })

  it("creates a team view from a model's +, from the table's starting view of that type, opened and in the hash", async () => {
    api.schema.mockResolvedValue({ ...served, views: [{ ...served.views[0], sort: ['-date'], group: 'date', hidden: ['place'] }, served.views[1]] })
    api.createView.mockResolvedValue(calais)
    render(<App />)
    await screen.findByText('Geen rijen')

    fireEvent.click(within(rail()).getByRole('button', { name: 'Weergave toevoegen aan Planning' }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Grid' }))
    const dialog = screen.getByRole('dialog', { name: 'Nieuwe gridweergave' })
    expect(within(dialog).getByText('Op Planning')).toBeTruthy()
    fireEvent.change(within(dialog).getByRole('textbox', { name: 'Naam' }), { target: { value: 'Calais techniek' } })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Weergave maken' }))

    expect(api.createView).toHaveBeenCalledWith({
      name: 'Calais techniek', table: 'planning', type: 'grid', field: null, shared: true,
      arrangement: { ...empty, sort: [{ id: 'date', desc: true }], group: 'date', hidden: ['place'] },
    })
    await waitFor(() => expect(hash()).toBe('42'))
    expect(within(types()).getByRole('button', { name: /^Calais techniek/ }).getAttribute('aria-current')).toBe('page')
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it("creates a personal first view on a model without one, which opens unfolded", async () => {
    const spare = { key: 'spare', label: 'Reserve', model: 'absence', types: ['grid' as const] }
    const first = { ...calais, key: '60', id: 60, label: 'Grid', table: 'spare', table_label: 'Reserve', model: 'absence', date_field: undefined }
    api.schema.mockResolvedValue({ ...served, tables: [...served.tables, spare] })
    api.createView.mockResolvedValue(first)
    render(<App />)
    await screen.findByText('Geen rijen')

    expect(node('Reserve').getAttribute('aria-expanded')).toBe('false')
    fireEvent.click(within(rail()).getByRole('button', { name: 'Weergave toevoegen aan Reserve' }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Grid' }))
    const dialog = screen.getByRole('dialog')
    fireEvent.click(within(dialog).getByRole('radio', { name: 'Alleen ik' }))
    fireEvent.click(within(dialog).getByRole('button', { name: 'Weergave maken' }))

    expect(api.createView).toHaveBeenCalledWith({ name: 'Grid', table: 'spare', type: 'grid', field: null, shared: false, arrangement: empty })
    await waitFor(() => expect(hash()).toBe('60'))
    expect(node('Reserve').getAttribute('aria-expanded')).toBe('true')
    expect(within(typesOf('Reserve')).getByRole('button', { name: 'Grid' }).getAttribute('aria-current')).toBe('page')
  })

  it('closes the new view dialog on Escape, creating nothing', async () => {
    render(<App />)
    await screen.findByText('Geen rijen')

    fireEvent.click(within(rail()).getByRole('button', { name: 'Weergave toevoegen aan Planning' }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Grid' }))
    fireEvent.keyDown(within(screen.getByRole('dialog')).getByRole('textbox', { name: 'Naam' }), { key: 'Escape' })

    expect(screen.queryByRole('dialog')).toBeNull()
    expect(api.createView).not.toHaveBeenCalled()
  })

  it('says nothing of a view this browser has not changed', async () => {
    window.location.hash = '#view=42'
    api.savedViews.mockResolvedValue([calais])
    render(<App />)
    await screen.findByText('Geen rijen')

    expect(within(toolbar()).queryByRole('button', { name: 'Opslaan' })).toBeNull()
  })

  it('reverts: the local copy is gone and the view is as saved', async () => {
    changeLocally('planning')
    render(<App />)
    await screen.findByText('Geen rijen')

    fireEvent.click(within(more()).getByRole('menuitem', { name: 'Terugzetten' }))

    expect(local('planning')).toBeNull()
  })

  it('undoes a revert: the notice says it was reverted, and its Undo brings the change back (R10)', async () => {
    changeLocally('planning')
    render(<App />)
    await screen.findByText('Geen rijen')

    fireEvent.click(within(more()).getByRole('menuitem', { name: 'Terugzetten' }))
    expect(screen.getByText('Teruggezet')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Ongedaan maken' }))

    expect(JSON.parse(local('planning') ?? '{}').hidden).toEqual(['place'])
    expect(items()).toContain('Terugzetten')
  })

  it("drops a view another tab deleted, says so, and keeps the change on the table's starting view", async () => {
    window.location.hash = '#view=42'
    api.schema.mockResolvedValue({ ...served, strings: { 'error.unknown_view': 'Deze weergave bestaat niet meer' } })
    api.savedViews.mockResolvedValue([{ ...calais, public: true }])
    api.updateView.mockRejectedValue({ code: 'unknown_view', message: 'unknown view 42' })
    changeLocally('42')
    render(<App />)
    await screen.findByText('Geen rijen')

    fireEvent.click(within(more()).getByRole('menuitem', { name: 'Publieke weergave bijwerken' }))

    expect(await screen.findByText('Deze weergave bestaat niet meer')).toBeTruthy()
    await waitFor(() => expect(hash()).toBe('planning'))
    expect(within(types()).queryByRole('button', { name: /^Calais techniek/ })).toBeNull()
    expect(JSON.parse(local('planning') ?? '{}').hidden).toEqual(['place'])
  })

  it('keeps a deleted view and its change when the table has no starting view of its type', async () => {
    window.location.hash = '#view=42'
    api.schema.mockResolvedValue({ ...served, views: [{ ...served.views[0], type: 'matrix' }, served.views[1]] })
    api.savedViews.mockResolvedValue([{ ...calais, public: true }])
    api.updateView.mockRejectedValue({ code: 'unknown_view', message: 'unknown view 42' })
    changeLocally('42')
    render(<App />)
    await screen.findByText('Geen rijen')

    fireEvent.click(within(more()).getByRole('menuitem', { name: 'Publieke weergave bijwerken' }))

    expect(await screen.findByText('unknown view 42 · Bewaar je wijziging met “Kopie maken” voor je weggaat')).toBeTruthy()
    expect(JSON.parse(local('42') ?? '{}').hidden).toEqual(['place'])
    expect(hash()).toBe('42')
    expect(within(types()).getByRole('button', { name: /^Calais techniek/ })).toBeTruthy()
    expect(items()).toContain('Terugzetten')
  })

  it("never overwrites the starting view's own unsaved change with a deleted view's", async () => {
    window.location.hash = '#view=42'
    api.savedViews.mockResolvedValue([{ ...calais, public: true }])
    api.updateView.mockRejectedValue({ code: 'unknown_view', message: 'unknown view 42' })
    changeLocally('42')
    window.localStorage.setItem('ntdst-views/layout/v2/planning', JSON.stringify({ hidden: ['kind'], order: [], widths: {}, sort: [], filters: [], group: null }))
    render(<App />)
    await screen.findByText('Geen rijen')

    fireEvent.click(within(more()).getByRole('menuitem', { name: 'Publieke weergave bijwerken' }))

    expect(await screen.findByText('unknown view 42 · Bewaar je wijziging met “Kopie maken” voor je weggaat')).toBeTruthy()
    expect(JSON.parse(local('planning') ?? '{}').hidden).toEqual(['kind'])
    expect(JSON.parse(local('42') ?? '{}').hidden).toEqual(['place'])
  })
})

describe("a saved view's actions", () => {
  const empty = { hidden: [], order: [], widths: [], sort: [], filters: [], group: null, picked: [] }
  const view = (id: number, label: string, extra: Partial<SavedView> = {}): SavedView => ({
    key: String(id), id, label, table: 'planning', table_label: 'Planning', model: 'activity', date_field: 'date', type: 'grid',
    starting: false, arrangement: empty, shared: false, owner: { id: 1, name: 'Hester' }, mine: true, editable: true, ...extra,
  })
  const calais = view(42, 'Calais techniek', { arrangement: { ...empty, hidden: ['place'] } })
  const montage = view(43, 'Montage')
  const types = () => typesOf('Planning')
  const names = () => within(types()).getAllByRole('button').map((b) => b.textContent)
  const hash = () => new URLSearchParams(window.location.hash.slice(1)).get('view')
  const choose = (name: string, action: string) => {
    fireEvent.click(within(rail()).getByRole('button', { name: `More actions: ${name}` }))
    fireEvent.click(within(screen.getByRole('menu', { name: 'More actions' })).getByRole('menuitem', { name: action }))
  }
  const opened = async () => {
    render(<App />)
    await screen.findByText('Geen rijen')
  }

  beforeEach(() => {
    window.localStorage.clear()
    api.savedViews.mockResolvedValue([calais, montage])
  })
  afterEach(() => window.localStorage.clear())

  it('duplicates a view as a personal copy named after it, with its arrangement, and opens it', async () => {
    api.schema.mockResolvedValue({ ...served, strings: { copyOf: '{name} (kopie)' } })
    api.createView.mockResolvedValue(view(50, 'Calais techniek (kopie)', { arrangement: calais.arrangement }))
    await opened()

    choose('Calais techniek', 'Kopie maken')

    expect(api.createView).toHaveBeenCalledWith({
      name: 'Calais techniek (kopie)', table: 'planning', type: 'grid', field: null, shared: false, arrangement: { ...empty, hidden: ['place'] },
    })
    await waitFor(() => expect(hash()).toBe('50'))
    expect(names()).toEqual(['Planning', 'Calais techniek', 'Montage', 'Calais techniek (kopie)'])
  })

  it('duplicates a starting view too', async () => {
    api.createView.mockResolvedValue(view(50, 'Planning (kopie)'))
    await opened()

    choose('Planning', 'Kopie maken')

    expect(api.createView).toHaveBeenCalledWith(expect.objectContaining({ name: 'Planning (kopie)', table: 'planning', type: 'grid', shared: false }))
  })

  it('deletes at once, says so with an undo, and the undo puts it back in its place', async () => {
    api.deleteView.mockResolvedValue({})
    api.restoreView.mockResolvedValue(calais)
    await opened()

    choose('Calais techniek', 'Verwijderen')

    expect(api.deleteView).toHaveBeenCalledWith(42)
    expect(names()).toEqual(['Planning', 'Montage'])
    const notice = await screen.findByRole('status', { name: 'Weergave verwijderd' })
    fireEvent.click(within(notice).getByRole('button', { name: 'Ongedaan maken' }))

    expect(api.restoreView).toHaveBeenCalledWith(42)
    await waitFor(() => expect(names()).toEqual(['Planning', 'Calais techniek', 'Montage']))
    expect(screen.queryByRole('status', { name: 'Weergave verwijderd' })).toBeNull()
  })

  it('offers the undo of the delete clicked last, though the first one answers last', async () => {
    let answerFirst: (value: unknown) => void = () => undefined
    api.deleteView.mockReturnValueOnce(new Promise((resolve) => { answerFirst = resolve })).mockResolvedValueOnce({})
    api.restoreView.mockResolvedValue(montage)
    await opened()

    choose('Calais techniek', 'Verwijderen')
    choose('Montage', 'Verwijderen')
    await screen.findByRole('status', { name: 'Weergave verwijderd' })
    await act(async () => answerFirst({}))
    fireEvent.click(within(screen.getByRole('status', { name: 'Weergave verwijderd' })).getByRole('button', { name: 'Ongedaan maken' }))

    expect(api.restoreView).toHaveBeenCalledWith(43)
    expect(api.restoreView).not.toHaveBeenCalledWith(42)
  })

  it('opens the first view when the open one is deleted', async () => {
    window.location.hash = '#view=42'
    api.deleteView.mockResolvedValue({})
    await opened()

    choose('Calais techniek', 'Verwijderen')

    await waitFor(() => expect(hash()).toBe('planning'))
  })

  it('puts a view back with the refusal when the delete is refused', async () => {
    api.schema.mockResolvedValue({ ...served, strings: { 'error.not_owner': 'Alleen de eigenaar kan deze weergave wijzigen' } })
    api.deleteView.mockRejectedValue({ code: 'not_owner', message: 'only the owner may change this view' })
    api.savedViews.mockResolvedValueOnce([calais, montage]).mockResolvedValue([calais, montage])
    await opened()

    choose('Calais techniek', 'Verwijderen')

    expect(await screen.findByText('Alleen de eigenaar kan deze weergave wijzigen')).toBeTruthy()
    await waitFor(() => expect(names()).toEqual(['Planning', 'Calais techniek', 'Montage']))
  })

  it('says why an undo could not restore', async () => {
    api.schema.mockResolvedValue({ ...served, strings: { 'error.views_limit': 'Je hebt het maximum van 200 weergaven bereikt' } })
    api.deleteView.mockResolvedValue({})
    api.restoreView.mockRejectedValue({ code: 'views_limit', message: 'Limit.' })
    await opened()

    choose('Calais techniek', 'Verwijderen')
    fireEvent.click(within(await screen.findByRole('status', { name: 'Weergave verwijderd' })).getByRole('button', { name: 'Ongedaan maken' }))

    expect(await screen.findByText('Je hebt het maximum van 200 weergaven bereikt')).toBeTruthy()
    expect(names()).toEqual(['Planning', 'Montage'])
  })

  it('shares a view with the team, and takes it back', async () => {
    api.updateView.mockResolvedValueOnce({ ...calais, shared: true })
    await opened()

    choose('Calais techniek', 'Delen met het team')

    expect(api.updateView).toHaveBeenCalledWith(expect.objectContaining({ id: 42 }), { shared: true })
    const item = () => within(types()).getByRole('button', { name: /^Calais techniek/ }).parentElement!
    await waitFor(() => expect(within(item()).queryByRole('img', { name: 'Alleen voor jou' })).toBeNull())

    api.updateView.mockResolvedValueOnce(calais)
    choose('Calais techniek', 'Niet meer delen')
    expect(api.updateView).toHaveBeenLastCalledWith(expect.objectContaining({ id: 42 }), { shared: false })
    await waitFor(() => expect(within(item()).getByRole('img', { name: 'Alleen voor jou' })).toBeTruthy())
  })

  it('renames in place on a double-click', async () => {
    api.updateView.mockResolvedValue({ ...calais, label: 'Calais licht' })
    await opened()

    fireEvent.doubleClick(within(types()).getByRole('button', { name: /^Calais techniek/ }))
    const name = screen.getByRole('textbox', { name: 'Nieuwe naam' })
    fireEvent.change(name, { target: { value: 'Calais licht' } })
    fireEvent.keyDown(name, { key: 'Enter' })

    expect(api.updateView).toHaveBeenCalledWith(expect.objectContaining({ id: 42 }), { name: 'Calais licht' })
    await waitFor(() => expect(names()).toEqual(['Planning', 'Calais licht', 'Montage']))
  })

  it('drops a view another tab deleted on a rename, in Dutch, and keeps its change on the starting view', async () => {
    api.schema.mockResolvedValue({ ...served, strings: { 'error.unknown_view': 'Deze weergave bestaat niet meer' } })
    api.updateView.mockRejectedValue({ code: 'unknown_view', message: 'unknown view 42' })
    window.location.hash = '#view=42'
    window.localStorage.setItem('ntdst-views/layout/v2/42', JSON.stringify({ hidden: ['kind'], order: [], widths: {}, sort: [], filters: [], group: null }))
    await opened()

    choose('Calais techniek', 'Delen met het team')

    expect(await screen.findByText('Deze weergave bestaat niet meer')).toBeTruthy()
    await waitFor(() => expect(names()).toEqual(['Planning', 'Montage']))
    expect(JSON.parse(window.localStorage.getItem('ntdst-views/layout/v2/planning') ?? '{}').hidden).toEqual(['kind'])
  })

  it('refreshes the list on a 403, in Dutch, and keeps the local arrangement', async () => {
    api.schema.mockResolvedValue({ ...served, strings: { 'error.not_owner': 'Alleen de eigenaar kan deze weergave wijzigen' } })
    api.savedViews.mockResolvedValueOnce([calais, montage]).mockResolvedValue([{ ...calais, mine: false, editable: false, shared: true }, montage])
    api.updateView.mockRejectedValue({ code: 'not_owner', message: 'only the owner may change this view' })
    window.localStorage.setItem('ntdst-views/layout/v2/42', JSON.stringify({ hidden: ['kind'], order: [], widths: {}, sort: [], filters: [], group: null }))
    await opened()

    choose('Calais techniek', 'Delen met het team')

    expect(await screen.findByText('Alleen de eigenaar kan deze weergave wijzigen')).toBeTruthy()
    await waitFor(() => expect(api.savedViews).toHaveBeenCalledTimes(2))
    fireEvent.click(within(rail()).getByRole('button', { name: 'More actions: Calais techniek' }))
    await waitFor(() => expect(within(screen.getByRole('menu', { name: 'More actions' })).getAllByRole('menuitem').map((i) => i.textContent)).toEqual(['Kopie maken']))
    expect(JSON.parse(window.localStorage.getItem('ntdst-views/layout/v2/42') ?? '{}').hidden).toEqual(['kind'])
  })

  it('moves a view up and down the list', async () => {
    await opened()

    choose('Montage', 'Omhoog')
    expect(names()).toEqual(['Planning', 'Montage', 'Calais techniek'])
    choose('Montage', 'Omlaag')
    expect(names()).toEqual(['Planning', 'Calais techniek', 'Montage'])
  })

  it('keeps a dragged order in the prefs, and the list holds it when opened again from them', async () => {
    const ROW = 28
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
      const top = (Number(this.style.gridRow) - 1) * ROW
      return { top, bottom: top + ROW, height: ROW, left: 0, right: 200, width: 200, x: 0, y: top, toJSON: () => ({}) } as DOMRect
    })
    await opened()

    fireEvent.pointerDown(within(types()).getByRole('button', { name: /^Montage/ }).parentElement!, { button: 0, clientY: 2 * ROW + 14 })
    fireEvent.pointerMove(window, { clientY: 10 })
    fireEvent.pointerUp(window, { clientY: 10 })

    expect(names()).toEqual(['Montage', 'Planning', 'Calais techniek'])
    const stored = { order: { planning: ['43', 'planning', '42'] }, last: {} }
    await waitFor(() => expect(api.savePrefs).toHaveBeenCalledWith(stored))
    cleanup()
    vi.restoreAllMocks()
    api.prefs.mockResolvedValue(stored)
    await opened()

    expect(names()).toEqual(['Montage', 'Planning', 'Calais techniek'])
  })

  it('puts an undone view back in its own place, though the list changed while it was gone', async () => {
    const lights = view(44, 'Licht')
    api.savedViews.mockResolvedValue([calais, montage, lights])
    api.deleteView.mockResolvedValue({})
    api.restoreView.mockResolvedValue(montage)
    api.updateView.mockRejectedValue({ code: 'unknown_view', message: 'unknown view 42' })
    await opened()

    choose('Montage', 'Verwijderen')
    const notice = await screen.findByRole('status', { name: 'Weergave verwijderd' })
    choose('Calais techniek', 'Delen met het team')
    await waitFor(() => expect(names()).toEqual(['Planning', 'Licht']))
    fireEvent.click(within(notice).getByRole('button', { name: 'Ongedaan maken' }))

    await waitFor(() => expect(names()).toEqual(['Planning', 'Montage', 'Licht']))
  })

  it("clears a deleted view's change in this browser once its undo is gone, and keeps it when undone", async () => {
    const changed = JSON.stringify({ hidden: ['kind'], order: [], widths: {}, sort: [], filters: [], group: null })
    window.localStorage.setItem('ntdst-views/layout/v2/42', changed)
    window.localStorage.setItem('ntdst-views/layout/v2/43', changed)
    api.deleteView.mockResolvedValue({})
    api.restoreView.mockResolvedValue(montage)
    await opened()

    choose('Montage', 'Verwijderen')
    fireEvent.click(within(await screen.findByRole('status', { name: 'Weergave verwijderd' })).getByRole('button', { name: 'Ongedaan maken' }))
    await waitFor(() => expect(names()).toContain('Montage'))
    expect(window.localStorage.getItem('ntdst-views/layout/v2/43')).toBe(changed)

    vi.useFakeTimers()
    try {
      choose('Calais techniek', 'Verwijderen')
      await act(async () => undefined)
      expect(screen.getByRole('status', { name: 'Weergave verwijderd' })).toBeTruthy()
      expect(window.localStorage.getItem('ntdst-views/layout/v2/42')).toBe(changed)
      act(() => vi.advanceTimersByTime(6100))
    } finally {
      vi.useRealTimers()
    }

    expect(window.localStorage.getItem('ntdst-views/layout/v2/42')).toBeNull()
    expect(window.localStorage.getItem('ntdst-views/layout/v2/43')).toBe(changed)
  })

  it('finds a saved view by its name in the search', async () => {
    await opened()

    fireEvent.change(screen.getByRole('searchbox', { name: 'Zoeken' }), { target: { value: 'montage' } })

    expect(screen.getByRole('button', { name: 'Naar Planning · Montage' })).toBeTruthy()
  })
})

describe('writes on the engine', () => {
  const productie = { type: 'relation' as const, label: 'Productie', required: true, fact: false, relation: { model: 'productie', multiple: false } }
  const engineSchema: Schema = {
    models: {
      activiteit: { key: 'activiteit', label: 'Activiteit', title_label: 'Omschrijving', title_readonly: false, fields: { productie_id: productie } },
      dagplanning: { key: 'dagplanning', label: 'Dagplanning', title_label: 'Omschrijving', title_readonly: true, query: true, fields: { productie_id: { ...productie, readonly: true } } },
      productie: { key: 'productie', label: 'Productie', title_label: 'Titel', title_readonly: true, fields: {} },
    },
    tables: [
      { key: 'activiteit', label: 'Activiteiten', model: 'activiteit', types: ['grid'] },
      { key: 'dagplanning', label: 'Dagplanning', model: 'dagplanning', types: ['grid'] },
    ],
    views: [
      { key: 'activiteit', label: 'Activiteiten', table: 'activiteit', model: 'activiteit' },
      { key: 'dagplanning', label: 'Dagplanning', table: 'dagplanning', model: 'dagplanning' },
    ],
    writable: { activiteit: true, dagplanning: true, productie: false },
  }
  const kersentuin = { id: 1, title: 'De Kersentuin', status: '', fields: {} }
  const opbouw = { id: 7, title: 'opbouw Gent', status: '', fields: { productie_id: 1 }, lookups: { productie_id: kersentuin } }

  beforeEach(() => {
    api.schema.mockResolvedValue(engineSchema)
    api.rows.mockResolvedValue({ rows: [opbouw], total: 1 })
    api.records.mockImplementation((model: string) => Promise.resolve(model === 'productie'
      ? { rows: [kersentuin, { id: 2, title: 'Wachten op Godot', status: '', fields: {} }], total: 2 }
      : { rows: [], total: 0 }))
  })

  it("relation chip options list the target's rows even when the loaded rows hold one productie", async () => {
    render(<App />)
    await screen.findByText('opbouw Gent')
    await waitFor(() => expect(api.records).toHaveBeenCalledWith('productie', ''))

    const [row] = await builderRows()
    fireEvent.click(within(fieldList(row as HTMLElement)).getByRole('option', { name: 'Productie' }))
    fireEvent.focus(await within(row as HTMLElement).findByRole('searchbox', { name: 'Productie zoeken' }))

    await waitFor(() => expect(within(within(row as HTMLElement).getByRole('listbox')).getAllByRole('option').map((o) => o.textContent))
      .toEqual(['De Kersentuin', 'Wachten op Godot']))
  })

  describe('a query that creates in a dataset', () => {
    const creating = (target: Partial<Schema['models'][string]>): Schema => ({
      ...engineSchema,
      models: {
        ...engineSchema.models,
        activiteit: { ...engineSchema.models.activiteit, title_required: false, new_label: 'Nieuwe activiteit', ...target },
        dagplanning: { ...engineSchema.models.dagplanning, creates: 'activiteit' },
      },
    })

    it("names its + Nieuw after the dataset's words, creates the row there and reads the query again", async () => {
      api.schema.mockResolvedValue(creating({ fields: {} }))
      api.create.mockResolvedValue({ row: { id: 9, title: '', status: '', fields: {} }, batch: 'b9' })
      window.location.hash = '#view=dagplanning'
      render(<App />)
      await screen.findByText('opbouw Gent')
      const reads = api.rows.mock.calls.length

      const button = screen.getByRole('button', { name: 'Nieuwe activiteit' }) as HTMLButtonElement
      expect(button.disabled).toBe(false)
      await act(async () => fireEvent.click(button))

      expect(api.create).toHaveBeenCalledWith('activiteit', {})
      await waitFor(() => expect(api.rows.mock.calls.length).toBeGreaterThan(reads))
    })

    it('waits for a pick the dataset needs, and says which', async () => {
      api.schema.mockResolvedValue(creating({}))
      window.location.hash = '#view=dagplanning'
      render(<App />)
      await screen.findByText('opbouw Gent')

      expect((screen.getByRole('button', { name: 'Nieuwe activiteit' }) as HTMLButtonElement).disabled).toBe(true)
      expect(screen.getByText('Kies eerst Productie')).toBeTruthy()
    })
  })

  it('+ New is blocked on a query view', async () => {
    window.location.hash = '#view=dagplanning'
    render(<App />)
    await screen.findByText('opbouw Gent')

    expect((screen.getByRole('button', { name: 'Nieuw Dagplanning' }) as HTMLButtonElement).disabled).toBe(true)
  })
})

describe("a dataset's action and the tab's undo history", () => {
  const apply = { name: 'sjabloon_toepassen', label: 'Sjabloon toepassen', input: { sjabloon_id: { relation: 'sjabloon', label: 'Sjabloon' } } }
  const theatre: Schema = {
    models: {
      speelreeks: { key: 'speelreeks', label: 'Speelreeks', title_label: 'Titel', title_readonly: false, actions: [apply], fields: {} },
      dagplanning: { key: 'dagplanning', label: 'Dagplanning', title_label: 'Titel', title_readonly: true, query: true, fields: {} },
    },
    tables: [
      { key: 'speelreeksen', label: 'Speelreeksen', model: 'speelreeks', types: ['grid'] },
      { key: 'dagplanningen', label: 'Dagplanning', model: 'dagplanning', types: ['grid'] },
    ],
    views: [
      { key: 'speelreeksen', label: 'Speelreeksen', table: 'speelreeksen', model: 'speelreeks' },
      { key: 'dagplanningen', label: 'Dagplanning', table: 'dagplanningen', model: 'dagplanning' },
    ],
    writable: { speelreeks: true, dagplanning: true },
  }
  const calaisReeks = { id: 3, title: 'Calais', status: '', fields: {} }
  const reads = (model: string) => api.rows.mock.calls.filter(([v]) => (v as { model: string }).model === model).length

  beforeEach(() => {
    api.schema.mockResolvedValue(theatre)
    api.rows.mockImplementation((v: { model: string }) =>
      Promise.resolve(v.model === 'speelreeks' ? { rows: [calaisReeks], total: 1 } : { rows: [{ id: 9, title: 'repetitie', status: '', fields: {} }], total: 1 }))
    api.records.mockResolvedValue({ rows: [{ id: 4, title: 'speeldag op locatie', status: '', fields: {} }], total: 1 })
    api.runAction.mockResolvedValue({ batch: 'a-1', created: [{ dataset: 'activiteit', id: 20 }] })
    api.undoBatch.mockResolvedValue('u-1')
  })

  async function applyTemplate() {
    fireEvent.click(await screen.findByRole('button', { name: 'Openen' }))
    fireEvent.click(screen.getByRole('button', { name: 'Sjabloon: —' }))
    fireEvent.click(await screen.findByRole('option', { name: 'speeldag op locatie' }))
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Sjabloon toepassen' }))
    })
  }
  const grid = async (name: string) => {
    const sheet = await screen.findByRole('grid', { name })
    await within(sheet).findAllByRole('gridcell')
    return sheet
  }

  it('shows the action on a Speelreeks row only', async () => {
    await shell()
    fireEvent.click(await screen.findByRole('button', { name: 'Openen' }))
    expect(screen.getByRole('group', { name: 'Sjabloon toepassen' })).toBeTruthy()

    fireEvent.click(tableEntry('Dagplanning'))
    await grid('Dagplanning')
    fireEvent.click(await screen.findByRole('button', { name: 'Openen' }))
    expect(screen.queryByRole('group', { name: 'Sjabloon toepassen' })).toBeNull()
  })

  it('an applied action becomes one undo entry, and the view reloads; its notice undoes it on the server', async () => {
    await shell()
    await grid('Speelreeksen')

    await applyTemplate()

    expect(api.runAction).toHaveBeenCalledExactlyOnceWith('sjabloon_toepassen', 3, { sjabloon_id: 4 })
    await waitFor(() => expect(reads('speelreeks')).toBe(2))
    const notice = await screen.findByRole('status', { name: 'Sjabloon toepassen uitgevoerd.' })
    await grid('Speelreeksen')
    await act(async () => {
      fireEvent.click(within(notice).getByRole('button', { name: 'Ongedaan maken' }))
    })

    expect(api.undoBatch).toHaveBeenCalledExactlyOnceWith('a-1')
    await waitFor(() => expect(reads('speelreeks')).toBe(3))
  })

  it("the notice's Undo does nothing once its action is no longer the last step", async () => {
    api.runAction.mockResolvedValueOnce({ batch: 'a-1', created: [] }).mockResolvedValueOnce({ batch: 'a-2', created: [] })
    await shell()
    await grid('Speelreeksen')
    await applyTemplate()
    await waitFor(() => expect(reads('speelreeks')).toBe(2))
    await grid('Speelreeksen')
    fireEvent.click(screen.getByRole('button', { name: 'Sluiten' }))
    await applyTemplate()
    await waitFor(() => expect(reads('speelreeks')).toBe(3))
    const notice = await screen.findByRole('status', { name: 'Sjabloon toepassen uitgevoerd.' })
    const cell = (await grid('Speelreeksen')).querySelector<HTMLElement>('td[data-cell]')!
    fireEvent.click(cell)
    await act(async () => {
      fireEvent.keyDown(cell, { key: 'z', ctrlKey: true })
    })
    expect(api.undoBatch).toHaveBeenCalledExactlyOnceWith('a-2')

    await act(async () => {
      fireEvent.click(within(notice).getByRole('button', { name: 'Ongedaan maken' }))
    })

    expect(api.undoBatch).toHaveBeenCalledOnce()
  })

  it('the entry survives the reload and Speelreeksen → Dagplanning → Speelreeksen, and Ctrl+Z there undoes the apply', async () => {
    await shell()
    await grid('Speelreeksen')
    await applyTemplate()
    await waitFor(() => expect(reads('speelreeks')).toBe(2))

    fireEvent.click(tableEntry('Dagplanning'))
    await grid('Dagplanning')
    fireEvent.click(tableEntry('Speelreeksen'))
    const sheet = await grid('Speelreeksen')
    const cell = sheet.querySelector<HTMLElement>('td[data-cell]')!
    fireEvent.click(cell)
    await act(async () => {
      fireEvent.keyDown(cell, { key: 'z', ctrlKey: true })
    })

    expect(api.undoBatch).toHaveBeenCalledExactlyOnceWith('a-1')
    await waitFor(() => expect(reads('speelreeks')).toBe(4))
    expect(api.rowOf).not.toHaveBeenCalled()
  })
})

describe("a model's ⋯ in the app", () => {
  const modelMenu = (model: string) => {
    fireEvent.click(within(node(model)).getByRole('button', { name: `Meer voor ${model}` }))
    return screen.getByRole('menu', { name: `Meer voor ${model}` })
  }
  const admin = () => api.me.mockResolvedValue({ id: 1, email: 'hester@example.test', role: 'administrator', subject: null })

  it('renames a model for an administrator: the engine is asked and the tree follows', async () => {
    admin()
    api.setDisplay.mockResolvedValue({ label: 'Werkplan', icon: null })
    await shell()

    fireEvent.click(within(modelMenu('Planning')).getByRole('menuitem', { name: 'Naam wijzigen' }))
    const field = within(rail()).getByRole('textbox', { name: 'Nieuwe naam voor Planning' })
    fireEvent.change(field, { target: { value: 'Werkplan' } })
    fireEvent.keyDown(field, { key: 'Enter' })

    expect(api.setDisplay).toHaveBeenCalledWith('planning', { label: 'Werkplan' })
    expect(await within(rail()).findByRole('treeitem', { name: 'Werkplan' })).toBeTruthy()
    expect(within(rail()).queryByRole('treeitem', { name: 'Planning' })).toBeNull()
    expect(screen.getByRole('button', { name: 'Nieuw Werkplan' })).toBeTruthy()
  })

  it("changes a model's icon for an administrator, and the tree draws it", async () => {
    admin()
    api.setDisplay.mockResolvedValue({ label: 'Planning', icon: 'star' })
    await shell()

    fireEvent.click(within(modelMenu('Planning')).getByRole('menuitem', { name: 'Icoon wijzigen' }))
    fireEvent.click(within(within(node('Planning')).getByRole('group', { name: 'Icoon voor Planning' })).getByRole('button', { name: 'Ster' }))

    expect(api.setDisplay).toHaveBeenCalledWith('planning', { icon: 'star' })
    // At rest, not hovered: a hovered row shows its chevron instead.
    await waitFor(() => expect(api.setDisplay).toHaveBeenCalled())
    fireEvent.mouseLeave(node('Planning').querySelector('.nv-model')!)
    await waitFor(() => expect(node('Planning').querySelector('.nv-model__lead .lucide-star')).not.toBeNull())
  })

  it('says why a refused change did not happen, and the tree stays as it was', async () => {
    admin()
    api.setDisplay.mockRejectedValue({ code: 'bad_display', message: 'label must be 1 to 60 characters' })
    await shell()

    fireEvent.click(within(modelMenu('Planning')).getByRole('menuitem', { name: 'Naam wijzigen' }))
    const field = within(rail()).getByRole('textbox', { name: 'Nieuwe naam voor Planning' })
    fireEvent.change(field, { target: { value: 'Werkplan' } })
    fireEvent.keyDown(field, { key: 'Enter' })

    expect(await screen.findByRole('status', { name: 'label must be 1 to 60 characters' })).toBeTruthy()
    expect(node('Planning')).toBeTruthy()
  })

  it('disables the name and the icon for an editor, with the reason', async () => {
    await shell()

    const off = within(modelMenu('Planning')).getAllByRole('menuitem').filter((item) => item.getAttribute('aria-disabled') === 'true')
    expect(off.map((item) => item.textContent)).toEqual([
      'Naam wijzigenAlleen een beheerder kan dit wijzigen',
      'Icoon wijzigenAlleen een beheerder kan dit wijzigen',
    ])
    expect(api.setDisplay).not.toHaveBeenCalled()
  })

  it('exports the open view with the existing export', async () => {
    const tabel = { ...calaisSchema.views[0], label: 'Tabel', table: 'planning', table_label: 'Planning' }
    api.schema.mockResolvedValue({ ...calaisSchema, views: [tabel] })
    api.rows.mockResolvedValue({ rows: calais, total: calais.length })
    render(<App />)
    await screen.findByText('Montage')

    fireEvent.click(within(modelMenu('Planning')).getByRole('menuitem', { name: 'Exporteren' }))

    expect(exporter.exportSheet).toHaveBeenCalledTimes(1)
    const [view, , , , title] = exporter.exportSheet.mock.calls[0]
    expect(view).toBe(tabel)
    expect(title).toBe('Planning')
  })
})

describe("a query's views under the model it reads", () => {
  const empty = { hidden: [], order: [], widths: [], sort: [], filters: [], group: null, picked: [] }
  const model = (key: string, label: string, query = false) => ({ key, label, title_label: 'Titel', title_readonly: false, ...(query ? { query: true } : {}), fields: {} })
  const def = (key: string, label: string, extra = {}) => ({ key, label, model: key, types: ['grid' as const], ...extra })
  const over = { query: true, of: 'activiteit' }
  const schema: Schema = {
    models: {
      persoon: model('persoon', 'Personen'),
      activiteit: model('activiteit', 'Activiteiten'),
      dagplanning: model('dagplanning', 'Dagplanning', true),
      productie_dag: model('productie_dag', 'Per productie per dag', true),
      voorstellingen: model('voorstellingen', 'Voorstellingen', true),
    },
    tables: [
      def('persoon', 'Personen'), def('activiteit', 'Activiteiten'),
      def('dagplanning', 'Dagplanning', over), def('productie_dag', 'Per productie per dag', over), def('voorstellingen', 'Voorstellingen', over),
    ],
    views: [],
    writable: { persoon: true, activiteit: true, dagplanning: true, productie_dag: false, voorstellingen: false },
  }
  const saved = (id: number, label: string, table: string, extra: Partial<SavedView> = {}): SavedView => ({
    key: String(id), id, label, table, table_label: label, model: table, type: 'grid', starting: false, arrangement: empty,
    shared: true, owner: { id: 1, name: 'Hester' }, mine: true, editable: true, ...(table === 'activiteit' || table === 'persoon' ? {} : over), ...extra,
  })
  const personen = saved(10, 'Personen', 'persoon', { mine: false, editable: false })
  const activiteiten = saved(20, 'Activiteiten', 'activiteit', { mine: false, editable: false })
  const dagplanning = saved(30, 'Dagplanning', 'dagplanning')
  const kopie = saved(31, 'Dagplanning (kopie)', 'dagplanning')
  const perDag = saved(40, 'Per productie per dag', 'productie_dag', { mine: false, editable: false })
  const voorstellingen = saved(50, 'Voorstellingen', 'voorstellingen', { mine: false, editable: false })
  const names = () => within(typesOf('Activiteiten')).getAllByRole('button').map((b) => b.textContent)
  const hash = () => new URLSearchParams(window.location.hash.slice(1)).get('view')
  const choices = async (name: string) => {
    const button = within(rail()).getByRole('button', { name: `More actions: ${name}` })
    fireEvent.click(button)
    const offered = within(screen.getByRole('menu', { name: 'More actions' })).getAllByRole('menuitem').map((item) => item.textContent)
    const open = screen.getByRole('menu')
    await waitFor(() => expect(open.contains(document.activeElement)).toBe(true))
    fireEvent.pointerDown(button, { button: 0, pointerType: 'mouse' })
    fireEvent.pointerUp(button, { button: 0, pointerType: 'mouse' })
    await waitFor(() => expect(screen.queryByRole('menu')).toBeNull())
    return offered
  }
  const choose = (name: string, action: string) => {
    fireEvent.click(within(rail()).getByRole('button', { name: `More actions: ${name}` }))
    fireEvent.click(within(screen.getByRole('menu', { name: 'More actions' })).getByRole('menuitem', { name: action }))
  }
  const opened = async (at: string) => {
    window.location.hash = `#view=${at}`
    await shell()
    await waitFor(() => expect(api.rows).toHaveBeenCalled())
  }

  beforeEach(() => {
    api.schema.mockResolvedValue(schema)
    api.savedViews.mockResolvedValue([personen, voorstellingen, perDag, kopie, dagplanning, activiteiten].sort((a, b) => a.id - b.id))
    api.rows.mockResolvedValue({ rows: [{ id: 1, title: 'Montage', status: '', fields: {} }], total: 1 })
  })

  it("ends the model's views with each query's, in the declared order, and lists no query as a node", async () => {
    await opened('20')

    expect(within(rail()).getAllByRole('treeitem')).toHaveLength(2)
    expect(within(rail()).queryByRole('treeitem', { name: 'Dagplanning' })).toBeNull()
    expect(names()).toEqual(['Activiteiten', 'Dagplanning', 'Dagplanning (kopie)', 'Per productie per dag', 'Voorstellingen'])
  })

  it("opens a query's view on the query's rows, the grid named by the query", async () => {
    await opened('20')

    fireEvent.click(within(typesOf('Activiteiten')).getByRole('button', { name: 'Dagplanning' }))

    await waitFor(() => expect(api.rows).toHaveBeenLastCalledWith(dagplanning, expect.any(Object), null, expect.any(Object)))
    expect(await screen.findByRole('grid', { name: 'Dagplanning' })).toBeTruthy()
  })

  it("makes a view on the model itself from the model's +", async () => {
    api.createView.mockResolvedValue(saved(60, 'Nieuw', 'activiteit'))
    await opened('30')

    fireEvent.click(within(rail()).getByRole('button', { name: 'Weergave toevoegen aan Activiteiten' }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Grid' }))
    const dialog = screen.getByRole('dialog')
    fireEvent.change(within(dialog).getByRole('textbox', { name: 'Naam' }), { target: { value: 'Nieuw' } })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Weergave maken' }))

    expect(api.createView).toHaveBeenCalledWith(expect.objectContaining({ name: 'Nieuw', table: 'activiteit' }))
  })

  it("copies a query's view as a view on the query", async () => {
    api.createView.mockResolvedValue(saved(61, 'Voorstellingen (kopie)', 'voorstellingen'))
    await opened('20')

    choose('Voorstellingen', 'Kopie maken')

    expect(api.createView).toHaveBeenCalledWith(expect.objectContaining({ name: 'Voorstellingen (kopie)', table: 'voorstellingen' }))
    await waitFor(() => expect(hash()).toBe('61'))
  })

  it("moves a query's view only within that query's views", async () => {
    await opened('20')

    const first = await choices('Dagplanning')
    const second = await choices('Dagplanning (kopie)')
    expect([first.includes('Omhoog'), first.includes('Omlaag')]).toEqual([false, true])
    expect([second.includes('Omhoog'), second.includes('Omlaag')]).toEqual([true, false])
    choose('Dagplanning (kopie)', 'Omhoog')

    expect(names()).toEqual(['Activiteiten', 'Dagplanning (kopie)', 'Dagplanning', 'Per productie per dag', 'Voorstellingen'])
    await waitFor(() => expect(api.savePrefs).toHaveBeenCalledWith({ order: { dagplanning: ['31', '30'] }, last: {} }))
  })

  it("does not move a query's view dragged into the model's own views", async () => {
    const ROW = 28
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
      const top = (Number(this.style.gridRow) - 1) * ROW
      return { top, bottom: top + ROW, height: ROW, left: 0, right: 200, width: 200, x: 0, y: top, toJSON: () => ({}) } as DOMRect
    })
    await opened('20')

    fireEvent.pointerDown(within(typesOf('Activiteiten')).getByRole('button', { name: /^Dagplanning$/ }).parentElement!, { button: 0, clientY: ROW + 14 })
    fireEvent.pointerMove(window, { clientY: 4 })
    fireEvent.pointerUp(window, { clientY: 4 })

    expect(names()).toEqual(['Activiteiten', 'Dagplanning', 'Dagplanning (kopie)', 'Per productie per dag', 'Voorstellingen'])
    vi.restoreAllMocks()
  })

  it("does not move a query's view that is not first in its block when dropped among the model's own views", async () => {
    const ROW = 28
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
      const top = (Number(this.style.gridRow) - 1) * ROW
      return { top, bottom: top + ROW, height: ROW, left: 0, right: 200, width: 200, x: 0, y: top, toJSON: () => ({}) } as DOMRect
    })
    await opened('20')

    fireEvent.pointerDown(within(typesOf('Activiteiten')).getByRole('button', { name: /^Dagplanning \(kopie\)$/ }).parentElement!, { button: 0, clientY: 2 * ROW + 14 })
    fireEvent.pointerMove(window, { clientY: 4 })
    fireEvent.pointerUp(window, { clientY: 4 })

    expect(names()).toEqual(['Activiteiten', 'Dagplanning', 'Dagplanning (kopie)', 'Per productie per dag', 'Voorstellingen'])
    await new Promise((resolve) => setTimeout(resolve, 600))
    expect(api.savePrefs).not.toHaveBeenCalled()
    vi.restoreAllMocks()
  })

  it('reopens the query view last used when its model is clicked again', async () => {
    await opened('20')

    fireEvent.click(within(typesOf('Activiteiten')).getByRole('button', { name: 'Dagplanning' }))
    await waitFor(() => expect(hash()).toBe('30'))
    fireEvent.click(within(node('Personen')).getAllByRole('button', { name: 'Personen' })[0])
    await waitFor(() => expect(hash()).toBe('10'))
    fireEvent.click(within(node('Activiteiten')).getAllByRole('button', { name: 'Activiteiten' })[0])

    await waitFor(() => expect(hash()).toBe('30'))
  })

  it('opens the next view under the model when the open query view is deleted', async () => {
    api.deleteView.mockResolvedValue({})
    await opened('31')

    choose('Dagplanning (kopie)', 'Verwijderen')

    await waitFor(() => expect(hash()).toBe('20'))
  })
})

describe('App and the period as a filter', () => {
  it('has no period control in the toolbar or the bar: the period is a condition', async () => {
    await shell()
    await screen.findByText('Geen rijen')

    expect(screen.queryByRole('group', { name: 'Periode' })).toBeNull()
    expect(screen.queryByRole('button', { name: /periode/i })).toBeNull()
    expect(document.querySelector('.nv-chip--period')).toBeNull()
  })
})

describe('a link that carries conditions', () => {
  const link = (view: string, f: unknown) => `#view=${view}&f=${encodeURIComponent(typeof f === 'string' ? f : JSON.stringify(f))}`
  const optie = [{ field: 'status', op: 'in', values: ['option'] }]
  const declared = {
    status: { type: 'select' as const, label: 'Status', options: { option: 'Optie' } },
    kind: { type: 'select' as const, label: 'Soort', options: { show: 'Voorstelling' } },
  }
  beforeEach(() => api.schema.mockResolvedValue({ ...served, models: { ...served.models, activity: { ...served.models.activity, fields: declared } } }))
  const lastFilters = () => (api.rows.mock.calls.at(-1)?.[3] as { filters: unknown[] }).filters
  const params = () => new URLSearchParams(window.location.hash.slice(1))

  it('lands on its view with its conditions as chips, asks the rows for them, and leaves the address without f', async () => {
    const status = { type: 'select' as const, label: 'Status', options: { option: 'Optie' } }
    api.schema.mockResolvedValue({ ...served, models: { ...served.models, activity: { ...served.models.activity, fields: { status } } } })
    api.rows.mockResolvedValue({ rows: [{ id: 1, title: 'Montage', status: 'publish', fields: { status: 'option' } }], total: 1 })
    window.location.hash = link('planning', optie)
    await shell()

    await waitFor(() => expect(lastFilters()).toEqual(optie))
    expect((await screen.findByText('Status is Optie')).closest('.nv-chip--filter')).toBeTruthy()
    expect(params().get('f')).toBeNull()
    expect(params().get('view')).toBe('planning')
  })

  it('applies to an own saved view once the saved views have answered, and does not save it', async () => {
    const own: SavedView = {
      key: '42', id: 42, label: 'Calais techniek', table: 'planning', table_label: 'Planning', model: 'activity', date_field: 'date', type: 'grid',
      starting: false, arrangement: { hidden: [], order: [], widths: [], sort: [], filters: [], group: null, picked: [] },
      shared: false, owner: { id: 1, name: 'Hester' }, mine: true, editable: true,
    }
    let answer: (views: SavedView[]) => void = () => undefined
    api.savedViews.mockReturnValue(new Promise((resolve) => { answer = resolve }))
    window.location.hash = link('42', optie)
    await shell()
    await act(async () => answer([own]))

    await waitFor(() => expect(lastFilters()).toEqual(optie))
    await new Promise((resolve) => setTimeout(resolve, 600))
    expect(api.updateView).not.toHaveBeenCalled()
  })

  it.each([
    ['names a view that is not there', link('gone', optie)],
    ['carries an unreadable f', link('planning', '{not json')],
    ['carries an f of the wrong shape', link('planning', [{ field: 'status', op: 'shout', values: ['x'] }])],
  ])('applies nothing when it %s, and drops f', async (_, hash) => {
    window.location.hash = hash
    await shell()
    await screen.findByText('Geen rijen')

    await waitFor(() => expect(params().get('f')).toBeNull())
    expect(lastFilters()).toEqual([])
  })

  it('says so when the linked view is not one this account can open', async () => {
    window.location.hash = link('gone', optie)
    await shell()

    expect(await screen.findByText('De gedeelde weergave is er niet voor jou; je ziet Planning zonder de filters van de link.')).toBeTruthy()
  })

  it('carries the join: j=or lands an any-of, and leaves the address with f', async () => {
    const two = [{ field: 'status', op: 'in', values: ['option'] }, { field: 'kind', op: 'in', values: ['show'] }]
    window.location.hash = `${link('planning', two)}&j=or`
    await shell()

    await waitFor(() => expect(api.rows.mock.calls.at(-1)?.[3]).toMatchObject({ filters: two, join: 'or' }))
    expect(params().get('j')).toBeNull()
  })

  it('reads the rows again when only the join changes', async () => {
    const two = [{ field: 'status', op: 'in', values: ['option'] }, { field: 'kind', op: 'in', values: ['show'] }]
    const status = { type: 'select' as const, label: 'Status', options: { option: 'Optie' } }
    const kind = { type: 'select' as const, label: 'Soort', options: { show: 'Voorstelling' } }
    api.schema.mockResolvedValue({ ...served, models: { ...served.models, activity: { ...served.models.activity, fields: { status, kind } } } })
    api.rows.mockResolvedValue({ rows: [{ id: 1, title: 'Montage', status: 'publish', fields: { status: 'option', kind: 'show' } }], total: 1 })
    window.location.hash = link('planning', two)
    await shell()
    await waitFor(() => expect(lastFilters()).toEqual(two))

    const [, second] = await builderRows()
    fireEvent.click(within(second as HTMLElement).getByRole('button', { name: /^Verbinding:/ }))
    fireEvent.click(within(within(second as HTMLElement).getByRole('listbox', { name: 'Verbinding' })).getByRole('option', { name: 'Of' }))

    await waitFor(() => expect(api.rows.mock.calls.at(-1)?.[3]).toMatchObject({ join: 'or' }))
  })

  it('offers Publiceren on a saved view to an administrator only', async () => {
    const own: SavedView = {
      key: '42', id: 42, label: 'Calais techniek', table: 'planning', table_label: 'Planning', model: 'activity', date_field: 'date', type: 'grid',
      starting: false, arrangement: { hidden: [], order: [], widths: [], sort: [], filters: [], group: null, picked: [] },
      shared: false, owner: { id: 1, name: 'Hester' }, mine: true, editable: true,
    }
    api.savedViews.mockResolvedValue([own])
    window.location.hash = '#view=42'
    const names = async () => {
      await screen.findByRole('heading', { level: 1, name: 'Calais techniek' })
      const menu = (shareItem('Excel').closest('[role="menu"]') as HTMLElement)
      return within(menu).getAllByRole('menuitem').map((item) => item.textContent)
    }
    const first = await shell()
    expect(await names()).not.toContain('Publiceren')
    first.unmount()

    api.me.mockResolvedValue({ id: 1, email: 'hester@example.test', role: 'administrator', subject: null })
    await shell()
    expect(await names()).toContain('Publiceren')
  })

  it('Link kopiëren copies the address a landing reads: the view, its conditions and its join', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    Object.assign(navigator, { clipboard: { writeText } })
    const two = [{ field: 'status', op: 'in', values: ['option'] }, { field: 'kind', op: 'in', values: ['show'] }]
    window.location.hash = `${link('planning', two)}&j=or`
    await shell()
    await waitFor(() => expect(lastFilters()).toEqual(two))

    fireEvent.click(shareItem('Link kopiëren'))

    await waitFor(() => expect(writeText).toHaveBeenCalled())
    const copied = new URL(writeText.mock.calls[0]?.[0] as string)
    const sent = new URLSearchParams(copied.hash.slice(1))
    expect([sent.get('view'), JSON.parse(sent.get('f') ?? '[]'), sent.get('j')]).toEqual(['planning', two, 'or'])
    expect(await screen.findByText('Link gekopieerd')).toBeTruthy()
  })

  it("replaces the view's conditions with the link's, so the colleague sees what the sender saw; an empty f clears them", async () => {
    const status = { type: 'select' as const, label: 'Status', options: { option: 'Optie', confirmed: 'Bevestigd' } }
    const kind = { type: 'select' as const, label: 'Soort', options: { show: 'Voorstelling' } }
    api.schema.mockResolvedValue({ ...served, models: { ...served.models, activity: { ...served.models.activity, fields: { status, kind } } } })
    window.localStorage.setItem('ntdst-views/layout/v2/planning', JSON.stringify({
      hidden: [], order: [], widths: {}, sort: [], filters: [{ field: 'status', op: 'in', values: ['confirmed'] }], group: null,
    }))
    const soort = [{ field: 'kind', op: 'in', values: ['show'] }]
    window.location.hash = link('planning', soort)
    const first = await shell()
    await waitFor(() => expect(lastFilters()).toEqual(soort))
    first.unmount()

    window.location.hash = link('planning', [])
    await shell()
    await waitFor(() => expect(lastFilters()).toEqual([]))
  })

  it("drops a linked condition the view's model cannot hold: a field it has not, or an operator its field does not take", async () => {
    const status = { type: 'select' as const, label: 'Status', options: { option: 'Optie' } }
    api.schema.mockResolvedValue({ ...served, models: { ...served.models, activity: { ...served.models.activity, fields: { status } } } })
    const kept = { field: 'status', op: 'in', values: ['option'] }
    window.location.hash = link('planning', [{ field: 'gone', op: 'in', values: ['x'] }, { field: 'status', op: 'week', values: [] }, kept])
    await shell()

    await waitFor(() => expect(lastFilters()).toEqual([kept]))
  })

  it("replaces the view's own date condition with the linked one, never beside it", async () => {
    window.localStorage.setItem('ntdst-views/layout/v2/planning', JSON.stringify({
      hidden: [], order: [], widths: {}, sort: [], filters: [{ field: 'date', op: 'week', values: [] }], group: null,
    }))
    api.schema.mockResolvedValue({ ...served, models: { ...served.models, activity: { ...served.models.activity, fields: { date: { type: 'date', label: 'Datum' } } } } })
    window.location.hash = link('planning', [{ field: 'date', op: 'between', values: ['2026-10-12', '2026-10-18'] }])
    await shell()

    await waitFor(() => expect(lastFilters()).toEqual([{ field: 'date', op: 'between', values: ['2026-10-12', '2026-10-18'] }]))
  })
})
