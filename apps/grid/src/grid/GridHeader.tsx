import type { Header, Table } from '@tanstack/react-table'
import {
  Calendar, CalendarClock, Clock, CornerDownRight, Hash, Link2, List, type LucideIcon, Sigma, SquareCheck, Tag, TextAlignStart, Type,
} from 'lucide-react'
import type { Row } from '../types'
import type { CellKind, Column } from './columns'

const ICON: Record<CellKind, LucideIcon> = {
  title: Type, text: Type, longtext: TextAlignStart, select: Tag, date: Calendar, datetime: CalendarClock, time: Clock,
  relation: Link2, bool: SquareCheck, number: Hash, lookup: CornerDownRight, rollup: Sigma, other: List,
}

const ARROW = { asc: ' ↑', desc: ' ↓' } as const
const ARIA_SORT = { asc: 'ascending', desc: 'descending' } as const

function HeaderCell({ header, column, first }: { header: Header<Row, unknown>; column: Column; first: boolean }) {
  const sorted = header.column.getIsSorted()
  const Icon = ICON[column.kind]
  return (
    <th
      data-column={column.id}
      className={['nv-th', first ? 'nv-first' : '', column.align === 'end' ? 'nv-end' : ''].filter(Boolean).join(' ')}
      style={{ width: header.getSize() }}
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

export function GridHeader({ table, byId }: { table: Table<Row>; byId: Map<string, Column> }) {
  return (
    <thead className="nv-grid__head">
      {table.getHeaderGroups().map((group) => (
        <tr key={group.id}>
          <th className="nv-th nv-num" aria-hidden="true">#</th>
          {group.headers.map((header, i) => (
            <HeaderCell key={header.id} header={header} column={byId.get(header.column.id)!} first={i === 0} />
          ))}
        </tr>
      ))}
    </thead>
  )
}
