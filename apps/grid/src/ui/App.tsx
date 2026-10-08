import { EmptyState, Spinner } from '@sakaniui/react'
import { type ReactNode, useEffect, useMemo, useRef, useState } from 'react'
import { awayRows, create as createRow, history as readHistory, me, onUnauthenticated, prefs, records, remove as removeRow, rowOf, rows, runAction, savedViews, schema, setDisplay, signOut, undoBatch } from '../api'
import { filterFields } from '../grid/filter'
import { exportSheet } from '../export/download'
import { Grid, type OnScreen } from '../grid/Grid'
import type { LinkActions } from '../grid/cells/Links'
import { useGridStore, useLayout } from '../grid/hooks'
import { cutAt } from '../grid/group'
import { complete, isDate, joinOf, type Kind, put, readConditions, windowOf } from '../grid/conditions'
import { type Layout, withFilters } from '../grid/layout'
import { type NewRow, newRow } from '../grid/newRow'
import { useMatrixStore } from '../matrix/hooks'
import { Matrix } from '../matrix/Matrix'
import { errorText, setStrings, t, undoText } from '../i18n'
import { useSpace } from '../space'
import type { Account, ApiError, DateWindow, Model, ModelAction, Row, Schema, Scope, TableDef, View, ViewType } from '../types'
import { Confirm } from './Confirm'
import { Filters } from './Filters'
import { NewViewDialog } from './NewViewDialog'
import { type ModelActions, Rail } from './Rail'
import type { Signed } from './RailFoot'
import { dropHash, readHash, writeHash } from './hash'
import { createHistory } from './history'
import { HistoryPanel } from './HistoryPanel'
import { Search } from './Search'
import { SignIn } from './SignIn'
import { SpaceSelect } from './SpaceSelect'
import { Toast, useNotice } from './Toast'
import type { Table } from './tables'
import { type Shown, Toolbar } from './Toolbar'
import { useFilterNames } from './useFilterNames'
import { useSavedViews } from './useSavedViews'
import { changed, clearLocal, isSaved, keepLocal, localOf, lockOf, useStoredRevision } from './views'
import { useFillViewport } from './viewport'
import { days, formatWindow, MATRIX_DAYS, weekOf } from './Window'

type Rows = { status: 'loading' } | { status: 'ready'; rows: Row[]; total: number; away: Row[]; titles: Map<number, string> } | { status: 'error'; error: ApiError }

/** A matrix's column titles: the live records of the model its join points at. */
async function titlesOf(view: View, served: Schema | null): Promise<Map<number, string>> {
  const join = view.type === 'matrix' ? view.join : undefined
  const model = join ? served?.models[join.model]?.fields[join.column_field]?.relation?.model : undefined
  if (!model) return new Map()
  const found = await records(model, '')
  return new Map(found.rows.map((row) => [row.id, row.title]))
}

type Session = { status: 'checking' } | { status: 'out' } | { status: 'link'; token: string } | { status: 'in'; account: Account; lapsed: boolean }

const LINK = /^#\/auth\/([\w-]+)$/
const SIGN_IN = '#/signin'

function landing(): Session {
  const token = LINK.exec(window.location.hash)?.[1]
  if (token) return { status: 'link', token }
  return window.location.hash === SIGN_IN ? { status: 'out' } : { status: 'checking' }
}

