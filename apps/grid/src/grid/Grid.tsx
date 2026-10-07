import { Button, EmptyState } from '@sakaniui/react'
import { type ClipboardEvent, type KeyboardEvent, type MouseEvent, type ReactNode, type RefObject, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import { t } from '../i18n'
import type { Lookup, Model, Row, Scope, View } from '../types'
import { RelationContext } from './cells/Relation'
import { type Column, columnsFor } from './columns'
import { Drawer, type RunAction } from './Drawer'
import { filterRows } from './filter'
import { type Group, groupRows, sums, total } from './group'
import { useFolded } from './hooks'
import { GridBar } from './GridBar'
import { type BodyActions, GridBody } from './GridBody'
import { GridFoot } from './GridFoot'
import { GridHeader } from './GridHeader'
import { type Cell, type Effect, initial, type Input, type KeyState, reduce, type Sheet } from './keys'
import type { Layout } from './layout'
import { DRAFT, type Store } from './store'
import { useGridTable } from './useTable'

/** What the grid shows, read when it is exported: the visible columns in order and the sorted, grouped rows. */
export interface OnScreen {
  columns: Column[]
  groups: Group[]
}

export interface GridProps {
  model: Model
  view: View
  /** The sheet's accessible name; the view's label when not given. */
  title?: string
  store: Store
  writable: boolean
  layout: Layout
  onLayout: (layout: Layout) => void
  /** The toolbar's search: rows whose title holds it. */
  query: string
  emptyTitle: string
  /** Names the window an empty sheet looked in. */
  emptyHint?: string
  /** Set to a reader of what is on screen, for the toolbar's export. */
  snapshot?: RefObject<(() => OnScreen) | null>
  /** Told what is on screen, for the title line's summary. */
  onShown?: (shown: { rows: number; groups: number | null } | null) => void
  /** Every declared model, for the relation pickers' targets. */
  models?: Record<string, Model>
  /** The selected space: a picker lists its records first where a model relates to `spaceModel`. */
  scope?: Scope | null
  spaceModel?: string | null
  /** The filter chips, shown in the bar over the sheet. */
  filters?: ReactNode
  /** Runs one of the model's actions on a record; without it the drawer offers none. */
  onAction?: (row: Row, ...run: Parameters<RunAction>) => Promise<void>
  /** The last row as loaded when the read limit held rows back: its group's facts may be short. */
  cut?: Row | null
}

const NO_MODELS: Record<string, Model> = {}

/** Only a cell or its editor drives the sheet; a header, Open or Dismiss button keeps its own keys. */
function fromCell(target: EventTarget): boolean {
  return target instanceof Element && (target.matches('td[data-cell]') || target.closest('[data-editor]') !== null)
}

function firstLine(text: string): string {
  return text.split(/\r?\n/)[0].split('\t')[0]
}

export function Grid({ model, view, title, store, writable, layout, onLayout, query, emptyTitle, emptyHint, snapshot, onShown, models = NO_MODELS, scope = null, spaceModel = null, filters, onAction, cut = null }: GridProps) {
  const state = useSyncExternalStore(store.subscribe, store.getState)
  // The fields a draft still needs are shown while it does, even where the view shows them only as a lookup or not at all.
  const wanted = useMemo(() => (state.rows.some((r) => r.id === DRAFT) ? state.needs : []), [state.rows, state.needs])
  const columns = useMemo(() => {
    const declared = columnsFor(model, view, writable, models)
    const absent = wanted.filter((need) => !declared.some((c) => c.field === need))
    if (absent.length === 0) return declared
    return [...declared, ...columnsFor(model, { ...view, columns: absent, lookups: {}, rollups: {} }, writable, models).filter((c) => c.field !== 'title')]
  }, [model, view, writable, models, wanted])
  const every = useMemo(() => columnsFor(model, { ...view, columns: undefined }, false, models), [model, view, models])
  const byId = useMemo(() => new Map(columns.map((c) => [c.id, c])), [columns])

  const drafts = useMemo(() => state.rows.filter((r) => r.id === DRAFT), [state.rows])
  const shown = useMemo(
    () => filterRows(state.rows.filter((r) => r.id !== DRAFT), layout.filters, query),
    [state.rows, layout.filters, query],
  )
  const by: Column | undefined = layout.group ? every.find((c) => c.id === layout.group) : undefined
  // Grouped by a day, each section names it: the column would repeat it on every row.
  const table = useGridTable(columns, shown, layout, onLayout, by?.kind === 'date' ? [by.id] : [], wanted)
  const visible = table.getVisibleLeafColumns().map((c) => byId.get(c.id)!)
  const groups = groupRows([...drafts, ...table.getRowModel().rows.map((r) => r.original)], by, { facts: view.facts ?? [], columns: every, cut })
  const [folded, fold] = useFolded(view.key, by?.id ?? null)
  // A group holding the draft stays open: the row being written must stay in reach.
  const shut = new Set(groups.filter((g) => folded.has(g.key) && !g.rows.some((r) => r.id === DRAFT)).map((g) => g.key))
  const ordered = groups.flatMap((g) => (shut.has(g.key) ? [] : g.rows))

  const sorted = table.getRowModel().rows
  useEffect(() => {
    if (!snapshot) return
    snapshot.current = () => ({ columns: visible, groups: groupRows(sorted.map((r) => r.original), by) })
    return () => {
      snapshot.current = null
    }
  })

  const shownRows = total(groups)
  const shownGroups = by ? groups.length : null
  useEffect(() => {
    onShown?.({ rows: shownRows, groups: shownGroups })
  }, [shownRows, shownGroups])
  useEffect(() => () => onShown?.(null), [])

  const [keys, setKeys] = useState<KeyState>(initial)
  const keysRef = useRef<KeyState>(initial)
  // The active cell follows its record and column: a write that re-sorts must not move it onto another row.
  const anchor = useRef<{ row: number; column: string } | null>(null)
  // Focus moves to a cell only after the grid itself moved it; a search filtering rows must keep its focus.
  const moved = useRef(false)
  const [drawer, setDrawer] = useState<number | null>(null)
  const tableRef = useRef<HTMLTableElement>(null)

  const sheet: Sheet = {
    rows: ordered.length,
    cols: visible.length,
    editable: (c) => Boolean(visible[c.col]?.editable && ordered[c.row]),
    required: (c) => Boolean(visible[c.col]?.required),
    toggles: (c) => visible[c.col]?.kind === 'bool',
    value: (c) => (ordered[c.row] && visible[c.col] ? visible[c.col].edit(ordered[c.row]) : ''),
  }

  // The record a picker chose, so its title paints with the id before the server answers.
  const picked = useRef<Row | null>(null)

  function apply(row: Row, column: Column, value: unknown): void {
    if (!column.field) return
    const chosen = picked.current
    picked.current = null
    const lookup: Lookup | null | undefined = column.kind !== 'relation' ? undefined
      : chosen && Array.isArray(value) && value[0] === chosen.id ? { id: chosen.id, title: chosen.title, status: chosen.status, fields: chosen.fields }
      : Array.isArray(value) && value.length === 0 ? null : undefined
    void store.apply({ id: row.id, field: column.field, value, lookup })
  }

  function run(effect: Effect): void {
    if (effect.type === 'undo') return void store.undo()
    if (effect.type === 'redo') return void store.redo()
    if (!('cell' in effect)) return
    const row = ordered[effect.cell.row]
    const column = visible[effect.cell.col]
    if (!row || !column) return
    if (effect.type === 'write') apply(row, column, column.parse(effect.draft))
    if (effect.type === 'clear') apply(row, column, column.kind === 'bool' ? false : column.parse(''))
    if (effect.type === 'toggle') apply(row, column, !column.value(row))
    if (effect.type === 'cancel' && row.id === DRAFT) store.discard()
  }

  function locate(): Cell | null {
    if (!anchor.current) return null
    const { row, column } = anchor.current
    const at = { row: ordered.findIndex((r) => r.id === row), col: visible.findIndex((c) => c.id === column) }
    return at.row < 0 || at.col < 0 ? null : at
  }

  function placed(state: KeyState): KeyState {
    const here = locate()
    return here ? { ...state, active: here, selection: here } : state
  }

  function set(next: KeyState, focus = true): void {
    moved.current = focus
    const row = next.active && ordered[next.active.row]
    const column = next.active && visible[next.active.col]
    anchor.current = row && column ? { row: row.id, column: column.id } : null
    keysRef.current = next
    setKeys(next)
  }

  function dispatch(input: Input, focus = true): Effect {
    const result = reduce(placed(keysRef.current), input, sheet)
    set(result.state, focus)
    run(result.effect)
    return result.effect
  }

  // A new draft, and each write that leaves it wanting, opens the next field it needs.
  const draftAt = ordered.findIndex((r) => r.id === DRAFT)
  // `+ New` on an open draft asks again: its next field, else the first it can edit.
  const need = draftAt >= 0 ? wanted[0] ?? null : null
  const asked = useRef(state.asked)
  useEffect(() => {
    const again = asked.current !== state.asked
    asked.current = state.asked
    if (draftAt < 0 || (need === null && !again)) return
    const at = need === null ? -1 : visible.findIndex((c) => c.field === need)
    const col = at >= 0 ? at : visible.findIndex((c) => c.editable)
    if (col < 0) return
    const cell = { row: draftAt, col }
    set({ active: cell, selection: cell, editing: { draft: '', mode: 'edit' } })
  }, [draftAt >= 0, need, state.asked])

  useEffect(() => {
    const active = keysRef.current.active
    if (active && !locate() && active.row >= ordered.length) set(ordered.length === 0 ? initial : { ...keysRef.current, active: { ...active, row: ordered.length - 1 }, editing: null })
  }, [ordered.length])

  const onScreen = placed(keys)
  useEffect(() => {
    if (!moved.current) return
    moved.current = false
    const focused = document.activeElement
    const inGrid = focused === null || focused === document.body || tableRef.current?.contains(focused)
    if (!onScreen.active || onScreen.editing || !inGrid) return
    tableRef.current?.querySelector<HTMLElement>(`[data-cell="${onScreen.active.row}-${onScreen.active.col}"]`)?.focus()
  })

  const actions: BodyActions = {
    click: (cell) => dispatch({ type: 'click', cell }),
    dblclick: (cell) => dispatch({ type: 'dblclick', cell }),
    draft: (value) => dispatch({ type: 'draft', value }),
    commit: (value, move) => dispatch({ type: 'commit', value, move }),
    leave: () => {
      const editing = keysRef.current.editing
      // Focus went somewhere the user chose: commit, and leave it there.
      if (!editing) return
      // An empty required field of a new row is not an answer: keep the row, send nothing.
      const at = keysRef.current.active
      const row = at && ordered[at.row]
      const column = at && visible[at.col]
      if (row && column && row.id === DRAFT && column.required && editing.draft.trim() === '') return set({ ...keysRef.current, editing: null }, false)
      dispatch({ type: 'commit', value: editing.draft, move: 'stay' }, false)
    },
    pick: (record, how) => {
      picked.current = record
      dispatch({ type: 'commit', value: String(record.id), move: how === 'key' ? 'down' : 'stay' })
    },
    cancel: () => dispatch({ type: 'key', key: 'Escape' }),
    close: () => set({ ...keysRef.current, editing: null }, false),
    toggle: (cell) => {
      dispatch({ type: 'click', cell })
      if (visible[cell.col]?.editable && ordered[cell.row]) run({ type: 'toggle', cell })
    },
    open: setDrawer,
    dismiss: store.dismiss,
  }

  const onKeyDown = (event: KeyboardEvent<HTMLTableElement>) => {
    if (!fromCell(event.target)) return
    const here = placed(keysRef.current)
    if (event.key === 'Escape' && !here.editing && here.active && ordered[here.active.row]?.id === DRAFT) {
      event.preventDefault()
      return store.discard()
    }
    const effect = dispatch({ type: 'key', key: event.key, ctrl: event.ctrlKey, meta: event.metaKey, shift: event.shiftKey })
    if (effect.type !== 'ignore') event.preventDefault()
  }

  const selected = () => {
    const { active, editing } = placed(keysRef.current)
    if (!active || editing) return null
    const row = ordered[active.row]
    const column = visible[active.col]
    return row && column ? { row, column } : null
  }

  const onCopy = (event: ClipboardEvent<HTMLTableElement>) => {
    const hit = fromCell(event.target) ? selected() : null
    if (!hit) return
    event.clipboardData.setData('text/plain', hit.column.text(hit.row))
    event.preventDefault()
  }

  const onPaste = (event: ClipboardEvent<HTMLTableElement>) => {
    const hit = fromCell(event.target) ? selected() : null
    if (!hit || !hit.column.editable || hit.column.kind === 'relation') return
    apply(hit.row, hit.column, hit.column.fromText(firstLine(event.clipboardData.getData('text/plain'))))
    event.preventDefault()
  }

  const open = drawer === null ? undefined : state.rows.find((r) => r.id === drawer)

  return (
    <RelationContext.Provider value={{ models, scope, spaceModel }}>
    <div className="nv-frame">
      <GridBar model={model} columns={columns} layout={layout} onLayout={onLayout} count={shown.length} filters={filters} />
      {state.rows.length === 0 ? (
      <div className="nv-center">
        <EmptyState type="no-data" title={emptyTitle} description={emptyHint} />
      </div>
      ) : (
      <div className="nv-body">
        <div className="nv-scroll">
          <table ref={tableRef} role="grid" aria-label={title ?? view.label} className="nv-grid" style={{ width: table.getTotalSize() }} onKeyDown={onKeyDown} onCopy={onCopy} onPaste={onPaste}>
            <GridHeader table={table} byId={byId} />
            <GridBody groups={groups} shut={shut} onFold={fold} columns={visible} keys={onScreen} errors={state.errors} actions={actions}
              emptyText={total(groups) === 0 ? t('noRowsMatch') : null} />
            <GridFoot columns={visible} count={total(groups) - drafts.length} sums={sums(shown, visible)} />
          </table>
        </div>
        {open && <Drawer row={open} columns={every} onClose={() => setDrawer(null)} actions={model.actions}
          onAction={onAction && open.id !== DRAFT ? (action, input) => onAction(open, action, input) : undefined}
          editor={model.deletable ? <DeleteRow key={open.id} onDelete={() => store.remove(open.id)} /> : undefined} />}
      </div>
      )}
    </div>
    </RelationContext.Provider>
  )
}

/** Two presses: Verwijderen, then Zeker?. Keyed by its row, so leaving the drawer starts it over. */
function DeleteRow({ onDelete }: { onDelete: () => Promise<void> }) {
  const [step, setStep] = useState<'ask' | 'sure' | 'sent'>('ask')
  const press = (event: MouseEvent) => {
    if (step === 'ask') return setStep('sure')
    // A double click's second click is not a confirmation.
    if (step !== 'sure' || event.detail > 1) return
    setStep('sent')
    void onDelete().finally(() => setStep('ask'))
  }
  return (
    <div aria-live="polite">
      <Button variant="destructive" size="sm" disabled={step === 'sent'} onClick={press}>
        {t(step === 'ask' ? 'delete' : 'deleteConfirm')}
      </Button>
    </div>
  )
}
