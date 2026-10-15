import { Plus } from 'lucide-react'
import { type CSSProperties, useEffect, useMemo, useRef } from 'react'
import { type DropItem, isTextDropItem } from 'react-aria'
import { Button, DropIndicator, GridList, GridListItem, useDragAndDrop } from 'react-aria-components'
import { Display } from '../grid/cells'
import { isOpen } from '../grid/cells/Links'
import { type Column, columnsFor, linksOf } from '../grid/columns'
import type { Layout } from '../grid/layout'
import { useOpenRow } from '../grid/useOpenRow'
import { locale, t } from '../i18n'
import type { Model, Row, View } from '../types'
import { factsOf } from '../ui/facts'
import { hueOf, toneColor } from '../ui/tone'
import type { Shown } from '../ui/Toolbar'
import { initials, whenOf } from '../ui/when'

const NONE = '\u0000'
const MAX_FACES = 4
const ROW = 'application/x-worktable-row'

const noToggle = () => undefined

/** The prototype's card: its kind, title, day and hours, its facts (an inherited one in italics), and its people with the open places. */
function Card({ row, columns }: { row: Row; columns: Column[] }) {
  const kind = columns.find((c) => c.kind === 'select')
  const dates = columns.filter((c) => c.kind === 'date' || c.kind === 'datetime')
  const people = columns.find((c) => c.kind === 'links')
  const facts = columns.filter((c) => c !== kind && c !== people && !dates.includes(c) && c.text(row) !== '' && c.text(row) !== row.title)
  const when = whenOf(row, dates)
  const links = people ? linksOf(row, people.field ?? people.id) : []
  const faces = links.filter((f) => !isOpen(f))
  const open = links.filter(isOpen).length
  return (
    <div className="nv-board__card">
      {kind && kind.text(row) && <span className="nv-board__kind"><Display column={kind} row={row} onToggle={noToggle} /></span>}
      <b className="nv-board__title">{row.title}</b>
      {(when.day || when.from || dates.length > 0) && (
        <span className="nv-board__when">
          {when.day && <span className="nv-board__day">{when.day}</span>}
          {when.from ? <span className="nv-time">{when.from}{when.to && <span className="nv-time__end">–{when.to}</span>}</span> : <span className="nv-board__untimed">{t('noTime')}</span>}
        </span>
      )}
      {facts.map((c) => <span key={c.id} className="nv-board__fact"><Display column={c} row={row} onToggle={noToggle} /></span>)}
      {(faces.length > 0 || open > 0) && (
        <span className="nv-board__faces" aria-label={faces.map((f) => f.title).join(', ')}>
          {faces.slice(0, MAX_FACES).map((f) => (
            <span key={f.id} className="nv-avatar nv-avatar--sm nv-avatar--hue" style={{ '--h': hueOf(f.target ?? f.id) } as CSSProperties} title={f.title} aria-hidden="true">{initials(f.title)}</span>
          ))}
          {open > 0 && <span className="nv-avatar nv-avatar--sm nv-avatar--open" title={t('openPlace')} aria-hidden="true">+</span>}
          {faces.length > MAX_FACES && <span className="nv-board__more" aria-hidden="true">+{faces.length - MAX_FACES}</span>}
        </span>
      )}
    </div>
  )
}

interface Lane {
  key: string
  label: string
}

