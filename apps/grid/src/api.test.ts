import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { create, prefs, records, remove, rows, savePrefs, schema, update } from './api'
import type { ApiFetch, View } from './types'

const apiFetch = vi.fn<ApiFetch>()
const planning: View = { key: 'planning', label: 'Tabel', table: 'planning', type: 'grid', model: 'activity', date_field: 'date' }
const bezetting: View = { ...planning, key: 'bezetting', label: 'Matrix', type: 'matrix' }

function boot(root: string) {
  window.ntdstViews = { root, tables: [], views: [], writable: {}, capability: 'edit_others_posts' }
}

beforeEach(() => {
  window.wp = { apiFetch }
  boot('https://example.test/wp-json/ntdst-views/v1')
})
afterEach(() => apiFetch.mockReset())

describe('rows()', () => {
  it('asks a scoped view for its space record\'s rows only', async () => {
    apiFetch.mockResolvedValueOnce({ rows: [], total: 0 })

    await rows(planning, {}, { field: 'production', id: 9 })

    const url = new URL(apiFetch.mock.calls[0][0].url)
    expect(url.searchParams.get('filter[production]')).toBe('9')
  })

  it('searches a model\'s titles for a picker, and lists them all without a query', async () => {
    apiFetch.mockResolvedValue({ rows: [], total: 0 })

    await records('person', 'ann')
    await records('person', '')

    expect(apiFetch.mock.calls[0][0].url).toBe('https://example.test/wp-json/ntdst-views/v1/rows/person?search=ann')
    expect(apiFetch.mock.calls[1][0].url).toBe('https://example.test/wp-json/ntdst-views/v1/rows/person')
  })

  it("builds the rows path from the root, the view's table and the window, never the view", async () => {
    apiFetch.mockResolvedValueOnce({ rows: [], total: 0 })

    await rows(planning, { from: '2026-05-18', to: '2026-05-24' })

    expect(apiFetch).toHaveBeenCalledWith({
      url: 'https://example.test/wp-json/ntdst-views/v1/rows/activity?table=planning&from=2026-05-18&to=2026-05-24',
      method: 'GET',
    })
  })

  it('asks for the cells when the view is a matrix: the same table, the same rows', async () => {
    apiFetch.mockResolvedValueOnce({ rows: [], total: 0 })

    await rows(bezetting, { from: '2026-05-18', to: '2026-05-24' })

    const url = new URL(apiFetch.mock.calls[0][0].url)
    expect(url.searchParams.get('table')).toBe('planning')
    expect(url.searchParams.get('cells')).toBe('1')
    expect(url.searchParams.has('view')).toBe(false)
  })

  it('asks a grid for no cells', async () => {
    apiFetch.mockResolvedValueOnce({ rows: [], total: 0 })

    await rows(planning, {})

    expect(new URL(apiFetch.mock.calls[0][0].url).searchParams.has('cells')).toBe(false)
  })

  it('leaves the window out for a view without one', async () => {
    apiFetch.mockResolvedValueOnce({ rows: [], total: 0 })

    const people: View = { key: 'people', label: 'People', table: 'people', model: 'person' }
    await rows(people, {})

    expect(apiFetch.mock.calls[0][0].url).toBe('https://example.test/wp-json/ntdst-views/v1/rows/person?table=people')
  })

  it('appends to rest_route on a plain-permalink root', async () => {
    boot('https://example.test/?rest_route=/ntdst-views/v1')
    apiFetch.mockResolvedValueOnce({ rows: [], total: 0 })

    await rows(planning, { from: '2026-05-18', to: '2026-05-24' })

    const url = new URL(apiFetch.mock.calls[0][0].url)
    expect(url.searchParams.get('rest_route')).toBe('/ntdst-views/v1/rows/activity')
    expect(url.searchParams.get('table')).toBe('planning')
    expect(url.searchParams.get('from')).toBe('2026-05-18')
  })

  it('keeps the slashes of the route readable and every other value encoded', async () => {
    boot('https://example.test/?rest_route=/ntdst-views/v1')
    apiFetch.mockResolvedValueOnce({ rows: [], total: 0 })

    await rows({ ...planning, table: 'a/b' }, {})

    expect(apiFetch.mock.calls[0][0].url).toBe('https://example.test/?rest_route=/ntdst-views/v1/rows/activity&table=a%2Fb')
  })

  it("rejects with the server's code and message", async () => {
    apiFetch.mockRejectedValueOnce({ code: 'views_unknown_field', message: 'Unknown field: colour.', data: { status: 400 } })

    await expect(rows(planning, {})).rejects.toEqual({ code: 'views_unknown_field', message: 'Unknown field: colour.' })
  })

  it('rejects a failure that carries no WordPress error as unknown', async () => {
    apiFetch.mockRejectedValueOnce(new TypeError('Failed to fetch'))

    await expect(rows(planning, {})).rejects.toEqual({ code: 'unknown', message: 'Failed to fetch' })
  })
})

