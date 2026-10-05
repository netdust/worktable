import type { Header, Table } from '@tanstack/react-table'
import type { Row } from '../types'
import type { Column } from './columns'

const ARROW = { asc: ' ↑', desc: ' ↓' } as const
const ARIA_SORT = { asc: 'ascending', desc: 'descending' } as const

function HeaderCell({ header, column, first }: { header: Header<Row, unknown>; column: Column; first: boolean }) {
  const sorted = header.column.getIsSorted()
  return (
    <th
      data-column={column.id}
      className={['nv-th', first ? 'nv-first' : '', column.align === 'end' ? 'nv-end' : ''].filter(Boolean).join(' ')}
      style={{ width: header.getSize() }}
      aria-sort={sorted ? ARIA_SORT[sorted] : undefined}
    >
      <button type="button" className="nv-th__sort" onClick={header.column.getToggleSortingHandler()}>
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
          {group.headers.map((header, i) => (
            <HeaderCell key={header.id} header={header} column={byId.get(header.column.id)!} first={i === 0} />
          ))}
        </tr>
      ))}
    </thead>
  )
}
