import { SidebarItem } from '@sakaniui/react'
import { Rows3 } from 'lucide-react'
import type { ReactNode } from 'react'
import { t } from '../i18n'
import { RailFoot } from './RailFoot'
import { type Table, tableOf } from './tables'
import { type ViewActions, ViewList } from './ViewList'

interface Props {
  tables: Table[]
  /** The active view's key. */
  active: string | undefined
  onSelect: (viewKey: string) => void
  /** A click on another table; without it, the table's first view opens. */
  onTable?: (table: Table) => void
  /** The space selector, when the site works inside one: its tables go under it, the rest under General. */
  space?: ReactNode
  /** "+ View" in the active table's list. */
  onNewView?: () => void
  /** Each view's ⋯ and its rename in place. */
  actions?: ViewActions
}

function TableList({ tables, current, onTable }: { tables: Table[]; current: Table | undefined; onTable: (table: Table) => void }) {
  return (
    <div className="nv-rail__views">
      {tables.map((table) => (
        <SidebarItem
          key={table.key}
          icon={Rows3}
          label={table.label}
          active={table === current}
          activeIndicator={false}
          onClick={() => table !== current && onTable(table)}
        />
      ))}
    </div>
  )
}

export function Rail({ tables, active, onSelect, onTable = (table) => onSelect(table.views[0].key), space, onNewView, actions }: Props) {
  const current = tableOf(tables, active)
  const views = <ViewList table={current} active={active} onSelect={onSelect} onNew={onNewView} actions={actions} />
  if (!space) {
    return (
      <nav className="nv-rail" aria-label={t('views')}>
        <h2 className="nv-rail__label">{t('views')}</h2>
        <TableList tables={tables} current={current} onTable={onTable} />
        {views}
        <RailFoot />
      </nav>
    )
  }

  const global = tables.filter((table) => table.space === 'global')
  return (
    <nav className="nv-rail" aria-label={t('views')}>
      {space}
      <TableList tables={tables.filter((table) => table.space === 'scoped')} current={current} onTable={onTable} />
      {global.length > 0 && (
        <div className="nv-rail__section" role="group" aria-label={t('general')}>
          <p className="nv-rail__label" aria-hidden="true">{t('general')}</p>
          <TableList tables={global} current={current} onTable={onTable} />
        </div>
      )}
      {views}
      <RailFoot />
    </nav>
  )
}
