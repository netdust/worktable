import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { awayRows, consumeLink, create, createView, deleteView, forgetSchema, history, me, onUnauthenticated, prefs, records, remove, restoreView, rows, requestLink, runAction, savePrefs, savedViews, schema, setDisplay, signOut, undoBatch, update, updateView } from './api'
import { type EngineRow, type EngineSchema, type EngineView, toRow } from './engine'
import { defaults } from './grid/layout'
import { createStore } from './grid/store'
import { createMatrixStore } from './matrix/store'
import type { MatrixAway, MatrixColumn, Row, Saved, View } from './types'

const toRowShape = (row: EngineRow): Row => toRow(row)

const fetcher = vi.fn<typeof fetch>()

const engine: EngineSchema = {
  sources: {
    productie: { kind: 'dataset', label: 'Producties', title: 'titel', date: null, columns: { titel: { type: 'text', label: 'Titel' } } },
    activiteit: {
      kind: 'dataset', label: 'Activiteiten', title: 'omschrijving', date: 'plandag',
      columns: {
        productie_id: { type: 'integer', label: 'Productie', relation: 'productie' },
        omschrijving: { type: 'text', label: 'Omschrijving', nullable: true },
        status: { type: 'text', label: 'Status', options: { optie: 'Optie', bevestigd: 'Bevestigd' } },
        plandag: { type: 'date', label: 'Plandag' },
        start_at: { type: 'datetime', label: 'Start' },
        eind_at: { type: 'datetime', label: 'Einde', nullable: true },
        personen: { type: 'integer', label: 'Personen', nullable: true },
        zaal: { type: 'text', label: 'Zaal', nullable: true, options: { groot: 'Grote zaal', klein: 'Kleine zaal' } },
        notitie: { type: 'text', label: 'Notitie' },
      },
      writable: true,
      deletable: true,
    },
    dagplanning: {
      kind: 'query', label: 'Dagplanning', title: 'omschrijving', date: 'plandag', writable: true,
      columns: {
        id: { type: 'integer', label: 'Id' },
        activiteit_id: { type: 'integer', label: 'Activiteit' },
        omschrijving: { type: 'text', label: 'Omschrijving', nullable: true },
        status: { type: 'text', label: 'Status', writes: { dataset: 'activiteit', field: 'status', key: 'activiteit_id' } },
        productie_id: { type: 'text', label: 'Productie', writes: { dataset: 'activiteit', field: 'productie_id', key: 'activiteit_id' } },
        start_at: { type: 'text', label: 'Start', writes: { dataset: 'activiteit', field: 'start_at', key: 'activiteit_id' } },
      },
    },
  },
}
const served: EngineView[] = [{
  id: 1, name: 'Planning', source_type: 'dataset', source: 'activiteit', skin: 'table',
  filters: { status: 'bevestigd' }, sort: ['plandag'], group_by: null, visible_fields: ['status'],
  shared: true, owner_id: 0, mine: true, editable: true,
}]
const planning: View = { key: '1', label: 'Planning', table: 'activiteit', model: 'activiteit', date_field: 'plandag' }

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
/** Each path its answer; the schema for `/api/schema`, the saved views for `/api/views`. */
function answer(byPath: Record<string, unknown> = {}) {
  fetcher.mockImplementation(async (input) => {
    const path = String(input).split('?')[0]
    if (path === '/api/schema') return json(engine)
    return json(byPath[path] ?? (path === '/api/views' ? { views: served } : { rows: [], total: 0 }))
  })
}
const urls = () => fetcher.mock.calls.map(([input]) => String(input))

beforeEach(() => {
  vi.stubGlobal('fetch', fetcher)
  forgetSchema()
  answer()
})
afterEach(() => {
  fetcher.mockReset()
  vi.unstubAllGlobals()
})

describe('schema() and savedViews()', () => {
  it('boot from a /schema without views: one /api/schema read between them, the saved views from GET /api/views', async () => {
    const [schemaOut, saved] = await Promise.all([schema(), savedViews()])

    expect([...urls()].sort()).toEqual(['/api/schema', '/api/views'])
    expect(schemaOut.tables.map((t) => t.key)).toEqual(['productie', 'activiteit', 'dagplanning'])
    expect([schemaOut.models.activiteit.deletable, schemaOut.models.productie.deletable]).toEqual([true, undefined])
    expect(saved.map((v) => [v.key, v.label, v.table, v.mine, v.editable, v.shared])).toEqual([['1', 'Planning', 'activiteit', true, true, true]])
  })

  it('asks again after a failed read', async () => {
    fetcher.mockRejectedValueOnce(new TypeError('Failed to fetch'))

    await expect(schema()).rejects.toEqual({ code: 'unknown', message: 'Failed to fetch' })
    await schema()

    expect(urls()).toEqual(['/api/schema', '/api/schema'])
  })
})

