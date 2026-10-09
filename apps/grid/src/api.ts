import { type EngineRow, type EngineSchema, type EngineSource, type EngineView, rowsQuery, titleColumn, toEngineData, withScope, toRow, toSavedViews, toSchema, toStoredView } from './engine'
import type { Layout } from './grid/layout'
import type { Account, ActView, ApiError, DateWindow, HistoryEntry, MatrixAway, NewView, OwnerRows, OwnerView, Prefs, Referrer, Row, RowsResponse, Saved, SavedView, Schema, Scope, StoredArrangement, View } from './types'

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
    const named = 'label' in error && typeof error.label === 'string' ? { label: error.label } : {}
    const column = 'column' in error && typeof error.column === 'string' ? { column: error.column } : {}
    const key = 'key' in error && typeof error.key === 'string' ? { key: error.key } : {}
    return { code: String(error.code), message: String(error.message), ...by, ...named, ...column, ...key }
  }
  return { code: 'unknown', message: error instanceof Error ? error.message : String(error) }
}

/** The engine answers a refusal as `{code, message}`; anything else is unknown, with the status as its message. */
async function refusal(response: Response): Promise<ApiError> {
  const body: unknown = await response.json().catch(() => null)
  return toApiError(body ?? `${response.status} ${response.statusText}`.trim())
}

let unauthenticated = () => {}

/** Called on every 401: the session is gone. Answers a function that stops it. */
export function onUnauthenticated(callback: () => void): () => void {
  unauthenticated = callback
  return () => {
    if (unauthenticated === callback) unauthenticated = () => {}
  }
}

let noticed: (notices: string[]) => void = () => {}

/** Called with what a write's reply says beside the row, such as an invite that could not go out. */
export function onNotices(callback: (notices: string[]) => void): () => void {
  noticed = callback
  return () => {
    if (noticed === callback) noticed = () => {}
  }
}

function heard(reply: Record<string, unknown>): void {
  const notices = Array.isArray(reply.notices) ? reply.notices.filter((n): n is string => typeof n === 'string') : []
  if (notices.length > 0) noticed(notices)
}

