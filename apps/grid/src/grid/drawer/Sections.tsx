import { type ReactNode, type Ref, useEffect, useImperativeHandle, useState } from 'react'
import { optionsFrom, recordHistory, rowsWhere } from '../../api'
import { locale, t } from '../../i18n'
import type { HistoryEntry, Link, LinkItem, Model, Row, Schema } from '../../types'
import type { Flag } from '../../ui/useFlags'
import { initials } from '../../ui/when'
import { crewOf, isOpen } from '../cells/Links'
import type { Column } from '../columns'
import { actorOf, dayLabel, type Inbound } from './derive'
import { Note } from './Note'
import { type Choosing, PlaceRow } from './PlaceRow'
import './long.css'

/** A section under the fields: an 11px heading with its count and, at the right, its action. */
export function Section({ ref, title, count, action, children }: { ref?: Ref<HTMLElement>; title: string; count?: string; action?: ReactNode; children: ReactNode }) {
  return (
    <section ref={ref} className="nv-dw-sec" aria-label={title}>
      <h3 className="nv-dw-sec__head">{title}{count !== undefined && <span className="nv-dw-sec__n">{count}</span>}{action && <span className="nv-dw-sec__r">{action}</span>}</h3>
      {children}
    </section>
  )
}

/** Writes a field the drawer edits, on the row it showed. */
export type WriteField = (row: Row, column: Column, value: unknown) => void

/** A long text as the prototype's Notities: a paragraph; pressed, its field in its place, as the matrix cell edits its note. Read only and empty, no block. */
export function LongSection({ column, row, onWrite }: { column: Column; row: Row; onWrite?: WriteField }) {
  const text = column.edit(row)
  if (!onWrite && !text) return null
  return (
    <Section title={column.label}>
      {onWrite
        ? <Note text={text} label={column.label} empty={t('notesEmpty', { label: column.label.toLocaleLowerCase(locale()) })} className="nv-dw-long"
            area="nv-textarea nv-dw-long__area" rows={4} onSave={(value) => onWrite(row, column, column.parse(value))} />
        : <p className="nv-dw-long">{text}</p>}
    </Section>
  )
}

/** Puts another record on one place of a link: an edit of that link row, one undo step. */
export type WriteLink = (link: Link, place: number, target: number) => Promise<void>

/** What the drawer's band asks of a link section: the picker open on one of its places. */
export interface Chooser {
  choose: (place: number) => void
}

/** The link's own rows on this record, by id; read again once a place changed hands, so a choice asks about it as it now is. */
function usePlaces(link: Link, id: number, items: LinkItem[], reads: boolean): Map<number, Row> {
  const [places, setPlaces] = useState<Map<number, Row>>(() => new Map())
  const held = items.map((item) => `${item.id}:${item.target}`).join()
  useEffect(() => {
    if (!reads) return
    let live = true
    rowsWhere(link.dataset, { [link.key]: id }, [], 200).then(
      ({ rows }) => live && setPlaces(new Map(rows.map((r: Row) => [r.id, r]))),
      () => undefined,
    )
    return () => {
      live = false
    }
  }, [link.dataset, link.key, id, reads, held])
  return places
}

/** A links field as the prototype's Bezetting: who, in what role, in what state; the open places last; have/need in the head. */
export function LinkSection({ ref, label, link, items, schema, id, flagsOf, onLink, onDone }: {
  ref?: Ref<Chooser>
  label: string; link: Link; items: LinkItem[]; schema: Schema | null; id: number
  /** The flags on one link row: a flagged person shows the flag in place of their role and state. */
  flagsOf?: (id: number) => Flag[]
  /** Writes who holds a place; without it, or where the target column offers no candidates, no place is chosen again. */
  onLink?: WriteLink
  /** Re-reads the record after a link item's button: without it no item shows buttons. */
  onDone?: () => Promise<Row | null>
}) {
  const [choosing, setChoosing] = useState<number | null>(null)
  useImperativeHandle(ref, () => ({ choose: setChoosing }), [])
  const other = schema?.models[link.dataset]
  // The link row's first relation that is neither its record nor its target: the role the place is held in.
  const role = other && Object.entries(other.fields).find(([key, f]) => f.type === 'relation' && key !== link.key && key !== link.target)?.[0]
  const target = other?.fields[link.target]
  const from = onLink ? target?.options_from : undefined
  const places = usePlaces(link, id, items, Boolean(role || from))
  const choosingOf = (item: LinkItem): Choosing | undefined => from && onLink && choosing === item.id ? {
    label: target?.label ?? label,
    candidates: () => optionsFrom(from, { ...places.get(item.id)?.fields, id: item.id }),
    onPick: (record) => {
      setChoosing(null)
      void onLink(link, item.id, record.id)
    },
    onCancel: () => setChoosing(null),
  } : undefined
  const { have, need } = crewOf(items, link)
  const ordered = [...items.filter((item) => !isOpen(item)), ...items.filter(isOpen)]
  return (
    <Section title={label} count={link?.meter === false ? undefined : `${have}/${need}`}>
      {items.length === 0 ? <p className="nv-dw-none">{t('noneOf', { label: label.toLocaleLowerCase(locale()) })}</p> : (
        <ul className="nv-dw-list">
          {ordered.map((item) => (
            <PlaceRow key={item.id} item={item} link={link} role={role ? places.get(item.id)?.lookups?.[role]?.title : undefined}
              flags={flagsOf?.(item.id) ?? []} choosing={choosingOf(item)} onDone={onDone} />
          ))}
        </ul>
      )}
    </Section>
  )
}

