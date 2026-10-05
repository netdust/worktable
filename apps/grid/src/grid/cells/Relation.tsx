import { createContext, useContext } from 'react'
import type { Model, Row, Scope } from '../../types'
import { firstId } from '../columns'
import type { CellProps, EditorProps } from './props'
import { RelationPicker } from './RelationPicker'

/** What a picker needs beyond its cell: the related models, and the space whose records it lists first. */
export const RelationContext = createContext<{ models: Record<string, Model>; scope: Scope | null; spaceModel: string | null }>({
  models: {}, scope: null, spaceModel: null,
})

export function RelationCell({ column, row }: CellProps) {
  return <span className="nv-cell__text">{column.text(row)}</span>
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
      <RelationCell column={column} row={row} />
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
