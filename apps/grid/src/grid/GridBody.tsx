import { Fragment, type KeyboardEvent } from 'react'
import { t } from '../i18n'
import type { Row } from '../types'
import { Display, Editor } from './cells'
import type { Pick } from './cells/RelationPicker'
import type { Column } from './columns'
import { type Fact, type Group, sums } from './group'
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
  /** The keys of the groups folded away. */
  shut: Set<string>
  onFold: (key: string) => void
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

function FactText({ fact }: { fact: Fact }) {
  if (fact.kind === 'first') return <span className="nv-group__fact"><i aria-hidden="true">●</i> {fact.label} <span className="nv-group__num">{fact.value}</span></span>
  return <span className="nv-group__fact"><span className="nv-group__num">{fact.value}</span> {fact.label}</span>
}

function Band({ group, columns, open, onFold }: { group: Group; columns: Column[]; open: boolean; onFold: () => void }) {
  const totals = sums(group.rows, columns)
  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key !== 'Enter' && event.key !== ' ') return
    event.preventDefault()
    onFold()
  }
  return (
    <tr className="nv-group nv-group--fold" tabIndex={0} aria-expanded={open} onClick={onFold} onKeyDown={onKeyDown}>
      <th role="rowheader" colSpan={columns.length}>
        <span className="nv-group__in">
          <span className="nv-group__chevron" aria-hidden="true">
            <svg viewBox="0 0 16 16" width="12" height="12"><path d="M6 4l4 4-4 4" /></svg>
          </span>
          <span className="nv-group__label">{group.label}</span>
          <span className="nv-group__count">{group.count}</span>
          {group.facts.map((fact) => <FactText key={`${fact.kind}:${fact.label}`} fact={fact} />)}
          {Object.keys(totals).length > 0 && (
            <span className="nv-group__totals">
              {columns.filter((c) => c.id in totals).map((c) => (
                <span key={c.id} className="nv-group__total">{c.label} <span className="nv-group__num">{totals[c.id]}</span></span>
              ))}
            </span>
          )}
        </span>
      </th>
    </tr>
  )
}

export function GridBody({ groups, shut, onFold, columns, keys, errors, actions, emptyText }: Props) {
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
          {group.label !== '' && <Band group={group} columns={columns} open={!shut.has(group.key)} onFold={() => onFold(group.key)} />}
          {!shut.has(group.key) && group.rows.map((row) => {
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
        </Fragment>
      ))}
    </tbody>
  )
}
