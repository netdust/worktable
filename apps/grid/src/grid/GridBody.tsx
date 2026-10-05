import { Fragment } from 'react'
import { rowCount, t } from '../i18n'
import type { Row } from '../types'
import { Display, Editor } from './cells'
import type { Pick } from './cells/RelationPicker'
import type { Column } from './columns'
import type { Group } from './group'
import type { Cell, KeyState, Move } from './keys'
import { cellKey, type CellError, DRAFT } from './store'

export interface BodyActions {
  click: (cell: Cell) => void
  dblclick: (cell: Cell) => void
  draft: (value: string) => void
  commit: (value: string, move: Move) => void
  leave: () => void
  toggle: (cell: Cell) => void
  pick: (row: Row, how: Pick) => void
  cancel: () => void
  close: () => void
  open: (id: number) => void
  dismiss: (id: number, field: string) => void
}

interface Props {
  groups: Group[]
  columns: Column[]
  keys: KeyState
  errors: Record<string, CellError>
  actions: BodyActions
  emptyText: string | null
}

function GridCell({ row, column, cell, keys, error, actions }: {
  row: Row; column: Column; cell: Cell; keys: KeyState; error: CellError | undefined; actions: BodyActions
}) {
  const active = keys.active?.row === cell.row && keys.active.col === cell.col
  const editing = active && keys.editing !== null
  const className = [
    'nv-td', cell.col === 0 ? 'nv-first' : '', column.align === 'end' ? 'nv-end' : '',
    active ? 'nv-td--active' : '', editing ? 'nv-td--editing' : '', error ? 'nv-td--error' : '',
  ].filter(Boolean).join(' ')

  return (
    <td
      role="gridcell"
      data-cell={`${cell.row}-${cell.col}`}
      className={className}
      tabIndex={active ? 0 : -1}
      aria-selected={active}
      aria-readonly={column.editable ? undefined : true}
      aria-invalid={error ? true : undefined}
      onClick={() => actions.click(cell)}
      onDoubleClick={() => actions.dblclick(cell)}
    >
      {editing && keys.editing ? (
        <Editor column={column} row={row} editing={keys.editing} onDraft={actions.draft} onCommit={actions.commit} onLeave={actions.leave}
          onPick={actions.pick} onCancel={actions.cancel} onClose={actions.close} />
      ) : (
        <Display column={column} row={row} onToggle={() => actions.toggle(cell)} />
      )}
      {column.required && column.editable && !editing && column.text(row) === '' && (
        <span className="nv-td__missing" title={t('required')}><span className="nv-sr">{t('required')}</span></span>
      )}
      {column.id === 'title' && row.id !== DRAFT && (
        <button type="button" className="nv-open" tabIndex={keys.active?.row === cell.row ? 0 : -1} onClick={(event) => {
          event.stopPropagation()
          actions.open(row.id)
        }}>
          {t('open')}
        </button>
      )}
      {error && (
        <span className="nv-td__error" role="alert">
          {error.message}
          <button type="button" onClick={(event) => {
            event.stopPropagation()
            actions.dismiss(error.id, error.field)
          }}>
            {t('dismiss')}
          </button>
        </span>
      )}
    </td>
  )
}

export function GridBody({ groups, columns, keys, errors, actions, emptyText }: Props) {
  let index = 0
  return (
    <tbody>
      {emptyText && (
        <tr>
          <td className="nv-first nv-td--empty" colSpan={columns.length}>{emptyText}</td>
        </tr>
      )}
      {groups.map((group) => (
        <Fragment key={group.key}>
          {group.label !== '' && (
            <tr className="nv-group">
              <th role="rowheader" colSpan={columns.length}><span className="nv-sticky">{group.label}</span></th>
            </tr>
          )}
          {group.rows.map((row) => {
            const r = index++
            return (
              <tr key={row.id} data-title={row.title} className={row.id === DRAFT ? 'nv-tr nv-tr--draft' : 'nv-tr'}>
                {columns.map((column, c) => (
                  <GridCell key={column.id} row={row} column={column} cell={{ row: r, col: c }} keys={keys}
                    error={column.field ? errors[cellKey(row.id, column.field)] : undefined} actions={actions} />
                ))}
              </tr>
            )
          })}
          {group.label !== '' && (
            <tr className="nv-groupfoot">
              <td colSpan={columns.length} data-testid="group-foot"><span className="nv-sticky">{rowCount(group.count)}</span></td>
            </tr>
          )}
        </Fragment>
      ))}
    </tbody>
  )
}