describe('rows()', () => {
  it("sends the layout's chips, sort and group and the window to /api/rows/<source>", async () => {
    const layout = { ...defaults(planning), filters: [{ field: 'status', op: 'in' as const, values: ['bevestigd'] }], sort: [{ id: 'title', desc: true }], group: 'plandag' }

    await rows(planning, { from: '2026-10-12', to: '2026-10-18' }, null, layout)

    const url = new URL(urls()[1], 'http://grid.test')
    expect(url.pathname).toBe('/api/rows/activiteit')
    expect(JSON.parse(url.searchParams.get('filter') ?? '')).toEqual({ status: { $eq: 'bevestigd' } })
    expect(url.searchParams.get('sort')).toBe('-omschrijving')
    expect(url.searchParams.get('group')).toBe('plandag')
    expect(url.searchParams.get('from')).toBe('2026-10-12')
    expect(url.searchParams.get('to')).toBe('2026-10-18')
  })

  it('merges the scope into the fixed filters, beside a fixed condition on its column', async () => {
    const fixed = { ...planning, fixed: { productie_id: { $ne: 2 }, status: { $in: ['optie'] } } }

    await rows(fixed, {}, { field: 'productie_id', id: 7 }, defaults(planning))
    await rows(planning, {}, { field: 'productie_id', id: 7 })

    const filters = urls().slice(1).map((u) => JSON.parse(new URL(u, 'http://grid.test').searchParams.get('filter') ?? ''))
    expect(filters).toEqual([
      { productie_id: { $ne: 2, $eq: 7 }, status: { $in: ['optie'] } },
      { productie_id: { $eq: 7 } },
    ])
  })

  it('sends only the window without a layout, and nothing for a view without one', async () => {
    await rows(planning, { from: '2026-10-12', to: '2026-10-18' })
    await rows(planning, {})

    expect(urls().slice(1)).toEqual(['/api/rows/activiteit?from=2026-10-12&to=2026-10-18', '/api/rows/activiteit'])
  })

  it("maps the engine's flat rows to the grid's, titled by the engine", async () => {
    answer({
      '/api/rows/activiteit': {
        rows: [{ id: 4, omschrijving: 'opbouw Gent', title: 'opbouw Gent', status: 'bevestigd', productie_id: 1, plandag: '2026-10-12', custom: {}, lookups: { productie_id: { id: 1, title: 'De Kersentuin' } } }],
        total: 1,
      },
    })

    const found = await rows(planning, {})

    expect(found.total).toBe(1)
    expect(found.rows[0]).toMatchObject({ id: 4, title: 'opbouw Gent', fields: { status: 'bevestigd', productie_id: 1 } })
    expect(found.rows[0].lookups?.productie_id?.title).toBe('De Kersentuin')
  })

  it("rejects with the engine's code and message", async () => {
    fetcher.mockImplementation(async (input) =>
      String(input) === '/api/schema' ? json(engine) : json({ code: 'bad_sort', message: 'cannot sort on "kleur"' }, 400),
    )

    await expect(rows(planning, {})).rejects.toEqual({ code: 'bad_sort', message: 'cannot sort on "kleur"' })
  })

  it('rejects an answer that is not the engine\'s JSON as unknown, with its status', async () => {
    fetcher.mockImplementation(async (input) =>
      String(input) === '/api/schema' ? json(engine) : new Response('Bad Gateway', { status: 502, statusText: 'Bad Gateway' }),
    )

    await expect(rows(planning, {})).rejects.toEqual({ code: 'unknown', message: '502 Bad Gateway' })
  })

  it('rejects a source the schema does not serve before asking for its rows', async () => {
    await expect(rows({ ...planning, model: 'kleur' }, {})).rejects.toMatchObject({ code: 'unknown_source' })
    expect(urls()).toEqual(['/api/schema'])
  })
})

describe('history()', () => {
  it("asks /api/history/<source> with the view's filter, scope and window, never its sort or group", async () => {
    const entries = [{ batch: 'b', record: { id: 4, title: 'opbouw' } }]
    answer({ '/api/history/activiteit': { entries } })
    const layout = { ...defaults(planning), filters: [{ field: 'status', value: 'bevestigd' }], sort: [{ id: 'title', desc: true }], group: 'plandag' }

    const found = await history(planning, { from: '2026-10-12', to: '2026-10-18' }, { field: 'productie_id', id: 7 }, layout)

    expect(found).toEqual(entries)
    const url = new URL(urls()[1], 'http://grid.test')
    expect(url.pathname).toBe('/api/history/activiteit')
    expect(JSON.parse(url.searchParams.get('filter') ?? '')).toEqual({ status: { $eq: 'bevestigd' }, productie_id: { $eq: 7 } })
    expect([...url.searchParams.keys()].sort()).toEqual(['filter', 'from', 'to'])
  })
})

