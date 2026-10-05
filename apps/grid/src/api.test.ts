import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { create, forgetSchema, prefs, records, remove, rows, savePrefs, savedViews, schema, update } from './api'
import type { EngineSchema } from './engine'
import { defaults } from './grid/layout'
import type { Row, View } from './types'

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
      },
      writable: true,
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
  views: [{
    id: 1, name: 'Planning', source_type: 'dataset', source: 'activiteit', skin: 'table',
    filters: { status: 'bevestigd' }, sort: ['plandag'], group_by: null, visible_fields: ['status'],
  }],
}
const planning: View = { key: '1', label: 'Planning', table: 'activiteit', model: 'activiteit', date_field: 'plandag' }

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
/** Each path its answer; the schema for `/api/schema`. */
function answer(byPath: Record<string, unknown> = {}) {
  fetcher.mockImplementation(async (input) => {
    const path = String(input).split('?')[0]
    return path === '/api/schema' ? json(engine) : json(byPath[path] ?? { rows: [], total: 0 })
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
  it('read /api/schema once between them', async () => {
    const [served, saved] = await Promise.all([schema(), savedViews()])

    expect(urls()).toEqual(['/api/schema'])
    expect(served.tables.map((t) => t.key)).toEqual(['activiteit'])
    expect(saved.map((v) => [v.key, v.label, v.table])).toEqual([['1', 'Planning', 'activiteit']])
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
    const layout = { ...defaults(planning), filters: [{ field: 'status', value: 'bevestigd' }], sort: [{ id: 'title', desc: true }], group: 'plandag' }

    await rows(planning, { from: '2026-10-12', to: '2026-10-18' }, null, layout)

    const url = new URL(urls()[1], 'http://grid.test')
    expect(url.pathname).toBe('/api/rows/activiteit')
    expect(JSON.parse(url.searchParams.get('filter') ?? '')).toEqual({ status: { $eq: 'bevestigd' } })
    expect(url.searchParams.get('sort')).toBe('-omschrijving')
    expect(url.searchParams.get('group')).toBe('plandag')
    expect(url.searchParams.get('from')).toBe('2026-10-12')
    expect(url.searchParams.get('to')).toBe('2026-10-18')
  })

  it('sends only the window without a layout, and nothing for a view without one', async () => {
    await rows(planning, { from: '2026-10-12', to: '2026-10-18' })
    await rows(planning, {})

    expect(urls().slice(1)).toEqual(['/api/rows/activiteit?from=2026-10-12&to=2026-10-18', '/api/rows/activiteit'])
  })

  it("maps the engine's flat rows to the grid's, titled by the source's title column", async () => {
    answer({
      '/api/rows/activiteit': {
        rows: [{ id: 4, omschrijving: 'opbouw Gent', status: 'bevestigd', productie_id: 1, plandag: '2026-10-12', custom: {}, lookups: { productie_id: { id: 1, title: 'De Kersentuin' } } }],
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

describe('records()', () => {
  it("lists a model's records, narrowed to the titles holding the search", async () => {
    answer({
      '/api/rows/productie': {
        rows: [{ id: 1, titel: 'De Kersentuin', custom: {}, lookups: {} }, { id: 2, titel: 'Wachten op Godot', custom: {}, lookups: {} }],
        total: 2,
      },
    })

    const found = await records('productie', 'kersen')
    const all = await records('productie', '')

    expect(found).toEqual({ rows: [expect.objectContaining({ id: 1, title: 'De Kersentuin' })], total: 1 })
    expect(all.total).toBe(2)
    expect(urls().slice(1)).toEqual(['/api/rows/productie', '/api/rows/productie'])
  })
})

describe('prefs', () => {
  it('starts from no prefs without asking', async () => {
    await expect(prefs()).resolves.toEqual({ order: {}, last: {} })
    expect(fetcher).not.toHaveBeenCalled()
  })
})

describe('writes', () => {
  const stored = { id: 7, omschrijving: 'opbouw Gent', status: 'optie', productie_id: 1, plandag: '2026-10-12', custom: {}, lookups: { productie_id: null } }
  /** A dagplanning row whose id is not its activiteit's: routing must read the key. */
  const planned: Row = { id: 40, title: 'opbouw Gent', status: '', fields: { activiteit_id: 7, status: 'optie' }, lookups: {} }
  const sent = () => fetcher.mock.calls.slice(1).map(([input, init]) => [decodeURIComponent(String(input)), init?.method ?? 'GET', init?.body])

  it('send JSON to the row paths under /api, the title as the title column, and map the reply', async () => {
    fetcher.mockImplementation(async (input, init) => (String(input) === '/api/schema' ? json(engine) : init?.method === 'DELETE' ? json({ id: 7 }) : json(stored)))

    const made = await create('activiteit', { title: 'opbouw Gent' })
    const changed = await update('activiteit', 7, { status: 'optie' })
    await remove('activiteit', 7)
    await savePrefs({ order: {}, last: {} })

    expect(made).toMatchObject({ id: 7, title: 'opbouw Gent', fields: { status: 'optie' } })
    expect(changed.title).toBe('opbouw Gent')
    expect(sent()).toEqual([
      ['/api/rows/activiteit', 'POST', JSON.stringify({ omschrijving: 'opbouw Gent' })],
      ['/api/rows/activiteit/7', 'PATCH', JSON.stringify({ status: 'optie' })],
      ['/api/rows/activiteit/7', 'DELETE', undefined],
      ['/api/views/prefs', 'PUT', JSON.stringify({ order: {}, last: {} })],
    ])
  })

  it('update on dagplanning status sends PATCH /rows/activiteit/<row.activiteit_id> and re-reads the query row', async () => {
    const reread = { id: 40, activiteit_id: 7, omschrijving: 'opbouw Gent', status: 'bevestigd', custom: {}, lookups: {} }
    fetcher.mockImplementation(async (input, init) => {
      if (String(input) === '/api/schema') return json(engine)
      return init?.method === 'PATCH' ? json({ ...stored, status: 'bevestigd' }) : json({ rows: [reread], total: 1 })
    })

    const row = await update('dagplanning', 40, { status: 'bevestigd' }, planned)

    expect(sent()).toEqual([
      ['/api/rows/activiteit/7', 'PATCH', JSON.stringify({ status: 'bevestigd' })],
      ['/api/rows/dagplanning?filter={"id":40}', 'GET', undefined],
    ])
    expect(row).toMatchObject({ id: 40, title: 'opbouw Gent', fields: { activiteit_id: 7, status: 'bevestigd' } })
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

    expect(gone).toEqual({ ...planned, fields: { activiteit_id: 7, status: 'geannuleerd' } })
    expect(failed).toEqual({ ...planned, fields: { activiteit_id: 7, status: 'bevestigd' } })
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

    it("clearing a datetime, an integer and a date sends null; a cleared text stays ''", async () => {
      await update('activiteit', 7, { eind_at: '', personen: '', plandag: '', title: '' })

      expect(sent()[0][2]).toBe(JSON.stringify({ eind_at: null, personen: null, plandag: null, omschrijving: '' }))
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

  it('reject with the not-found the engine answers', async () => {
    fetcher.mockImplementation(async () => new Response('404 Not Found', { status: 404, statusText: 'Not Found' }))

    await expect(savePrefs({ order: {}, last: {} })).rejects.toEqual({ code: 'unknown', message: '404 Not Found' })
  })
})