/** Routes `#/auth/<token>` to the confirm screen and `#/signin`, or no session, to the form; else the grid. */
export function App() {
  const [session, setSession] = useState<Session>(landing)
  const signedIn = (account: Account) => setSession({ status: 'in', account, lapsed: false })

  // A lapsed session keeps the grid mounted under the form, so a new row's draft survives it.
  useEffect(() => onUnauthenticated(() => setSession((s) => {
    if (s.status === 'checking') return { status: 'out' }
    return s.status === 'in' && !s.lapsed ? { ...s, lapsed: true } : s
  })), [])

  useEffect(() => {
    if (session.status === 'checking') me().then(signedIn, () => setSession({ status: 'out' }))
  }, [session.status])

  // A link pasted into a tab where the app is already open changes only the hash, so nothing reloads.
  useEffect(() => {
    const follow = () => {
      const token = LINK.exec(window.location.hash)?.[1]
      if (token) setSession({ status: 'link', token })
    }
    window.addEventListener('hashchange', follow)
    return () => window.removeEventListener('hashchange', follow)
  }, [])

  // Signed in again in another tab: back here, the same account carries on and another one starts afresh.
  useEffect(() => {
    if (session.status !== 'in' || !session.lapsed) return
    const { id } = session.account
    const recheck = () => me().then((account) => (account.id === id ? signedIn(account) : window.location.reload()), () => undefined)
    window.addEventListener('focus', recheck)
    return () => window.removeEventListener('focus', recheck)
  }, [session])

  if (session.status === 'checking') return <div className="nv-app"><div className="nv-center"><Spinner /></div></div>
  if (session.status === 'out') return <div className="nv-auth-page"><SignIn /></div>
  if (session.status === 'link') return <div className="nv-auth-page"><Confirm token={session.token} onSignedIn={signedIn} /></div>

  const signOutNow = () => {
    signOut().catch(() => undefined).finally(() => {
      window.history.replaceState(null, '', SIGN_IN)
      setSession({ status: 'out' })
    })
  }
  return (
    <>
      <Workspace signed={{ email: session.account.email, onSignOut: signOutNow }} role={session.account.role} />
      {session.lapsed && (
        <div className="nv-auth-over" role="dialog" aria-modal="true" aria-label={t('signIn')}>
          <SignIn note={t('sessionLapsed')} />
        </div>
      )}
    </>
  )
}

type Display = { label: string; icon: string | null }

/** A table as an administrator renamed it or gave it an icon in this visit. */
function displayed(table: TableDef, display: Display | undefined): TableDef {
  if (!display) return table
  const { icon: _, ...rest } = table
  return { ...rest, label: display.label, ...(display.icon ? { icon: display.icon } : {}) }
}

/** The models as an administrator renamed their tables in this visit: a label over the served one. */
function renamed(models: Schema['models'], tables: TableDef[], displays: Record<string, Display>): Schema['models'] {
  const labels = new Map(tables.flatMap((table) => (displays[table.key] ? [[table.model, displays[table.key].label] as const] : [])))
  return Object.fromEntries(Object.entries(models).map(([key, model]) => {
    const label = labels.get(key)
    if (!label || label === model.label) return [key, model]
    const { new_label: _, ...rest } = model
    return [key, { ...rest, label }]
  }))
}

/** `+ Nieuw`'s words: the model's own while it keeps its name, else "Nieuw" and its name. */
const newLabel = (model: Model | undefined): string => model?.new_label ?? [t('new'), model?.label].filter(Boolean).join(' ')