describe('records()', () => {
  it("lists a model's records, narrowed to the titles holding the search", async () => {
    answer({
      '/api/rows/productie': {
        rows: [{ id: 1, titel: 'De Kersentuin', title: 'De Kersentuin', custom: {}, lookups: {} }, { id: 2, titel: 'Wachten op Godot', title: 'Wachten op Godot', custom: {}, lookups: {} }],
        total: 2,
      },
    })

    const found = await records('productie', 'kersen')
    const all = await records('productie', '')

    expect(found).toEqual({ rows: [expect.objectContaining({ id: 1, title: 'De Kersentuin' })], total: 1 })
    expect(all.total).toBe(2)
    expect(urls()).toEqual(['/api/rows/productie?limit=5000&offset=0', '/api/rows/productie?limit=5000&offset=0'])
  })

  it('clamps a page size the engine would refuse', async () => {
    vi.stubEnv('VITE_RECORDS_PAGE_SIZE', '99999')
    answer()
    await records('productie', '')
    vi.stubEnv('VITE_RECORDS_PAGE_SIZE', '-3')
    await records('productie', '')
    vi.unstubAllEnvs()

    expect(urls().filter((u) => u.startsWith('/api/rows/'))).toEqual(['/api/rows/productie?limit=5000&offset=0', '/api/rows/productie?limit=1&offset=0'])
  })

  it('pages with offset until the total: five rows at page size 2 take three calls', async () => {
    vi.stubEnv('VITE_RECORDS_PAGE_SIZE', '2')
    const every = [1, 2, 3, 4, 5].map((id) => ({ id, titel: `P${id}`, title: `P${id}`, custom: {}, lookups: {} }))
    fetcher.mockImplementation(async (input) => {
      const url = new URL(String(input), 'http://x')
      if (url.pathname === '/api/schema') return json(engine)
      const [limit, offset] = [Number(url.searchParams.get('limit')), Number(url.searchParams.get('offset'))]
      return json({ rows: every.slice(offset, offset + limit), total: 5 })
    })

    const found = await records('productie', '')

    expect(found.rows.map((r) => r.id)).toEqual([1, 2, 3, 4, 5])
    expect(urls().filter((u) => u.startsWith('/api/rows/'))).toEqual([
      '/api/rows/productie?limit=2&offset=0', '/api/rows/productie?limit=2&offset=2', '/api/rows/productie?limit=2&offset=4',
    ])
    vi.unstubAllEnvs()
  })
})

describe('setDisplay()', () => {
  it('PUTs the display to the source as JSON, and reads /schema afresh afterwards', async () => {
    fetcher.mockImplementation(async (input) => json(String(input) === '/api/schema' ? engine : { source: 'activiteit', label: 'Werk', icon: 'star', batch_id: 'b1' }))
    await schema()

    expect(await setDisplay('activiteit', { label: 'Werk', icon: 'star' })).toMatchObject({ label: 'Werk', icon: 'star' })
    const [, init] = fetcher.mock.calls[1] ?? []
    expect([String(fetcher.mock.calls[1]?.[0]), init?.method, init?.body]).toEqual(['/api/sources/activiteit/display', 'PUT', JSON.stringify({ label: 'Werk', icon: 'star' })])
    await schema()
    expect(urls().filter((url) => url === '/api/schema')).toHaveLength(2)
  })

  it("rejects with the engine's refusal", async () => {
    fetcher.mockResolvedValue(json({ code: 'forbidden', message: 'only an administrator may change how a source is shown' }, 403))

    await expect(setDisplay('activiteit', { label: 'Werk' })).rejects.toEqual({ code: 'forbidden', message: 'only an administrator may change how a source is shown' })
  })
})

describe('prefs', () => {
  it('starts from no prefs, and keeps a change, without asking', async () => {
    await expect(prefs()).resolves.toEqual({ order: {}, last: {} })
    await expect(savePrefs({ order: { activiteit: ['1'] }, last: {} })).resolves.toEqual({ order: { activiteit: ['1'] }, last: {} })
    expect(fetcher).not.toHaveBeenCalled()
  })
})

