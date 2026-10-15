import { DndContext, DragOverlay } from '@dnd-kit/core'
import { useEffect, useMemo } from 'react'
import { createPortal } from 'react-dom'
import { columnsFor } from '../grid/columns'
import type { Layout } from '../grid/layout'
import { useOpenRow } from '../grid/useOpenRow'
import { locale, t } from '../i18n'
import type { Field, Model, Row, View } from '../types'
import { factsOf } from '../ui/facts'
import { toneColor } from '../ui/tone'
import type { Shown } from '../ui/Toolbar'
import { useTones } from '../ui/useTones'
import './board.css'
import { CardFace, type TonedLine } from './Card'
import { Column } from './Column'
import type { Drop } from './drop'
import { byRank } from './rank'
import { type BoardLane, useBoardDrag } from './useBoardDrag'

const NONE = '\u0000'

interface Props {
  view: View
  model: Model
  models: Record<string, Model>
  rows: Row[]
  column: string
  /** Which facts a card shows, and in what order (Kolommen); its sort says whether the board is in manual order. */
  layout: Layout
  /** What the title line says it shows: the cards and the columns. */
  onShown?: (shown: Shown) => void
  /** A card dropped: its writes, answering whether the card's own landed. Absent where the board cannot write: nothing drags. */
  onDrop?: (drop: Exclude<Drop, { kind: 'none' }>, id: number) => Promise<boolean>
  /** A within-column drop on a sorted board switches the view to manual order. */
  onLayout?: (next: Layout) => void
  /** A column head's +: a new record with that column's value. */
  onCreate?: (preset: Record<string, unknown>) => void
}

/** A column per option of the board's column, in its order, "Geen" last when it holds a card; a manual board orders each by rank. */
function lanesOf(rows: Row[], column: string, field: Field | undefined, manual: boolean): BoardLane[] {
  const keyOf = (row: Row) => {
    const value = row.fields[column]
    return typeof value === 'string' && field?.options && value in field.options ? value : NONE
  }
  const ordered = manual ? rows.toSorted(byRank) : rows
  return [...Object.entries(field?.options ?? {}).map(([key, label]) => ({ key, label, value: key as string | null })), { key: NONE, label: t('noLane'), value: null }]
    .map((lane) => ({ ...lane, cards: ordered.filter((row) => keyOf(row) === lane.key) }))
    .filter((lane) => lane.key !== NONE || lane.cards.length > 0)
}

/** Cards in a column per option of the board's column; a card opens its row, and drags to its place in any column. */
export function Board({ view, model, models, rows, column, layout, onShown, onDrop, onLayout, onCreate }: Props) {
  const [openRow, drawer, open] = useOpenRow(model, view, models, rows, layout)
  const field = model.fields[column]
  const all = useMemo(() => columnsFor(model, view, false, models), [model, view, models])
  // The card shows the facts Kolommen leaves, in its order; the column the board sorts by needs no line.
  const shown = useMemo(() => factsOf(all, layout).filter((c) => c.id !== column), [all, layout, column])
  // The first line naming a record of a toned dataset carries that record's tone, as the prototype's production tag.
  const line = shown.find((c) => c.kind === 'relation' && models[c.relation?.model ?? '']?.tone)
  const tones = useTones(models, line?.relation?.model)
  const toned: TonedLine | undefined = useMemo(() => (line && tones ? { column: line.id, tones } : undefined), [line, tones])
  const manual = layout.sort[0]?.id === 'position'
  const lanes = useMemo(() => lanesOf(rows, column, field, manual), [rows, column, field, manual])
  const drag = useBoardDrag({ lanes, manual, layout, onDrop, onLayout })
  useEffect(() => onShown?.({ rows: rows.length, groups: null, cut: false, columns: lanes.length, menu: all }), [rows.length, lanes.length, all])
  const none = t('noneOf', { label: model.label.toLocaleLowerCase(locale()) })
  return (
    <div className="nv-frame">
      <div className="nv-body">
        <div className="nv-board" ref={drag.root}>
          <DndContext {...drag.context}>
            {drag.shown.map((lane) => (
              <Column key={lane.key} lane={lane} tone={toneColor(field?.tones?.[lane.key])} columns={shown} toned={toned} none={none} open={open} drags={onDrop !== undefined}
                look={drag.lookOf(lane.key)} onOpen={openRow} onCreate={onCreate ? () => onCreate(lane.value === null ? {} : { [column]: lane.value }) : undefined} />
            ))}
            {/* In #root, where the theme's tokens live; fixed above every column. */}
            {createPortal(
              <DragOverlay dropAnimation={null}>
                {drag.lifted && <div className="nv-board__card nv-board__card--lifted"><CardFace row={drag.lifted} columns={shown} toned={toned} /></div>}
              </DragOverlay>,
              document.getElementById('root') ?? document.body,
            )}
          </DndContext>
        </div>
        {drawer}
      </div>
    </div>
  )
}
