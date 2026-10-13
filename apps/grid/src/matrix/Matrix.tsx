import { type ClipboardEvent, type CSSProperties, Fragment, type KeyboardEvent, type MouseEvent, type ReactNode, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { type Column, columnsFor } from '../grid/columns'
import { Drawer } from '../grid/Drawer'
import { filterRows } from '../grid/filter'
import { hide, type Layout, show as unhide } from '../grid/layout'
import type { CellError } from '../grid/store'
import { groupRows } from '../grid/group'
import { locale, rowCount, t } from '../i18n'
import { optionsFrom } from '../api'
import type { MatrixCell, MatrixColumn, Model, OptionsFrom, Row, Tone, View } from '../types'
import { ChipRow } from '../ui/ChipRow'
import { Spinner } from '../ui/Spinner'
import { toneColor } from '../ui/tone'
import { iso } from '../ui/Window'
import { initials, whenOf } from '../ui/when'
import { absentOn } from './away'
import { ColumnPicker } from './ColumnPicker'
import { buildColumns, cellFor, loadPicked, markFor, OPEN, type OpenSlot, openSlots, savePicked, visibleColumns } from './columns'
import { actionForKey, cycle } from './keys'
import { Panel } from './Panel'
import { EmptyState } from '../ui/EmptyState'
import type { MatrixStore } from './store'

export interface MatrixProps {
  view: View
  /** The matrix's accessible name; the view's label when not given. */
  title?: string
  models: Record<string, Model>
  rows: Row[]
  /** The away view's rows for the same window. */
  away: Row[]
  /** The column model's live records, by id. */
  titles: Map<number, string>
  emptyTitle: string
  emptyHint?: string
  /** Writes the cells; without one, or without `writable`, the matrix is read-only. */
  store?: MatrixStore
  /** Whether the join model has a writer. */
  writable?: boolean
  /** The search words the toolbar holds. */
  query?: string
  /** The viewer's arrangement: hidden columns, filters and the row grouping, applied here to the window's rows. */
  layout: Layout
  onLayout: (layout: Layout) => void
  /** The filter chips, shown in the bar after "+ Column". */
  filters?: ReactNode
  /** The space's chip, first in the bar. */
  scope?: string | null
}

/** A cell by its row's id and its column's key, so it survives a repaint. */
interface Spot {
  row: number
  column: string
}

/** What the side panel shows: a cell, or a row label when `column` is null. */
interface Open {
  row: number
  column: string | null
}

interface Rect {
  top: number
  bottom: number
  left: number
  right: number
}

const ARROWS: Record<string, [number, number]> = { ArrowUp: [-1, 0], ArrowDown: [1, 0], ArrowLeft: [0, -1], ArrowRight: [0, 1] }

function clamp(value: number, max: number): number {
  return Math.max(0, Math.min(max - 1, value))
}

/** Clipboard text as a block: lines of tab-separated words, a trailing newline dropped. */
function blockOf(text: string): string[][] {
  const lines = text.replace(/\r?\n$/, '').split(/\r?\n/)
  return lines.map((line) => line.split('\t'))
}

const LABEL_WIDTH = 280
const COLUMN_WIDTH = 84
const COUNT_WIDTH = 64
const OPEN_WIDTH = 132

function text(value: unknown): string {
  return typeof value === 'string' ? value : ''
}

function dateOf(view: View, row: Row): string {
  return text(row.fields[view.date_field ?? ''])
}

/** The field the sections come from: the declared group, else the day. */
function sectionColumn(view: View, models: Record<string, Model>, group: string | null) {
  const model = models[view.model]
  const field = group ?? view.date_field
  if (!model || !field) return undefined
  return columnsFor(model, { ...view, columns: [field], lookups: undefined, rollups: undefined }, false, models).find((column) => column.field === field)
}

interface CellState {
  spot: string
  active: boolean
  selected: boolean
  /** The cell the panel shows. */
  open: boolean
  split: boolean
  focusable: boolean
  error: CellError | null
  onClick: (shift: boolean) => void
  onOpen: () => void
  onFocus: () => void
}

/** A Shift+click's mousedown would focus the cell first, and focusing re-anchors: the click moves the focus instead. */
function keepFocusOnShift(event: MouseEvent<HTMLTableCellElement>): void {
  if (event.shiftKey) event.preventDefault()
}

/** A cell's look: its status tinted by its tone, a refused one quiet, away hatched, away and still on the row red. */
function toneClass(cell: MatrixCell | undefined, tone: Tone | undefined, away: Row | undefined): string {
  const look = !cell ? '' : tone === 'bad' ? 'nv-mx__cell--no' : away ? 'nv-mx__cell--bad' : tone ? 'nv-mx__cell--on' : ''
  return [away ? 'nv-mx__away' : '', look].filter(Boolean).join(' ')
}

function Cell({ view, models, cell, column, away, date, state }: {
  view: View; models: Record<string, Model>; cell: MatrixCell | undefined; column: MatrixColumn; away: Row | undefined; date: string; state: CellState
}) {
  const join = view.join!
  const status = cell ? text(cell.fields[join.cell_field]) : ''
  const note = cell && join.note_field ? text(cell.fields[join.note_field]).trim() : ''
  const word = models[join.model]?.fields[join.cell_field]?.options?.[status] ?? status
  const reason = away && view.away ? text(away.fields[view.away.label_field]) : ''
  const tone = models[join.model]?.fields[join.cell_field]?.tones?.[status]
  const label = [
    column.title,
    cell && `${t('statusLabel')}: ${word}`,
    note !== '' && `${t('noteLabel')}: ${note}`,
    away && t('awayReason', { reason }),
    away && cell && t('awayWarning'),
  ].filter(Boolean).join('. ')

  return (
    <td role="gridcell" aria-label={label} data-column={column.key} data-date={date} data-cell={state.spot}
      className={['nv-td', 'nv-mx__cell', state.split ? 'nv-mx__split' : '', toneClass(cell, tone, away), state.selected ? 'nv-mx__selected' : '', state.open ? 'nv-mx__open-cell' : '', state.active ? 'nv-td--active' : '', state.error ? 'nv-td--error' : ''].filter(Boolean).join(' ')}
      style={cell && tone ? ({ '--c': toneColor(tone) } as CSSProperties) : undefined}
      tabIndex={state.focusable ? 0 : -1} aria-selected={state.selected} aria-invalid={state.error ? true : undefined}
      onMouseDown={keepFocusOnShift} onClick={(event) => state.onClick(event.shiftKey)} onDoubleClick={state.onOpen} onFocus={state.onFocus}>
      {cell && <span className="nv-mx__mark" data-counted={status === join.count}>{markFor(view, status)}</span>}
      {!cell && away && <span className="nv-mx__reason" aria-hidden="true">{reason}</span>}
      {cell && away && <span className="nv-mx__warn" aria-hidden="true">⚠</span>}
      {note !== '' && <span className="nv-mx__dot" aria-hidden="true" />}
      {state.error && <span className="nv-td__error" role="alert">{state.error.message}</span>}
    </td>
  )
}

/** A row's hours before its title, "14:00–15:30", or that it has none. */
function Hours({ row, dates }: { row: Row; dates: Column[] }) {
  if (dates.length === 0) return null
  const { from, to } = whenOf(row, dates)
  return from ? <span className="nv-time nv-mx__time">{from}{to && <span className="nv-time__end">–{to}</span>}</span> : <span className="nv-mx__time nv-mx__untimed">{t('noTime')}</span>
}

function OpenCell({ row, slots, error, onFill }: { row: number; slots: OpenSlot[]; error: CellError | null; onFill?: () => void }) {
  const count = slots.reduce((sum, slot) => sum + slot.count, 0)
  const labels = slots.map((slot) => slot.label).filter(Boolean).join(', ')
  const shown = slots.length > 0 && <><b className="nv-cell__tabular">{count}</b> <span className="nv-mx__roles">{labels}</span></>
  return (
    <td role="gridcell" data-testid="open" data-open-row={row} tabIndex={-1} className="nv-td nv-mx__open" aria-label={slots.length > 0 ? `${t('openSlots', { count: String(count) })}. ${labels}` : undefined}
      aria-invalid={error ? true : undefined}>
      {shown && (onFill ? <button type="button" className="nv-mx__fill" onClick={onFill}>{shown}</button> : shown)}
      {error && <span className="nv-td__error" role="alert">{error.message}</span>}
    </td>
  )
}

/** In the page, nothing floats: the role first when more than one waits, then the person. */
function FillPicker({ row, slots, titles, taken, from, onPick, onClose }: {
  row: Row; slots: OpenSlot[]; titles: Map<number, string>; taken: number[]; from?: OptionsFrom; onPick: (cell: number, record: number) => void; onClose: () => void
}) {
  const [slot, setSlot] = useState<OpenSlot | null>(slots.length === 1 ? slots[0] : null)
  const [query, setQuery] = useState('')
  // A declared source lists the slot's candidates, best first, until the planner asks for everyone.
  const [candidates, setCandidates] = useState<[number, string][] | null>(null)
  const [everyone, setEveryone] = useState(!from)
  const ref = useRef<HTMLElement>(null)
  useEffect(() => ref.current?.querySelector<HTMLElement>('input, .nv-mx__pick')?.focus(), [slot])
  useEffect(() => {
    if (!from || !slot || everyone) return
    let live = true
    setCandidates(null)
    optionsFrom(from, slot.record).then((found) => live && setCandidates(found.map((r) => [r.id, r.title])), () => live && setCandidates([]))
    return () => {
      live = false
    }
  }, [from, slot, everyone])
  const words = query.trim().toLocaleLowerCase()
  const listed = everyone ? [...titles].sort((a, b) => a[1].localeCompare(b[1])) : (candidates ?? [])
  const people = listed.filter(([id, title]) => !taken.includes(id) && title.toLocaleLowerCase().includes(words))
  return (
    <section ref={ref} className="nv-mx__picker" aria-label={t('fillSlot')} onKeyDown={(event) => event.key === 'Escape' && onClose()}>
      <p className="nv-picker__note">{[row.title, slot?.label].filter(Boolean).join(' · ')}</p>
      {slot === null ? (
        <>
          <p>{t('fillPickRole')}</p>
          <ul className="nv-mx__picks">
            {slots.map((s) => <li key={s.key}><button type="button" className="nv-mx__pick" onClick={() => setSlot(s)}>{`${s.label || '–'} · ${s.count}`}</button></li>)}
          </ul>
        </>
      ) : (
        <>
          <input type="search" className="nv-picker__input" aria-label={t('fillPickPerson')} placeholder={t('search')} value={query} onChange={(e) => setQuery(e.target.value)} />
          <ul className="nv-mx__picks">
            {people.map(([id, title]) => <li key={id}><button type="button" className="nv-mx__pick" onClick={() => onPick(slot.cell, id)}>{title}</button></li>)}
          </ul>
          {!everyone && candidates === null && <Spinner small />}
          {people.length === 0 && (everyone || candidates !== null) && <p className="nv-picker__note">{t(everyone || words ? 'noMatches' : 'candidatesNone')}</p>}
          {!everyone && <button type="button" className="nv-bar__button" onClick={() => setEveryone(true)}>{t('candidatesAll')}</button>}
        </>
      )}
      <button type="button" className="nv-bar__button" onClick={onClose}>{t('cancel')}</button>
    </section>
  )
}

/** Rows by day, one column per record or name, and what each has on a row; typed into like a sheet. */
export function Matrix({ view, title, models, rows: windowRows, away, titles, emptyTitle, emptyHint, store, writable = false, query = '', layout, onLayout, filters, scope = null }: MatrixProps) {
  const [picked, setPicked] = useState(() => loadPicked(view))
  const [picking, setPicking] = useState(false)
  // A column stays for the visit once shown: removing its last cell must not pull it from under the cursor.
  const kept = useRef<number[]>([])
  const keptNames = useRef<MatrixColumn[]>([])
  const rows = useMemo(() => filterRows(windowRows, query), [windowRows, query])
  const everyColumn = useMemo(() => {
    const built = buildColumns(view, windowRows, titles, [...picked, ...kept.current], keptNames.current)
    kept.current = built.flatMap((column) => (column.id ? [column.id] : []))
    keptNames.current = built.filter((column) => column.kind === 'name')
    return built
  }, [view, windowRows, titles, picked])
  const columns = useMemo(() => visibleColumns(everyColumn, layout.hidden), [everyColumn, layout.hidden])
  const toggle = (key: string) => onLayout(layout.hidden.includes(key) ? unhide(layout, key) : hide(layout, key))
  const join = view.join!
  const [active, setActive] = useState<Spot | null>(null)
  const [anchor, setAnchor] = useState<Spot | null>(null)
  const moved = useRef(false)
  const [open, setOpen] = useState<Open | null>(null)
  const [filling, setFilling] = useState<number | null>(null)
  const toPanel = useRef(false)
  const clickedAt = useRef(0)
  const bodyRef = useRef<HTMLDivElement>(null)
  const tableRef = useRef<HTMLTableElement>(null)
  const editable = writable && store !== undefined
  const counted = (cell: MatrixCell | undefined) => cell?.fields[join.cell_field] === join.count
  const grid = useMemo(
    () => rows.map((row) => ({ row, cells: columns.map((column) => cellFor(view, row, column)) })),
    [view, rows, columns],
  )
  // Hiding is an arrangement, not data: a row's headcount and the total keep counting the hidden columns.
  const headcount = (row: Row) => everyColumn.filter((column) => counted(cellFor(view, row, column))).length
  const total = rows.reduce((sum, row) => sum + headcount(row), 0)
  const perColumn = columns.map((_, c) => grid.filter(({ cells }) => counted(cells[c])).length)
  const firstName = columns.findIndex((column) => column.kind === 'name')
  const pick = (id: number) => {
    const next = [...picked, id]
    setPicked(next)
    savePicked(view, next)
    setPicking(false)
  }
  const hasOpen = join.open !== undefined
  const openTotal = hasOpen ? rows.reduce((sum, row) => sum + openSlots(view, row).reduce((n, slot) => n + slot.count, 0), 0) : 0
  const fillRow = filling === null ? undefined : rows.find((row) => row.id === filling)
  // The keyboard goes back to the row's open cell, which stays when its last slot is filled: Ctrl+Z works from there.
  const refocus = useRef<number | null>(null)
  const closeFill = (row: number) => {
    refocus.current = row
    setFilling(null)
  }
  const fill = (row: Row, cell: number, record: number) => {
    closeFill(row.id)
    void store?.fill(row.id, cell, record)
  }
  useEffect(() => {
    if (refocus.current === null || filling !== null) return
    tableRef.current?.querySelector<HTMLElement>(`[data-open-row="${refocus.current}"]`)?.focus()
    refocus.current = null
  }, [filling])
  const countWord = models[join.model]?.fields[join.cell_field]?.options?.[join.count] ?? join.count
  const cellClass = (c: number) => (c === firstName && c > 0 ? 'nv-mx__split' : '')

  const by = useMemo(() => sectionColumn(view, models, layout.group), [view, models, layout.group])
  const body = groupRows(rows, by)
  const ordered = body.flatMap((section) => section.rows)
  const indexOf = (spot: Spot | null) => {
    if (!spot) return null
    const r = ordered.findIndex((row) => row.id === spot.row)
    const c = columns.findIndex((column) => column.key === spot.column)
    return r < 0 || c < 0 ? null : { r, c }
  }
  const here = indexOf(active)
  const from = indexOf(anchor) ?? here
  const rect: Rect | null = here && from
    ? { top: Math.min(here.r, from.r), bottom: Math.max(here.r, from.r), left: Math.min(here.c, from.c), right: Math.max(here.c, from.c) }
    : null
  const rowsIn = (box: Rect) => ordered.slice(box.top, box.bottom + 1).map((row) => row.id)
  const columnsIn = (box: Rect) => columns.slice(box.left, box.right + 1)
  const spotAt = (r: number, c: number): Spot => ({ row: ordered[r].id, column: columns[c].key })
  const statusAt = (row: Row, column: MatrixColumn) => {
    const value = cellFor(view, row, column)?.fields[join.cell_field]
    return typeof value === 'string' ? value : ''
  }

  useEffect(() => {
    if (toPanel.current) {
      toPanel.current = false
      const drawer = bodyRef.current?.querySelector('.nv-drawer') ?? document.querySelector('.nv-drawer-slot .nv-panel')?.closest('.nv-drawer')
      return void (drawer?.querySelector<HTMLElement>('[role="radio"][tabindex="0"]') ?? drawer?.querySelector<HTMLElement>('.nv-drawer__head button'))?.focus()
    }
    if (!moved.current || !here) return
    moved.current = false
    tableRef.current?.querySelector<HTMLElement>(`[data-cell="${here.r}-${here.c}"]`)?.focus()
  })

  // The panel takes the sheet's right edge: bring the cell back into view before the next click lands.
  useLayoutEffect(() => {
    if (!open || !here) return
    tableRef.current?.querySelector<HTMLElement>(`[data-cell="${here.r}-${here.c}"]`)?.scrollIntoView?.({ block: 'nearest', inline: 'nearest' })
  }, [open])

  /** A double-click's second click that the opening panel moved under the pointer is the double-click, not a pick. */
  const onSecondClick = (event: MouseEvent<HTMLDivElement>) => {
    const inPanel = event.target instanceof Element && event.target.closest('.nv-drawer')
    if (!inPanel || event.detail < 2 || performance.now() - clickedAt.current > 600) return
    event.preventDefault()
    event.stopPropagation()
    if (event.type === 'click' && open?.column) {
      toPanel.current = true
      setOpen({ ...open })
    }
  }

  /** Enter and double-click hand the keyboard to the panel; a click leaves it on the cell. */
  function show(row: number, column: MatrixColumn, focus: boolean): void {
    toPanel.current = focus
    setOpen({ row, column: column.key })
  }

  /** The label keeps the keyboard on a cell: the active one moves to this row, so Escape and the arrows still work. */
  function showRow(r: number, id: number): void {
    // No column, no cell to keep the keyboard on: the panel takes it, so Escape still closes it.
    if (columns.length === 0) {
      toPanel.current = true
      return setOpen({ row: id, column: null })
    }
    moved.current = true
    setAnchor(null)
    setActive(spotAt(r, here?.c ?? 0))
    setOpen({ row: id, column: null })
  }

  function close(): void {
    moved.current = true
    setOpen(null)
  }

  function go(r: number, c: number, extend: boolean): void {
    if (!here) return
    moved.current = true
    if (extend) setAnchor(anchor ?? spotAt(here.r, here.c))
    else setAnchor(null)
    const next = spotAt(clamp(r, ordered.length), clamp(c, columns.length))
    setActive(next)
    // An open cell panel follows the cursor, so it always shows the cell a typed key writes.
    if (open?.column) setOpen({ row: next.row, column: next.column })
  }

  function write(action: Exclude<ReturnType<typeof actionForKey>, null | 'copy' | 'paste'>, at: { r: number; c: number }, box: Rect): void {
    if (!store) return
    const row = ordered[at.r]
    const column = columns[at.c]
    if (action === 'undo') return void store.undo()
    if (action === 'redo') return void store.redo()
    if (action === 'cycle') {
      const order = Object.keys(models[join.model]?.fields[join.cell_field]?.options ?? {})
      if (order.length > 0) void store.set(row.id, column, cycle(order, statusAt(row, column)))
      return
    }
    if (action === 'remove') {
      const ids = rowsIn(box)
      const across = columnsIn(box)
      if (ids.length * across.length === 1) return void store.set(row.id, column, null)
      return void store.paste(ids.map(() => across.map(() => '')), { rows: ids, columns: across })
    }
    if (action === 'fill') {
      const ids = rowsIn(box)
      const across = columnsIn(box)
      if (ids.length < 2) return
      if (across.length === 1) return void store.fillDown(across[0], ids)
      const top = across.map((column) => statusAt(ordered[box.top], column))
      return void store.paste(ids.slice(1).map(() => top), { rows: ids.slice(1), columns: across })
    }
    void store.set(row.id, column, action.status)
  }

  const onKeyDown = (event: KeyboardEvent<HTMLTableElement>) => {
    if (event.target instanceof Element && event.target.closest('td.nv-mx__open')) return onOpenKey(event)
    if (!(event.target instanceof Element) || !event.target.matches('td[data-cell]') || !here || !rect) return
    const ctrl = event.ctrlKey || event.metaKey
    const arrow = ARROWS[event.key]
    if (arrow && !ctrl) {
      event.preventDefault()
      return go(here.r + arrow[0], here.c + arrow[1], event.shiftKey)
    }
    if (event.key === 'Tab') {
      const edge = event.shiftKey ? here.c === 0 : here.c === columns.length - 1
      if (edge) return
      event.preventDefault()
      return go(here.r, here.c + (event.shiftKey ? -1 : 1), false)
    }
    if (event.key === 'Escape') {
      setOpen(null)
      return setAnchor(null)
    }
    if (event.key === 'Enter') {
      event.preventDefault()
      return show(ordered[here.r].id, columns[here.c], true)
    }
    const action = actionForKey(view, event.key, { ctrl, shift: event.shiftKey })
    // Copy and paste come back as the browser's clipboard events.
    if (action === null || action === 'copy' || action === 'paste') return
    event.preventDefault()
    if (editable) write(action, here, rect)
  }

  /** The open column is off the arrow grid: from it only undo and redo. */
  function onOpenKey(event: KeyboardEvent<HTMLTableElement>): void {
    const action = actionForKey(view, event.key, { ctrl: event.ctrlKey || event.metaKey, shift: event.shiftKey })
    if (action !== 'undo' && action !== 'redo') return
    event.preventDefault()
    if (editable && store) void store[action]()
  }

  const onCopy = (event: ClipboardEvent<HTMLTableElement>) => {
    if (!rect) return
    const text = rowsIn(rect).map((id) => {
      const row = ordered.find((r) => r.id === id)!
      return columnsIn(rect).map((column) => statusAt(row, column)).join('\t')
    }).join('\n')
    event.clipboardData.setData('text/plain', text)
    event.preventDefault()
  }

  const onPaste = (event: ClipboardEvent<HTMLTableElement>) => {
    if (!here || !editable || !store) return
    event.preventDefault()
    const at = { rows: ordered.slice(here.r).map((row) => row.id), columns: columns.slice(here.c) }
    void store.paste(blockOf(event.clipboardData.getData('text/plain')), at)
  }

  const stateOf = (r: number, c: number, row: Row, column: MatrixColumn): CellState => ({
    spot: `${r}-${c}`,
    active: here?.r === r && here.c === c,
    selected: rect !== null && r >= rect.top && r <= rect.bottom && c >= rect.left && c <= rect.right,
    open: open?.row === row.id && open.column === column.key,
    split: cellClass(c) !== '',
    focusable: here ? here.r === r && here.c === c : r === 0 && c === 0,
    error: store?.cellError(row.id, column) ?? null,
    onClick: (shift) => {
      moved.current = true
      if (shift && here) {
        setAnchor(anchor ?? spotAt(here.r, here.c))
        setActive(spotAt(r, c))
        return
      }
      setAnchor(null)
      setActive(spotAt(r, c))
      clickedAt.current = performance.now()
      show(row.id, column, false)
    },
    onOpen: () => show(row.id, column, true),
    onFocus: () => {
      if (here?.r !== r || here.c !== c) {
        setAnchor(null)
        setActive(spotAt(r, c))
      }
    },
  })

  const model = models[view.model]
  const dates = useMemo(() => (model ? columnsFor(model, { ...view, columns: undefined, lookups: undefined, rollups: undefined }, false, models).filter((c) => c.kind === 'datetime') : []), [model, view, models])
  const today = iso(new Date())
  const span = columns.length + (hasOpen ? 3 : 2)
  const openRow = open ? rows.find((row) => row.id === open.row) : undefined
  const openColumn = open?.column ? columns.find((column) => column.key === open.column) : undefined
  return (
    <div className="nv-frame">
      <ChipRow scope={scope} filters={filters} group={by?.label} count={rows.length}>
        <button type="button" className="nv-chip" aria-expanded={picking} onClick={() => setPicking(!picking)}>{t('addColumn')}</button>
      </ChipRow>
      {fillRow && (
        <FillPicker key={fillRow.id} row={fillRow} slots={openSlots(view, fillRow)} titles={titles} from={join.open?.options_from} onClose={() => closeFill(fillRow.id)}
          taken={everyColumn.flatMap((column) => (column.id && cellFor(view, fillRow, column) ? [column.id] : []))} onPick={(cell, record) => fill(fillRow, cell, record)} />
      )}
      {picking && <ColumnPicker model={models[join.model]?.fields[join.column_field]?.relation?.model ?? ''} taken={everyColumn.flatMap((c) => (c.id ? [c.id] : []))} onPick={pick}
        columns={everyColumn} hidden={layout.hidden} onToggle={toggle} />}
      {windowRows.length === 0 ? <div className="nv-center"><EmptyState title={emptyTitle} description={emptyHint ?? ''} /></div>
        : rows.length === 0 ? <div className="nv-center"><EmptyState title={t('noRowsMatch')} description="" /></div> : (
      <div className="nv-body" ref={bodyRef} onMouseDownCapture={onSecondClick} onClickCapture={onSecondClick}>
        <div className="nv-scroll nv-mx__scroll">
          <table ref={tableRef} role="grid" aria-label={title ?? view.label} aria-readonly={editable ? undefined : true} onKeyDown={onKeyDown} onCopy={onCopy} onPaste={onPaste}
            className="nv-grid nv-mx" style={{ width: LABEL_WIDTH + (hasOpen ? OPEN_WIDTH : 0) + columns.length * COLUMN_WIDTH + COUNT_WIDTH }}>
            <colgroup>
              <col style={{ width: LABEL_WIDTH }} />
              {hasOpen && <col style={{ width: OPEN_WIDTH }} />}
              {columns.map((column) => <col key={column.key} style={{ width: COLUMN_WIDTH }} />)}
              <col style={{ width: COUNT_WIDTH }} />
            </colgroup>
            <thead className="nv-grid__head">
              <tr>
                <th className="nv-th nv-first" scope="col"><span className="nv-th__label">{model?.label ?? ''}</span></th>
                {hasOpen && <th className="nv-th nv-mx__open" scope="col"><span className="nv-th__label">{t('openColumn')}</span></th>}
                {columns.map((column, c) => (
                  <th key={column.key} className={[`nv-th nv-mx__head`, cellClass(c), open?.column === column.key ? 'nv-mx__cross' : ''].filter(Boolean).join(' ')} scope="col" title={column.title}>
                    <span className="nv-mx__who"><span className="nv-avatar nv-avatar--sm" data-initials={initials(column.title)} aria-hidden="true" /><span className="nv-th__label">{column.title}</span></span>
                  </th>
                ))}
                <th className="nv-th nv-end" scope="col" title={countWord}>
                  <span className="nv-th__label">{markFor(view, join.count)}<span className="nv-sr">{countWord}</span></span>
                </th>
              </tr>
            </thead>
            <tbody>
              {body.map((section) => (
                <Fragment key={section.key}>
                  <tr className="nv-group">
                    <th role="rowheader" colSpan={span}>
                      <span className="nv-sticky nv-group__in">
                        <span className="nv-group__label">{section.day ? <><span className="nv-group__day">{section.day.weekday}</span> <span className="nv-group__date">{section.day.date}</span></> : section.label}</span>
                        <span className="nv-group__count">{section.count}</span>
                        {section.key === today && <span className="nv-mx__today">{t('today').toLocaleLowerCase(locale())}</span>}
                      </span>
                    </th>
                  </tr>
                  {section.rows.map((row) => {
                    const at = grid.findIndex((g) => g.row.id === row.id)
                    const r = ordered.indexOf(row)
                    const date = dateOf(view, row)
                    return (
                      <tr key={row.id} className="nv-tr" data-title={row.title}>
                        <th scope="row" className={open?.row === row.id ? 'nv-td nv-first nv-mx__cross' : 'nv-td nv-first'} onMouseDown={(event) => event.preventDefault()} onClick={() => showRow(r, row.id)}>
                          <span className="nv-mx__rowhead"><Hours row={row} dates={dates} /><span className="nv-cell__title">{row.title}</span></span>
                        </th>
                        {hasOpen && <OpenCell row={row.id} slots={openSlots(view, row)} error={store?.cellError(row.id, OPEN) ?? null} onFill={editable ? () => setFilling(row.id) : undefined} />}
                        {columns.map((column, c) => (
                          <Cell key={column.key} view={view} models={models} cell={grid[at].cells[c]} column={column}
                            away={absentOn(away, view, column, date)} date={date} state={stateOf(r, c, row, column)} />
                        ))}
                        <td role="gridcell" className="nv-td nv-end nv-cell__tabular" data-testid="row-count">{headcount(row)}</td>
                      </tr>
                    )
                  })}
                </Fragment>
              ))}
            </tbody>
            <tfoot className="nv-grid__foot">
              <tr data-testid="total">
                <td className="nv-first">{`${t('total')} · ${rowCount(rows.length)}`}</td>
                {hasOpen && <td className="nv-mx__open nv-cell__tabular" data-testid="open-count">{openTotal}</td>}
                {perColumn.map((n, c) => <td key={columns[c].key} className={`nv-mx__count ${cellClass(c)}`.trim()} data-testid="column-count">{n}</td>)}
                <td className="nv-end" data-testid="row-count">{total}</td>
              </tr>
            </tfoot>
          </table>
        </div>
        {openRow && (open?.column === null || openColumn) && (
          <PanelDrawer view={view} models={models} row={openRow} column={openColumn ?? null} columns={columns} away={away}
            store={editable ? store : undefined} onClose={close} />
        )}
      </div>
      )}
    </div>
  )
}

/** The grid's drawer with the panel in its editor slot: a cell's join record, or the row read whole. */
function PanelDrawer({ onClose, ...panel }: Parameters<typeof Panel>[0] & { onClose: () => void }) {
  const { view, models, row, column, columns } = panel
  const fields = useMemo(() => {
    const model = models[view.model]
    if (!model || column) return []
    // A row carries its table's lookups; a relation without one has no title and would read as empty.
    return columnsFor(model, { ...view, columns: undefined, lookups: undefined, rollups: undefined }, false, models)
      .filter((field) => field.kind !== 'relation' || row.lookups?.[field.id] !== undefined)
  }, [models, view, column, row])
  const cell = column ? cellFor(view, row, column) : undefined
  const at = column ? columns.indexOf(column) : -1
  const shown: Row = column
    ? { id: cell?.id ?? -(row.id * 1000000 + at), title: column.title, status: cell?.status ?? '', fields: cell?.fields ?? {} }
    : row
  return (
    <Drawer row={shown} columns={fields} focusOnOpen={false} onClose={onClose}
      editor={<Panel key={`${row.id}:${column?.key ?? ''}`} {...panel} />} />
  )
}
