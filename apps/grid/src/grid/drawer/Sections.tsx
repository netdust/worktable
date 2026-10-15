import { type CSSProperties, type ReactNode, type Ref, useEffect, useState } from 'react'
import { recordHistory, rowsWhere } from '../../api'
import { locale, t } from '../../i18n'
import type { HistoryEntry, Link, LinkItem, Model, Row, Schema } from '../../types'
import { hueOf, toneColor } from '../../ui/tone'
import { initials } from '../../ui/when'
import { crewOf, isOpen } from '../cells/Links'
import type { Column } from '../columns'
import { actorOf, dayLabel, type Inbound } from './derive'
import { Note } from './Note'

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

/** A long text as the prototype's Notities: a paragraph; pressed, its field in its place, as the matrix cell edits its note. */
export function LongSection({ column, row, onWrite }: { column: Column; row: Row; onWrite?: WriteField }) {
  const text = column.edit(row)
  return (
    <Section title={column.label}>
      {onWrite
        ? <Note text={text} label={column.label} empty={t('notesEmpty', { label: column.label.toLocaleLowerCase(locale()) })} className="nv-dw-long"
            area="nv-textarea nv-dw-long__area" rows={4} onSave={(value) => onWrite(row, column, column.parse(value))} />
        : <p className="nv-dw-long">{text || t('empty')}</p>}
    </Section>
  )
}

const Face = ({ id, name }: { id: number | null; name: string }) =>
  id === null
    ? <span className="nv-avatar nv-avatar--open" aria-hidden="true">+</span>
    : <span className="nv-avatar nv-avatar--hue" style={{ '--h': hueOf(id) } as CSSProperties} aria-hidden="true">{initials(name)}</span>

/** A links field as the prototype's Bezetting: who, in what role, in what state; the open places last; have/need in the head. */
export function LinkSection({ label, link, items, schema, id }: { label: string; link: Link; items: LinkItem[]; schema: Schema | null; id: number }) {
  const [roles, setRoles] = useState<Record<number, string>>({})
  const other = schema?.models[link.dataset]
  // The link row's first relation that is neither its record nor its target: a toewijzing's role.
  const role = other && Object.entries(other.fields).find(([key, f]) => f.type === 'relation' && key !== link.key && key !== link.target)?.[0]
  useEffect(() => {
    if (!role) return
    let live = true
    rowsWhere(link.dataset, { [link.key]: id }, [], 200).then(
      ({ rows }) => live && setRoles(Object.fromEntries(rows.map((r: Row) => [r.id, r.lookups?.[role]?.title ?? '']))),
      () => undefined,
    )
    return () => {
      live = false
    }
  }, [link.dataset, link.key, id, role])
  const { have, need } = crewOf(items, link)
  const open = items.filter(isOpen)
  const people = items.filter((item) => !isOpen(item))
  return (
    <Section title={label} count={`${have}/${need}`}>
      {items.length === 0 ? <p className="nv-dw-none">{t('noneOf', { label: label.toLocaleLowerCase(locale()) })}</p> : (
        <ul className="nv-dw-list">
          {[...people, ...open].map((item) => (
            <li key={item.id}>
              <Face id={isOpen(item) ? null : (item.target ?? item.id)} name={item.title} />
              <span className="nv-dw-list__main">{isOpen(item) ? t('openPlace') : item.title}{roles[item.id] && <small>{roles[item.id]}</small>}</span>
              {!isOpen(item) && item.state && link.state && (
                <span className="nv-pill" style={{ '--tone': toneColor(link.state.tones[item.state]) } as CSSProperties}>{link.state.options[item.state] ?? item.state}</span>
              )}
            </li>
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
