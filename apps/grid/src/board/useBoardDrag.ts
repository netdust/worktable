import {
  type Announcements,
  type Collision,
  type CollisionDetection,
  closestCenter,
  type DndContextProps,
  type DragStartEvent,
  type KeyboardCoordinateGetter,
  KeyboardSensor,
  MeasuringStrategy,
  PointerSensor,
  pointerWithin,
  type UniqueIdentifier,
  useSensor,
  useSensors,
} from '@dnd-kit/core'
import { type RefObject, useEffect, useMemo, useRef, useState } from 'react'
import type { Layout } from '../grid/layout'
import { type StringKey, t } from '../i18n'
import type { Row } from '../types'
import type { ColumnLook } from './Column'
import { type Drop, dropOf } from './drop'
import { byRank } from './rank'
import { type Measured, targetOf, within } from './target'

export interface BoardLane {
  key: string
  label: string
  /** The value a card dropped here takes; null for "Geen". */
  value: string | null
  cards: Row[]
}

interface Lifted {
  id: number
  lane: string
  index: number
  height: number
  /** From its list's left edge, where the keyboard puts it in any column. */
  inset: number
}

/** Where the dragged card lands: a slot among the column's cards without it. */
interface Target {
  lane: string
  index: number
}

interface Options {
  lanes: BoardLane[]
  manual: boolean
  layout: Layout
  onDrop?: (drop: Exclude<Drop, { kind: 'none' }>, id: number) => Promise<boolean>
  onLayout?: (next: Layout) => void
}

const LANE = 'lane:'
// The list's gap (board.css): where a slot after a column's last card begins.
const GAP = 8
const MEASURING = { droppable: { strategy: MeasuringStrategy.Always } }
const KEYS = { start: ['Space'], end: ['Space'], cancel: ['Escape'] }
// [columns, slots] an arrow moves the target by.
const ARROWS: Record<string, [number, number]> = { ArrowUp: [0, -1], ArrowDown: [0, 1], ArrowLeft: [-1, 0], ArrowRight: [1, 0] }

export const laneId = (key: string) => `${LANE}${key}`
const isLane = (id: UniqueIdentifier) => String(id).startsWith(LANE)

type Lists = Map<string, { list: HTMLElement; cards: Measured[]; left: Map<number, number> }>

/** The lists as they stand when a drag begins, each card from its list's top, so a slot drawn since never moves a hit. */
function measure(root: HTMLElement | null): Lists {
  const lists: Lists = new Map()
  for (const list of root?.querySelectorAll<HTMLElement>('[data-lane]') ?? []) {
    const box = list.getBoundingClientRect()
    const nodes = [...list.querySelectorAll<HTMLElement>('[data-card]')]
    const rects = nodes.map((node) => ({ id: Number(node.dataset.card), rect: node.getBoundingClientRect() }))
    lists.set(list.dataset.lane ?? '', {
      list,
      cards: rects.map(({ id, rect }) => ({ id, top: rect.top - box.top, height: rect.height })),
      left: new Map(rects.map(({ id, rect }) => [id, rect.left - box.left])),
    })
  }
  return lists
}

/** A column ordered by its ranks with a drop's ranks written over them. */
function ranked(cards: Row[], ranks: Map<number, string>): Row[] {
  const at = (row: Row) => (ranks.has(row.id) ? { ...row, fields: { ...row.fields, position: ranks.get(row.id) } } : row)
  return cards.map((row) => ({ row, at: at(row) })).sort((a, b) => byRank(a.at, b.at)).map(({ row }) => row)
}

/** The screen point of a slot, where the keyboard puts the lifted card. */
function pointOf(lists: Lists, at: Target, from: Lifted) {
  const measured = lists.get(at.lane)
  if (!measured) return null
  const box = measured.list.getBoundingClientRect()
  const { cards } = measured
  const over = cards[at.index]
  const end = cards.at(-1)
  const y = at.lane === from.lane
    ? (over && at.index > from.index ? over.top + over.height - from.height : (over?.top ?? 0))
    : (over?.top ?? (end ? end.top + end.height + GAP : 0))
  return { x: box.left + from.inset, y: box.top + y }
}