/** One column: its head with the count and +, its cards in the view's order, and the drop that moves a card into it. */
function BoardColumn({ lane, cards, tone, columns, none, open, dragging, onOpen, onMove, onCreate }: {
  lane: Lane; cards: Row[]; tone: string; columns: Column[]; none: string; open: Row | null
  /** The column a card is being dragged from, shared by the board's columns; null when nothing drags, or the board does not. */
  dragging: { current: string | null } | null
  onOpen: (row: Row) => void
  onMove: (id: number, key: string) => void
  onCreate?: (key: string) => void
}) {
  const drop = async (items: DropItem[]) => {
    for (const item of items) if (isTextDropItem(item)) onMove(Number(await item.getText(ROW)), lane.key)
  }
  const { dragAndDropHooks } = useDragAndDrop({
    getItems: (keys) => [...keys].map((key) => ({ [ROW]: String(key), 'text/plain': cards.find((r) => r.id === key)?.title ?? '' })),
    acceptedDragTypes: [ROW],
    onDragStart: () => dragging && (dragging.current = lane.key),
    onDragEnd: () => dragging && (dragging.current = null),
    // A card lands in another column; the order inside one is the view's sort, so a column never takes its own.
    getDropOperation: () => (dragging?.current !== null && dragging?.current !== lane.key ? 'move' : 'cancel'),
    onRootDrop: (event) => drop(event.items),
    onInsert: (event) => drop(event.items),
    onItemDrop: (event) => drop(event.items),
    renderDropIndicator: (target) => <DropIndicator target={target} className="nv-board__slot">{lane.label}</DropIndicator>,
    renderDragPreview: (items) => <div className="nv-board__card nv-board__card--lifted">{items[0]?.['text/plain']}</div>,
  })
  return (
    <section className="nv-board__column" aria-label={lane.label}>
      <header className="nv-board__head">
        <span className="nv-board__name" style={{ '--tone': tone } as CSSProperties}>{lane.label}</span>
        <span className="nv-board__count">{cards.length}</span>
        {onCreate && (
          <button type="button" className="nv-board__new" aria-label={t('newIn', { label: lane.label })} title={t('newIn', { label: lane.label })} onClick={() => onCreate(lane.key)}>
            <Plus size={14} aria-hidden="true" />
          </button>
        )}
      </header>
      <GridList aria-label={lane.label} className="nv-board__list" items={cards} dependencies={[columns, open]} dragAndDropHooks={dragging ? dragAndDropHooks : undefined}
        onAction={(key) => {
          const row = cards.find((r) => r.id === key)
          if (row) onOpen(row)
        }}
        renderEmptyState={() => <span className="nv-board__empty">{none}</span>}>
        {(row) => (
          <GridListItem id={row.id} textValue={row.title || t('openPlace')} className={open?.id === row.id ? 'nv-board__item nv-board__item--open' : 'nv-board__item'}>
            {dragging && <Button slot="drag" className="nv-board__grip" aria-label={t('dragCard', { title: row.title || t('openPlace') })}>⠿</Button>}
            <Card row={row} columns={columns} />
          </GridListItem>
        )}
      </GridList>
    </section>
  )
}

interface Props {
  view: View
  model: Model
  models: Record<string, Model>
  rows: Row[]
  column: string
  /** Which facts a card shows, and in what order (Kolommen). */
  layout: Layout
  /** What the title line says it shows: the cards and the columns. */
  onShown?: (shown: Shown) => void
  /** A card dropped in another column: its column's value written, as any edit. Absent where the board cannot write it. */
  onMove?: (id: number, field: string, value: string | null) => void
  /** A column head's +: a new record with that column's value. */
  onCreate?: (preset: Record<string, unknown>) => void
}

/** Cards in a column per option of the board's column, in its order, "Geen" last when it holds a card; a card opens its row, and drags to another column. */
export function Board({ view, model, models, rows, column, layout, onShown, onMove, onCreate }: Props) {
  const [openRow, drawer, open] = useOpenRow(model, view, models, rows, layout)
  const field = model.fields[column]
  const options = Object.entries(field?.options ?? {})
  const all = useMemo(() => columnsFor(model, view, false, models), [model, view, models])
  // The card shows the facts Kolommen leaves, in its order; the column the board sorts by needs no line.
  const shown = useMemo(() => factsOf(all, layout).filter((c) => c.id !== column), [all, layout, column])
  const keyOf = (row: Row) => {
    const value = row.fields[column]
    return typeof value === 'string' && field?.options && value in field.options ? value : NONE
  }
  const lanes: Lane[] = [...options.map(([key, label]) => ({ key, label })), { key: NONE, label: t('noLane') }]
    .filter((lane) => lane.key !== NONE || rows.some((row) => keyOf(row) === NONE))
  useEffect(() => onShown?.({ rows: rows.length, groups: null, cut: false, columns: lanes.length, menu: all }), [rows.length, lanes.length, all])
  const none = t('noneOf', { label: model.label.toLocaleLowerCase(locale()) })
  const dragging = useRef<string | null>(null)
  return (
    <div className="nv-frame">
      <div className="nv-body">
        <div className="nv-board">
          {lanes.map((lane) => (
            <BoardColumn key={lane.key} lane={lane} cards={rows.filter((row) => keyOf(row) === lane.key)} tone={toneColor(field?.tones?.[lane.key])}
              columns={shown} none={none} open={open} dragging={onMove ? dragging : null} onOpen={openRow}
              onMove={(id, key) => onMove?.(id, column, key === NONE ? null : key)}
              onCreate={onCreate ? (key) => onCreate(key === NONE ? {} : { [column]: key }) : undefined} />
          ))}
        </div>
        {drawer}
      </div>
    </div>
  )
}