describe('saved views on the engine', () => {
  const sent = () => fetcher.mock.calls.filter(([input]) => String(input) !== '/api/schema').map(([input, init]) => [String(input), init?.method ?? 'GET', init?.body && JSON.parse(String(init.body))])
  const out = (view: Partial<EngineView>): EngineView => ({ ...served[0], ...view })
  const seeded = out({ id: 5, name: 'Optie of bevestigd', filters: { status: { $in: ['optie', 'bevestigd'] } }, sort: ['plandag'], visible_fields: ['status', 'productie_id'] })
  const routes = (byRoute: Record<string, unknown>) =>
    fetcher.mockImplementation(async (input, init) => {
      const path = String(input)
      if (path === '/api/schema') return json(engine)
      const [status, body] = (byRoute[`${init?.method ?? 'GET'} ${path}`] ?? [200, { views: [seeded] }]) as [number, unknown]
      return json(body, status)
    })

  it('"Save as new" posts the arrangement as the engine stores it, and opens what comes back', async () => {
    routes({ 'POST /api/views': [201, out({ id: 9, name: 'Mijn planning', shared: false })] })
    const arrangement = {
      hidden: ['plandag', 'personen', 'zaal', 'notitie', 'eind_at'], order: ['status', 'productie_id', 'start_at'], widths: [{ id: 'status', width: 90 }],
      sort: [{ id: 'title', desc: true }], filters: [{ field: 'zaal', op: 'in' as const, values: ['groot'] }], group: 'plandag', picked: [],
    }

    const created = await createView({ name: 'Mijn planning', table: 'activiteit', type: 'grid', field: null, shared: false, arrangement, fixed: { personen: { $gt: 2 } } })

    expect(sent()).toEqual([['/api/views', 'POST', {
      name: 'Mijn planning', source: 'activiteit', skin: 'table', shared: false,
      filters: { zaal: { $eq: 'groot' }, personen: { $gt: 2 } }, sort: ['-omschrijving'], group_by: 'plandag',
      visible_fields: ['omschrijving', 'status', 'productie_id', 'start_at'],
    }]])
    expect(created).toMatchObject({ key: '9', id: 9, label: 'Mijn planning', table: 'activiteit', type: 'grid', shared: false, mine: true })
  })

  it('a new matrix view is created with the matrix skin', async () => {
    routes({ 'POST /api/views': [201, out({ id: 9, skin: 'matrix' })] })

    await createView({ name: 'Bezetting', table: 'activiteit', type: 'matrix', field: null, shared: true, arrangement: { hidden: [], order: [], widths: [], sort: [], filters: [], group: null, picked: [] } })

    expect(sent()[0][2]).toMatchObject({ skin: 'matrix', shared: true })
  })

  it('a seeded $in filter is a condition: a Save stores the conditions as they stand', async () => {
    routes({ 'PATCH /api/views/5': [200, out({ ...seeded, filters: { status: { $eq: 'optie' } } })] })
    const [view] = await savedViews()
    expect(view.arrangement.filters).toEqual([{ field: 'status', op: 'in', values: ['optie', 'bevestigd'] }])
    fetcher.mockClear()

    const fresh = await updateView(view, { arrangement: { ...view.arrangement, filters: [{ field: 'status', op: 'in' as const, values: ['optie'] }] } })

    expect(sent()).toEqual([['/api/views/5', 'PATCH', {
      filters: { status: { $eq: 'optie' } }, sort: ['plandag'], group_by: null, visible_fields: ['omschrijving', 'status', 'productie_id'],
    }]])
    expect(fresh.arrangement.filters).toEqual([{ field: 'status', op: 'in', values: ['optie'] }])
    expect(fresh.fixed).toEqual({})
  })

  it('a rename or a share sends only that', async () => {
    routes({ 'PATCH /api/views/5': [200, out({ ...seeded, name: 'Opties', shared: false })] })
    const [view] = await savedViews()
    fetcher.mockClear()

    const renamed = await updateView(view, { name: 'Opties' })
    await updateView(view, { shared: false })

    expect(sent()).toEqual([['/api/views/5', 'PATCH', { name: 'Opties' }], ['/api/views/5', 'PATCH', { shared: false }]])
    expect(renamed).toMatchObject({ label: 'Opties', shared: false })
  })

  it('deletes, and restores what the engine gives back', async () => {
    routes({ 'DELETE /api/views/5': [200, { id: 5 }], 'POST /api/views/5/restore': [200, seeded] })

    await deleteView(5)
    const back = await restoreView(5)

    expect(sent()).toEqual([['/api/views/5', 'DELETE', undefined], ['/api/views/5/restore', 'POST', {}]])
    const restore = fetcher.mock.calls.find(([input]) => String(input) === '/api/views/5/restore')
    expect(restore?.[1]?.headers).toEqual({ 'Content-Type': 'application/json' })
    expect(back).toMatchObject({ key: '5', label: 'Optie of bevestigd', table: 'activiteit' })
  })

  it("rejects with the engine's unknown_view and not_owner", async () => {
    routes({
      'PATCH /api/views/5': [404, { code: 'unknown_view', message: 'unknown view 5' }],
      'DELETE /api/views/5': [403, { code: 'not_owner', message: 'only the owner may change this view' }],
    })
    const [view] = await savedViews()

    await expect(updateView(view, { name: 'x' })).rejects.toEqual({ code: 'unknown_view', message: 'unknown view 5' })
    await expect(deleteView(5)).rejects.toEqual({ code: 'not_owner', message: 'only the owner may change this view' })
  })
})