/** The board's drag: the sensors, the lifted card, where it lands, and the drop it writes. */
export function useBoardDrag({ lanes, manual, layout, onDrop, onLayout }: Options) {
  const [lifted, setLifted] = useState<Lifted | null>(null)
  const [target, setTarget] = useState<Target | null>(null)
  // A sorted board's dropped column, in the drop's ranks until its writes answer.
  const [pending, setPending] = useState<{ lane: string; ranks: Map<number, string> } | null>(null)
  const shown = useMemo(
    () => (pending ? lanes.map((lane) => (lane.key === pending.lane ? { ...lane, cards: ranked(lane.cards, pending.ranks) } : lane)) : lanes),
    [lanes, pending],
  )
  const root = useRef<HTMLDivElement>(null)
  const latest = useRef({ shown, manual, layout, onDrop, onLayout })
  latest.current = { shown, manual, layout, onDrop, onLayout }
  const drag = useRef<Lifted | null>(null)
  const live = useRef<Target | null>(null)
  const heard = useRef<Target | null>(null)
  const last = useRef<Collision[]>([])
  const pointer = useRef<{ x: number; y: number } | null>(null)
  const measured = useRef(measure(null))

  useEffect(() => {
    if (!lifted) return
    document.body.classList.add('nv-dragging')
    return () => document.body.classList.remove('nv-dragging')
  }, [lifted])

  const laneOf = (key: string) => latest.current.shown.find((lane) => lane.key === key)
  const aim = (next: Target) => {
    const now = live.current
    if (!now || now.lane !== next.lane || now.index !== next.index) live.current = next
  }

  const collide: CollisionDetection = (args) => {
    const from = drag.current
    const now = live.current
    if (!from || !now) return []
    // The keyboard has no pointer: its target is the one the arrows set.
    if (!args.pointerCoordinates) {
      if (now.lane !== from.lane) return [{ id: laneId(now.lane) }]
      const over = laneOf(now.lane)?.cards[now.index]
      return over ? [{ id: over.id }] : []
    }
    pointer.current = args.pointerCoordinates
    const hit = pointerWithin({ ...args, droppableContainers: args.droppableContainers.filter((c) => isLane(c.id)) })[0]
    if (!hit) return last.current
    const key = String(hit.id).slice(LANE.length)
    if (key === from.lane) {
      const own = args.droppableContainers.filter((c) => !isLane(c.id) && c.data.current?.lane === key)
      const near = closestCenter({ ...args, droppableContainers: own }).slice(0, 1)
      const index = near[0] ? (laneOf(key)?.cards.findIndex((row) => row.id === near[0].id) ?? -1) : -1
      if (index >= 0) aim({ lane: key, index })
      last.current = near
      return near
    }
    const lists = measured.current.get(key)
    if (lists) aim({ lane: key, index: targetOf(lists.cards, args.pointerCoordinates.y - lists.list.getBoundingClientRect().top, from.id) })
    last.current = [hit]
    return last.current
  }

  const step: KeyboardCoordinateGetter = (event, { currentCoordinates }) => {
    const from = drag.current
    const now = live.current
    if (!from || !now) return
    const all = latest.current.shown
    const at = all.findIndex((lane) => lane.key === now.lane)
    const move = ARROWS[event.code]
    if (!move) return
    const lane = all[Math.max(0, Math.min(all.length - 1, at + move[0]))]
    if (!lane) return
    const slots = lane.cards.filter((row) => row.id !== from.id).length
    aim({ lane: lane.key, index: Math.max(0, Math.min(slots, now.index + move[1])) })
    setTarget(live.current)
    return (live.current && pointOf(measured.current, live.current, from)) ?? currentCoordinates
  }

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { keyboardCodes: KEYS, coordinateGetter: step }),
  )

  const words = (key: StringKey, at: Target | null) => {
    const from = drag.current
    const lane = at && laneOf(at.lane)
    if (!from || !at || !lane) return undefined
    const title = lane.cards.find((row) => row.id === from.id)?.title ?? laneOf(from.lane)?.cards.find((row) => row.id === from.id)?.title ?? ''
    const count = lane.cards.filter((row) => row.id !== from.id).length + 1
    heard.current = at
    return t(key, { title: title || t('openPlace'), label: lane.label, place: at.index + 1, count })
  }
  const moved = () => (live.current === heard.current ? undefined : words('dragOver', live.current))
  const cancelled = () => (drag.current ? words('dragCancelled', { lane: drag.current.lane, index: drag.current.index }) : undefined)
  const inside = () => within(root.current?.getBoundingClientRect(), pointer.current)
  const announcements: Announcements = {
    onDragStart: () => words('dragLifted', live.current),
    onDragMove: moved,
    onDragOver: moved,
    onDragEnd: () => (inside() ? words('dragDropped', live.current) : cancelled()),
    onDragCancel: cancelled,
  }

  const start = ({ active }: DragStartEvent) => {
    const id = Number(active.id)
    const lane = String(active.data.current?.lane)
    measured.current = measure(root.current)
    const own = measured.current.get(lane)
    const index = laneOf(lane)?.cards.findIndex((row) => row.id === id) ?? 0
    drag.current = { id, lane, index, height: own?.cards.find((card) => card.id === id)?.height ?? 0, inset: own?.left.get(id) ?? 0 }
    live.current = { lane, index }
    last.current = []
    pointer.current = null
    setLifted(drag.current)
    setTarget(live.current)
  }

  // Let go outside the board, the drag is cancelled; between its columns it lands at the last target.
  const end = () => {
    const from = drag.current
    const at = live.current
    setLifted(null)
    setTarget(null)
    if (from && at && inside()) void land(from, at)
  }

  const land = async (from: Lifted, at: Target) => {
    const { manual, onDrop } = latest.current
    const lane = laneOf(at.lane)
    if (!lane || !onDrop) return
    const cards = lane.cards.filter((row) => row.id !== from.id)
    const drop = dropOf({ manual, from: at.lane === from.lane ? from.index : null, index: at.index, cards, value: lane.value })
    if (drop.kind === 'none') return
    const switching = drop.kind === 'place' && !drop.manual
    if (switching) setPending({ lane: at.lane, ranks: new Map([...drop.ranks.map((r) => [r.id, r.position] as const), [from.id, drop.position]]) })
    const landed = await onDrop(drop, from.id).catch(() => false)
    if (!switching) return
    // The writes first, the switch after: a refused drop leaves the board sorted as it was.
    const now = latest.current.layout
    if (landed) latest.current.onLayout?.({ ...now, sort: [{ id: 'position', desc: false }, ...now.sort.filter((key) => key.id !== 'position')] })
    setPending(null)
  }

  const context: DndContextProps = {
    sensors,
    collisionDetection: collide,
    measuring: MEASURING,
    accessibility: { announcements, screenReaderInstructions: { draggable: t('dragInstructions') } },
    onDragStart: start,
    onDragMove: () => setTarget(live.current),
    onDragOver: () => setTarget(live.current),
    onDragEnd: end,
    onDragCancel: () => {
      setLifted(null)
      setTarget(null)
    },
  }

  const lookOf = (key: string): ColumnLook | null => {
    if (!lifted || !target) return null
    const away = target.lane !== lifted.lane
    const here = away && target.lane === key
    return {
      dragged: lifted.lane === key ? { id: lifted.id, look: away ? 'ghost' : 'slot' } : null,
      tint: here,
      slot: here && manual ? { index: target.index, height: lifted.height } : null,
    }
  }

  const card = lifted ? (shown.find((lane) => lane.key === lifted.lane)?.cards.find((row) => row.id === lifted.id) ?? null) : null
  return { root: root as RefObject<HTMLDivElement>, shown, context, lookOf, lifted: card }
}
