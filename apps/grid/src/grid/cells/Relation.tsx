import { createContext, useContext } from 'react'
import { Button } from 'react-aria-components'
import { t } from '../../i18n'
import type { Model, Row, Scope } from '../../types'
import { firstId } from '../columns'
import type { CellProps, EditorProps } from './props'
import { RelationPicker } from './RelationPicker'

/** What a picker needs beyond its cell: the related models, and the space whose records it lists first. */
export const RelationContext = createContext<{
  models: Record<string, Model>; scope: Scope | null; spaceModel: string | null
  openRelated?: (model: string, id: number) => void
}>({ models: {}, scope: null, spaceModel: null })

export function RelationCell({ column, row }: CellProps) {
  const { models, openRelated } = useContext(RelationContext)
  const target = column.relation?.model
  const id = Number(column.edit(row))
  const title = column.text(row)
  const openable = openRelated && target && target in models && id > 0 && title !== ''
  return (
    <>
      <span className="nv-cell__text">{title}</span>
      {openable && (
        <Button className="nv-related" aria-label={t('openRecord', { title })} onPress={() => openRelated(target, id)}>
          <svg viewBox="0 0 16 16" width="12" height="12" aria-hidden="true"><path d="M6 3h7v7M13 3 5 11" fill="none" stroke="currentColor" strokeWidth="1.5" /></svg>
        </Button>
      )}
    </>
  )
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
