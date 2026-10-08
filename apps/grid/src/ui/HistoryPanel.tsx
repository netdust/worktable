import { Button, Spinner } from '@sakaniui/react'
import { useEffect, useState } from 'react'
import { locale, type StringKey, t } from '../i18n'
import type { ApiError, Field, HistoryEntry } from '../types'
import { SidePanel } from './SidePanel'

interface Props {
  load: () => Promise<HistoryEntry[]>
  onUndo: (batch: string) => Promise<unknown>
  /** After an undo: the view reads again. */
  onUndone: () => void
  onRefused: (error: ApiError) => void
  onClose: () => void
  /** The view's fields, for an option's label. */
  fields?: Record<string, Field>
}

type Read = { status: 'loading' } | { status: 'ready'; entries: HistoryEntry[] } | { status: 'error' }

const WHO: Record<Exclude<HistoryEntry['by'], 'account'>, StringKey> = {
  self: 'historySelf',
  system: 'historySystem',
  hidden: 'historyHidden',
  gone: 'historyGone',
}

const whose = (entry: HistoryEntry): string => (entry.by === 'account' ? (entry.actor ?? '') : t(WHO[entry.by]))

const dayOf = (at: string): string => new Date(at).toLocaleDateString(locale(), { weekday: 'long', day: 'numeric', month: 'long' })
const timeOf = (at: string): string => new Date(at).toLocaleTimeString(locale(), { hour: '2-digit', minute: '2-digit' })

function shown(value: unknown, field: Field | undefined): string {
  if (value === null || value === undefined || value === '') return t('empty')
  if (typeof value === 'boolean') return t(value ? 'yes' : 'no')
  if (typeof value === 'object') return JSON.stringify(value)
  return field?.options?.[String(value)] ?? String(value)
}

/** In the order the engine answers them, newest first: a day starts a group where it changes. */
function byDay(entries: HistoryEntry[]): { day: string; entries: HistoryEntry[] }[] {
  const days: { day: string; entries: HistoryEntry[] }[] = []
  for (const entry of entries) {
    const day = dayOf(entry.at)
    if (days.at(-1)?.day !== day) days.push({ day, entries: [] })
    days.at(-1)?.entries.push(entry)
  }
  return days
}

/** Undoing one entry undoes its whole batch: the others this list holds are named. */
function alsoUndone(entries: HistoryEntry[], entry: HistoryEntry): string | null {
  const others = entries.filter((e) => e.batch === entry.batch).length - 1
  return others === 0 ? null : others === 1 ? t('historyAlsoOne') : t('historyAlso', { n: others })
}

export function HistoryPanel({ load, onUndo, onUndone, onRefused, onClose, fields = {} }: Props) {
  const [read, setRead] = useState<Read>({ status: 'loading' })
  const [reads, setReads] = useState(0)
  const [busy, setBusy] = useState<string | null>(null)

  useEffect(() => {
    let live = true
    load().then(
      (entries) => live && setRead({ status: 'ready', entries }),
      () => live && setRead({ status: 'error' }),
    )
    return () => {
      live = false
    }
  }, [reads])

  const undo = (batch: string) => {
    setBusy(batch)
    onUndo(batch)
      .then(onUndone, onRefused)
      .finally(() => {
        setBusy(null)
        setReads((n) => n + 1)
      })
  }

  return (
    <SidePanel label={t('history')} onClose={onClose}>
      <div className="nv-history">
        {read.status === 'loading' && <Spinner />}
        {read.status === 'error' && <p role="alert">{t('historyFailed')}</p>}
        {read.status === 'ready' && read.entries.length === 0 && <p className="nv-history__empty">{t('historyEmpty')}</p>}
        {read.status === 'ready' && byDay(read.entries).map(({ day, entries }) => (
          <section key={day} className="nv-history__day">
            <h3 className="nv-history__date">{day}</h3>
            <ul className="nv-history__list">
              {entries.map((entry) => (
                <Item key={`${entry.batch}:${entry.record.id}`} entry={entry} fields={fields} also={alsoUndone(read.entries, entry)} busy={busy !== null} onUndo={undo} />
              ))}
            </ul>
          </section>
        ))}
      </div>
    </SidePanel>
  )
}

function Item({ entry, fields, also, busy, onUndo }: { entry: HistoryEntry; fields: Record<string, Field>; also: string | null; busy: boolean; onUndo: (batch: string) => void }) {
  return (
    <li className="nv-history__entry">
      <div className="nv-history__head">
        <strong className="nv-history__record">{entry.record.title || t('empty')}</strong>
        <span className="nv-history__by">{whose(entry)}</span>
        <time className="nv-history__time" dateTime={entry.at}>{timeOf(entry.at)}</time>
      </div>
      {entry.created && <p className="nv-history__created">{t('historyCreated')}</p>}
      {entry.changes.length > 0 && (
        <dl className="nv-history__changes">
          {entry.changes.map((change) => (
            <div key={change.field} className="nv-history__change">
              <dt>{change.label}</dt>
              <dd>{entry.created ? '' : `${shown(change.old, fields[change.field])} → `}{shown(change.new, fields[change.field])}</dd>
            </div>
          ))}
        </dl>
      )}
      {entry.undoable && (
        <div className="nv-history__undo">
          <Button variant="ghost" size="sm" disabled={busy} onClick={() => onUndo(entry.batch)}>{t('undo')}</Button>
          {also && <span className="nv-history__also">{also}</span>}
        </div>
      )}
    </li>
  )
}
