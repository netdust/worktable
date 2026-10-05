import type { ApiError, ApiFetch, ApiFetchOptions, Boot, DateWindow, NewView, Prefs, Row, RowsResponse, SavedView, Schema, Scope, StoredArrangement, View } from './types'

declare global {
  interface Window {
    wp?: { apiFetch: ApiFetch }
    ntdstViews?: Boot
  }
}

type Query = Record<string, string | undefined>

/** The root may be pretty (`/wp-json/ns`) or plain (`?rest_route=/ns`); both take the path. */
function endpoint(path: string, query: Query = {}): string {
  const root = window.ntdstViews?.root
  if (!root) throw { code: 'unknown', message: 'window.ntdstViews.root is missing.' } satisfies ApiError
  const url = new URL(root, window.location.href)
  const route = url.searchParams.get('rest_route')
  if (route === null) {
    url.pathname = url.pathname.replace(/\/$/, '') + path
  } else {
    url.searchParams.set('rest_route', route.replace(/\/$/, '') + path)
  }
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined) url.searchParams.set(key, value)
  }
  if (route === null) return url.toString()
  // Plain permalinks: only the route reads better with its slashes; every other value stays encoded.
  const encoded = encodeURIComponent(url.searchParams.get('rest_route') ?? '')
  return url.toString().replace(`rest_route=${encoded}`, `rest_route=${encoded.replace(/%2F/g, '/')}`)
}

function toApiError(error: unknown): ApiError {
  if (typeof error === 'object' && error !== null && 'code' in error && 'message' in error) {
    return { code: String(error.code), message: String(error.message) }
  }
  return { code: 'unknown', message: error instanceof Error ? error.message : String(error) }
}

type Method = ApiFetchOptions['method']

/** Async from the first line: a bad root or a missing apiFetch rejects, never throws into a render. */
async function request<T>(method: Method, path: string, query?: Query, data?: Record<string, unknown>): Promise<T> {
  try {
    const apiFetch = window.wp?.apiFetch
    if (!apiFetch) throw { code: 'unknown', message: 'wp.apiFetch is not loaded.' } satisfies ApiError
    const options: ApiFetchOptions = { url: endpoint(path, query), method }
    return (await apiFetch(data === undefined ? options : { ...options, data })) as T
  } catch (error) {
    throw toApiError(error)
  }
}

export function schema(): Promise<Schema> {
  return request('GET', '/schema')
}

/** A table's rows, the same for every view of it; a matrix asks for its cells too. With a scope, only the rows related to that space record. */
export function rows(view: Pick<View, 'model' | 'table' | 'type'>, window: Partial<DateWindow>, scope: Scope | null = null): Promise<RowsResponse> {
  const filter = scope ? { [`filter[${scope.field}]`]: String(scope.id) } : {}
  const cells = view.type === 'matrix' ? { cells: '1' } : {}
  return request('GET', `/rows/${view.model}`, { table: view.table, ...cells, ...window, ...filter })
}

/** A model's records for a picker: titles holding `search`, at most 50 of `total`; every record without one. */
export function records(model: string, search: string): Promise<RowsResponse> {
  return request('GET', `/rows/${model}`, { search: search === '' ? undefined : search })
}

/** With `table`, the row comes back with that table's lookups and rollups. */
export function create(model: string, data: Record<string, unknown>, table?: string): Promise<Row> {
  return request('POST', `/rows/${model}`, { table }, data)
}

export function update(model: string, id: number, data: Record<string, unknown>, table?: string): Promise<Row> {
  return request('PATCH', `/rows/${model}/${id}`, { table }, data)
}

export function remove(model: string, id: number): Promise<unknown> {
  return request('DELETE', `/rows/${model}/${id}`)
}

/** The saved views this user may see — their own and the shared — of one table, or of all. */
export function savedViews(table?: string): Promise<SavedView[]> {
  return request('GET', '/views', { table })
}

export function createView(view: NewView): Promise<SavedView> {
  return request('POST', '/views', {}, { ...view })
}

export function updateView(id: number, data: { name?: string; arrangement?: StoredArrangement; shared?: boolean }): Promise<SavedView> {
  return request('PATCH', `/views/${id}`, {}, data)
}

export function deleteView(id: number): Promise<unknown> {
  return request('DELETE', `/views/${id}`)
}

export function restoreView(id: number): Promise<SavedView> {
  return request('POST', `/views/${id}/restore`)
}

/** This user's prefs; the route names no user. */
export function prefs(): Promise<Prefs> {
  return request('GET', '/views/prefs')
}

/** Replaces this user's prefs; the answer is what the server kept. */
export function savePrefs(data: Prefs): Promise<Prefs> {
  return request('PUT', '/views/prefs', {}, { ...data })
}
