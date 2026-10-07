import { rowCount, t } from '../i18n'
import type { Column } from './columns'

/** R10's foot: the count, and a sum under every number. */
export function GridFoot({ columns, count, sums }: { columns: Column[]; count: number; sums: Record<string, number> }) {
  return (
    <tfoot className="nv-grid__foot">
      <tr data-testid="total">
        <td className="nv-num" aria-hidden="true" />
        {columns.map((column, i) => (
          <td key={column.id} className={[i === 0 ? 'nv-first' : '', column.align === 'end' ? 'nv-end' : ''].filter(Boolean).join(' ')}>
            {i === 0 ? `${t('total')} · ${rowCount(count)}` : column.id in sums ? String(sums[column.id]) : ''}
          </td>
        ))}
      </tr>
    </tfoot>
  )
}
