import { type EngineRow, type EngineSchema, rowsQuery, toRow, toSavedViews, toSchema } from './engine'
import type { Layout } from './grid/layout'
import type { ApiError, DateWindow, NewView, Prefs, Row, RowsResponse, SavedView, Schema, Scope, StoredArrangement, View } from './types'

type Query = Record<string, string | undefined>
type Method = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'

/** Same origin: Vite proxies `/api` to the engine. */
function endpoint(path: string, query: Query = {}): string {
  const params = new URLSearchParams(Object.entries(query).filter((entry): entry is [string, string] => entry[1] !== undefined))
  const search = params.toString()
  return `/api${path}${search === '' ? '' : `?${search}`}`
}

function toApiError(error: unknown): ApiError {
  if (typeof error === 'object' && error !== null && 'code' in error && 'message' in error) {
    return { code: String(error.code), message: String(error.message) }
  }
  return { code: 'unknown', message: error instanceof Error ? error.message : String(error) }
}

/** The engine answers a refusal as `{code, message}`; anything else is unknown, with the status as its message. */
async function refusal(response: Response): Promise<ApiError> {
  const body: unknown = await response.json().catch(() => null)
  return toApiError(body ?? `${response.status} ${response.statusText}`.trim())
}

async function request<T>(method: Method, path: string, query?: Query, data?: Record<string, unknown>): Promise<T> {
  try {
    const body = data === undefined ? undefined : JSON.stringify(data)
    const response = await fetch(endpoint(path, query), { method, body, headers: body ? { 'Content-Type': 'application/json' } : undefined })
    if (!response.ok) throw await refusal(response)
    return (await response.json()) as T
  } catch (error) {
    throw toApiError(error)
  }
}

let served: Promise<EngineSchema> | null = null

/** One `/schema` read for the schema and the saved views both; a failed one is asked again. */
function engineSchema(): Promise<EngineSchema> {
  served ??= request<EngineSchema>('GET', '/schema').catch((error: unknown) => {
    served = null
    throw error
  })
  return served
}

export function forgetSchema(): void {
  served = null
}

async function titleOf(source: string): Promise<string> {
  const title = (await engineSchema()).sources[source]?.title
  if (!title) throw { code: 'unknown_source', message: `unknown source "${source}"` } satisfies ApiError
  return title
}

async function rowsOf(source: string, query: Query): Promise<RowsResponse> {
  const [title, found] = await Promise.all([titleOf(source), request<{ rows: EngineRow[]; total: number }>('GET', `/rows/${source}`, query)])
  return { rows: found.rows.map((row) => toRow(row, title)), total: found.total }
}

export function schema(): Promise<Schema> {
  return engineSchema().then(toSchema)
}

/** A source's rows with the layout's filters, sort and group applied by the engine. The scope has no route yet: no space is served. */
export async function rows(view: Pick<View, 'model' | 'table' | 'type' | 'date_field'>, window: Partial<DateWindow>, _scope: Scope | null = null, layout: Layout | null = null): Promise<RowsResponse> {
  const title = await titleOf(view.model)
  return rowsOf(view.model, layout ? rowsQuery(view, layout, window, title) : { ...window })
}

/** A model's records for a picker: titles holding `search`, every record without one. The engine has no search: the titles are narrowed here. */
export async function records(model: string, search: string): Promise<RowsResponse> {
  const all = await rowsOf(model, {})
  const wanted = search.toLocaleLowerCase()
  const found = wanted === '' ? all.rows : all.rows.filter((row) => row.title.toLocaleLowerCase().includes(wanted))
  return { rows: found, total: found.length }
}

export function create(model: string, data: Record<string, unknown>): Promise<Row> {
  return request('POST', `/rows/${model}`, {}, data)
}

export function update(model: string, id: number, data: Record<string, unknown>): Promise<Row> {
  return request('PATCH', `/rows/${model}/${id}`, {}, data)
}

export function remove(model: string, id: number): Promise<unknown> {
  return request('DELETE', `/rows/${model}/${id}`)
}

/** The saved views the schema serves, merged over their sources' tables. */
export function savedViews(): Promise<SavedView[]> {
  return engineSchema().then(toSavedViews)
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

/** No prefs are stored yet: every table opens on its first view. */
export function prefs(): Promise<Prefs> {
  return Promise.resolve({ order: {}, last: {} })
}

/** Replaces this user's prefs; the answer is what the server kept. */
export function savePrefs(data: Prefs): Promise<Prefs> {
  return request('PUT', '/views/prefs', {}, { ...data })
}