/** `authorization` replaces the session cookie's say for this one request, such as a person's link. */
async function request<T>(method: Method, path: string, query?: Query, data?: Record<string, unknown>, authorization?: string): Promise<T> {
  try {
    const body = data === undefined ? undefined : JSON.stringify(data)
    const headers = { ...(body ? { 'Content-Type': 'application/json' } : {}), ...(authorization ? { Authorization: authorization } : {}) }
    const response = await fetch(endpoint(path, query), { method, body, headers: Object.keys(headers).length > 0 ? headers : undefined })
    if (response.status === 401) unauthenticated()
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

/** A source's rows with the layout's filters, sort and group applied by the engine; a matrix's rows with their cells. The scope is one more filter. */
export async function rows(view: ViewRead, window: Partial<DateWindow>, scope: Scope | null = null, layout: Layout | null = null): Promise<RowsResponse> {
  const query = await viewQuery(view, window, scope, layout)
  return rowsOf(view.model, view.type === 'matrix' ? { ...query, cells: '1' } : query)
}

type ViewRead = Pick<View, 'model' | 'table' | 'type' | 'date_field' | 'fixed'>

async function viewQuery(view: ViewRead, window: Partial<DateWindow>, scope: Scope | null, layout: Layout | null): Promise<Query> {
  const source = await sourceOf(view.model)
  const title = titleColumn(source)
  const scoped = { ...view, fixed: withScope(view.fixed ?? {}, scope) }
  return layout ? rowsQuery(scoped, layout, window, title, source) : { ...window, ...(scope ? { filter: JSON.stringify(scoped.fixed) } : {}) }
}

/** Makes a saved view public, or gives it a new link, the old one stopping: the token comes back once. */
export async function publishView(id: number): Promise<string> {
  return (await request<{ token: string }>('PUT', `/views/${id}/share-token`, {}, {})).token
}

/** Shows a saved view to the people its rows belong to, or stops showing it; an administrator's. */
export async function setForOwners(id: number, on: boolean): Promise<void> {
  await request(on ? 'PUT' : 'DELETE', `/views/${id}/for-owners`, {}, on ? {} : undefined)
}

/** A record's current link, as the administrator copies it for its person. */
export async function recordLink(dataset: string, id: number): Promise<string> {
  return (await request<{ link: string }>('GET', `/record-links/${encodeURIComponent(dataset)}/${id}`)).link
}

/** A new link for a record; the old one stops at once. */
export async function rotateRecordLink(dataset: string, id: number): Promise<string> {
  return (await request<{ link: string }>('POST', `/record-links/${encodeURIComponent(dataset)}/${id}/rotate`, {}, {})).link
}

const asLink = (token: string) => `RecordLink ${token}`

/** The views shown to the link's person. The token travels in the Authorization header only, never in an address. */
export async function ownerViews(token: string): Promise<OwnerView[]> {
  return (await request<{ views: OwnerView[] }>('GET', '/owner/views', {}, undefined, asLink(token))).views
}

export function ownerRows(token: string, id: number): Promise<OwnerRows> {
  return request<OwnerRows>('GET', `/owner/views/${id}/rows`, {}, undefined, asLink(token))
}

/** The recent changes to the rows the view shows: its filter, scope and window, as `rows` sends them. */
export async function history(view: ViewRead, window: Partial<DateWindow>, scope: Scope | null, layout: Layout | null): Promise<HistoryEntry[]> {
  const { filter, from, to } = await viewQuery(view, window, scope, layout)
  return (await request<{ entries: HistoryEntry[] }>('GET', `/history/${view.model}`, { filter, from, to })).entries
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

/** A write's row, and the batch an undo names it by: none when the write changed nothing. */
function writtenOf(reply: EngineRow): Saved {
  heard(reply)
  return { row: toRow(reply), batch: reply.revision?.batch_id ?? null }
}

export async function create(model: string, data: Record<string, unknown>): Promise<Saved> {
  const source = await sourceOf(model)
  const sent = toEngineData(data, source, (await engineSchema()).sources)
  return writtenOf(await request<EngineRow>('POST', `/rows/${model}`, {}, sent))
}

/** A lifecycle write expects the value the row showed; the engine answers 409 when it moved on meanwhile. */
function expectedOf(source: EngineSource, sent: Record<string, unknown>, row?: Row): Record<string, string> | undefined {
  const column = source.lifecycle?.column
  const shown = column && Object.hasOwn(sent, column) ? row?.fields[column] : undefined
  return column && typeof shown === 'string' && shown !== '' ? { [column]: shown } : undefined
}

/**
 * A query's row is written through its mapped column, so `row` is needed to find the target record.
 * `expect` goes beside the engine data, never through `toEngineData`; without it, it is read off `row`.
 */
export async function update(model: string, id: number, data: Record<string, unknown>, row?: Row, expect?: Record<string, string>): Promise<Saved> {
  const source = await sourceOf(model)
  const sent = toEngineData(data, source, (await engineSchema()).sources)
  if (source.kind === 'query') return updateThrough(model, source, id, sent, row)
  const expected = expect ?? expectedOf(source, sent, row)
  return writtenOf(await request<EngineRow>('PATCH', `/rows/${model}/${id}`, {}, expected ? { ...sent, expect: expected } : sent))
}

/** One row as its source computes it now; null once it left the source. */
export async function rowOf(model: string, id: number): Promise<Row | null> {
  const found = await request<{ rows: EngineRow[] }>('GET', `/rows/${model}`, { filter: JSON.stringify({ id }) })
  return found.rows[0] ? toRow(found.rows[0]) : null
}

/** The write lands on the target record; the row is then read again as the query now computes it. */
async function updateThrough(model: string, source: EngineSource, id: number, sent: Record<string, unknown>, row?: Row): Promise<Saved> {
  const [[column, value] = ['', undefined]] = Object.entries(sent)
  const writes = source.columns[column]?.writes
  if (!writes || !row) throw { code: 'read_only', message: `"${column}" of "${model}" is not written` } satisfies ApiError
  const target = writes.key === 'id' ? row.id : row.fields[writes.key]
  if (target === null || target === undefined) throw { code: 'read_only', message: `"${column}" of "${model}" has no ${writes.key}` } satisfies ApiError
  const reply = await request<EngineRow>('PATCH', `/rows/${writes.dataset}/${target}`, {}, { [writes.field]: value })
  heard(reply)
  const written = column === source.title ? { ...row, title: String(value ?? '') } : { ...row, fields: { ...row.fields, [column]: value } }
  // An edit can move the row out of the query; the write still landed.
  const found = await rowOf(model, id).catch(() => null)
  return { row: found ?? written, batch: reply.revision?.batch_id ?? null }
}

/** Undoes a batch on the server; answers the undo's own batch, which a redo undoes. An empty JSON body: the write guard refuses a POST that is not JSON. */
export async function undoBatch(batch: string): Promise<string> {
  return (await request<{ batch_id: string }>('POST', `/batches/${encodeURIComponent(batch)}/undo`, {}, {})).batch_id
}

/** Runs a dataset's declared action on one record, in one batch. */
export async function runAction(name: string, id: number, input: Record<string, unknown>): Promise<{ batch: string; created: { dataset: string; id: number }[] }> {
  const reply = await request<{ batch_id: string; created: { dataset: string; id: number }[]; notices?: string[] }>('POST', `/actions/${encodeURIComponent(name)}`, {}, { id, input })
  heard(reply)
  return { batch: reply.batch_id, created: reply.created }
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

/** An administrator's display name and icon for a source; null gives back the declared one. Answers what is shown now. */
export async function setDisplay(source: string, data: { label?: string | null; icon?: string | null }): Promise<{ label: string; icon: string | null }> {
  const shown = await request<{ label: string; icon: string | null }>('PUT', `/sources/${encodeURIComponent(source)}/display`, {}, data)
  forgetSchema()
  return shown
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

/** The engine answers the same for any address, so the caller can say nothing more than "look in your mail". */
export function requestLink(email: string): Promise<unknown> {
  return request('POST', '/auth/request', {}, { email })
}

export async function consumeLink(token: string): Promise<Account> {
  return (await request<{ account: Account }>('POST', '/auth/consume', {}, { token })).account
}

/** What an action token shows its holder, and the answers it allows. The token travels in POST bodies only. */
export function actView(token: string): Promise<ActView> {
  return request<ActView>('POST', '/act/view', {}, { token })
}

export function actOn(token: string, to: string): Promise<unknown> {
  return request('POST', '/act', {}, { token, to })
}

export function me(): Promise<Account> {
  return request<Account>('GET', '/auth/me')
}

export function signOut(): Promise<unknown> {
  forgetSchema()
  return request('POST', '/auth/signout', {}, {})
}