describe('writes', () => {
  const stored = { id: 7, omschrijving: 'opbouw Gent', title: 'opbouw Gent', status: 'optie', productie_id: 1, plandag: '2026-10-12', custom: {}, lookups: { productie_id: null } }
  /** A dagplanning row whose id is not its activiteit's: routing must read the key. */
  const planned: Row = { id: 40, title: 'opbouw Gent', status: '', fields: { activiteit_id: 7, status: 'optie' }, lookups: {} }
  const sent = () => fetcher.mock.calls.slice(1).map(([input, init]) => [decodeURIComponent(String(input)), init?.method ?? 'GET', init?.body])

  it('send JSON to the row paths under /api, the title as the title column, and map the reply', async () => {
    fetcher.mockImplementation(async (input, init) => (String(input) === '/api/schema' ? json(engine) : init?.method === 'DELETE' ? json({ id: 7 }) : json(stored)))

    const made = await create('activiteit', { title: 'opbouw Gent' })
    const changed = await update('activiteit', 7, { status: 'optie' })
    await remove('activiteit', 7)

    expect(made).toEqual({ row: expect.objectContaining({ id: 7, title: 'opbouw Gent', fields: expect.objectContaining({ status: 'optie' }) }), batch: null })
    expect(changed.row.title).toBe('opbouw Gent')
    expect(sent()).toEqual([
      ['/api/rows/activiteit', 'POST', JSON.stringify({ omschrijving: 'opbouw Gent' })],
      ['/api/rows/activiteit/7', 'PATCH', JSON.stringify({ status: 'optie' })],
      ['/api/rows/activiteit/7', 'DELETE', undefined],
    ])
  })

  it('update on dagplanning status sends PATCH /rows/activiteit/<row.activiteit_id> and re-reads the query row', async () => {
    const reread = { id: 40, activiteit_id: 7, omschrijving: 'opbouw Gent', title: 'opbouw Gent', status: 'bevestigd', custom: {}, lookups: {} }
    fetcher.mockImplementation(async (input, init) => {
      if (String(input) === '/api/schema') return json(engine)
      return init?.method === 'PATCH' ? json({ ...stored, status: 'bevestigd', revision: { batch_id: 'b-7', changed: ['status'] } }) : json({ rows: [reread], total: 1 })
    })

    const { row, batch } = await update('dagplanning', 40, { status: 'bevestigd' }, planned)

    expect(sent()).toEqual([
      ['/api/rows/activiteit/7', 'PATCH', JSON.stringify({ status: 'bevestigd' })],
      ['/api/rows/dagplanning?filter={"id":40}', 'GET', undefined],
    ])
    expect(row).toMatchObject({ id: 40, title: 'opbouw Gent', fields: { activiteit_id: 7, status: 'bevestigd' } })
    expect(batch).toBe('b-7')
  })

  it('a re-read that finds no row, or fails, returns the patched row', async () => {
    fetcher.mockImplementation(async (input, init) => {
      if (String(input) === '/api/schema') return json(engine)
      return init?.method === 'PATCH' ? json(stored) : json({ rows: [], total: 0 })
    })
    const gone = await update('dagplanning', 40, { status: 'geannuleerd' }, planned)

    fetcher.mockImplementation(async (input, init) => {
      if (String(input) === '/api/schema') return json(engine)
      return init?.method === 'PATCH' ? json(stored) : new Response('Bad Gateway', { status: 502 })
    })
    const failed = await update('dagplanning', 40, { status: 'bevestigd' }, planned)

    expect(gone.row).toEqual({ ...planned, fields: { activiteit_id: 7, status: 'geannuleerd' } })
    expect(failed.row).toEqual({ ...planned, fields: { activiteit_id: 7, status: 'bevestigd' } })
  })

  describe('the wire format follows the engine column types', () => {
    beforeEach(() => {
      fetcher.mockImplementation(async (input, init) => {
        if (String(input) === '/api/schema') return json(engine)
        return init?.method === 'PATCH' ? json(stored) : json({ rows: [], total: 0 })
      })
    })

    it('a relation pick sends the id, and clearing it sends null', async () => {
      await update('activiteit', 7, { productie_id: [2] })
      await update('activiteit', 7, { productie_id: [] })

      expect(sent().map(([, , body]) => body)).toEqual([JSON.stringify({ productie_id: 2 }), JSON.stringify({ productie_id: null })])
    })

    it("clearing a datetime, an integer, a date and a nullable text sends null; a cleared non-nullable text stays ''", async () => {
      await update('activiteit', 7, { eind_at: '', personen: '', plandag: '', title: '', notitie: '' })

      expect(sent()[0][2]).toBe(JSON.stringify({ eind_at: null, personen: null, plandag: null, omschrijving: null, notitie: '' }))
    })

    it("clearing a nullable select sends null; clearing a non-nullable select still sends '' for its writer to refuse", async () => {
      await update('activiteit', 7, { zaal: '' })
      await update('activiteit', 7, { status: '' })

      expect(sent().map(([, , body]) => body)).toEqual([JSON.stringify({ zaal: null }), JSON.stringify({ status: '' })])
    })

    it("a mapped query column sends its target column's type", async () => {
      await update('dagplanning', 40, { start_at: '' }, planned)
      await update('dagplanning', 40, { productie_id: [3] }, planned)

      expect(sent().filter(([, method]) => method === 'PATCH')).toEqual([
        ['/api/rows/activiteit/7', 'PATCH', JSON.stringify({ start_at: null })],
        ['/api/rows/activiteit/7', 'PATCH', JSON.stringify({ productie_id: 3 })],
      ])
    })
  })

  it("a query row without its key's value is refused read_only before any request", async () => {
    const keyless: Row = { ...planned, fields: { activiteit_id: null, status: 'optie' } }

    await expect(update('dagplanning', 40, { status: 'bevestigd' }, keyless)).rejects.toMatchObject({ code: 'read_only' })
    expect(urls()).toEqual(['/api/schema'])
  })

  it('a 422 reaches the store as {code:\'refused\', message}', async () => {
    fetcher.mockImplementation(async (input) =>
      String(input) === '/api/schema' ? json(engine) : json({ code: 'refused', message: 'Een bevestigde activiteit heeft een starttijd nodig.' }, 422),
    )

    await expect(update('activiteit', 7, { status: 'bevestigd' })).rejects.toEqual({ code: 'refused', message: 'Een bevestigde activiteit heeft een starttijd nodig.' })
    await expect(update('dagplanning', 40, { status: 'bevestigd' }, planned)).rejects.toEqual({ code: 'refused', message: 'Een bevestigde activiteit heeft een starttijd nodig.' })
  })

  it("a 409 in_use reaches the store with the engine's by", async () => {
    const by = [{ label: 'Activiteiten', count: 3 }, { label: 'Personen', count: 1 }]
    fetcher.mockImplementation(async (input) =>
      String(input) === '/api/schema' ? json(engine) : json({ by, code: 'in_use', message: 'Still referenced by Activiteiten (3), Personen (1)' }, 409),
    )

    await expect(remove('productie', 1)).rejects.toEqual({ code: 'in_use', message: 'Still referenced by Activiteiten (3), Personen (1)', by })
  })

  it('a 409 keeps only the well-formed by entries, and the store settles on their sentence', async () => {
    const by = [null, { label: 'Activiteiten', count: 3 }, { label: 'Personen', count: 'veel' }, { label: 7, count: 1 }, { label: 'Tijden', count: 1.5 }, { label: 'Leveranciers', count: 2 }]
    fetcher.mockImplementation(async (input) =>
      String(input) === '/api/schema' ? json(engine) : json({ by, code: 'in_use', message: 'Still referenced' }, 409),
    )

    const refused = await remove('productie', 1).catch((error: unknown) => error)
    expect(refused).toEqual({ code: 'in_use', message: 'Still referenced', by: [{ label: 'Activiteiten', count: 3 }, { label: 'Leveranciers', count: 2 }] })

    const store = createStore({ model: 'productie', rows: [{ id: 1, title: 'Alfa', status: '', fields: {} }], api: { update: vi.fn(), create: vi.fn(), remove: () => Promise.reject(refused) } })
    await store.remove(1)
    expect(store.getState()).toMatchObject({ save: 'error', error: { code: 'in_use', message: 'Nog in gebruik door Activiteiten (3) en Leveranciers (2).' } })
  })

  it("hands back a write's batch, and never lands the revision in the row's fields", async () => {
    fetcher.mockImplementation(async (input) => (String(input) === '/api/schema' ? json(engine) : json({ ...stored, revision: { batch_id: 'b-1', changed: ['status'] } })))

    const { row, batch } = await update('activiteit', 7, { status: 'optie' })

    expect(batch).toBe('b-1')
    expect(row.fields).not.toHaveProperty('revision')
  })

  it('undoes a batch with an empty JSON body and answers the undo batch; a changed_since keeps its column and label', async () => {
    fetcher.mockImplementationOnce(async () => json({ batch_id: 'u-1', affected: [{ dataset: 'activiteit', id: 7 }] }))
    expect(await undoBatch('b-1')).toBe('u-1')
    expect(fetcher.mock.calls[0][0]).toBe('/api/batches/b-1/undo')
    expect(fetcher.mock.calls[0][1]).toMatchObject({ method: 'POST', body: '{}', headers: { 'Content-Type': 'application/json' } })

    fetcher.mockImplementationOnce(async () => json({ code: 'changed_since', message: '"status" changed since', dataset: 'activiteit', id: 7, column: 'status', label: 'Status' }, 409))
    await expect(undoBatch('b-1')).rejects.toEqual({ code: 'changed_since', message: '"status" changed since', column: 'status', label: 'Status' })
  })

  it('runs an action on a record with its input, and answers its batch', async () => {
    fetcher.mockImplementationOnce(async () => json({ batch_id: 'a-1', created: [{ dataset: 'activiteit', id: 9 }] }, 201))

    expect(await runAction('sjabloon_toepassen', 3, { sjabloon_id: 2 })).toEqual({ batch: 'a-1', created: [{ dataset: 'activiteit', id: 9 }] })
    expect(fetcher.mock.calls[0][0]).toBe('/api/actions/sjabloon_toepassen')
    expect(fetcher.mock.calls[0][1]?.body).toBe(JSON.stringify({ id: 3, input: { sjabloon_id: 2 } }))
  })

  it('reject with the not-found the engine answers', async () => {
    fetcher.mockImplementation(async () => new Response('404 Not Found', { status: 404, statusText: 'Not Found' }))

    await expect(deleteView(5)).rejects.toEqual({ code: 'unknown', message: '404 Not Found' })
  })
})