/** The shell waits for the served schema: it declares the tables, the saved views come with it. */
function Workspace({ signed, role }: { signed: Signed; role: Account['role'] }) {
  const frame = useRef<HTMLDivElement>(null)
  const [served, setServed] = useState<Schema | null>(null)
  const [unserved, setUnserved] = useState<ApiError | null>(null)
  const [settled, setSettled] = useState(false)
  const [activeKey, setActive] = useState<string | undefined>(() => readHash('view') ?? undefined)
  const [adding, setAdding] = useState<{ table: Table; type: ViewType } | null>(null)
  const [viewNote, setViewNote] = useState<string | null>(null)
  const [shown, setShown] = useState<Shown | null>(null)
  const [notice, notify] = useNotice()
  // A revert remounts the matrix, whose picked columns are its own state.
  const [resets, setResets] = useState(0)
  const [historyOpen, setHistoryOpen] = useState(false)
  // Only a switch the user made is remembered as the table's last view; the landing is not one.
  const switched = useRef(false)
  const setActiveKey = (key: string) => {
    switched.current = true
    writeHash('view', key)
    setActive(key)
    setAdding(null)
    setViewNote(null)
  }
  const [result, setResult] = useState<Rows>({ status: 'loading' })
  const [query, setQuery] = useState('')
  const [exportFailed, setExportFailed] = useState(false)
  const snapshot = useRef<(() => OnScreen) | null>(null)
  // The tab's undo history: it outlives every view's store, so an undo reaches back across a reload or a switch.
  const [history] = useState(() => createHistory(undoBatch))
  const [reloads, setReloads] = useState(0)
  const [displays, setDisplays] = useState<Record<string, Display>>({})
  const reloadView = () => setReloads((n) => n + 1)
  useFillViewport(frame)

  useEffect(() => {
    let live = true
    const served = schema().then((s) => {
      if (!live) return
      setStrings(s.strings)
      setServed(s)
    }, (error: ApiError) => live && setUnserved(error))
    const mine = savedViews().then((list) => live && load(list), () => undefined)
    const order = prefs().then((stored) => live && loadPrefs(stored), () => undefined)
    Promise.all([served, mine, order]).finally(() => live && setSettled(true))
    return () => {
      live = false
    }
  }, [])

  const starting = served?.views ?? []
  const declared = useMemo(() => (served?.tables ?? []).map((table) => displayed(table, displays[table.key])), [served, displays])
  const current = useRef<string | undefined>(undefined)
  const { load, loadPrefs, tables, create, save, changedLayout, remember, openTable, actions } = useSavedViews({ declared, starting, active: current, open: setActiveKey, note: setViewNote, notify })
  const view = tables.flatMap((table) => table.views).find((v) => v.key === activeKey) ?? tables[0]?.views[0] ?? starting[0]
  current.current = view?.key

  useEffect(() => {
    if (switched.current && view) remember(view)
  }, [view?.key])
  // Once settled the open view is held by its key: a reorder must not move the page off a view it landed on.
  useEffect(() => {
    if (settled && view && view.key !== activeKey) setActive(view.key)
  }, [settled, view?.key, activeKey])
  // Named by the view's own source: a query's view sits under another model's node and keeps the query's name.
  const title = declared.find((table) => table.key === view?.table)?.label ?? t('viewsShown')
  const dated = Boolean(view?.date_field)
  const [space, select] = useSpace(served?.space)
  const scoped = space.status !== 'none' && view?.space === 'scoped'
  // undefined: the space is still loading; null: this view is not scoped, or every record is selected.
  const scope: Scope | null | undefined = !scoped ? null : space.status === 'ready' ? space.scope : undefined
  const scopeId = scope === undefined ? undefined : scope?.id ?? null
  const [stored, storeLayout] = useLayout(view)
  // A change the person makes: kept here, and one's own view saves itself. A landing or a link is not that.
  const setLayout = (next: Layout) => {
    storeLayout(next)
    if (view) changedLayout(view)
  }
  const spaceField = scope?.field
  // A chip saved before the view was scoped would filter on what the scope already decides.
  const layout = stored && spaceField ? { ...stored, filters: stored.filters.filter((f) => f.field !== spaceField) } : stored
  // A link's conditions land once, on the view it names, as a local change: only the person's own next change saves.
  const landing = useRef({ view: readHash('view'), f: readHash('f'), j: readHash('j') })
  useEffect(() => {
    const { view: linkedKey, f, j } = landing.current
    if (!settled || f === null || !view || !layout) return
    landing.current = { view: null, f: null, j: null }
    dropHash('f')
    dropHash('j')
    const linked = view.key === linkedKey ? readConditions(f) : null
    if (!linked?.length) return
    const type = (field: string) => served?.models[view.model]?.fields[field]?.type
    const kind = (field: string): Kind => (type(field) === 'date' || type(field) === 'datetime' ? 'date' : 'text')
    const filters = linked.reduce((all, condition) => put(all, condition, kind), layout.filters)
    storeLayout({ ...withFilters(layout, filters), join: j === 'or' ? 'or' : undefined })
  }, [settled, view?.key, layout === null])
  const asks = layout ? JSON.stringify([layout.filters, joinOf(layout.filters, layout.join), layout.sort, layout.group]) : ''
  // The period is the condition on the view's date column: its days, for a matrix, a new row and the export.
  const dateCondition = layout && view?.date_field ? layout.filters.find((f) => f.field === view.date_field && isDate(f.op) && complete(f)) : undefined
  const conditionDays = useMemo(() => windowOf(dateCondition, new Date()), [JSON.stringify(dateCondition)])
  // A matrix reads one bounded window: the condition's days, else the current week (none, or over the engine's cap).
  const conditioned = layout ? layout.filters.some((f) => f !== dateCondition && complete(f)) : false
  const matrixDays = conditionDays && days(conditionDays) <= MATRIX_DAYS ? conditionDays : weekOf(new Date())
  const window = view?.type === 'matrix' ? matrixDays : {}
  const windowKey = JSON.stringify(window)

  const shownKey = useRef<string | null>(null)
  useEffect(() => {
    if (!settled || !view || scope === undefined) return
    let live = true
    // The same view asked again (a condition, a sort) keeps its rows on screen, so an open filter builder stays open.
    if (shownKey.current !== view.key) setResult({ status: 'loading' })
    const asked = window
    const away = view.type === 'matrix' ? view.away : undefined
    Promise.all([rows(view, asked, scope, layout), away ? awayRows(away, asked) : [], titlesOf(view, served)]).then(
      ([r, away, titles]) => {
        if (!live) return
        shownKey.current = view.key
        setResult({ status: 'ready', rows: r.rows, total: r.total, away, titles })
      },
      (error: ApiError) => {
        if (!live) return
        shownKey.current = null
        setResult({ status: 'error', error })
      },
    )
    return () => {
      live = false
    }
    // By key, and by what the server applies (filters, sort, group): a width or a hidden column stays in the browser.
  }, [settled, view?.key, windowKey, scopeId, asks, reloads])

  const models = useMemo(() => renamed(served?.models ?? {}, served?.tables ?? [], displays), [served, displays])
  const model = view ? models[view.model] : undefined
  const writable = view ? served?.writable[view.model] === true : false
  const loaded = result.status === 'ready' && model ? result.rows : null
  const matrix = view?.type === 'matrix'
  // The stores hold the rows as edited and their undo: a view's new arrangement must not rebuild them.
  const stores = useMemo(() => view, [view?.key, served])
  const [store, state] = useGridStore(model && !matrix ? stores : undefined, loaded, history, reloadView)
  const live = useRef(store)
  live.current = store
  const reload = () => (view ? rows(view, window, scope ?? null, layout).then((r) => r.rows) : Promise.resolve([]))
  const [cells, cellsState] = useMatrixStore(matrix && model ? stores : undefined, matrix ? loaded : null, reload)
  const joinWritable = view?.join ? served?.writable[view.join.model] === true : false
  const saves = store ? { state, undo: store.undo, redo: store.redo } : cells ? { state: cellsState, undo: cells.undo, redo: cells.redo } : null
  const fields = useMemo(
    () => (model && loaded ? filterFields(model, loaded, view?.filters).filter((f) => f.field !== spaceField) : []),
    [model, loaded, view?.filters, spaceField],
  )
  const [named, waiting] = useFilterNames(model, fields, layout?.filters ?? [])

  const scopeChip = scope && model && space.status === 'ready' && space.selected
    ? t('scopeIs', { field: model.fields[scope.field]?.label ?? '', value: space.selected.title })
    : null

  const plan = model && view && !model.creates ? newRow(model, view, dated ? conditionDays : null, new Date(), scope ?? null) : null
  const target = model?.creates ? models[model.creates] : undefined
  const made = target ? madeFrom(target, served?.tables ?? [], dated ? conditionDays : null, space.status === 'ready' ? space.scope : null) : null
  const addBlocked = target ? createBlocked(target, made, served?.writable[target.key] === true)
    : !writable || model?.query || !store || !plan ? t('readOnly') : 'missing' in plan ? t('needsFields', { fields: plan.missing.join(', ') }) : null
  const add = () => {
    if (target && made && !('missing' in made)) return void createThrough(target.key, made.fields)
    if (!store || !model || !plan || 'missing' in plan) return
    if (plan.needs.length === 0) void store.create(plan.fields)
    else store.draft(plan.fields, plan.needs, plan.offers)
  }
  // A query's new row goes to the dataset it creates in; the query then reads again, and one undo takes the row back.
  const createThrough = (dataset: string, fields: Record<string, unknown>) =>
    createRow(dataset, fields).then(
      ({ batch }) => {
        history.push({ batch: Promise.resolve(batch), model: dataset, id: null })
        reloadView()
      },
      (error: ApiError) => notify({ message: errorText(error.code, error.message) }),
    )

  const grid = store && model && view && layout
  const filters = layout && fields.length > 0
    ? <Filters fields={named} filters={layout.filters} join={layout.join} waiting={waiting} onChange={(next) => setLayout(withFilters(layout, next))}
      onJoin={(join) => setLayout({ ...layout, join: join === 'or' ? 'or' : undefined })} />
    : null
  const exportView = () => {
    const shown = snapshot.current?.()
    if (!view || !shown) return
    setExportFailed(false)
    exportSheet(view, shown.columns, shown.groups, dated ? conditionDays : null, title).catch(() => setExportFailed(true))
  }
  // A link is a row of another dataset, created and deleted there through its writer; then the row it sits on is read again.
  const repaint = (row: Row) => {
    if (model) rowOf(model.key, row.id).then((found) => found && store?.replace(found), reloadView)
  }
  const refused = (row: Row) => (error: ApiError) => {
    notify({ message: errorText(error.code, error.message) })
    repaint(row)
  }
  const links: LinkActions = {
    add: async (field, row, target) => {
      const link = model?.fields[field]?.link
      if (!link) return
      await createRow(link.dataset, { [link.key]: row.id, [link.target]: target }).then(({ row: made, batch }) => {
        history.push({ batch: Promise.resolve(batch), model: link.dataset, id: made.id })
        repaint(row)
      }, refused(row))
    },
    // A delete is never undone: its earlier steps leave the history with it.
    remove: async (field, row, item) => {
      const link = model?.fields[field]?.link
      if (!link) return
      await removeRow(link.dataset, item.id).then(() => {
        history.forget(link.dataset, item.id)
        repaint(row)
      }, refused(row))
    },
  }
  const changeDisplay = (table: Table, data: { label?: string; icon?: string }) => {
    setDisplay(table.key, data).then(
      (shown) => setDisplays((was) => ({ ...was, [table.key]: shown })),
      (error: ApiError) => notify({ message: errorText(error.code, error.message) }),
    )
  }
  const modelActions: ModelActions = {
    displayBlocked: role === 'administrator' ? undefined : t('adminOnly'),
    rename: (table, label) => changeDisplay(table, { label }),
    icon: (table, icon) => changeDisplay(table, { icon }),
    exportOpen: { run: exportView, blocked: matrix ? t('matrixNotExported') : grid ? undefined : t('exportNotReady') },
  }
  const revision = useStoredRevision()
  const modified = useMemo(() => (view ? changed(view) : false), [view, revision])
  const revert = () => {
    if (!view) return
    const previous = localOf(view)
    clearLocal(view)
    setResets((n) => n + 1)
    if (!previous) return
    notify({ message: t('reverted'), action: { label: t('undo'), run: () => {
      keepLocal(view, previous)
      setResets((n) => n + 1)
    } } })
  }
  // One undo entry for everything the action made; the notice's Undo is the toolbar's while that entry is the last.
  const act = async (row: Row, action: ModelAction, input: Record<string, number>) => {
    if (!view) return
    const { batch } = await runAction(action.name, row.id, input)
    const entry = { batch: Promise.resolve(batch), model: view.model, id: null }
    history.push(entry)
    reloadView()
    const undo = () => {
      if (history.last() === entry) void (live.current?.undo() ?? history.undo().then(reloadView, () => undefined))
    }
    notify({ message: t('actionDone', { action: action.label }), action: { label: t('undo'), run: undo } })
  }

  if (!served) {
    return (
      <div className="nv-app" ref={frame}>
        <div className="nv-center">
          {unserved ? <EmptyState type="no-data" title={t('noViews')} description={errorText(unserved.code, unserved.message)} /> : <Spinner />}
        </div>
      </div>
    )
  }

  return (
    <div className="nv-app" ref={frame}>
      <Rail signed={signed} tables={tables} sections={served.sections} active={view?.key} onSelect={setActiveKey} onTable={openTable}
        onNewView={(table, type) => setAdding({ table, type })} actions={actions} modelActions={modelActions} space={space.status === 'ready' && served?.space && (
        <SpaceSelect label={models[served.space.model]?.label ?? ''} records={space.records} selected={space.selected} onSelect={select} />
      )} />
      <main className="nv-main">
        <Toolbar
          title={view?.label ?? title}
          matrix={matrix}
          locked={view ? lockOf(view) : null}
          shown={matrix ? null : shown}
          search={<Search query={query} onQuery={setQuery} tables={tables} onJump={setActiveKey} />}
          saving={saves?.state}
          addLabel={newLabel(target ?? model)}
          addBlocked={addBlocked}
          onAdd={matrix ? undefined : add}
          onExport={grid ? exportView : undefined}
          exportBlocked={matrix ? t('matrixNotExported') : undefined}
          exportNote={exportFailed ? t('exportFailed') : null}
          local={view && modified ? {
            onRevert: revert,
            ...(isSaved(view) && view.public && view.editable ? { onPublish: () => save(view) } : {}),
          } : null}
          viewNote={viewNote}
          fixed={Object.keys(view?.fixed ?? {}).length}
          onHistory={view ? () => setHistoryOpen((open) => !open) : undefined}
        />
        <div className="nv-work">
        <section className="nv-sheet">
          {matrix && model && view && result.status === 'ready' && cells && layout ? (
            <Matrix key={`${view.key}:${resets}`} view={view} title={title} models={models} rows={cellsState.rows} query={query} away={result.away}
              titles={result.titles} emptyTitle={t(conditioned ? 'noRowsMatch' : 'noRowsInWindow')} emptyHint={formatWindow(matrixDays)} store={cells} writable={joinWritable}
              layout={layout} onLayout={setLayout} filters={filters} />
          ) : grid ? (
            <Grid model={model} view={view} title={title} store={store} writable={writable} layout={layout} onLayout={setLayout} query={query}
              emptyTitle={t(conditioned ? 'noRowsMatch' : conditionDays ? 'noRowsInWindow' : 'noRows')} emptyHint={conditionDays ? formatWindow(conditionDays) : undefined} snapshot={snapshot} onShown={setShown}
              models={models} scope={scope ?? null} spaceModel={served?.space?.model ?? null} filters={filters} scopeChip={scopeChip} onAction={act}
              cut={result.status === 'ready' ? cutAt(result.rows, result.total) : null} links={links} />
          ) : (
            <Sheet hasView={view !== undefined} result={result} />
          )}
        </section>
        {historyOpen && view && (
          <HistoryPanel key={view.key} load={() => readHistory(view, dated ? range : {}, scope ?? null, layout)} fields={model?.fields}
            onUndo={undoBatch} onUndone={reloadView} onRefused={(error) => notify({ message: undoText(error) })} onClose={() => setHistoryOpen(false)} />
        )}
        </div>
        {(saves || notice) && <Toast key={view?.key} state={saves?.state} onUndo={() => void saves?.undo()} onRedo={() => void saves?.redo()} notice={notice} />}
      </main>
      {adding && (
        <NewViewDialog source={adding.table.label} type={adding.type}
          scope={adding.table.space === 'scoped' && space.status === 'ready' ? space.selected?.title ?? null : null}
          onSubmit={(name, shared) => create(adding.table.key, name, adding.type, shared)} onClose={() => setAdding(null)} />
      )}
    </div>
  )
}

