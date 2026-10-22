import { type CSSProperties, useContext } from 'react'
import { t } from '../../i18n'
import type { Link, LinkItem, Row } from '../../types'
import { FlagMark } from '../../ui/Flag'
import { hueOf, toneColor } from '../../ui/tone'
import type { Flag } from '../../ui/useFlags'
import { initials } from '../../ui/when'
import { isOpen } from '../cells/Links'
import { DrawerButtons } from '../DrawerButtons'
import { RelationContext } from '../cells/Relation'
import { RelationPicker } from '../cells/RelationPicker'
import './place.css'

const Face = ({ id, name }: { id: number | null; name: string }) =>
  id === null
    ? <span className="nv-avatar nv-avatar--open" aria-hidden="true">+</span>
    : <span className="nv-avatar nv-avatar--hue" style={{ '--h': hueOf(id) } as CSSProperties} aria-hidden="true">{initials(name)}</span>

/** Choosing who holds a place again: the target column's word, its candidates, and what a pick or Escape does. */
export interface Choosing {
  label: string
  candidates: () => Promise<Row[]>
  onPick: (record: Row) => void
  onCancel: () => void
}

const flaggedClass = (flags: Flag[]) =>
  flags.length === 0 ? undefined : flags.some((flag) => flag.tone === 'bad') ? 'nv-dw-list__flagged' : 'nv-dw-list__flagged nv-dw-list__flagged--warn'

/** One place of a link section: who, in what role, in what state, or the flag on them; choosing, the search in place of the name. */
export function PlaceRow({ item, link, role, flags, choosing, onDone }: { item: LinkItem; link: Link; role?: string; flags: Flag[]; choosing?: Choosing; onDone?: () => Promise<Row | null> }) {
  const { openRelated } = useContext(RelationContext)
  const said = flags[0]?.text ?? role
  const detail = item.detail
  // An open place shows its state only when that leaves it out of the count: refused or cancelled.
  const stated = item.state !== null && (!isOpen(item) || link.state?.tones[item.state] === 'bad')
  const places = isOpen(item) ? (item.places ?? 1) : 1
  return (
    <li className={flaggedClass(flags)}>
      <Face id={isOpen(item) ? null : (item.target ?? item.id)} name={item.title} />
      {choosing
        ? <RelationPicker model={link.target_dataset} label={choosing.label} candidates={choosing.candidates} hide={(record) => record.id === item.target}
            onPick={choosing.onPick} onCancel={choosing.onCancel} />
        : <span className="nv-dw-list__main"><span>{isOpen(item) ? t('openPlace') : openRelated && item.title !== ''
          ? <button type="button" className="nv-dw-list__open" aria-label={t('openRecord', { title: item.title })} onClick={() => openRelated(link.dataset, item.id)}>{item.title}</button>
          : item.title}{places > 1 && (
            <span className="nv-dw-list__times">{t('openPlaces', { n: places })}</span>
          )}</span>{said && <small>{said}</small>}{detail && <small className="nv-dw-list__detail">{detail}</small>}</span>}
      {flags.length > 0 ? <FlagMark flags={flags} /> : stated && item.state && link.state && (
        <span className="nv-pill" style={{ '--tone': toneColor(link.state.tones[item.state]) } as CSSProperties}>{link.state.options[item.state] ?? item.state}</span>
      )}
      {onDone && <DrawerButtons model={link.dataset} id={item.id} available={item.available} onDone={onDone} />}
    </li>
  )
}
