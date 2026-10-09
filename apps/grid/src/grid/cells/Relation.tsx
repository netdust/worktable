import { createContext, useContext } from 'react'
import { t } from '../../i18n'
import type { Model, Row, Scope } from '../../types'
import { type Column, firstId } from '../columns'
import type { CellProps, EditorProps } from './props'
import { RelationPicker } from './RelationPicker'

/** What a picker needs beyond its cell: the related models, and the space whose records it lists first. */
export const RelationContext = createContext<{
  models: Record<string, Model>; scope: Scope | null; spaceModel: string | null
  openRelated?: (model: string, id: number) => void
}>({ models: {}, scope: null, spaceModel: null })

/**
 * The open button joins the tab order only on the active cell, as the grid's roving focus has it.
 * A plain button, as the title's Openen is: one sits in every filled cell, and a React Aria Button there doubled what each render of the sheet costs.
 * A double-click on it opens the record once and never reaches the cell, which would open its editor.
 */
export function RelationCell({ column, row, active = false }: CellProps & { active?: boolean }) {
  const { models, openRelated } = useContext(RelationContext)
  const title = column.text(row)
  const related = openRelated && relatedOf(column, row, models)
  return (
    <>
      <span className="nv-cell__text">{title}</span>
      {related && (
        <button type="button" className="nv-related" tabIndex={active ? 0 : -1} aria-label={t('openRecord', { title })} onClick={(event) => {
          event.stopPropagation()
          if (event.detail < 2) openRelated(related.target, related.id)
        }} onDoubleClick={(event) => event.stopPropagation()}>
          <svg viewBox="0 0 16 16" width="12" height="12" aria-hidden="true"><path d="M6 3h7v7M13 3 5 11" fill="none" stroke="currentColor" strokeWidth="1.5" /></svg>
        </button>
      )}
    </>
  )
}

/** The record a filled to-one cell points at, when its model is one this user may read. */
export function relatedOf(column: Column, row: Row, models: Record<string, Model>): { target: string; id: number } | null {
  const target = column.relation?.model
  const id = Number(column.edit(row))
  return column.kind === 'relation' && target && target in models && id > 0 && column.text(row) !== '' ? { target, id } : null
}

function holds(value: unknown, id: number): boolean {
  return (Array.isArray(value) ? value : [value]).map((v) => firstId(v)).includes(String(id))
}

export function RelationEditor({ column, row, editing, onCommit, onPick, onCancel, onClose }: EditorProps) {
  const { models, scope, spaceModel } = useContext(RelationContext)
  const target = column.relation?.model ?? ''
  const via = scope ? models[target]?.fields[scope.field] : undefined
  const scoped = scope !== null && via?.type === 'relation' && via.relation?.model === spaceModel

  return (
    <>
      <span className="nv-cell__text">{column.text(row)}</span>
      <RelationPicker
        model={target}
        label={column.label}
        query={editing.mode === 'enter' ? editing.draft : ''}
        first={scoped ? (record: Row) => holds(record.fields[scope.field], scope.id) : undefined}
        onPick={onPick}
        onCancel={onCancel}
        onClose={onClose}
        onClear={column.required ? undefined : () => onCommit('', 'stay')}
      />
    </>
  )
}