/** What a query's `+ Nieuw` creates in its dataset: that dataset's own new row, on the window's day and in the selected space. */
function madeFrom(target: Model, tables: TableDef[], window: Partial<DateWindow> | null, scope: Scope | null): NewRow {
  const table = tables.find((t) => t.model === target.key)
  const view: View = { key: target.key, label: target.label, table: target.key, model: target.key, ...(table?.date_field ? { date_field: table.date_field } : {}) }
  return newRow(target, view, window, new Date(), table?.space === 'scoped' ? scope : null)
}

/** Why a query's `+ Nieuw` is off: its dataset is read-only, or a row there still needs what only a pick gives. */
function createBlocked(target: Model, made: NewRow | null, writable: boolean): string | null {
  if (!writable || !made) return t('readOnly')
  if ('missing' in made) return t('needsFields', { fields: made.missing.join(', ') })
  const asked = made.needs.filter((key) => key !== 'title').map((key) => target.fields[key]?.label ?? key)
  return asked.length > 0 ? t('pickFirst', { fields: asked.join(', ') }) : null
}

function Sheet({ hasView, result }: { hasView: boolean; result: Rows }) {
  if (!hasView) return <div className="nv-center"><EmptyState type="no-data" title={t('noViews')} description={t('noViewsHint')} /></div>
  if (result.status === 'loading') return <div className="nv-center"><Spinner /></div>
  return (
    <div className="nv-center">
      <EmptyState type="no-data" title={t('noRows')} description={result.status === 'error' ? errorText(result.error.code, result.error.message) : ''} />
    </div>
  )
}