describe('the matrix on the engine', () => {
  const matrixEngine: EngineSchema = {
    sources: {
      activiteit: { ...engine.sources.activiteit, matrix_join: 'toewijzing' },
      toewijzing: {
        kind: 'dataset', label: 'Toewijzingen', title: 'naam', title_via: 'persoon_id', date: null, writable: true, deletable: true,
        columns: {
          activiteit_id: { type: 'integer', label: 'Activiteit', relation: 'activiteit' },
          persoon_id: { type: 'integer', label: 'Persoon', relation: 'persoon', nullable: true },
          naam: { type: 'text', label: 'Naam', nullable: true },
          state: { type: 'text', label: 'Status', options: { uitgenodigd: 'Uitgenodigd', bevestigd: 'Bevestigd' } },
        },
        matrix: { down: 'activiteit_id', across: 'persoon_id', label: 'naam', cell: 'state', keys: { b: 'bevestigd' }, marks: { bevestigd: '✓' }, count: 'bevestigd' },
      },
    },
  }
  const matrixView: View = {
    key: '4', label: 'Toewijzingen per activiteit', table: 'activiteit', model: 'activiteit', type: 'matrix', date_field: 'plandag',
    join: { model: 'toewijzing', row_field: 'activiteit_id', column_field: 'persoon_id', name_field: 'naam', cell_field: 'state', keys: { b: 'bevestigd' }, marks: { bevestigd: '✓' }, count: 'bevestigd' },
  }
  const lotte: MatrixColumn = { key: 'record:1', kind: 'record', id: 1, title: 'Lotte Verhaegen' }
  const cell: EngineRow = { id: 4, activiteit_id: 2, persoon_id: 1, naam: null, state: 'bevestigd', title: 'Lotte Verhaegen', custom: {}, lookups: {} }
  const activiteit = (cells: EngineRow[]): EngineRow => ({ id: 2, omschrijving: 'repetitie Gent', plandag: '2026-10-12', title: 'repetitie Gent', custom: {}, lookups: {}, cells })
  const sent = () => fetcher.mock.calls.filter(([input]) => String(input) !== '/api/schema').map(([input, init]) => [decodeURIComponent(String(input)), init?.method ?? 'GET', init?.body])
  // The matrix takes the row a write returns, as its hooks hand it.
  const unwrapped = <A extends unknown[]>(write: (...args: A) => Promise<Saved>) => (...args: A) => write(...args).then((saved) => saved.row)
  const on = (reply: (path: string, init?: RequestInit) => Response) =>
    fetcher.mockImplementation(async (input, init) => (String(input) === '/api/schema' ? json(matrixEngine) : reply(String(input), init)))

  it('asks a matrix view its rows with cells=1 and the window, and carries the cells as rollups.cells', async () => {
    on(() => json({ rows: [activiteit([cell])], total: 1 }))

    const found = await rows(matrixView, { from: '2026-10-12', to: '2026-10-18' }, null, { ...defaults(matrixView), filters: [], sort: [], group: null })

    expect(new URL(String(sent()[0][0]), 'http://x').searchParams.get('cells')).toBe('1')
    expect(sent()[0][0]).toContain('from=2026-10-12&to=2026-10-18')
    expect(found.rows[0].rollups?.cells).toEqual([expect.objectContaining({ id: 4, title: 'Lotte Verhaegen', fields: expect.objectContaining({ persoon_id: 1, state: 'bevestigd' }) })])
  })

  it('reads the away rows by overlap only, with no window; nothing without one', async () => {
    const away: MatrixAway = { table: 'beschikbaarheid', model: 'beschikbaarheid', column_field: 'persoon_id', label_field: 'reden', date_field: 'start_at', end_field: 'eind_at' }
    on(() => json({ rows: [{ id: 3, persoon_id: 1, start_at: '2026-10-09T09:00', eind_at: '2026-10-12T12:00', reden: 'Studiedag', title: 'Lotte', custom: {}, lookups: {} }], total: 1 }))

    expect(await awayRows(away, { from: '2026-10-12' })).toEqual([])
    expect(fetcher).not.toHaveBeenCalled()
    const found = await awayRows(away, { from: '2026-10-12', to: '2026-10-18' })

    expect(found.map((r) => r.fields.reden)).toEqual(['Studiedag'])
    expect(sent()).toEqual([[`/api/rows/beschikbaarheid?filter=${JSON.stringify({ start_at: { $lte: '2026-10-18T23:59:59' }, eind_at: { $gte: '2026-10-12' } })}`, 'GET', undefined]])
  })

  it('a cell create sends one id per relation; clearing it sends DELETE', async () => {
    on((_path, init) => (init?.method === 'DELETE' ? json({ id: 9 }) : json({ ...cell, id: 9, activiteit_id: 2 })))
    const store = createMatrixStore({ view: matrixView, rows: [toRowShape(activiteit([]))], api: { create: unwrapped(create), update: unwrapped(update), remove } })

    expect(await store.set(2, lotte, 'bevestigd')).toBe(true)
    expect(await store.set(2, lotte, null)).toBe(true)

    expect(sent()).toEqual([
      ['/api/rows/toewijzing', 'POST', JSON.stringify({ activiteit_id: 2, persoon_id: 1, state: 'bevestigd' })],
      ['/api/rows/toewijzing/9', 'DELETE', undefined],
    ])
  })

  it("a 422 reverts the cell with the writer's message", async () => {
    on(() => json({ code: 'refused', message: 'Deze persoon staat al op deze activiteit.' }, 422))
    const store = createMatrixStore({ view: matrixView, rows: [toRowShape(activiteit([]))], api: { create: unwrapped(create), update: unwrapped(update), remove } })

    expect(await store.set(2, lotte, 'bevestigd')).toBe(false)

    expect(store.cellError(2, lotte)?.message).toBe('Deze persoon staat al op deze activiteit.')
    expect(store.getState().rows[0].rollups?.cells).toEqual([])
  })

  it('a via-title record is titled by the engine, and a picker searches that title', async () => {
    on(() => json({ rows: [cell, { ...cell, id: 5, persoon_id: null, naam: 'Gastmuzikant', title: 'Gastmuzikant' }], total: 2 }))

    expect((await records('toewijzing', 'gast')).rows.map((r) => [r.id, r.title, r.fields.naam])).toEqual([[5, 'Gastmuzikant', 'Gastmuzikant']])
  })
})