describe('schema()', () => {
  it('rejects, never throws, when the boot config is missing', async () => {
    window.ntdstViews = undefined
    let thrown: unknown = null
    let result: Promise<unknown> | null = null
    try {
      result = schema()
    } catch (error) {
      thrown = error
    }

    expect(thrown).toBeNull()
    await expect(result).rejects.toMatchObject({ code: 'unknown' })
    expect(apiFetch).not.toHaveBeenCalled()
  })


  it('reads the schema route', async () => {
    apiFetch.mockResolvedValueOnce({ models: {}, tables: [], views: [], writable: {}, capability: 'x' })

    await schema()

    expect(apiFetch).toHaveBeenCalledWith({ url: 'https://example.test/wp-json/ntdst-views/v1/schema', method: 'GET' })
  })
})

describe('writes', () => {
  it('create posts to the model', async () => {
    apiFetch.mockResolvedValueOnce({})
    await create('activity', { title: 'Montage' })
    expect(apiFetch).toHaveBeenCalledWith({
      url: 'https://example.test/wp-json/ntdst-views/v1/rows/activity',
      method: 'POST',
      data: { title: 'Montage' },
    })
  })

  it('update patches the one row', async () => {
    apiFetch.mockResolvedValueOnce({})
    await update('activity', 7, { kind: 'meal' })
    expect(apiFetch).toHaveBeenCalledWith({
      url: 'https://example.test/wp-json/ntdst-views/v1/rows/activity/7',
      method: 'PATCH',
      data: { kind: 'meal' },
    })
  })

  it("asks for the table's lookups and rollups back when a write names it", async () => {
    apiFetch.mockResolvedValue({})
    await update('activity', 7, { kind: 'meal' }, 'planning')
    await create('activity', { title: 'Montage' }, 'planning')
    expect(apiFetch.mock.calls.map((call) => call[0].url)).toEqual([
      'https://example.test/wp-json/ntdst-views/v1/rows/activity/7?table=planning',
      'https://example.test/wp-json/ntdst-views/v1/rows/activity?table=planning',
    ])
  })

  it('remove deletes the one row', async () => {
    apiFetch.mockResolvedValueOnce({})
    await remove('activity', 7)
    expect(apiFetch).toHaveBeenCalledWith({ url: 'https://example.test/wp-json/ntdst-views/v1/rows/activity/7', method: 'DELETE' })
  })
})

describe('prefs', () => {
  it('reads and replaces the user\'s own prefs, naming no user', async () => {
    apiFetch.mockResolvedValue({ order: {}, last: {} })
    await prefs()
    await savePrefs({ order: { planning: ['bezetting', 'planning'] }, last: { planning: 'bezetting' } })
    expect(apiFetch.mock.calls.map((call) => call[0])).toEqual([
      { url: 'https://example.test/wp-json/ntdst-views/v1/views/prefs', method: 'GET' },
      { url: 'https://example.test/wp-json/ntdst-views/v1/views/prefs', method: 'PUT', data: { order: { planning: ['bezetting', 'planning'] }, last: { planning: 'bezetting' } } },
    ])
  })
})
