import { EmptyState, Spinner } from '@sakaniui/react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { awayRows, prefs, records, rows, savedViews, schema } from '../api'
import { filterFields } from '../grid/filter'
import { exportSheet } from '../export/download'
import { Grid, type OnScreen } from '../grid/Grid'
import { useGridStore, useLayout } from '../grid/hooks'
import { filter } from '../grid/layout'
import { newRow } from '../grid/newRow'
import { useMatrixStore } from '../matrix/hooks'
import { Matrix } from '../matrix/Matrix'
import { errorText, setStrings, t } from '../i18n'
import { useSpace } from '../space'
import type { ApiError, Row, Schema, Scope, View } from '../types'
import { Filters } from './Filters'
import { Rail } from './Rail'
import { readHash, writeHash } from './hash'
import { Search } from './Search'
import { SpaceSelect } from './SpaceSelect'
import { Toast, useNotice } from './Toast'
import { tableOf } from './tables'
import { Toolbar } from './Toolbar'
import { ViewPanel } from './ViewPanel'
import { useFilterNames } from './useFilterNames'
import { useSavedViews } from './useSavedViews'
import { changed, clearLocal, isSaved, keepLocal, localOf, useStoredRevision } from './views'
import { useFillViewport } from './viewport'
import { formatWindow, useWindow } from './Window'

type Rows = { status: 'loading' } | { status: 'unscoped' } | { status: 'ready'; rows: Row[]; away: Row[]; titles: Map<number, string> } | { status: 'error'; error: ApiError }

/** A matrix's column titles: the live records of the model its join points at. */
async function titlesOf(view: View, served: Schema | null): Promise<Map<number, string>> {
  const join = view.type === 'matrix' ? view.join : undefined
  const model = join ? served?.models[join.model]?.fields[join.column_field]?.relation?.model : undefined
  if (!model) return new Map()
  const found = await records(model, '')
  return new Map(found.rows.map((row) => [row.id, row.title]))
}