describe('signing in', () => {
  it('a 401 on any request calls the unauthenticated callback, and the request still fails', async () => {
    const lapsed = vi.fn()
    const stop = onUnauthenticated(lapsed)
    fetcher.mockImplementation(async () => json({ code: 'unauthenticated', message: 'Sign in first' }, 401))

    await expect(records('productie', '')).rejects.toEqual({ code: 'unauthenticated', message: 'Sign in first' })
    expect(lapsed).toHaveBeenCalledOnce()

    stop()
    await expect(me()).rejects.toMatchObject({ code: 'unauthenticated' })
    expect(lapsed).toHaveBeenCalledOnce()
  })

  it('another refusal is not a lapsed session', async () => {
    const lapsed = vi.fn()
    const stop = onUnauthenticated(lapsed)
    fetcher.mockImplementation(async () => json({ code: 'forbidden', message: 'Nee' }, 403))

    await expect(remove('productie', 1)).rejects.toMatchObject({ code: 'forbidden' })
    expect(lapsed).not.toHaveBeenCalled()
    stop()
  })

  it('posts the email, the token, and an empty body to sign out', async () => {
    const account = { id: 3, email: 'an@example.test', role: 'editor', subject: null }
    fetcher.mockImplementation(async (input) => json(String(input) === '/api/auth/consume' ? { account } : { ok: true }))

    await requestLink('an@example.test')
    expect(await consumeLink('tok')).toEqual(account)
    await signOut()

    expect(fetcher.mock.calls.map(([input, init]) => [String(input), init?.method, init?.body])).toEqual([
      ['/api/auth/request', 'POST', JSON.stringify({ email: 'an@example.test' })],
      ['/api/auth/consume', 'POST', JSON.stringify({ token: 'tok' })],
      ['/api/auth/signout', 'POST', '{}'],
    ])
  })
})
