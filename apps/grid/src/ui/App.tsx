import { Dialog, Modal, ModalOverlay } from 'react-aria-components'
import { EmptyState } from './EmptyState'
import { Spinner } from './Spinner'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { awayRows, create as createRow, recordCount, history as readHistory, me, publishView, onNotices, onUnauthenticated, prefs, records, remove as removeRow, rowOf, rows, runAction, savedViews, schema, setDisplay, signOut, undoBatch, spanRows } from '../api'
import { filterFields } from '../grid/filter'
import { OPERATORS } from './FilterBuilder'
import { exportSheet } from '../export/download'
import { linkedDataset } from '../grid/Drawer'
import { Grid, type OnScreen } from '../grid/Grid'
import type { LinkActions } from '../grid/cells/Links'
import { useGridStore, useLayout } from '../grid/hooks'
import { cutAt } from '../grid/group'
import { complete, type Filter, joinOf, readConditions, windowOf } from '../grid/conditions'
import { type Layout, withFilters } from '../grid/layout'
import { madeFrom, type NewRow, newRow } from '../grid/newRow'
import { useMatrixStore } from '../matrix/hooks'
import { Matrix } from '../matrix/Matrix'
import { errorText, setStrings, t, undoText } from '../i18n'
import { useSpace } from '../space'
import type { Account, ApiError, DateWindow, Model, ModelAction, Row, SavedView, Schema, Scope, TableDef, View, ViewType } from '../types'
import { Act } from './Act'
import { Confirm } from './Confirm'
import { LinkPage } from './LinkPage'
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
import { offersForOwners, Share } from './Share'
import { downloadIcs, toIcs } from '../export/ics'
import { useSavedViews } from './useSavedViews'
import { DrawerSlot } from './SidePanel'
import { changed, clearLocal, isSaved, keepLocal, localOf, lockOf, useStoredRevision } from './views'
import { useFillViewport } from './viewport'
import { insightOf } from './insight'
import { periodOf, stepPeriod, todayPeriod, withPeriod } from './period'
import { hintsOf, stepsPeriod } from './hints'
import { formatWindow, isMonth, isoWeek, weekOf } from './Window'
import { Calendar } from '../calendar/Calendar'
import { Board } from '../board/Board'
import { writeDrop } from '../board/drop'
import { Dashboard } from '../dashboard/Dashboard'
import { QuickCreate } from '../dashboard/QuickCreate'
import { barOf, boardColumn } from './bar'
import { SchemaContext } from '../grid/drawer/context'
import { AwayChip, SizeChips } from './SizeChips'
import { useViewChoice } from './choice'
import { useGallerySize } from '../gallery/size'
import { ChipBar } from './ChipBar'
import { Legend } from '../matrix/Legend'
import { Gallery } from '../gallery/Gallery'
import { Timeline } from '../timeline/Timeline'
import { monthWeeks } from '../calendar/layout'

type Rows = { status: 'loading' } | { status: 'ready'; rows: Row[]; total: number; away: Row[]; titles: Map<number, string> } | { status: 'error'; error: ApiError }

/** A matrix's column titles: the live records of the model its join points at. */
async function titlesOf(view: View, served: Schema | null): Promise<Map<number, string>> {
  const join = view.type === 'matrix' ? view.join : undefined
  const model = join ? served?.models[join.model]?.fields[join.column_field]?.relation?.model : undefined
  if (!model) return new Map()
  const found = await records(model, '')
  return new Map(found.rows.map((row) => [row.id, row.title]))
}

type Session = { status: 'checking' } | { status: 'out' } | { status: 'link'; token: string } | { status: 'act'; token: string } | { status: 'record'; token: string } | { status: 'in'; account: Account; lapsed: boolean }

const LINK = /^#\/auth\/([\w-]+)$/
const ACT = /^#\/act\/([\w-]+)$/
const RECORD = /^#\/link\/([\w.-]+)$/
const SIGN_IN = '#/signin'

function tokenLanding(): Session | null {
  const link = LINK.exec(window.location.hash)?.[1]
  if (link) return { status: 'link', token: link }
  const act = ACT.exec(window.location.hash)?.[1]
  if (act) return { status: 'act', token: act }
  const record = RECORD.exec(window.location.hash)?.[1]
  return record ? { status: 'record', token: record } : null
}

function landing(): Session {
  return tokenLanding() ?? (window.location.hash === SIGN_IN ? { status: 'out' } : { status: 'checking' })
}