/** The shell waits for the served schema: it declares the tables, the saved views come with it. */
export function App() {
  const frame = useRef<HTMLDivElement>(null)
  const [served, setServed] = useState<Schema | null>(null)
  const [unserved, setUnserved] = useState<ApiError | null>(null)
  const [settled, setSettled] = useState(false)
  const [activeKey, setActive] = useState<string | undefined>(() => readHash('view') ?? undefined)
  const [panel, setPanel] = useState<'new' | 'saveAs' | null>(null)
  const [viewNote, setViewNote] = useState<string | null>(null)
  const [notice, notify] = useNotice()
  // A revert remounts the matrix, whose picked columns are its own state.
  const [resets, setResets] = useState(0)
  // Only a switch the user made is remembered as the table's last view; the landing is not one.
  const switched = useRef(false)
  const setActiveKey = (key: string) => {
    switched.current = true
    writeHash('view', key)
    setActive(key)
    setPanel(null)
    setViewNote(null)
  }
  const [range, setRange] = useWindow()
  const [result, setResult] = useState<Rows>({ status: 'loading' })
  const [query, setQuery] = useState('')
  const [exportFailed, setExportFailed] = useState(false)
  const snapshot = useRef<(() => OnScreen) | null>(null)
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
  const declared = served?.tables ?? []
  const current = useRef<string | undefined>(undefined)
  const { load, loadPrefs, tables, busy, create, saveAs, save, remember, openTable, actions } = useSavedViews({ declared, starting, active: current, open: setActiveKey, note: setViewNote, notify })
  const view = tables.flatMap((table) => table.views).find((v) => v.key === activeKey) ?? tables[0]?.views[0] ?? starting[0]
  current.current = view?.key

  useEffect(() => {
    if (switched.current && view) remember(view)
  }, [view?.key])
  // Once settled the open view is held by its key: a reorder must not move the page off a view it landed on.
  useEffect(() => {
    if (settled && view && view.key !== activeKey) setActive(view.key)
  }, [settled, view?.key, activeKey])
  const title = tableOf(tables, view?.key)?.label ?? t('views')
  const dated = Boolean(view?.date_field)
  const [space, select] = useSpace(served?.space)
  const scoped = space.status !== 'none' && view?.space === 'scoped'
  // undefined: the space is still loading; null: this view is not scoped.
  const scope: Scope | null | undefined = !scoped ? null : space.status === 'ready' ? space.scope : undefined
  const scopeId = scope === undefined ? undefined : scope?.id ?? null
  const [stored, setLayout] = useLayout(view)
  const spaceField = scoped && served?.space ? served.space.field : undefined
  // A chip saved before the view was scoped would filter on what the scope already decides.
  const layout = stored && spaceField ? { ...stored, filters: stored.filters.filter((f) => f.field !== spaceField) } : stored
  const asks = layout ? JSON.stringify([layout.filters, layout.sort, layout.group]) : ''

  useEffect(() => {
    if (!settled || !view || scope === undefined) return
    if (scoped && scope === null) return setResult({ status: 'unscoped' })
    let live = true
    setResult({ status: 'loading' })
    const asked = dated ? range : {}
    const away = view.type === 'matrix' ? view.away : undefined
    Promise.all([rows(view, asked, scope, layout), away ? awayRows(away, asked) : [], titlesOf(view, served)]).then(
      ([r, away, titles]) => live && setResult({ status: 'ready', rows: r.rows, away, titles }),
      (error: ApiError) => live && setResult({ status: 'error', error }),
    )
    return () => {
      live = false
    }
    // By key, and by what the server applies (filters, sort, group): a width or a hidden column stays in the browser.
  }, [settled, view?.key, dated, range, scopeId, asks])

  const model = view ? served?.models[view.model] : undefined
  const writable = view ? served?.writable[view.model] === true : false
  const loaded = result.status === 'ready' && model ? result.rows : null
  const matrix = view?.type === 'matrix'
  // The stores hold the rows as edited and their undo: a view's new arrangement must not rebuild them.
  const stores = useMemo(() => view, [view?.key, served])
  const [store, state] = useGridStore(model && !matrix ? stores : undefined, loaded)
  const reload = () => (view ? rows(view, dated ? range : {}, scope ?? null, layout).then((r) => r.rows) : Promise.resolve([]))
  const [cells, cellsState] = useMatrixStore(matrix && model ? stores : undefined, matrix ? loaded : null, reload)
  const joinWritable = view?.join ? served?.writable[view.join.model] === true : false
  const saves = store ? { state, undo: store.undo, redo: store.redo } : cells ? { state: cellsState, undo: cells.undo, redo: cells.redo } : null
  const fields = useMemo(
    () => (model && loaded ? filterFields(model, loaded, view?.filters).filter((f) => f.field !== spaceField) : []),
    [model, loaded, view?.filters, spaceField],
  )
  const [named, waiting] = useFilterNames(model, fields, layout?.filters ?? [])

  const plan = model && view ? newRow(model, view, dated ? range : null, new Date(), scope ?? null) : null
  const addBlocked = !writable || model?.query || !store || !plan ? t('readOnly') : 'missing' in plan ? t('needsFields', { fields: plan.missing.join(', ') }) : null
  const add = () => {
    if (!store || !model || !plan || 'missing' in plan) return
    if (plan.needs.length === 0) void store.create(plan.fields)
    else store.draft(plan.fields, plan.needs, plan.offers)
  }

  const grid = store && model && view && layout
  const filters = layout && fields.length > 0
    ? <Filters fields={named} active={layout.filters.filter((f) => !waiting.includes(f.field))} onChange={(field, value) => setLayout(filter(layout, field, value))} />
    : null
  const exportView = () => {
    const shown = snapshot.current?.()
    if (!view || !shown) return
    setExportFailed(false)
    exportSheet(view, shown.columns, shown.groups, dated ? range : null, title).catch(() => setExportFailed(true))
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
  const types = declared.find((table) => table.key === view?.table)?.types ?? ['grid']

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
      <Rail tables={tables} active={view?.key} onSelect={setActiveKey} onTable={openTable} onNewView={view ? () => setPanel('new') : undefined} actions={actions} space={space.status === 'ready' && served?.space && (
        <SpaceSelect label={served.models[served.space.model]?.label ?? ''} model={served.space.model} selected={space.selected} onSelect={select} />
      )} />
      <main className="nv-main">
        <Toolbar
          title={title}
          window={dated ? range : null}
          onWindow={setRange}
          search={<Search query={query} onQuery={setQuery} tables={tables} onJump={setActiveKey} />}
          saving={saves?.state}
          addLabel={[t('new'), model?.label].filter(Boolean).join(' ')}
          addBlocked={addBlocked}
          onAdd={matrix ? undefined : add}
          onExport={grid ? exportView : undefined}
          exportBlocked={matrix ? t('matrixNotExported') : undefined}
          exportNote={exportFailed ? t('exportFailed') : null}
          modified={view && modified ? {
            onSave: isSaved(view) && view.mine && view.editable ? () => save(view) : undefined,
            busy,
            onSaveAs: () => setPanel('saveAs'),
            onRevert: revert,
          } : null}
          viewNote={viewNote}
          fixed={Object.keys(view?.fixed ?? {}).length}
        />
        <div className="nv-work">
        <section className="nv-sheet">
          {matrix && model && view && result.status === 'ready' && cells && layout ? (
            <Matrix key={`${view.key}:${resets}`} view={view} title={title} models={served?.models ?? {}} rows={cellsState.rows} query={query} away={result.away}
              titles={result.titles} emptyTitle={t('noRowsInWindow')} emptyHint={formatWindow(range)} store={cells} writable={joinWritable}
              layout={layout} onLayout={setLayout} filters={filters} />
          ) : grid ? (
            <Grid model={model} view={view} title={title} store={store} writable={writable} layout={layout} onLayout={setLayout} query={query}
              emptyTitle={t(dated ? 'noRowsInWindow' : 'noRows')} emptyHint={dated ? formatWindow(range) : undefined} snapshot={snapshot}
              models={served?.models} scope={scope ?? null} spaceModel={served?.space?.model ?? null} filters={filters} />
          ) : (
            <Sheet hasView={view !== undefined} dated={dated} result={result} />
          )}
        </section>
        {panel && view && (
          <ViewPanel key={panel} label={t(panel === 'new' ? 'newView' : 'saveAsNew')} types={panel === 'new' ? types : null} type={panel === 'saveAs' ? view.type ?? 'grid' : undefined}
            onSubmit={(name, type) => (panel === 'new' ? create : saveAs)(view, name, type)} onClose={() => setPanel(null)} />
        )}
        </div>
        {(saves || notice) && <Toast key={view?.key} state={saves?.state} onUndo={() => void saves?.undo()} onRedo={() => void saves?.redo()} notice={notice} />}
      </main>
    </div>
  )
}

function Sheet({ hasView, dated, result }: { hasView: boolean; dated: boolean; result: Rows }) {
  if (!hasView) return <div className="nv-center"><EmptyState type="no-data" title={t('noViews')} description={t('noViewsHint')} /></div>
  if (result.status === 'loading') return <div className="nv-center"><Spinner /></div>
  if (result.status === 'unscoped') return <div className="nv-center"><EmptyState type="no-data" title={t('chooseSpace')} /></div>
  return (
    <div className="nv-center">
      <EmptyState
        type="no-data"
        title={t(dated ? 'noRowsInWindow' : 'noRows')}
        description={result.status === 'error' ? errorText(result.error.code, result.error.message) : undefined}
      />
    </div>
  )
}
