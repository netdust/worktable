import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { type CSSProperties, useCallback } from 'react'
import { Display } from '../grid/cells'
import { isOpen } from '../grid/cells/Links'
import { type Column, firstId, linksOf } from '../grid/columns'
import { t } from '../i18n'
import type { Row, Tone } from '../types'
import { FlagMark } from '../ui/Flag'
import { hueOf, toneColor } from '../ui/tone'
import type { Flag } from '../ui/useFlags'
import { initials, whenOf } from '../ui/when'

const MAX_FACES = 4

const noToggle = () => undefined
// The dropped card is placed by its new rank on the frame it lands; an animation would slide it back from its old place first.
const still = () => false

/** How the dragged card shows in its own column: the slot it lands in, or a ghost once it is over another column. */
export type Look = 'slot' | 'ghost'

/** The card line naming a record of a toned dataset, and each such record's tone. */
export type TonedLine = { column: string; tones: Map<number, Tone> }

/** The prototype's card: its kind, title, day and hours, its facts (an inherited one in italics), and its people with the open places. */
export function CardFace({ row, columns, toned, flags = [] }: { row: Row; columns: Column[]; toned?: TonedLine; flags?: Flag[] }) {
  const kind = columns.find((c) => c.kind === 'select')
  const dates = columns.filter((c) => c.kind === 'date' || c.kind === 'datetime')
  const people = columns.find((c) => c.kind === 'links')
  const facts = columns.filter((c) => c !== kind && c !== people && !dates.includes(c) && c.text(row) !== '' && c.text(row) !== row.title)
  const when = whenOf(row, dates)
  const links = people ? linksOf(row, people.field ?? people.id) : []
  const faces = links.filter((f) => !isOpen(f))
  const open = links.filter(isOpen).length
  return (
    <>
      {((kind && kind.text(row)) || flags.length > 0) && (
        <span className="nv-board__kind">{kind && kind.text(row) && <Display column={kind} row={row} onToggle={noToggle} />}<FlagMark flags={flags} /></span>
      )}
      <b className="nv-board__title">{row.title}</b>
      {(when.day || when.from || dates.length > 0) && (
        <span className="nv-board__when">
          {when.day && <span className="nv-board__day">{when.day}</span>}
          {when.from ? <span className="nv-time">{when.from}{when.to && <span className="nv-time__end">–{when.to}</span>}</span> : <span className="nv-board__untimed">{t('noTime')}</span>}
        </span>
      )}
      {facts.map((c) => {
        const tone = c.id === toned?.column ? toned.tones.get(Number(firstId(c.value(row)))) : undefined
        return (
          <span key={c.id} className="nv-board__fact">
            {tone && <i className="nv-board__tone" style={{ '--c': toneColor(tone) } as CSSProperties} aria-hidden="true" />}
            <Display column={c} row={row} onToggle={noToggle} />
          </span>
        )
      })}
      {(faces.length > 0 || open > 0) && (
        <span className="nv-board__faces" aria-label={faces.map((f) => f.title).join(', ')}>
          {faces.slice(0, MAX_FACES).map((f) => (
            <span key={f.id} className="nv-avatar nv-avatar--sm nv-avatar--hue" style={{ '--h': hueOf(f.target ?? f.id) } as CSSProperties} title={f.title} aria-hidden="true">{initials(f.title)}</span>
          ))}
          {open > 0 && <span className="nv-avatar nv-avatar--sm nv-avatar--open" title={t('openPlace')} aria-hidden="true">+</span>}
          {faces.length > MAX_FACES && <span className="nv-board__more" aria-hidden="true">+{faces.length - MAX_FACES}</span>}
        </span>
      )}
    </>
  )
}

/** A card in its column: it opens its row on a click or Enter, and where the board writes, Space or the pointer lifts it. */
export function Card({ row, columns, toned, flags, lane, drags, open, look, onOpen }: {
  row: Row; columns: Column[]; toned?: TonedLine; flags?: Flag[]; lane: string; drags: boolean; open: boolean; look: Look | null
  onOpen: (row: Row) => void
}) {
  const { setNodeRef, setActivatorNodeRef, attributes, listeners, transform, transition, isDragging } = useSortable({
    id: row.id, data: { lane }, disabled: !drags, animateLayoutChanges: still, attributes: { roleDescription: t('dragRole') },
  })
  const ref = useCallback((node: HTMLElement | null) => {
    setNodeRef(node)
    setActivatorNodeRef(node)
  }, [setNodeRef, setActivatorNodeRef])
  const className = ['nv-board__card', drags && 'nv-board__card--drags', open && 'nv-board__card--open', look && `nv-board__card--${look}`].filter(Boolean).join(' ')
  return (
    <div ref={ref} className={className} style={{ transform: CSS.Translate.toString(transform), transition }} data-card={row.id}
      {...(drags ? attributes : {})} {...listeners} role="button" tabIndex={0}
      onClick={() => onOpen(row)}
      onKeyDown={(event) => {
        if (event.key === 'Enter' && !isDragging) onOpen(row)
        else listeners?.onKeyDown?.(event)
      }}>
      <CardFace row={row} columns={columns} toned={toned} flags={flags} />
    </div>
  )
}
