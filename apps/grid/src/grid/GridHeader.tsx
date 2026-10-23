import type { Header, Table } from '@tanstack/react-table'
import {
  Calendar, CalendarClock, Clock, CornerDownRight, Hash, Link2, List, type LucideIcon, Sigma, SquareCheck, Tag, TextAlignStart, Type, Users,
} from 'lucide-react'
import { t } from '../i18n'
import type { Row } from '../types'
import type { CellKind, Column } from './columns'

/** A column's kind as an icon: the header's, and the drawer's beside each label. */
export const ICON: Record<CellKind, LucideIcon> = {
  title: Type, text: Type, longtext: TextAlignStart, select: Tag, date: Calendar, datetime: CalendarClock, time: Clock,
  relation: Link2, bool: SquareCheck, number: Hash, lookup: CornerDownRight, rollup: Sigma, links: Users, other: List,
}

/** The row-number column's width: fixed, so the table's stretch goes to the data columns. */
export const NUMBER_WIDTH = 44

/** With the row box beside the number, three digits fit. */
export const SELECT_WIDTH = 68

const ARROW = { asc: ' ↑', desc: ' ↓' } as const
const ARIA_SORT = { asc: 'ascending', desc: 'descending' } as const

function HeaderCell({ header, column, first, last }: { header: Header<Row, unknown>; column: Column; first: boolean; last: boolean }) {
  const sorted = header.column.getIsSorted()
  const Icon = ICON[column.kind]
  return (
    <th
      data-column={column.id}
      className={['nv-th', first ? 'nv-first' : '', column.align === 'end' ? 'nv-end' : '', sorted ? 'nv-th--sorted' : ''].filter(Boolean).join(' ')}
      style={last ? undefined : { width: header.getSize() }}
      aria-sort={sorted ? ARIA_SORT[sorted] : undefined}
    >
      <button type="button" className="nv-th__sort" onClick={header.column.getToggleSortingHandler()}>
        <Icon className="nv-th__icon" size={13} aria-hidden="true" />
        {column.label}
        {sorted && <span aria-hidden="true">{ARROW[sorted]}</span>}
      </button>
      <span className="nv-th__resize" aria-hidden="true" onMouseDown={header.getResizeHandler()} onTouchStart={header.getResizeHandler()} />
    </th>
  )
}

/** The header box of a selectable table: all of the view's rows, some, or none. */
export interface HeaderSelection {
  all: boolean
  some: boolean
  onToggle: () => void
}

export function GridHeader({ table, byId, selection, numberWidth = NUMBER_WIDTH }: { table: Table<Row>; byId: Map<string, Column>; selection?: HeaderSelection; numberWidth?: number }) {
  return (
    <>
    <colgroup>
      <col style={{ width: numberWidth }} />
      {/* The last column takes what the sheet adds beyond the columns' widths; the others keep theirs. */}
      {table.getVisibleLeafColumns().map((column, i, all) => <col key={column.id} style={i === all.length - 1 ? undefined : { width: column.getSize() }} />)}
    </colgroup>
    <thead className="nv-grid__head">
      {table.getHeaderGroups().map((group) => (
        <tr key={group.id}>
          {selection ? (
            <th className="nv-th nv-num">
              <input type="checkbox" aria-label={t('selectAll')} checked={selection.all} onChange={selection.onToggle}
                ref={(box) => { if (box) box.indeterminate = selection.some && !selection.all }} />
            </th>
          ) : <th className="nv-th nv-num" aria-hidden="true">#</th>}
          {group.headers.map((header, i) => (
            <HeaderCell key={header.id} header={header} column={byId.get(header.column.id)!} first={i === 0} last={i === group.headers.length - 1} />
          ))}
        </tr>
      ))}
    </thead>
    </>
  )
}
