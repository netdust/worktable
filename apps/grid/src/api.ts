import { type EngineRow, type EngineSchema, type EngineSource, rowsQuery, toEngineData, toRow, toSavedViews, toSchema } from './engine'
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

async function sourceOf(name: string): Promise<EngineSource> {
  const source = (await engineSchema()).sources[name]
  if (!source) throw { code: 'unknown_source', message: `unknown source "${name}"` } satisfies ApiError
  return source
}

async function titleOf(source: string): Promise<string> {
  return (await sourceOf(source)).title
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

export async function create(model: string, data: Record<string, unknown>): Promise<Row> {
  const title = await titleOf(model)
  return toRow(await request<EngineRow>('POST', `/rows/${model}`, {}, toEngineData(data, title)), title)
}

/** A query's row is written through its mapped column, so `row` is needed to find the target record. */
export async function update(model: string, id: number, data: Record<string, unknown>, row?: Row): Promise<Row> {
  const source = await sourceOf(model)
  const sent = toEngineData(data, source.title)
  if (source.kind === 'query') return updateThrough(model, source, id, sent, row)
  return toRow(await request<EngineRow>('PATCH', `/rows/${model}/${id}`, {}, sent), source.title)
}

/** The write lands on the target record; the row is then read again as the query now computes it. */
async function updateThrough(model: string, source: EngineSource, id: number, sent: Record<string, unknown>, row?: Row): Promise<Row> {
  const [[column, value] = ['', undefined]] = Object.entries(sent)
  const writes = source.columns[column]?.writes
  if (!writes || !row) throw { code: 'read_only', message: `"${column}" of "${model}" is not written` } satisfies ApiError
  const target = writes.key === 'id' ? row.id : row.fields[writes.key]
  await request('PATCH', `/rows/${writes.dataset}/${target}`, {}, { [writes.field]: value })
  const written = column === source.title ? { ...row, title: String(value ?? '') } : { ...row, fields: { ...row.fields, [column]: value } }
  // An edit can move the row out of the query; the write still landed.
  const found = await request<{ rows: EngineRow[] }>('GET', `/rows/${model}`, { filter: JSON.stringify({ id }) }).catch(() => null)
  return found?.rows[0] ? toRow(found.rows[0], source.title) : written
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