/** The rows of a dated table that point at this record, by their day: at most five, and a way to all of them. */
export function InboundSection({ inbound, id, schema }: { inbound: Inbound; id: number; schema: Schema | null }) {
  const [found, setFound] = useState<{ rows: Row[]; total: number } | null>(null)
  useEffect(() => {
    let live = true
    rowsWhere(inbound.model, { [inbound.field]: id }, [inbound.date], 5).then((r) => live && setFound(r), () => undefined)
    return () => {
      live = false
    }
  }, [inbound.model, inbound.field, id])
  if (!found) return null
  const view = schema?.views.find((v) => v.table === inbound.table)
  const all = view && found.total > found.rows.length
    ? <a href={`#view=${encodeURIComponent(view.key)}&f=${encodeURIComponent(JSON.stringify([{ field: inbound.field, op: 'in', values: [String(id)] }]))}`}>{t('allOf', { n: found.total })}</a>
    : undefined
  return (
    <Section title={inbound.label} count={String(found.total)} action={all}>
      {found.rows.length === 0 ? <p className="nv-dw-none">{t('noneOf', { label: inbound.label.toLocaleLowerCase(locale()) })}</p> : (
        <ul className="nv-dw-rows">
          {found.rows.map((r) => {
            const day = String(r.fields[inbound.date] ?? '')
            return <li key={r.id}><span className="nv-mono">{day ? dayLabel(day, locale()).replace(/ \d{4}$/, '') : '—'}</span><span>{r.title || t('untitled')}</span></li>
          })}
        </ul>
      )}
    </Section>
  )
}

const said = (value: unknown, field: string, model: Model): string => {
  const options = model.fields[field]?.options
  if (value === null || value === undefined || value === '') return t('empty')
  return options?.[String(value)] ?? String(value)
}

const when = (at: string) =>
  new Intl.DateTimeFormat(locale(), { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }).format(new Date(at)).replace(/\./g, '')

/** This record's changes, newest first, as the prototype's Geschiedenis: who, what became what, when. */
export function HistorySection({ model, id }: { model: Model; id: number }) {
  const [entries, setEntries] = useState<HistoryEntry[] | null>(null)
  useEffect(() => {
    let live = true
    recordHistory(model.key, id).then((e) => live && setEntries(e), () => live && setEntries([]))
    return () => {
      live = false
    }
  }, [model.key, id])
  if (!entries) return null
  return (
    <Section title={t('history')} count={String(entries.length)}>
      {entries.length === 0 ? <p className="nv-dw-none">{t('noHistory')}</p> : (
        <ul className="nv-dw-hist">
          {entries.slice(0, 8).map((entry) => {
            const who = actorOf(entry.actor) || t(entry.by === 'system' ? 'bySystem' : 'bySomeone')
            const change = entry.changes[0]
            return (
              <li key={entry.batch}>
                <span className="nv-avatar nv-avatar--sm" aria-hidden="true">{initials(who)}</span>
                <span>
                  <b>{who}</b> {entry.created ? t('madeIt') : change?.moved ? t('moved') : change ? t('setTo', { field: change.label.toLocaleLowerCase(locale()), value: said(change.new, change.field, model) }) : t('changedIt')}
                  <span className="nv-dw-hist__t"> · {when(entry.at)}</span>
                </span>
              </li>
            )
          })}
        </ul>
      )}
    </Section>
  )
}
