import { useDroppable } from '@dnd-kit/core'
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { Plus } from 'lucide-react'
import type { CSSProperties } from 'react'
import type { Column as Fact } from '../grid/columns'
import { t } from '../i18n'
import type { Row } from '../types'
import { Card, type Look } from './Card'
import { type BoardLane, laneId } from './useBoardDrag'

/** What a drag draws in a column: its own card's look, the tint of a target column, and the slot a card lands in there. */
export interface ColumnLook {
  dragged: { id: number; look: Look } | null
  tint: boolean
  slot: { index: number; height: number } | null
}

/** One column: its head with the count and +, and its cards in the board's order, sortable where the board writes. */
export function Column({ lane, tone, columns, none, open, drags, look, onOpen, onCreate }: {
  lane: BoardLane; tone: string; columns: Fact[]; none: string; open: Row | null; drags: boolean; look: ColumnLook | null
  onOpen: (row: Row) => void
  onCreate?: () => void
}) {
  const { setNodeRef } = useDroppable({ id: laneId(lane.key), data: { lane: lane.key } })
  const slot = look?.slot ?? null
  const cards = lane.cards.map((row) => (
    <Card key={`${row.id}:${lane.key}`} row={row} columns={columns} lane={lane.key} drags={drags} open={open?.id === row.id}
      look={look?.dragged?.id === row.id ? look.dragged.look : null} onOpen={onOpen} />
  ))
  if (slot) cards.splice(slot.index, 0, <div key="slot" className="nv-board__slot" style={{ height: slot.height }} aria-hidden="true">{lane.label}</div>)
  return (
    <section ref={setNodeRef} className={look?.tint ? 'nv-board__column nv-board__column--drop' : 'nv-board__column'} aria-label={lane.label}>
      <header className="nv-board__head">
        <span className="nv-board__name" style={{ '--tone': tone } as CSSProperties}>{lane.label}</span>
        <span className="nv-board__count">{lane.cards.length}</span>
        {onCreate && (
          <button type="button" className="nv-board__new" aria-label={t('newIn', { label: lane.label })} title={t('newIn', { label: lane.label })} onClick={onCreate}>
            <Plus size={14} aria-hidden="true" />
          </button>
        )}
      </header>
      <div className="nv-board__list" data-lane={lane.key}>
        <SortableContext id={lane.key} items={lane.cards.map((row) => row.id)} strategy={verticalListSortingStrategy}>
          {cards}
        </SortableContext>
        {cards.length === 0 && <span className="nv-board__empty">{none}</span>}
      </div>
    </section>
  )
}