/** Routes `#/auth/<token>` to the confirm screen, `#/act/<token>` to the answer page, `#/link/<token>` to the person page and `#/signin`, or no session, to the form; else the grid. */
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
      const landed = tokenLanding()
      if (landed) setSession(landed)
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
  if (session.status === 'act') return <div className="nv-auth-page"><Act token={session.token} /></div>
  if (session.status === 'record') return <div className="nv-auth-page"><LinkPage token={session.token} /></div>

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
        <ModalOverlay className="nv-auth-over" isOpen isKeyboardDismissDisabled>
          <Modal className="nv-auth-modal">
            <Dialog className="nv-auth-modal__body" aria-label={t('signIn')}>
              <SignIn note={t('sessionLapsed')} />
            </Dialog>
          </Modal>
        </ModalOverlay>
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
  // What the title line says, kept with the view that said it: a view that says nothing shows nothing.
  const [told, setTold] = useState<{ view: string; shown: Shown | null } | null>(null)
  const [notice, notify] = useNotice()
  useEffect(() => onNotices((notices) => notify({ message: notices.join(' ') })), [])
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
  const [drawerSlot, setDrawerSlot] = useState<HTMLElement | null>(null)
  // The quick create, open with the values a board column's + presets.
  const [quick, setQuick] = useState<Record<string, unknown> | null>(null)
  // "+ Kolom" on a matrix: the chip row holds the button, the matrix the picker.
  const [picking, setPicking] = useState(false)
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
  const { dashboards, load, loadPrefs, tables, create, save, changedLayout, remember, openTable, actions } = useSavedViews({ declared, starting, active: current, open: setActiveKey, note: setViewNote, notify })
  // The grid opens on the first dashboard the reader can open, else on its first view.
  const view = [...dashboards, ...tables.flatMap((table) => table.views)].find((v) => v.key === activeKey) ?? dashboards[0] ?? tables[0]?.views[0] ?? starting[0]
  const dashboard = view?.type === 'dashboard' ? view : undefined
  const setShown = useCallback((shown: Shown | null) => setTold({ view: view?.key ?? '', shown }), [view?.key])
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
  // A link's conditions land once, on the view it names, in place of the view's own: the colleague sees what the sender saw.
  // It is a local change: only the person's own next change saves. A condition the view's model cannot hold is dropped.
  const landing = useRef({ view: readHash('view'), f: readHash('f'), j: readHash('j') })
  // A link followed while the app is open (a drawer's "alle n") lands the same way, without a reload.
  const [landings, setLandings] = useState(0)
  useEffect(() => {
    const follow = () => {
      const [linked, f] = [readHash('view'), readHash('f')]
      if (!linked || f === null) return
      landing.current = { view: linked, f, j: readHash('j') }
      setActiveKey(linked)
      setLandings((n) => n + 1)
    }
    // The page's window: inside this component `window` names the days a view reads.
    globalThis.addEventListener('hashchange', follow)
    return () => globalThis.removeEventListener('hashchange', follow)
  }, [])
  useEffect(() => {
    const { view: linkedKey, f, j } = landing.current
    if (!settled || f === null || !view || !layout) return
    landing.current = { view: null, f: null, j: null }
    dropHash('f')
    dropHash('j')
    const model = served?.models[view.model]
    if (view.key !== linkedKey || !model) {
      notify({ message: t('linkViewGone', { view: view.label }) })
      return
    }
    const linked = readConditions(f)
    if (linked === null) return
    const offered = filterFields(model, [])
    const fits = (c: Filter) => offered.some((field) => field.field === c.field && OPERATORS[field.kind].includes(c.op))
    storeLayout({ ...withFilters(layout, linked.filter(fits)), join: j === 'or' ? 'or' : undefined })
  }, [settled, view?.key, layout === null, landings])
  const asks = layout ? JSON.stringify([layout.filters, joinOf(layout.filters, layout.join), layout.sort, layout.group]) : ''
  // The period is the one condition on the view's date column: the days a skin shows, a new row's day and the export's.
  const period = useMemo(() => (view && layout ? periodOf(view, layout, new Date()) : null), [view, layout?.filters])
  const dateCondition = period?.condition ?? undefined
  const conditionDays = useMemo(() => windowOf(dateCondition, new Date()), [JSON.stringify(dateCondition)])
  const conditioned = layout ? layout.filters.some((f) => f !== dateCondition && complete(f)) : false
  const matrixDays = view?.type === 'matrix' && period?.window ? period.window : weekOf(new Date())
  const calendar = view?.type === 'calendar' ? view.calendar : undefined
  const timeline = view?.type === 'timeline' ? view.calendar : undefined
  const calendarShown = calendar && period?.window ? period.window : weekOf(new Date())
  // A month reads its whole weeks.
  const calendarDays = isMonth(calendarShown) ? monthSpan(calendarShown) : calendarShown
  const timelineShown = timeline && period?.window ? period.window : weekOf(new Date())
  const window = view?.type === 'matrix' ? matrixDays : calendar ? calendarDays : timeline ? timelineShown : {}
  // Rows that span days are read by overlap with the window, so one begun before it still shows.
  const readRows = (calendar ?? timeline)?.spans ? spanRows : rows
  const setPeriod = (next: Filter | null) => {
    if (period && layout) setLayout(withPeriod(layout, period.field, next))
  }
  // A calendar's and a timeline's ←→ step the period and T comes back to today, as the prototype; a grid's and a matrix's arrows move the cursor.
  const stepping = useRef({ period, setPeriod })
  stepping.current = { period, setPeriod }
  const keyed = view?.type === 'calendar' || view?.type === 'timeline'
  useEffect(() => {
    if (!keyed) return
    const onKey = (event: KeyboardEvent) => {
      const { period: p, setPeriod: set } = stepping.current
      if (!p || event.metaKey || event.ctrlKey || event.altKey || !stepsPeriod(event.target)) return
      const next = event.key === 'ArrowLeft' ? stepPeriod(p, -1) : event.key === 'ArrowRight' ? stepPeriod(p, 1) : event.key.toLowerCase() === 't' ? todayPeriod(p) : undefined
      if (next === undefined) return
      event.preventDefault()
      set(next)
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [keyed])
  const windowKey = JSON.stringify(window)
  useEffect(() => setPicking(false), [view?.key])
  const [size, setSize] = useGallerySize(view)
  // Each dataset's records, beside its name in the rail: one count read per table, as the page loads.
  const [counts, setCounts] = useState<Record<string, number>>({})
  const countKey = tables.filter((table) => !table.query).map((table) => table.key).join(',')
  useEffect(() => {
    let live = true
    for (const table of tables.filter((each) => !each.query)) {
      const model = table.views[0]?.model
      if (model) recordCount(model).then((n) => live && setCounts((was) => ({ ...was, [table.key]: n })), () => undefined)
    }
    return () => {
      live = false
    }
  }, [countKey])
  const [showAway, setShowAway] = useViewChoice<boolean>(view, 'ntdst-views/matrix-away/v1/', (raw) => (typeof raw === 'boolean' ? raw : null), true)

  const shownKey = useRef<string | null>(null)
  useEffect(() => {
    if (!settled || !view || scope === undefined || dashboard) return
    let live = true
    // The same view asked again (a condition, a sort) keeps its rows on screen, so an open filter builder stays open.
    if (shownKey.current !== view.key) setResult({ status: 'loading' })
    const asked = window
    const away = view.type === 'matrix' ? view.away : undefined
    Promise.all([readRows(view, asked, scope, layout), away ? awayRows(away, asked) : [], titlesOf(view, served)]).then(
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
  // A skin with no draft row to type in asks for its new row in the dashboard's quick create.
  const quickAdd = !model?.query && (view?.type === 'board' || view?.type === 'timeline' || view?.type === 'gallery' || Boolean(calendar))
  const writable = view ? served?.writable[view.model] === true : false
  const loaded = result.status === 'ready' && model ? result.rows : null
  const matrix = view?.type === 'matrix'
  // The stores hold the rows as edited and their undo: a view's new arrangement must not rebuild them.
  const stores = useMemo(() => view, [view?.key, served])
  const [store, state] = useGridStore(model && !matrix ? stores : undefined, loaded, history, reloadView)
  const live = useRef(store)
  live.current = store
  const reload = () => (view ? readRows(view, window, scope ?? null, layout).then((r) => r.rows) : Promise.resolve([]))
  const [cells, cellsState] = useMatrixStore(matrix && model ? stores : undefined, matrix ? loaded : null, reload, (message) => notify({ message }))
  const joinWritable = view?.join ? served?.writable[view.join.model] === true : false
  const saves = store ? { state, undo: store.undo, redo: store.redo } : cells ? { state: cellsState, undo: cells.undo, redo: cells.redo } : null
  // ⌘Z and ⇧⌘Z on the page, for every skin: the toast promises the undo wherever the focus went (a drop, a drawer's button
  // that unmounted). A cell that handled the key first has prevented it; a field keeps its own.
  const undoing = useRef(saves)
  undoing.current = saves
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null
      if (event.defaultPrevented || !(event.metaKey || event.ctrlKey) || event.key.toLowerCase() !== 'z') return
      if (target?.closest('input, textarea, [contenteditable="true"]')) return
      const now = undoing.current
      if (!now) return
      event.preventDefault()
      void (event.shiftKey ? now.redo() : now.undo())
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [])
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

  // A dashboard's title line: the space it reads and this week, as the prototype's.
  const spaceName = space.status === 'ready' && served?.space ? (space.selected?.title ?? t('allSpace', { label: (served.models[served.space.model]?.label ?? '').toLocaleLowerCase() })) : null
  const dashboardSum = spaceName ? t('dashboardSum', { space: spaceName, week: isoWeek(new Date()) }) : t('dashboardSum', { space: '', week: isoWeek(new Date()) }).replace(/^ · /, '')
  // What still waits, counted on the rows as the sheet now holds them: an edit or a drop moves the count with it.
  const shownRows = store ? state.rows : result.status === 'ready' ? result.rows : null
  const insight = useMemo(() => (!dashboard && model && shownRows && !matrix ? insightOf(model, shownRows) : null), [dashboard, model, shownRows, matrix])
  const grid = store && model && view && layout
  const filters = layout && fields.length > 0
    ? <Filters fields={named} filters={layout.filters} period={dateCondition} join={layout.join} waiting={waiting} onChange={(next) => setLayout(withFilters(layout, next))}
      onJoin={(join) => setLayout({ ...layout, join: join === 'or' ? 'or' : undefined })} />
    : null
  const exportView = () => {
    const shown = snapshot.current?.()
    if (!view || !shown) return
    setExportFailed(false)
    exportSheet(view, shown.columns, shown.groups, dated ? conditionDays : null, title).catch(() => setExportFailed(true))
  }
  const exportIcs = () => {
    const shown = snapshot.current?.()
    if (!view || !model || !shown) return
    downloadIcs(toIcs(shown.groups.flatMap((group) => group.rows), view, shown.columns, model), view.label)
  }
  // The address with the view and its conditions, as a landing reads it.
  const shareLink = () => {
    const params = new URLSearchParams({ view: view?.key ?? '' })
    // Always an f, an empty one too: the link replaces the colleague's conditions with the sender's.
    params.set('f', JSON.stringify(layout?.filters.filter(complete) ?? []))
    if (layout && joinOf(layout.filters, layout.join) === 'or') params.set('j', 'or')
    return `${globalThis.location.origin}${globalThis.location.pathname}#${params.toString()}`
  }
  const publishing = role === 'administrator' && view && isSaved(view)
    ? { isPublic: Boolean(view.public), run: () => publishView(view.id).then((token) => {
      savedViews().then(load, () => undefined)
      return token
    }) }
    : undefined
  const owners = view && isSaved(view) && offersForOwners(role, model)
    ? { id: view.id, isForOwners: Boolean(view.for_owners), onChanged: (on: boolean) => {
      notify({ message: t(on ? 'forOwnersDone' : 'forOwnersStopped') })
      savedViews().then(load, () => undefined)
    } }
    : undefined
  const share = view
    ? <Share onExcel={grid ? exportView : undefined} excelBlocked={matrix ? t('matrixNotExported') : grid ? undefined : t('exportNotReady')}
        onIcs={grid && dated ? exportIcs : undefined} link={shareLink} onCopied={() => notify({ message: t('linkCopied') })} publish={publishing} owners={owners} />
    : null
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
  const act = async (row: Row, action: ModelAction, input: Record<string, unknown>) => {
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
          {unserved ? <EmptyState title={t('noViews')} description={errorText(unserved.code, unserved.message)} /> : <Spinner />}
        </div>
      </div>
    )
  }

  return (
    <DrawerSlot.Provider value={drawerSlot}>
    <SchemaContext.Provider value={served}>
    <div className="nv-app" ref={frame}>
      <Rail signed={signed} tables={tables} counts={counts} dashboards={dashboards} sections={served.sections} active={view?.key} onSelect={setActiveKey} onTable={openTable}
        onNewView={(table, type) => setAdding({ table, type })} actions={actions} modelActions={modelActions}
        onRemoveDashboard={role === 'administrator' ? actions.remove : undefined} space={space.status === 'ready' && served?.space && (
        <SpaceSelect label={models[served.space.model]?.label ?? ''} records={space.records} selected={space.selected} onSelect={select} />
      )} />
      <main className="nv-main">
        <Toolbar
          title={view?.label ?? title}
          kind={view?.type ?? 'grid'}
          locked={view ? lockOf(view) : null}
          shown={told?.view !== view?.key ? null : (told?.shown ?? null)}
          period={dashboard ? dashboardSum : (period?.name ?? null)}
          insight={insight}
          search={<Search query={query} onQuery={setQuery} tables={tables} onJump={setActiveKey} />}
          saving={saves?.state}
          addLabel={newLabel(target ?? model)}
          addBlocked={quickAdd ? (writable && !model?.query ? null : t('readOnly')) : addBlocked}
          onAdd={quickAdd ? () => setQuick({}) : matrix || dashboard || calendar || view?.type === 'board' || view?.type === 'timeline' || view?.type === 'gallery' ? undefined : add}
          share={dashboard ? null : share}
          exportNote={exportFailed ? t('exportFailed') : null}
          local={view && modified ? {
            onRevert: revert,
            ...(isSaved(view) && view.public && view.editable ? { onPublish: () => save(view) } : {}),
          } : null}
          viewNote={viewNote}
          fixed={Object.keys(view?.fixed ?? {}).length}
          onHistory={view && !dashboard ? () => setHistoryOpen((open) => !open) : undefined}
        />
        {!dashboard && view && model && layout && (
          <ChipBar {...barOf({
            view, model, layout, onLayout: setLayout, scope: scopeChip, filters, period: period ? { period, onPeriod: setPeriod } : null,
            told: told?.view === view.key ? told.shown : null,
            ...(matrix ? { adding: { open: picking, onToggle: () => setPicking(!picking) } } : {}),
            ...(view.type === 'gallery' ? { skin: <SizeChips size={size} onSize={setSize} /> } : {}),
            ...(matrix && view.away ? { skin: <AwayChip on={showAway} onToggle={() => setShowAway(!showAway)} /> } : {}),
          })} />
        )}
        <div className="nv-work">
        <section className="nv-sheet">
          {dashboard ? (
            <Dashboard key={dashboard.key} dashboard={dashboard as SavedView} models={models} tables={served.tables} onOpenView={setActiveKey} role={role}
              onSaved={(saved) => savedViews().then((list) => { load(list); setActiveKey(saved.key) }, () => undefined)}
              views={tables.flatMap((table) => table.views).filter(isSaved)} scope={space.status === 'ready' ? space.scope : null} />
          ) : calendar && model && view && layout && result.status === 'ready' ? (
            <Calendar key={view.key} view={view} model={model} models={models} rows={result.rows} cal={calendar} shown={calendarShown}
              lane={layout.group} layout={layout} onTitle={setShown} />
          ) : timeline && model && view && layout && result.status === 'ready' ? (
            <Timeline key={view.key} view={view} model={model} models={models} rows={result.rows} cal={timeline} shown={timelineShown}
              lane={layout.group} layout={layout} onTitle={setShown} />
          ) : view?.type === 'board' && model && layout && boardColumn(view, model, layout) && result.status === 'ready' ? (
            <Board key={view.key} view={view} model={model} models={models} rows={store ? state.rows : result.rows} column={boardColumn(view, model, layout) as string} layout={layout} onShown={setShown}
              onDrop={store && writable && !model.query && !model.fields[boardColumn(view, model, layout) as string]?.readonly ? (drop, id) => writeDrop(store, boardColumn(view, model, layout) as string, drop, id) : undefined} onLayout={setLayout}
              onCreate={writable && !model.query ? (preset) => setQuick(preset) : undefined} />
          ) : view?.type === 'gallery' && view.gallery && model && layout && result.status === 'ready' ? (
            <Gallery key={view.key} view={view} model={model} models={models} rows={result.rows} kind={view.gallery.kind} layout={layout} size={size} onShown={setShown} />
          ) : matrix && model && view && result.status === 'ready' && cells && layout ? (
            <Matrix key={`${view.key}:${resets}`} view={view} title={title} models={models} rows={cellsState.rows} query={query} away={showAway ? result.away : []}
              titles={result.titles} emptyTitle={t(conditioned ? 'noRowsMatch' : 'noRowsInWindow')} emptyHint={formatWindow(matrixDays)} store={cells} writable={joinWritable}
              layout={layout} onLayout={setLayout} picking={picking} onPicking={setPicking} onShown={setShown} />
          ) : grid ? (
            <Grid model={model} view={view} title={title} store={store} writable={writable} layout={layout} onLayout={setLayout} query={query}
              emptyTitle={t(conditioned ? 'noRowsMatch' : conditionDays ? 'noRowsInWindow' : 'noRows')} emptyHint={conditionDays ? formatWindow(conditionDays) : undefined} snapshot={snapshot} onShown={setShown}
              models={models} scope={scope ?? null} spaceModel={served?.space?.model ?? null} onAction={act} onNotice={(message) => notify({ message })}
              cut={result.status === 'ready' ? cutAt(result.rows, result.total) : null} links={links} recordLink={model ? linkedDataset(role, model) : undefined} reloads={reloads} />
          ) : (
            <Sheet hasView={view !== undefined} result={result} />
          )}
        </section>
        {historyOpen && view && (
          <HistoryPanel key={`${view.key}:${asks}:${windowKey}:${scopeId}`} load={() => readHistory(view, window, scope ?? null, layout)} fields={model?.fields}
            onUndo={undoBatch} onUndone={reloadView} onRefused={(error) => notify({ message: undoText(error) })} onClose={() => setHistoryOpen(false)} />
        )}
        </div>
        <footer className="nv-foot" aria-label={t('hints')}>
          {hintsOf(dashboard ? 'dashboard' : (view?.type ?? 'grid')).map((hint) => <span key={hint}>{hint}</span>)}
          {matrix && view && <Legend view={view} models={models} />}
        </footer>
        <div className="nv-toast-region" data-react-aria-top-layer>
          {(saves || notice) && <Toast key={view?.key} state={saves?.state} onUndo={() => void saves?.undo()} onRedo={() => void saves?.redo()} notice={notice} />}
        </div>
      </main>
      <div className="nv-drawer-slot" ref={setDrawerSlot} />
      {quick && model && (
        <QuickCreate label={newLabel(model)} model={model} tables={served.tables} scope={space.status === 'ready' ? space.scope : null}
          window={calendar ? calendarShown : (period?.window ?? null)} preset={quick} onClose={() => setQuick(null)} onCreated={() => { setQuick(null); reloadView() }} />
      )}
      {adding && (
        <NewViewDialog source={adding.table.label} type={adding.type}
          scope={adding.table.space === 'scoped' && space.status === 'ready' ? space.selected?.title ?? null : null}
          onSubmit={(name, shared) => create(adding.table.key, name, adding.type, shared)} onClose={() => setAdding(null)} />
      )}
    </div>
    </SchemaContext.Provider>
    </DrawerSlot.Provider>
  )
}

/** A month's whole Monday-first weeks. */
function monthSpan(month: DateWindow): DateWindow {
  const weeks = monthWeeks(month)
  const last = weeks[weeks.length - 1]
  return weeks[0] && last ? { from: weeks[0][0], to: last[6] } : month
}


/** Why a query's `+ Nieuw` is off: its dataset is read-only, or a row there still needs what only a pick gives. */
function createBlocked(target: Model, made: NewRow | null, writable: boolean): string | null {
  if (!writable || !made) return t('readOnly')
  if ('missing' in made) return t('needsFields', { fields: made.missing.join(', ') })
  const asked = made.needs.filter((key) => key !== 'title').map((key) => target.fields[key]?.label ?? key)
  return asked.length > 0 ? t('pickFirst', { fields: asked.join(', ') }) : null
}

function Sheet({ hasView, result }: { hasView: boolean; result: Rows }) {
  if (!hasView) return <div className="nv-center"><EmptyState title={t('noViews')} description={t('noViewsHint')} /></div>
  if (result.status === 'loading') return <div className="nv-center"><Spinner /></div>
  return (
    <div className="nv-center">
      <EmptyState title={t('noRows')} description={result.status === 'error' ? errorText(result.error.code, result.error.message) : ''} />
    </div>
  )
}
