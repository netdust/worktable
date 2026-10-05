import { type EngineRow, type EngineSchema, type EngineSource, type EngineView, rowsQuery, titleColumn, toEngineData, toRow, toSavedViews, toSchema, toStoredView } from './engine'
import type { Layout } from './grid/layout'
import type { ApiError, DateWindow, MatrixAway, NewView, Prefs, Referrer, Row, RowsResponse, SavedView, Schema, Scope, StoredArrangement, View } from './types'

type Query = Record<string, string | undefined>
type Method = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'

/** Same origin: Vite proxies `/api` to the engine. */
function endpoint(path: string, query: Query = {}): string {
  const params = new URLSearchParams(Object.entries(query).filter((entry): entry is [string, string] => entry[1] !== undefined))
  const search = params.toString()
  return `/api${path}${search === '' ? '' : `?${search}`}`
}

function isReferrer(entry: unknown): entry is Referrer {
  const { label, count } = (entry ?? {}) as Partial<Record<keyof Referrer, unknown>>
  return typeof label === 'string' && Number.isSafeInteger(count)
}

function toApiError(error: unknown): ApiError {
  if (typeof error === 'object' && error !== null && 'code' in error && 'message' in error) {
    const by = 'by' in error && Array.isArray(error.by) ? { by: error.by.filter(isReferrer) } : {}
    return { code: String(error.code), message: String(error.message), ...by }
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

/** One `/schema` read for the schema and every saved-view mapping; a failed one is asked again. */
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

async function rowsOf(source: string, query: Query): Promise<RowsResponse> {
  const found = await request<{ rows: EngineRow[]; total: number }>('GET', `/rows/${source}`, query)
  return { rows: found.rows.map(toRow), total: found.total }
}

export function schema(): Promise<Schema> {
  return engineSchema().then(toSchema)
}

/** A source's rows with the layout's filters, sort and group applied by the engine; a matrix's rows with their cells. The scope has no route yet: no space is served. */
export async function rows(view: Pick<View, 'model' | 'table' | 'type' | 'date_field' | 'fixed'>, window: Partial<DateWindow>, _scope: Scope | null = null, layout: Layout | null = null): Promise<RowsResponse> {
  const title = titleColumn(await sourceOf(view.model))
  const query: Query = layout ? rowsQuery(view, layout, window, title) : { ...window }
  return rowsOf(view.model, view.type === 'matrix' ? { ...query, cells: '1' } : query)
}

/** The away rows overlapping the window: begun before its end, ended after its start. Not the dated window, which would miss a period begun before it. */
export async function awayRows(away: MatrixAway, window: Partial<DateWindow>): Promise<Row[]> {
  if (!window.from || !window.to) return []
  const filter = { [away.date_field]: { $lte: `${window.to}T23:59:59` }, [away.end_field]: { $gte: window.from } }
  return (await rowsOf(away.model, { filter: JSON.stringify(filter) })).rows
}

/** The rows a relation's options are read in; the engine's own cap, unless a deployment asks for smaller pages. */
const pageSize = () => Math.min(5000, Math.max(1, Math.trunc(Number(import.meta.env.VITE_RECORDS_PAGE_SIZE)) || 5000))

/** Every live row of a model, a page at a time until the engine's `total` is reached. */
async function everyRow(model: string): Promise<Row[]> {
  const all: Row[] = []
  for (;;) {
    const page = await rowsOf(model, { limit: String(pageSize()), offset: String(all.length) })
    all.push(...page.rows)
    if (page.rows.length === 0 || all.length >= page.total) return all
  }
}

/** A model's records for a picker: titles holding `search`, every record without one. The engine has no search: the titles are narrowed here. */
export async function records(model: string, search: string): Promise<RowsResponse> {
  const all = await everyRow(model)
  const wanted = search.toLocaleLowerCase()
  const found = wanted === '' ? all : all.filter((row) => row.title.toLocaleLowerCase().includes(wanted))
  return { rows: found, total: found.length }
}

export async function create(model: string, data: Record<string, unknown>): Promise<Row> {
  const source = await sourceOf(model)
  const sent = toEngineData(data, source, (await engineSchema()).sources)
  return toRow(await request<EngineRow>('POST', `/rows/${model}`, {}, sent))
}

/** A query's row is written through its mapped column, so `row` is needed to find the target record. */
export async function update(model: string, id: number, data: Record<string, unknown>, row?: Row): Promise<Row> {
  const source = await sourceOf(model)
  const sent = toEngineData(data, source, (await engineSchema()).sources)
  if (source.kind === 'query') return updateThrough(model, source, id, sent, row)
  return toRow(await request<EngineRow>('PATCH', `/rows/${model}/${id}`, {}, sent))
}

/** The write lands on the target record; the row is then read again as the query now computes it. */
async function updateThrough(model: string, source: EngineSource, id: number, sent: Record<string, unknown>, row?: Row): Promise<Row> {
  const [[column, value] = ['', undefined]] = Object.entries(sent)
  const writes = source.columns[column]?.writes
  if (!writes || !row) throw { code: 'read_only', message: `"${column}" of "${model}" is not written` } satisfies ApiError
  const target = writes.key === 'id' ? row.id : row.fields[writes.key]
  if (target === null || target === undefined) throw { code: 'read_only', message: `"${column}" of "${model}" has no ${writes.key}` } satisfies ApiError
  await request('PATCH', `/rows/${writes.dataset}/${target}`, {}, { [writes.field]: value })
  const written = column === source.title ? { ...row, title: String(value ?? '') } : { ...row, fields: { ...row.fields, [column]: value } }
  // An edit can move the row out of the query; the write still landed.
  const found = await request<{ rows: EngineRow[] }>('GET', `/rows/${model}`, { filter: JSON.stringify({ id }) }).catch(() => null)
  return found?.rows[0] ? toRow(found.rows[0]) : written
}

export function remove(model: string, id: number): Promise<unknown> {
  return request('DELETE', `/rows/${model}/${id}`)
}

/** One saved view as the grid holds it; a view on a source the schema does not serve is refused. */
async function savedOf(found: EngineView): Promise<SavedView> {
  const [view] = toSavedViews([found], (await engineSchema()).sources)
  if (!view) throw { code: 'unknown_source', message: `unknown source "${found.source}"` } satisfies ApiError
  return view
}

/** This user's saved views and the shared ones, merged over their sources' tables. */
export async function savedViews(): Promise<SavedView[]> {
  const [served, { views }] = await Promise.all([engineSchema(), request<{ views: EngineView[] }>('GET', '/views')])
  return toSavedViews(views, served.sources)
}

export async function createView(view: NewView): Promise<SavedView> {
  const stored = toStoredView(view.arrangement, view.fixed ?? {}, await sourceOf(view.table))
  const skin = view.type === 'matrix' ? 'matrix' : 'table'
  return savedOf(await request<EngineView>('POST', '/views', {}, { name: view.name, source: view.table, skin, shared: view.shared, ...stored }))
}

/** A rename, a share, or a Save of the arrangement, which keeps the view's fixed filters. */
export async function updateView(view: SavedView, data: { name?: string; arrangement?: StoredArrangement; shared?: boolean }): Promise<SavedView> {
  const { arrangement, ...rest } = data
  const stored = arrangement ? toStoredView(arrangement, view.fixed ?? {}, await sourceOf(view.table)) : {}
  return savedOf(await request<EngineView>('PATCH', `/views/${view.id}`, {}, { ...rest, ...stored }))
}

export function deleteView(id: number): Promise<unknown> {
  return request('DELETE', `/views/${id}`)
}

/** An empty JSON body: the engine's write guard refuses a POST that is not JSON. */
export async function restoreView(id: number): Promise<SavedView> {
  return savedOf(await request<EngineView>('POST', `/views/${id}/restore`, {}, {}))
}

/** No prefs are stored yet: every table opens on its first view. */
export function prefs(): Promise<Prefs> {
  return Promise.resolve({ order: {}, last: {} })
}

/** Prefs are not stored yet: the change holds for this visit. */
export function savePrefs(data: Prefs): Promise<Prefs> {
  return Promise.resolve(data)
}
